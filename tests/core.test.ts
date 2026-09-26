import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ALIPAY_SAMPLE_CSV, CMB_SAMPLE_CSV, WECHAT_SAMPLE_CSV } from '../src/demo/samples'
import { decodeBuffer, detectPlatform, parseAmount, daysBetween } from '../src/core/parsers/detect'
import { bankFromRows } from '../src/core/parsers/bank'
import { parseBillText, parseBillXlsx, processPipeline, reviewQueueOf } from '../src/core/pipeline'
import { groupPdfTextItems, pdfPositionedRowsToBill, pdfRowsToBill } from '../src/core/parsers/pdf'
import { parseBankDate } from '../src/core/parsers/bank'
import { aggregateMonth, momDiff, prevMonth } from '../src/core/month'
import { computePersona } from '../src/core/persona'
import { amountBuckets, categoryRows, generateInsights, weekdaySums } from '../src/core/insights'
import { autoCategorize } from '../src/core/categories'
import { computeLabelCandidates, suggestCategories, unlabeledPool } from '../src/core/labeling'
import { categoryDetails, deepMining, incomeBreakdown, payMethodBreakdown, recurringExpenses, shoppingSpend } from '../src/core/analysis'
import { buildReportHTML } from '../src/core/report'
import { countsAsFlow, needsReview } from '../src/core/transfer'
import type { Transaction } from '../src/core/schema'

const round2 = (n: number) => Math.round(n * 100) / 100

describe('detect & decode', () => {
  it('识别微信账单', () => {
    expect(detectPlatform(WECHAT_SAMPLE_CSV)).toBe('wechat')
  })

  it('识别支付宝账单', () => {
    expect(detectPlatform(ALIPAY_SAMPLE_CSV)).toBe('alipay')
  })

  it('GBK 编码的支付宝文件能自动解码（真实导出场景）', () => {
    const p = resolve(__dirname, 'fixtures/alipay_sample_gbk.csv')
    const buf = readFileSync(p)
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const text = decodeBuffer(bytes)
    expect(text).toContain('支付宝')
    expect(detectPlatform(text)).toBe('alipay')
    const bill = parseBillText(text)
    expect(bill.platform).toBe('alipay')
    expect(bill.transactions.length).toBe(12)
  })

  it('金额解析兼容 ¥ 与引号', () => {
    expect(parseAmount('¥1,234.56')).toBe(1234.56)
    expect(parseAmount('28.50')).toBe(28.5)
    expect(parseAmount('')).toBeNaN()
  })

  it('日期差计算', () => {
    expect(daysBetween('2025-08-02 09:00:00', '2025-08-02 20:06:30')).toBe(0)
    expect(daysBetween('2025-08-02', '2025-08-05')).toBe(3)
  })
})

describe('解析', () => {
  const wechat = parseBillText(WECHAT_SAMPLE_CSV)
  const alipay = parseBillText(ALIPAY_SAMPLE_CSV)

  it('微信解析 15 行有效交易', () => {
    expect(wechat.transactions.length).toBe(15)
    expect(wechat.platform).toBe('wechat')
  })

  it('金额/方向/月份正确映射', () => {
    const luckin = wechat.transactions.find((t) => t.counterparty === '瑞幸咖啡')!
    expect(luckin.amount).toBe(15.9)
    expect(luckin.direction).toBe('out')
    expect(luckin.month).toBe('2025-08')

    const redpack = wechat.transactions.find((t) => t.type === '微信红包')!
    expect(redpack.direction).toBe('in')

    const recharge = wechat.transactions.filter((t) => t.type === '零钱充值')
    expect(recharge.length).toBe(2)
    expect(recharge.every((t) => t.direction === 'neutral')).toBe(true)
  })

  it('支付宝解析 12 行，中性交易识别', () => {
    expect(alipay.transactions.length).toBe(12)
    const neutrals = alipay.transactions.filter((t) => t.direction === 'neutral')
    expect(neutrals.length).toBe(3) // 余额宝转出/转入、花呗还款
    const yuebao = alipay.transactions.find((t) => t.item.includes('余额宝-转出到银行卡'))!
    expect(yuebao.amount).toBe(1000)
  })
})

describe('Excel(xlsx) 导入路径', () => {
  /** 把 CSV 样本文本转成 xlsx 字节（模拟微信/支付宝导出的 Excel 账单） */
  function csvToXlsxBytes(csvText: string): ArrayBuffer {
    const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: false })
    const ws = XLSX.utils.aoa_to_sheet(parsed.data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '账单明细')
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }

  it('微信 xlsx 账单可解析（新版本导出格式）', async () => {
    const buf = csvToXlsxBytes(WECHAT_SAMPLE_CSV)
    const bill = await parseBillXlsx(buf)
    expect(bill.platform).toBe('wechat')
    expect(bill.transactions.length).toBe(15)
    const luckin = bill.transactions.find((t) => t.counterparty === '瑞幸咖啡')!
    expect(luckin.amount).toBe(15.9)
    expect(luckin.direction).toBe('out')
  })

  it('支付宝 xlsx 账单可解析', async () => {
    const buf = csvToXlsxBytes(ALIPAY_SAMPLE_CSV)
    const bill = await parseBillXlsx(buf)
    expect(bill.platform).toBe('alipay')
    expect(bill.transactions.length).toBe(12)
    const yuebao = bill.transactions.find((t) => t.item.includes('余额宝-转出到银行卡'))!
    expect(yuebao.direction).toBe('neutral')
  })

  it('xlsx 与 CSV 解析结果完全一致（同一套行解析器）', async () => {
    const fromCsv = parseBillText(WECHAT_SAMPLE_CSV)
    const fromXlsx = await parseBillXlsx(csvToXlsxBytes(WECHAT_SAMPLE_CSV))
    expect(fromXlsx.transactions.map((t) => [t.time, t.amount, t.direction, t.billNo]))
      .toEqual(fromCsv.transactions.map((t) => [t.time, t.amount, t.direction, t.billNo]))
  })
})

describe('清洗 + 分类 + 对冲 管线', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})
  const flows = processed.filter(countsAsFlow)

  it('微信"已全额退款"的原交易不计支出', () => {
    const hema = processed.find((t) => t.counterparty === '盒马鲜生')!
    expect(hema.transferFlag).toBe('refund')
    expect(countsAsFlow(hema)).toBe(false)
  })

  it('跨平台配对：支付宝→微信零钱 666 元被对冲', () => {
    const aliOut = processed.find((t) => t.platform === 'alipay' && Math.abs(t.amount - 666) < 0.01)!
    const wechatIn = processed.find(
      (t) => t.platform === 'wechat' && t.type === '零钱充值' && Math.abs(t.amount - 666) < 0.01,
    )!
    expect(aliOut.transferFlag).toBe('internal')
    expect(aliOut.confidence).toBeGreaterThanOrEqual(0.8)
    expect(aliOut.pairId).toBe(wechatIn.id)
    expect(wechatIn.pairId).toBe(aliOut.id)
    expect(countsAsFlow(aliOut)).toBe(false)
  })

  it('1000 元 余额宝转出 ↔ 零钱充值 配对', () => {
    const paired = processed.filter((t) => Math.abs(t.amount - 1000) < 0.01 && t.pairId)
    expect(paired.length).toBe(2)
  })

  it('花呗还款直接标记 repayment', () => {
    const huabei = processed.find((t) => t.item.includes('花呗还款'))!
    expect(huabei.transferFlag).toBe('repayment')
    expect(huabei.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('软还款候选进纠错队列，等待用户确认', () => {
    const queue = reviewQueueOf(processed)
    expect(queue.length).toBe(1)
    expect(queue[0].counterparty).toBe('XX消费金融')
    // 低置信软候选在确认前仍计入收支
    expect(countsAsFlow(queue[0])).toBe(true)
  })

  it('自动分类命中预期', () => {
    const get = (counter: string) => processed.find((t) => t.counterparty === counter)!.category
    expect(get('瑞幸咖啡')).toBe('餐饮美食')
    expect(get('滴滴出行')).toBe('交通出行')
    expect(get('房东')).toBe('住房水电')
    expect(get('中国移动')).toBe('通讯网络')
    expect(get('李四')).toBe('人情往来') // 转账给个人
    expect(get('优衣库')).toBe('服饰美容') // 支付宝交易分类映射
  })
})

describe('用户修正', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
  ]
  const queue = reviewQueueOf(processPipeline(merged, {}))
  const fixed = processPipeline(merged, { [queue[0].id]: { transferFlag: 'normal' } })

  it('用户标记"正常支出"后不再进队列且计入支出', () => {
    expect(reviewQueueOf(fixed).length).toBe(0)
    const tx = fixed.find((t) => t.counterparty === 'XX消费金融')!
    expect(tx.flagSource).toBe('manual')
    expect(tx.transferFlag).toBeNull()
    expect(countsAsFlow(tx)).toBe(true)
  })
})

describe('月度聚合与环比', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})
  const agg = aggregateMonth('2025-08', processed)

  it('收支总额正确（排除对冲/还款/中性，退款计收入）', () => {
    // 支出：15.9+26.5+500+199+45+23.75+50+4+3500 = 4364.15（盒马退款剔除）
    //      + 28.5+129+18.6+78+30+156.8 = 440.9（666 对冲剔除）+ 300 软还款待确认 = 5105.05
    expect(agg.expense).toBe(5105.05)
    // 收入：88+20 红包 + 500 转账退款 + 35 支付宝退款 = 643
    expect(agg.income).toBe(643)
  })

  it('夜间支出统计', () => {
    expect(agg.nightCount).toBe(1) // 23:45 夜宵
  })

  it('分类与商户聚合', () => {
    expect(round2(agg.byCategory['餐饮美食'])).toBe(115.9)
    expect(agg.byMerchant['房东']).toBe(3500)
  })

  it('环比计算', () => {
    expect(momDiff(110, 100).dir).toBe('up')
    expect(momDiff(80, 100).dir).toBe('down')
    expect(momDiff(100, 100).dir).toBe('flat')
    expect(momDiff(100, undefined).pct).toBeNull()
    expect(prevMonth('2025-08')).toBe('2025-07')
    expect(prevMonth('2025-01')).toBe('2024-12')
  })
})

describe('洞察引擎', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})
  const monthTx = processed.filter((t) => t.month === '2025-08')
  const agg = aggregateMonth('2025-08', processed)

  it('演示数据生成非空洞察，含结余率预警', () => {
    const insights = generateInsights(monthTx, agg, undefined, '2025-08')
    expect(insights.length).toBeGreaterThan(3)
    const savings = insights.find((i) => i.id === 'savings') ?? insights.find((i) => i.id === 'no-income')
    expect(savings).toBeDefined()
    expect(savings!.kind).toBe('warn') // 演示数据入不敷出
    expect(insights.find((i) => i.id === 'top-cat')!.title).toContain('住房水电')
  })

  it('洞察数量有上限', () => {
    expect(generateInsights(monthTx, agg).length).toBeLessThanOrEqual(8)
  })

  it('周内规律：7天合计等于支出总额', () => {
    const sums = weekdaySums(monthTx)
    expect(sums.length).toBe(7)
    const total = sums.reduce((s, v) => s + v, 0)
    expect(Math.round(total * 100)).toBe(Math.round(agg.expense * 100))
  })

  it('单笔分布：笔数与金额守恒', () => {
    const buckets = amountBuckets(monthTx)
    const outs = monthTx.filter((t) => t.direction === 'out' && countsAsFlow(t))
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(outs.length)
    expect(Math.round(buckets.reduce((s, b) => s + b.sum, 0) * 100)).toBe(Math.round(agg.expense * 100))
  })

  it('分类环比行：新增类目标记正确', () => {
    const prev = { ...agg, byCategory: { 餐饮美食: 50 } }
    const rows = categoryRows(agg, prev)
    expect(rows.find((r) => r.name === '餐饮美食')!.diffPct).toBeGreaterThan(1)
    expect(rows.find((r) => r.name === '住房水电')!.previous).toBeUndefined()
  })
})

describe('深度分析引擎', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})
  const monthTx = processed.filter((t) => t.month === '2025-08')
  const agg = aggregateMonth('2025-08', processed)

  it('分类深析：金额/笔数/商户/占比正确', () => {
    const details = categoryDetails(monthTx, agg.expense)
    expect(details.length).toBeGreaterThan(3)
    expect(details[0].name).toBe('住房水电')
    expect(details[0].total).toBe(3656.8) // 房租3500 + 电费156.8
    const dining = details.find((d) => d.name === '餐饮美食')!
    expect(dining.count).toBe(4)
    expect(dining.topMerchants.length).toBeGreaterThan(0)
    expect(dining.share).toBeGreaterThan(0)
    expect(dining.avg).toBeGreaterThan(0)
  })

  it('分类深析：环比与解读', () => {
    const prev = { ...agg, byCategory: { 餐饮美食: 50 } }
    const details = categoryDetails(monthTx, agg.expense, prev)
    const dining = details.find((d) => d.name === '餐饮美食')!
    expect(dining.momPct).toBeGreaterThan(1)
    expect(dining.insight).toContain('多花')
  })

  it('支付方式分析：金额守恒', () => {
    const pays = payMethodBreakdown(monthTx)
    const total = pays.reduce((s, p) => s + p.total, 0)
    expect(Math.round(total * 100)).toBe(Math.round(agg.expense * 100))
  })

  it('收入构成：总额守恒', () => {
    const inc = incomeBreakdown(monthTx)
    const total = inc.reduce((s, p) => s + p.total, 0)
    expect(Math.round(total * 100)).toBe(Math.round(agg.income * 100))
  })

  it('固定支出：跨月同额收款方被识别，单月数据为空', () => {
    expect(recurringExpenses(monthTx)).toEqual([]) // 演示数据只有一个月份
    // 构造两月房租数据
    const rent = (month: string): typeof processed => [
      { ...processed[0], id: 'r1' + month, month, time: `${month}-01 10:00:00`, direction: 'out', amount: 3000, counterparty: '房东', category: '住房水电', transferFlag: null, flagSource: null, confidence: 1 },
      { ...processed[0], id: 'r2' + month, month, time: `${month}-02 10:00:00`, direction: 'out', amount: 3000, counterparty: '房东', category: '住房水电', transferFlag: null, flagSource: null, confidence: 1 },
    ]
    const rec = recurringExpenses([...rent('2025-07'), ...rent('2025-08')])
    expect(rec.length).toBe(1)
    expect(rec[0].counterparty).toBe('房东')
    expect(rec[0].months.length).toBe(2)
  })

  it('深度挖掘：情绪消费识别深夜/月初窗口', () => {
    const m = deepMining(monthTx, processed)
    // 演示数据：23:45 夜宵 ¥45 属餐饮（弹性分类）
    expect(m.emotional.night.total).toBe(45)
    expect(m.emotional.night.count).toBe(1)
    // 8月1-3号：瑞幸15.9 + 饿了么28.5 + 美团外卖26.5 = 70.9（转账/充值不计）
    expect(Math.round(m.emotional.monthStart.total * 100)).toBe(7090)
    // 演示数据最多8/22，无月底消费
    expect(m.emotional.monthEnd.count).toBe(0)
  })

  it('深度挖掘：投资自己与省钱型消费', () => {
    const m = deepMining(monthTx, processed)
    expect(m.selfInvest.total).toBe(30) // 好大夫在线问诊（医疗健康）
    expect(m.selfInvest.categories).toContain('医疗健康')
    expect(m.takeawayTotal).toBe(70.9) // 瑞幸15.9 + 美团26.5 + 饿了么28.5
  })

  it('深度挖掘：扣费刺客需要跨月数据，单月为空', () => {
    const m = deepMining(monthTx, monthTx)
    expect(m.subscriptions).toEqual([])
  })

  it('深度挖掘：构造跨月订阅识别为刺客', () => {
    const mk = (month: string, id: string) => ({
      ...processed[0], id, month, time: `${month}-05 09:00:00`, direction: 'out' as const,
      amount: 25, counterparty: '某视频会员', category: '文娱休闲',
      transferFlag: null, flagSource: null, confidence: 1,
    })
    const all = [...monthTx, mk('2025-07', 's1'), mk('2025-08', 's2')]
    const m = deepMining(monthTx, all)
    expect(m.subscriptions.length).toBe(1)
    expect(m.subscriptions[0].name).toBe('某视频会员')
    expect(m.subscriptions[0].autoRenew).toBe(true)
    expect(m.subscriptionMonthlyTotal).toBe(25)
  })

  it('分析报告HTML生成：自包含且包含关键区块', () => {
    const insights = generateInsights(monthTx, agg)
    const details = categoryDetails(monthTx, agg.expense)
    const html = buildReportHTML({
      label: '2025-08',
      generatedAt: '2025-09-01 12:00:00',
      agg,
      insights,
      categories: details,
      payMethods: payMethodBreakdown(monthTx),
      recurring: [],
      persona: computePersona(monthTx),
      txnCount: agg.txnCount,
    })
    expect(html).toContain('账单分析助手')
    expect(html).toContain('收支分析报告')
    expect(html).toContain('洞察')
    expect(html).toContain('分类明细')
    expect(html).not.toContain('undefined')
  })
})

describe('银行账单解析', () => {
  it('识别招商银行账单并解析（借贷标志 + 负数金额）', () => {
    expect(detectPlatform(CMB_SAMPLE_CSV)).toBe('cmb')
    const bill = parseBillText(CMB_SAMPLE_CSV)
    expect(bill.platform).toBe('cmb')
    expect(bill.transactions.length).toBe(9)

    const salary = bill.transactions.find((t) => t.item.includes('工资发放'))!
    expect(salary.direction).toBe('in') // 贷=收入
    expect(salary.amount).toBe(3000)
    expect(salary.month).toBe('2025-08')

    const transfer = bill.transactions.find((t) => t.item.includes('转账支出'))!
    expect(transfer.direction).toBe('out') // 借=支出，负数取绝对值
    expect(transfer.amount).toBe(500)

    const balance = bill.transactions.find((t) => t.item.includes('生活缴费'))!
    expect(balance.payMethod).toContain('9901')
  })

  it('银行账单进入完整管线并正确分类', () => {
    const bill = parseBillText(CMB_SAMPLE_CSV)
    const processed = processPipeline(bill.transactions, {})
    const salary = processed.find((t) => t.item.includes('工资发放'))!
    expect(salary.category).toBe('工资薪水')
    const gas = processed.find((t) => t.item.includes('生活缴费'))!
    expect(gas.category).toBe('住房水电')
    // 信用卡还款：强关键词自动标记 repayment，不进纠错队列
    const cardRepay = processed.find((t) => t.item.includes('信用卡还款'))!
    expect(cardRepay.transferFlag).toBe('repayment')
    expect(cardRepay.confidence).toBeGreaterThanOrEqual(0.8)
    expect(needsReview(cardRepay)).toBe(false)
  })

  it('多日期格式归一（斜杠/年月日/无分隔）', async () => {
    const slash = `招商银行交易流水\n交易日期,交易金额,借贷标志,交易摘要\n2025/08/02,-100.00,借,消费A\n2025年08月03日,-50.00,借,消费B\n20250804,-30.00,借,消费C\n`
    const bill = parseBillText(slash)
    expect(bill.platform).toBe('cmb')
    const [a, b, c] = bill.transactions
    expect(a.time.startsWith('2025-08-02')).toBe(true)
    expect(b.time.startsWith('2025-08-03')).toBe(true)
    expect(c.time.startsWith('2025-08-04')).toBe(true)
  })

  it('银行 xlsx 账单可解析', async () => {
    const parsed = Papa.parse<string[]>(CMB_SAMPLE_CSV.trim(), { skipEmptyLines: false })
    const ws = XLSX.utils.aoa_to_sheet(parsed.data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '流水')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const bill = await parseBillXlsx(buf)
    expect(bill.platform).toBe('cmb')
    expect(bill.transactions.length).toBe(9)
  })

  it('无银行标识的通用格式兜底解析（platform=bank）', () => {
    const generic = `账户明细导出\n记账日期,收支金额,摘要,账户余额\n2025-08-01,2000.00,奖金,8000.00\n2025-08-02,-150.00,日用,7850.00\n2025-08-03,-45.00,日用,7805.00\n`
    const bill = parseBillText(generic)
    expect(bill.platform).toBe('bank')
    expect(bill.transactions.length).toBe(3)
    const bonus = bill.transactions.find((t) => t.item.includes('奖金'))!
    expect(bonus.direction).toBe('in')
    const daily = bill.transactions.find((t) => t.item.includes('日用') && t.amount === 150)!
    expect(daily.direction).toBe('out')
  })

  it('收入金额/支出金额双列格式', () => {
    const dual = `中国银行交易流水明细清单\n交易日期,转入金额,转出金额,交易摘要,账户余额\n2025-08-01,1200.00,,退款,5200.00\n2025-08-02,,89.00,消费,5111.00\n`
    const bill = parseBillText(dual)
    expect(bill.platform).toBe('boc')
    expect(bill.transactions.length).toBe(2)
    const refund = bill.transactions[0]
    expect(refund.direction).toBe('in')
    expect(refund.amount).toBe(1200)
    const spend = bill.transactions[1]
    expect(spend.direction).toBe('out')
    expect(spend.amount).toBe(89)
  })

  it('银行转账同样进对冲引擎（个人转账软候选进纠错）', () => {
    const bill = parseBillText(CMB_SAMPLE_CSV)
    const processed = processPipeline(bill.transactions, {})
    // 转账支出(给个人)：WALLET_OPS 无命中、无还款词 → 正常支出；这里验证管线对银行流水完整执行
    const transfer = processed.find((t) => t.item.includes('转账支出'))!
    expect(transfer.direction).toBe('out')
    expect(countsAsFlow(transfer)).toBe(true)
  })
})

describe('PDF 账单解析', () => {
  const item = (str: string, x: number, y: number, w = 30): { str: string; x: number; y: number; w: number } => ({ str, x, y, w })

  it('文字碎片按坐标重建成行和单元格', () => {
    const items = [
      item('交易日期', 40, 700), item('交易摘要', 120, 700), item('金额', 220, 700),
      item('2026-09-01', 40, 680), item('消费-餐馆', 120, 680), item('120.00', 220, 680),
      item('第', 40, 20), item('1', 48, 20), item('页', 56, 20), // 页脚应被过滤
    ]
    const rows = groupPdfTextItems(items as never)
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual(['交易日期', '交易摘要', '金额'])
    expect(rows[1]).toEqual(['2026-09-01', '消费-餐馆', '120.00'])
  })

  it('同一单元格内的连续碎片合并（间距小）', () => {
    const items = [
      item('交易日期', 40, 700), item('金额', 200, 700),
      item('2026-09-01', 40, 680),
      item('1,2', 200, 680, 10), item('34.56', 212, 680, 20), // 间距2pt → 同一格
    ]
    const rows = groupPdfTextItems(items as never)
    expect(rows[1]).toEqual(['2026-09-01', '1,234.56'])
  })

  it('中信信用卡PDF模式：金额恒正、消费=支出、还款=入账、MM/DD日期补年份', () => {
    const rows = [
      ['中信银行信用卡账单'],
      ['账单周期：2026-08-11 至 2026-09-10'],
      ['交易日', '记账日', '交易摘要', '交易金额(人民币)'],
      ['09/01', '09/03', '消费-商户甲', '150.00'],
      ['09/05', '09/06', '消费-商户乙', '36.50'],
      ['09/08', '09/09', '还款', '1000.00'],
    ]
    const bill = pdfRowsToBill(rows)
    expect(bill.platform).toBe('citic')
    expect(bill.transactions.length).toBe(3)

    const spend = bill.transactions.find((t) => t.item.includes('商户甲'))!
    expect(spend.direction).toBe('out')
    expect(spend.amount).toBe(150)
    // 日期列取"记账日"（银行以记账日入账），年份来自账单周期
    expect(spend.time.startsWith('2026-09-03')).toBe(true)

    const repay = bill.transactions.find((t) => t.item.includes('还款'))!
    expect(repay.direction).toBe('in')
  })

  it('PDF行重建的招行流水走通用解析', () => {
    const rows = [
      ['招商银行储蓄卡交易流水明细'],
      ['交易日期', '交易金额', '借贷标志', '交易摘要'],
      ['2025-08-01', '3000.00', '贷', '工资发放'],
      ['2025-08-03', '-500.00', '借', '转账支出'],
    ]
    const bill = pdfRowsToBill(rows)
    expect(bill.platform).toBe('cmb')
    expect(bill.transactions[0].direction).toBe('in')
    expect(bill.transactions[1].direction).toBe('out')
  })

  it('parseBankDate 支持 MM/DD + 指定年份', () => {
    expect(parseBankDate('09/01', 2026)).toBe('2026-09-01 00:00:00')
    expect(parseBankDate('8月1日', 2025)).toBe('2025-08-01 00:00:00')
    expect(parseBankDate('2026-09-01 10:30')).toBe('2026-09-01 10:30:00')
    expect(parseBankDate('20260901')).toBe('2026-09-01 00:00:00')
    expect(parseBankDate('垃圾')).toBeNull()
  })

  it('扫描件友好报错', () => {
    // 空行数组 = 没有任何可识别的交易表
    expect(() => pdfRowsToBill([])).toThrow(/未找到含日期与金额/)
    expect(() => pdfRowsToBill([['随机文本'], ['没有表头']])).toThrow(/交易表/)
  })

  it('坐标对齐：收入/支出双列空列不串位（真实中信账单结构复刻）', () => {
    // 复刻真实账单坐标：收入金额列空，支出金额列有值——按数组顺序会错位成收入
    const rows = [
      [{ text: '账户交易明细', x: 253, w: 90 }],
      [
        { text: '交易日期', x: 22, w: 36 }, { text: '收入金额', x: 98, w: 36 },
        { text: '支出金额', x: 165, w: 36 }, { text: '账户余额', x: 233, w: 36 },
        { text: '交易摘要', x: 305, w: 36 }, { text: '对方账号', x: 407, w: 36 },
        { text: '对方户名', x: 508, w: 36 },
      ],
      [
        { text: '20260825', x: 24, w: 36 }, { text: 'RMB 8.00', x: 165, w: 36 },
        { text: 'RMB 22316.63', x: 215, w: 54 }, { text: '财付通快捷支付', x: 291, w: 63 },
        { text: '801276280', x: 406, w: 41 }, { text: '拉加代尔商业运营管理(山东)有限公司', x: 475, w: 102 },
      ],
    ]
    const bill = pdfPositionedRowsToBill(rows)
    expect(bill.platform).toBe('bank') // 真实账单正文无银行名，走通用银行
    expect(bill.transactions.length).toBe(1)
    const tx = bill.transactions[0]
    expect(tx.direction).toBe('out') // 必须是支出——错位的话会变成收入
    expect(tx.amount).toBe(8)
    expect(tx.time).toBe('2026-08-25 00:00:00')
    expect(tx.counterparty).toBe('拉加代尔商业运营管理(山东)有限公司')
  })

  it('真实中信账单PDF端到端（本地fixture，不入库）', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const fixture = path.resolve(__dirname, 'fixtures/citic_real.pdf')
    if (!fs.existsSync(fixture)) {
      console.warn('跳过：本地无 citic_real.pdf（含个人隐私，不入库）')
      return
    }
    // node 环境用 legacy 构建（无 worker）
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(fs.readFileSync(fixture))
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
    const posRows: Array<Array<{ text: string; x: number; w: number }>> = []
    for (let p = 1; p <= Math.min(doc.numPages, 50); p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width ?? 0 })
      }
      const { groupPdfPositionedRows } = await import('../src/core/parsers/pdf')
      posRows.push(...groupPdfPositionedRows(items))
      page.cleanup()
    }
    const bill = pdfPositionedRowsToBill(posRows)
    expect(bill.transactions.length).toBeGreaterThan(10)
    // 首笔：2026-08-25 支出 8.00 财付通快捷支付
    const first = bill.transactions.find((t) => t.amount === 8)!
    expect(first.direction).toBe('out')
    expect(first.counterparty).toBe('拉加代尔商业运营管理(山东)有限公司')
    // 所有交易方向/金额都应有效
    for (const t of bill.transactions) {
      expect(['in', 'out']).toContain(t.direction)
      expect(t.amount).toBeGreaterThan(0)
    }
  })
})

describe('跨渠道去重', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
    ...parseBillText(CMB_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})

  it('银行"财付通快捷支付"行与微信银行卡消费配对：银行侧剔除、App侧保留', () => {
    const bankRow = processed.find(
      (t) => t.platform === 'cmb' && t.item.includes('财付通快捷支付') && Math.abs(t.amount - 26.5) < 0.01,
    )!
    const appRow = processed.find(
      (t) => t.platform === 'wechat' && t.counterparty === '美团平台商户' && t.payMethod.includes('招商银行'),
    )!

    // 银行渠道行：已对冲，不计收支
    expect(bankRow.transferFlag).toBe('internal')
    expect(bankRow.confidence).toBeGreaterThanOrEqual(0.8)
    expect(bankRow.pairId).toBe(appRow.id)
    expect(countsAsFlow(bankRow)).toBe(false)

    // App侧消费：保留计数（商户/分类信息全），配对关系可查
    expect(appRow.transferFlag).toBeNull()
    expect(appRow.pairId).toBe(bankRow.id)
    expect(countsAsFlow(appRow)).toBe(true)
    expect(appRow.category).toBe('餐饮美食')
  })

  it('零钱支付的消费不参与渠道去重（不经过银行卡）', () => {
    const luckin = processed.find((t) => t.counterparty === '瑞幸咖啡')!
    expect(luckin.payMethod).toBe('零钱')
    expect(luckin.pairId).toBeUndefined()
  })

  it('汇总守恒：银行渠道行剔除后，美团消费只计一次', () => {
    const meituanRows = processed.filter(countsAsFlow).filter((t) => t.direction === 'out' && (t.counterparty.includes('美团') || t.item.includes('美团')))
    expect(meituanRows.length).toBe(1)
  })

  it('洞察含跨渠道去重条目', () => {
    const monthTx = processed.filter((t) => t.month === '2025-08')
    const insights = generateInsights(monthTx, aggregateMonth('2025-08', processed))
    const dedup = insights.find((i) => i.id === 'dedup')
    expect(dedup).toBeDefined()
    expect(dedup!.title).toContain('1 笔')
  })

  it('手工修正优先：用户把银行渠道行标记为正常支出后照常计数', () => {
    const bankRow = processed.find(
      (t) => t.platform === 'cmb' && t.item.includes('财付通快捷支付') && Math.abs(t.amount - 26.5) < 0.01,
    )!
    const refixed = processPipeline(merged, { [bankRow.id]: { transferFlag: 'normal' } })
    const row = refixed.find((t) => t.id === bankRow.id)!
    expect(row.transferFlag).toBeNull()
    expect(countsAsFlow(row)).toBe(true)
  })
})

describe('电商平台消费识别', () => {
  it('按商户名识别平台归属并汇总（演示数据含美团/京东）', () => {
    const merged = [
      ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
      ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
      ...parseBillText(CMB_SAMPLE_CSV).transactions,
    ]
    const processed = processPipeline(merged, {})
    const agg = aggregateMonth('2025-08', processed)
    const shops = shoppingSpend(processed.filter((t) => t.month === '2025-08'), agg.expense)
    const meituan = shops.find((s) => s.platform === '美团')!
    expect(meituan).toBeDefined()
    // 微信美团外卖26.5（已计）+ 招行财付通快捷支付26.5（已对冲剔除）+ 支付宝美团退款35是收入不计
    expect(meituan.total).toBe(26.5)
    expect(meituan.count).toBe(1)
    const jd = shops.find((s) => s.platform === '京东')!
    expect(jd.total).toBe(199) // 京东商城-蓝牙耳机
  })

  it('无相关消费时返回空数组', () => {
    const merged = parseBillText(WECHAT_SAMPLE_CSV).transactions.filter((t) => t.direction === 'in')
    expect(shoppingSpend(merged, 100)).toEqual([])
  })
})

describe('P0 修复：银行弱信息行处理', () => {
  const mk = (platform: 'citic' | 'cmb', id: string, over: Partial<Record<string, unknown>>): Transaction => ({
    id, platform, time: '2026-09-01 00:00:00', month: '2026-09',
    counterparty: '', item: '', amount: 100, direction: 'out', category: '',
    payMethod: '', status: '', type: '', billNo: id,
    transferFlag: null, flagSource: null, confidence: 0,
    ...over,
  } as unknown as Transaction)

  it('渠道摘要分类：拼多多/美团/微信转账/网银在线各归其位', () => {
    const cases: Array<[string, string, string]> = [
      // [摘要文本, 期望分类, 说明]
      ['财付通-拼多多平台商户', '日常购物', '渠道+商户'],
      ['美团支付(钱袋宝)', '餐饮美食', '美团支付'],
      ['财付通-微信转账', '人情往来', '微信转账'],
      ['网银在线-京东金融', '日常购物', '网银在线=京东支付'],
      ['美团买菜', '日常购物', '买菜不是下馆子'],
    ]
    for (const [text, cat] of cases) {
      const tx = mk('citic', 't' + text, { item: text, counterparty: text })
      expect(autoCategorize(tx)).toBe(cat)
    }
  })

  it('渠道摘要规则不影响微信/支付宝行分类', () => {
    const wx = mk('wechat', 'w1', { item: '财付通测试', counterparty: '某商户', type: '商户消费' })
    // 微信行不走银行渠道规则，正常关键词分类
    expect(autoCategorize(wx)).toBe('其他支出')
  })

  it('hasTime：日期行标记false，日期时间行标记true', () => {
    const rows = [
      ['交易日期', '收入金额', '支出金额', '账户余额', '交易摘要'],
      ['20260825', '', '8.00', '100.00', '消费A'],
      ['2026-08-26 14:30:25', '', '9.00', '91.00', '消费B'],
    ]
    const result = bankFromRows(rows, 'bank', '测试')
    const [a, b] = result.transactions
    expect(a.hasTime).toBe(false)
    expect(a.time).toBe('2026-08-25 00:00:00')
    expect(b.hasTime).toBe(true)
  })

  it('夜间统计排除银行默认00:00行', () => {
    const rows = [
      ['交易日期', '支出金额', '交易摘要'],
      ['20260825', '8.00', '消费A'], // 默认00:00 → 不算夜间
      ['2026-08-26 23:30:00', '9.00', '消费B'], // 真实23:30 → 夜间
    ]
    const txs = bankFromRows(rows, 'bank', '测试').transactions
    const agg = aggregateMonth('2026-08', txs)
    expect(agg.nightCount).toBe(1)
  })

  it('支付方式列不再误匹配"账户余额"，回退银行名', () => {
    const rows = [
      ['交易日期', '收入金额', '支出金额', '账户余额', '交易摘要'],
      ['20260825', '', '8.00', 'RMB 22316.63', '财付通快捷支付'],
    ]
    const result = bankFromRows(rows, 'citic', '测试')
    expect(result.transactions[0].payMethod).toBe('中信银行卡')
    // 余额值绝不能出现在支付方式里
    expect(result.transactions[0].payMethod).not.toContain('RMB')
    expect(result.transactions[0].payMethod).not.toContain('22316')
  })

  it('跨渠道充值对冲：银行财付通行 ↔ 微信零钱充值（中性行）', () => {
    const rows = [
      ['交易日期', '支出金额', '交易摘要'],
      ['20260820', '500.00', '财付通-微信转账'],
    ]
    const bankTx = bankFromRows(rows, 'cmb', '测试').transactions
    const wxTopup: Transaction = {
      ...bankTx[0],
      id: 'wxtopup', platform: 'wechat', time: '2026-08-21 09:00:00',
      type: '零钱充值', item: '零钱充值', direction: 'neutral', payMethod: '工商银行(1234)',
    }
    processPipeline([bankTx[0], wxTopup], {})
    // 银行行应被标记 internal（充值场景）
    const txs = processPipeline([bankTx[0], wxTopup], {})
    expect(txs[0].transferFlag).toBe('internal')
    expect(countsAsFlow(txs[0])).toBe(false)
  })
})

describe('大额未知引导打标签', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
    ...parseBillText(CMB_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})
  const monthTx = processed.filter((t) => t.month === '2025-08')
  const agg = aggregateMonth('2025-08', processed)

  // 把最大几笔改成其他支出，模拟未分类场景
  const unknownPool = monthTx.map((t) =>
    ['房东', '去哪儿网'].includes(t.counterparty) || t.item.includes('转账支出')
      ? { ...t, category: '其他支出' }
      : t,
  )
  const aggUnknown = aggregateMonth('2025-08', unknownPool)

  it('影响度筛选：大额兜底分类进清单，按金额降序且不超过5笔', () => {
    const candidates = computeLabelCandidates(unknownPool, aggUnknown.expense)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThanOrEqual(5)
    for (const c of candidates) {
      expect(['其他支出', '其他收入']).toContain(c.tx.category)
    }
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].tx.amount).toBeGreaterThanOrEqual(candidates[i].tx.amount)
    }
  })

  it('跳过的不再出现', () => {
    const first = computeLabelCandidates(unknownPool, aggUnknown.expense)
    const skipped = new Set(first.map((c) => c.tx.id))
    const second = computeLabelCandidates(unknownPool, aggUnknown.expense, skipped)
    for (const c of second) {
      expect(skipped.has(c.tx.id)).toBe(false)
    }
  })

  it('未分类池统计', () => {
    const pool = unlabeledPool(unknownPool, aggUnknown.expense)
    expect(pool.sum).toBeGreaterThan(0)
    expect(pool.share).toBeGreaterThan(0)
    expect(pool.share).toBeLessThanOrEqual(1)
  })

  it('分类建议：历史同商户标注优先', () => {
    const target = unknownPool.find((t) => t.counterparty === '房东')!
    // 模拟上月同商户已标注（不同ID、不同月份）
    const history = [...unknownPool, { ...target, id: target.id + '-jul', month: '2025-07', time: '2025-07-01 10:00:00', category: '住房水电' }]
    const suggestions = suggestCategories(target, history)
    expect(suggestions[0]).toBe('住房水电')
  })

  it('无兜底分类时清单为空', () => {
    const allLabeled = monthTx.map((t) => ({ ...t, category: t.category === '其他支出' ? '餐饮美食' : t.category }))
    expect(computeLabelCandidates(allLabeled, agg.expense)).toEqual([])
  })
})

describe('P1/P3 洞察分级与文案', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
    ...parseBillText(CMB_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})
  const monthTx = processed.filter((t) => t.month === '2025-08')
  const agg = aggregateMonth('2025-08', processed)

  it('洞察按优先级排序：口径类（去重）在结论/结构之前', () => {
    const insights = generateInsights(monthTx, agg, undefined, '2025-08')
    const dedupIdx = insights.findIndex((x) => x.id === 'dedup')
    const topCatIdx = insights.findIndex((x) => x.id === 'top-cat')
    expect(dedupIdx).toBeGreaterThanOrEqual(0)
    expect(dedupIdx).toBeLessThan(topCatIdx)
    expect(insights.find((x) => x.id === 'dedup')!.group).toBe('scope')
  })

  it('全部范围时结余文案自适应', () => {
    const insights = generateInsights(monthTx, agg, undefined, '全部')
    const savings = insights.find((x) => x.id === 'savings')!
    expect(savings.title).toContain('统计期内')
  })

  it('去重洞察带可展开清单', () => {
    const insights = generateInsights(monthTx, agg)
    const dedup = insights.find((x) => x.id === 'dedup')!
    expect(dedup.items).toBeDefined()
    expect(dedup.items!.length).toBeGreaterThan(0)
    expect(dedup.items![0].amount).toBeGreaterThan(0)
  })
})

describe('银行格式适配扩展', () => {
  it('工商银行风格：裸收入/支出双列（无金额字样）', () => {
    const rows = [
      ['中国工商银行借记卡账户明细清单'],
      ['记账日期', '摘要', '对方户名', '支出', '收入', '余额'],
      ['20260901', '消费', '超市', '150.00', '', '1000.00'],
      ['20260902', '代发工资', '公司', '', '8000.00', '9000.00'],
    ]
    const bill = pdfRowsToBill(rows)
    expect(bill.platform).toBe('icbc')
    expect(bill.transactions.length).toBe(2)
    const spend = bill.transactions.find((t) => t.direction === 'out')!
    expect(spend.amount).toBe(150)
    const income = bill.transactions.find((t) => t.direction === 'in')!
    expect(income.amount).toBe(8000)
  })

  it('交通银行风格：借方发生额/贷方发生额', () => {
    const rows = [
      ['交通银行电子回单'],
      ['交易日期', '借贷标志', '借方发生额', '贷方发生额', '摘要'],
      ['2026-09-01', '借', '66.00', '', '转账'],
      ['2026-09-02', '贷', '', '1200.00', '转入'],
    ]
    const bill = pdfRowsToBill(rows)
    expect(bill.platform).toBe('bocom')
    const out = bill.transactions.find((t) => t.direction === 'out')!
    expect(out.amount).toBe(66)
    const inc = bill.transactions.find((t) => t.direction === 'in')!
    expect(inc.amount).toBe(1200)
  })

  it('会计负数括号：(1,234.56) = -1234.56', () => {
    const rows = [
      ['招商银行流水'],
      ['交易日期', '交易金额', '借贷标志', '交易摘要'],
      ['2026-09-01', '(1,234.56)', '借', '大额消费'],
    ]
    const bill = pdfRowsToBill(rows)
    expect(bill.transactions[0].amount).toBe(1234.56)
    expect(bill.transactions[0].direction).toBe('out')
  })

  it('收/付标志：付=支出，收=收入', () => {
    const rows = [
      ['某银行明细'],
      ['交易日期', '金额', '收付标志', '摘要'],
      ['2026-09-01', '100.00', '收', '入账'],
      ['2026-09-02', '50.00', '付', '缴费'],
    ]
    const bill = pdfRowsToBill(rows)
    expect(bill.transactions[0].direction).toBe('in')
    expect(bill.transactions[1].direction).toBe('out')
  })
})

describe('动物人格', () => {
  const merged = [
    ...parseBillText(WECHAT_SAMPLE_CSV).transactions,
    ...parseBillText(ALIPAY_SAMPLE_CSV).transactions,
  ]
  const processed = processPipeline(merged, {})
  const persona = computePersona(processed.filter((t) => t.month === '2025-08'))

  it('数据充足时给出主副人格', () => {
    expect(persona).not.toBeNull()
    expect(persona!.primary).toBeDefined()
    expect(persona!.dims.txnCount).toBe(16)
    // 收不抵支 → 蝴蝶特征
    expect(persona!.dims.savingsRate!).toBeLessThan(0)
    expect(persona!.primary.key).toBe('butterfly')
  })

  it('数据不足时返回 null', () => {
    expect(computePersona(processed.slice(0, 3))).toBeNull()
  })
})

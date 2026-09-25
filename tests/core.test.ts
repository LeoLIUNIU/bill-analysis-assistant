import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ALIPAY_SAMPLE_CSV, WECHAT_SAMPLE_CSV } from '../src/demo/samples'
import { decodeBuffer, detectPlatform, parseAmount, daysBetween } from '../src/core/parsers/detect'
import { parseBillText, parseBillXlsx, processPipeline, reviewQueueOf } from '../src/core/pipeline'
import { aggregateMonth, momDiff, prevMonth } from '../src/core/month'
import { computePersona } from '../src/core/persona'
import { amountBuckets, categoryRows, generateInsights, weekdaySums } from '../src/core/insights'
import { categoryDetails, deepMining, incomeBreakdown, payMethodBreakdown, recurringExpenses } from '../src/core/analysis'
import { buildReportHTML } from '../src/core/report'
import { countsAsFlow } from '../src/core/transfer'

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

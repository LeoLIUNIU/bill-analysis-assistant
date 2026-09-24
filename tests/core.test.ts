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

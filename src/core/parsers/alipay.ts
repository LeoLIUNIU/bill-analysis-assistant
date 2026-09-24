import Papa from 'papaparse'
import type { Transaction } from '../schema'
import { transactionId } from '../ids'
import { findHeaderRow, monthOf, normalizeHeader, parseAmount, splitLines } from './detect'

/** 支付宝"收/支"列 → 方向（"不计收支"为中性） */
function alipayDirection(raw: string): Transaction['direction'] {
  const v = raw.trim()
  if (v === '支出') return 'out'
  if (v === '收入') return 'in'
  return 'neutral' // 不计收支 / 空 / 其他
}

/**
 * 解析支付宝交易流水证明 CSV（"用于个人对账"导出）。
 * 兼容新版表头（交易时间/交易分类/…/交易订单号）与旧版（交易创建时间/商品名称/交易号），
 * 列一律按表头名映射，不依赖固定列位置。
 */
export function parseAlipay(text: string): Transaction[] {
  const lines = splitLines(text)
  const headerIdx = findHeaderRow(lines, [['交易时间', '交易创建时间'], ['金额'], ['收/支']])
  if (headerIdx === -1) throw new Error('未找到支付宝账单表头：请确认导出的是"支付宝交易流水证明"CSV文件')

  const csvText = lines.slice(headerIdx).join('\n')
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: 'greedy' })
  const rows = parsed.data
  if (rows.length < 2) throw new Error('支付宝账单内容为空')

  const header = rows[0].map(normalizeHeader)
  const col = (...names: string[]) => {
    for (const n of names) {
      const idx = header.findIndex((h) => h === n || h.startsWith(n))
      if (idx !== -1) return idx
    }
    return -1
  }

  const iTime = col('交易时间', '交易创建时间', '付款时间')
  const iCategory = col('交易分类')
  const iType = col('类型')
  const iCounterparty = col('交易对方')
  const iItem = col('商品说明', '商品名称')
  const iDir = col('收/支')
  const iAmount = col('金额')
  const iRefund = col('成功退款')
  const iPay = col('收/支付方式')
  const iStatus = col('交易状态')
  const iBillNo = col('交易订单号', '交易号')

  const txs: Transaction[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length < 3) continue
    const time = (row[iTime] ?? '').trim()
    const amount = parseAmount(row[iAmount] ?? '')
    if (!time || !Number.isFinite(amount)) continue

    // 旧版格式带"成功退款（元）"列：净额 = 金额 - 已退款
    let netAmount = amount
    if (iRefund !== -1) {
      const refunded = parseAmount(row[iRefund] ?? '')
      if (Number.isFinite(refunded) && refunded > 0) netAmount = Math.max(0, amount - refunded)
    }

    const billNo = (row[iBillNo] ?? '').trim()
    const direction = alipayDirection(row[iDir] ?? '')
    // 展示用类型：优先"交易分类"，其次"类型"
    const displayType = ((row[iCategory] ?? '').trim() || (row[iType] ?? '').trim())

    txs.push({
      id: transactionId('alipay', billNo, row.join('|')),
      platform: 'alipay',
      time,
      month: monthOf(time),
      counterparty: (row[iCounterparty] ?? '').trim(),
      item: (row[iItem] ?? '').trim(),
      amount: netAmount,
      direction,
      category: '',
      payMethod: (row[iPay] ?? '').trim(),
      status: (row[iStatus] ?? '').trim(),
      type: displayType,
      billNo,
      transferFlag: null,
      flagSource: null,
      confidence: 0,
    })
  }
  return txs
}

import Papa from 'papaparse'
import type { Transaction } from '../schema'
import { transactionId } from '../ids'
import { findHeaderRow, monthOf, normalizeHeader, parseAmount, splitLines } from './detect'

/** 微信"收/支"列 → 方向 */
function wechatDirection(raw: string): Transaction['direction'] {
  const v = raw.trim()
  if (v.includes('中性')) return 'neutral'
  if (v.includes('支')) return 'out'
  if (v.includes('收')) return 'in'
  return 'neutral'
}

/**
 * 解析微信支付账单明细 CSV（"用于个人对账"导出）。
 * 表头：交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
 */
export function parseWeChat(text: string): Transaction[] {
  const lines = splitLines(text)
  const headerIdx = findHeaderRow(lines, [['交易时间'], ['交易类型'], ['金额']])
  if (headerIdx === -1) throw new Error('未找到微信账单表头：请确认导出的是"微信支付账单明细"CSV文件')

  const csvText = lines.slice(headerIdx).join('\n')
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: 'greedy' })
  const rows = parsed.data
  if (rows.length < 2) throw new Error('微信账单内容为空')

  const header = rows[0].map(normalizeHeader)
  const col = (name: string) => header.findIndex((h) => h === name)

  const iTime = col('交易时间')
  const iType = col('交易类型')
  const iCounterparty = col('交易对方')
  const iItem = col('商品')
  const iDir = header.findIndex((h) => h.startsWith('收/支'))
  const iAmount = header.findIndex((h) => h.startsWith('金额'))
  const iPay = col('支付方式')
  const iStatus = col('当前状态')
  const iBillNo = col('交易单号')

  const txs: Transaction[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length < 3) continue
    const time = (row[iTime] ?? '').trim()
    const amount = parseAmount(row[iAmount] ?? '')
    if (!time || !Number.isFinite(amount)) continue

    const billNo = (row[iBillNo] ?? '').trim()
    const direction = wechatDirection(row[iDir] ?? '')

    txs.push({
      id: transactionId('wechat', billNo, row.join('|')),
      platform: 'wechat',
      time,
      month: monthOf(time),
      counterparty: (row[iCounterparty] ?? '').trim(),
      item: (row[iItem] ?? '').trim(),
      amount,
      direction,
      category: '', // 由分类引擎填充
      payMethod: (row[iPay] ?? '').trim(),
      status: (row[iStatus] ?? '').trim(),
      type: (row[iType] ?? '').trim(),
      billNo,
      transferFlag: null,
      flagSource: null,
      confidence: 0,
    })
  }
  return txs
}

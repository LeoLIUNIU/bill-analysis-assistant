import type { Correction, ParsedBill, Platform, Transaction } from './schema'
import { autoCategorize } from './categories'
import { cleanTransactions } from './clean'
import { detectPlatform, decodeBuffer, findHeaderRow, splitLines } from './parsers/detect'
import { parseAlipay, alipayFromRows } from './parsers/alipay'
import { parseWeChat, wechatFromRows, WECHAT_HEADER_KEYS } from './parsers/wechat'
import { CONF_AUTO, detectTransfers, needsReview } from './transfer'

function finalize(
  platform: Platform,
  rowCount: number,
  transactions: Transaction[],
): ParsedBill {
  if (transactions.length === 0) {
    throw new Error(
      `${platform === 'wechat' ? '微信' : '支付宝'}账单解析结果为空：文件里没有有效交易行`,
    )
  }
  const times = transactions.map((t) => t.time).sort()
  return { platform, rowCount, transactions, range: [times[0], times[times.length - 1]] }
}

/** 文本 → 解析结果（按平台分发） */
export function parseBillText(text: string): ParsedBill {
  const platform = detectPlatform(text)
  if (!platform) {
    throw new Error('无法识别账单格式：请上传微信或支付宝导出的"用于个人对账"文件（CSV 或 Excel）')
  }
  const transactions = platform === 'wechat' ? parseWeChat(text) : parseAlipay(text)
  return finalize(platform, transactions.length, transactions)
}

/**
 * Excel（.xlsx/.xls）→ 解析结果。
 * 微信新版本导出的"用于个人对账"账单是 xlsx：遍历工作表，按表头指纹找到账单 sheet，
 * 与 CSV 共用同一套行解析器。SheetJS 按需动态加载，不拖累首屏体积。
 */
export async function parseBillXlsx(buf: ArrayBuffer): Promise<ParsedBill> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })
    const rows = aoa.map((r) => r.map((c) => String(c ?? '').trim()))
    const headText = rows.slice(0, 60).map((r) => r.join(',')).join('\n')
    const platform = detectPlatform(headText)
    if (!platform) continue
    try {
      const transactions = platform === 'wechat' ? xlsxWeChat(rows) : xlsxAlipay(rows)
      return finalize(platform, rows.length, transactions)
    } catch {
      continue // 这张 sheet 不是账单数据，尝试下一张
    }
  }
  throw new Error('无法识别账单格式：请上传微信或支付宝导出的"用于个人对账"文件（CSV 或 Excel）')
}

function xlsxWeChat(rows: string[][]): Transaction[] {
  const joined = rows.map((r) => r.join('◆'))
  const idx = findHeaderRow(joined, WECHAT_HEADER_KEYS)
  if (idx === -1) throw new Error('未找到微信账单表头')
  return wechatFromRows(rows.slice(idx))
}

function xlsxAlipay(rows: string[][]): Transaction[] {
  const joined = rows.map((r) => r.join('◆'))
  const idx = findHeaderRow(joined, [['交易时间', '交易创建时间'], ['金额'], ['收/支']])
  if (idx === -1) throw new Error('未找到支付宝账单表头')
  return alipayFromRows(rows.slice(idx))
}

/** 文件入口：按扩展名分发。CSV 自动解码（UTF-8 / GBK），Excel 走 SheetJS。 */
export async function parseBillFile(file: File): Promise<ParsedBill> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseBillXlsx(await file.arrayBuffer())
  }
  return parseBillText(decodeBuffer(await file.arrayBuffer()))
}

/**
 * 全量处理管线：清洗 → 自动分类 → 转账对冲 → 应用用户修正。
 * 返回可用于统计的最终流水（原数组不被修改）。
 */
export function processPipeline(input: Transaction[], corrections: Record<string, Correction>): Transaction[] {
  // 深拷贝，保证 store 里的原始数据不被管线污染
  const txs = input.map((t) => ({ ...t }))

  cleanTransactions(txs)
  for (const tx of txs) {
    tx.category = autoCategorize(tx)
  }
  detectTransfers(txs)

  // 用户修正最后应用，覆盖一切自动结果
  for (const tx of txs) {
    const corr = corrections[tx.id]
    if (!corr) continue
    if (corr.transferFlag === 'normal') {
      tx.transferFlag = null
      tx.flagSource = 'manual'
      tx.confidence = 1
    } else if (corr.transferFlag) {
      tx.transferFlag = corr.transferFlag
      tx.flagSource = 'manual'
      tx.confidence = 1
    }
    if (corr.category) tx.category = corr.category
  }
  return txs
}

/** 纠错队列数据 */
export function reviewQueueOf(processed: Transaction[]): Transaction[] {
  return processed.filter(needsReview)
}

/** 重复合并：按ID去重（同文件重复导入、增量账单交叉），新数据优先 */
export function mergeTransactions(existing: Transaction[], incoming: Transaction[]): Transaction[] {
  const map = new Map<string, Transaction>()
  for (const tx of existing) map.set(tx.id, tx)
  for (const tx of incoming) map.set(tx.id, tx)
  return [...map.values()]
}

export const CONF_THRESHOLD = CONF_AUTO
export type { Platform, Transaction }
export { splitLines }

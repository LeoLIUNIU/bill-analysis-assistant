import type { Correction, ParsedBill, Platform, Transaction } from './schema'
import { autoCategorize } from './categories'
import { cleanTransactions } from './clean'
import { detectPlatform, decodeBuffer, splitLines } from './parsers/detect'
import { parseAlipay } from './parsers/alipay'
import { parseWeChat } from './parsers/wechat'
import { CONF_AUTO, detectTransfers, needsReview } from './transfer'

/** 文本 → 解析结果（按平台分发） */
export function parseBillText(text: string): ParsedBill {
  const platform = detectPlatform(text)
  if (!platform) {
    throw new Error('无法识别账单格式：请上传微信或支付宝导出的"用于个人对账"CSV文件')
  }
  const transactions = platform === 'wechat' ? parseWeChat(text) : parseAlipay(text)
  if (transactions.length === 0) {
    throw new Error(`${platform === 'wechat' ? '微信' : '支付宝'}账单解析结果为空：文件里没有有效交易行`)
  }
  const times = transactions.map((t) => t.time).sort()
  return { platform, rowCount: transactions.length, transactions, range: [times[0], times[times.length - 1]] }
}

/** 文件入口：解码（UTF-8 / GBK 自动）+ 解析 */
export async function parseBillFile(file: File): Promise<ParsedBill> {
  const buf = await file.arrayBuffer()
  return parseBillText(decodeBuffer(buf))
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

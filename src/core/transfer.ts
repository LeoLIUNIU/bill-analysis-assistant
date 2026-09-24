import type { Transaction } from './schema'
import { daysBetween } from './parsers/detect'

/**
 * 转账对冲引擎 v1：让"支付宝转微信钱包"这类资金搬运不计入收支。
 *
 * 三层策略（宁可多问、不可错杀）：
 * 1. 强还款关键词（花呗还款/信用卡还款/白条还款）——消费在购买时已计，直接标记 internal（置信 0.9）
 * 2. 跨平台配对：金额相同(±0.005)、日期±3天、平台不同的两笔候选 → internal（置信 0.9，互设 pairId）
 * 3. 其余弱候选（如未配对成功的"转账到银行卡"）→ 置信 0.55，进纠错队列让用户确认
 *
 * 已被平台标记为中性（零钱充值/余额宝存取）的行不计收支，无需处理，但参与配对。
 */

/** 置信度阈值：>=AUTO 排除收支；[REVIEW, AUTO) 进纠错队列 */
export const CONF_AUTO = 0.8
export const CONF_REVIEW = 0.5

const REPAYMENT_STRONG = ['花呗还款', '信用卡还款', '白条还款', '借呗还款']
const REPAYMENT_SOFT = ['还款']

/** 资金搬运类操作关键词（需配对确认） */
const WALLET_OPS = [
  '零钱充值', '零钱提现', '余额提现', '提现-零钱', '提现',
  '余额宝-转出', '余额宝-转入', '余额转入', '余额转出',
  '转出到银行卡', '转账到银行卡', '转账至银行卡', '转账-到银行卡', '转账-银行卡',
]

function haystack(tx: Transaction): string {
  return `${tx.type} ${tx.counterparty} ${tx.item}`
}

export interface TransferReport {
  pairedCount: number
  autoInternal: number
  reviewCandidates: number
}

/** 原地标记 txs 的 transferFlag / confidence / pairId。跳过已有手工修正的行。 */
export function detectTransfers(txs: Transaction[]): TransferReport {
  const report: TransferReport = { pairedCount: 0, autoInternal: 0, reviewCandidates: 0 }
  const eligible = txs.filter((t) => t.flagSource !== 'manual')

  // 1) 强还款：直接 internal
  for (const tx of eligible) {
    if (tx.transferFlag && tx.flagSource === 'auto') continue
    if (REPAYMENT_STRONG.some((k) => haystack(tx).includes(k))) {
      tx.transferFlag = 'repayment'
      tx.flagSource = 'auto'
      tx.confidence = 0.9
      report.autoInternal++
    }
  }

  // 2) 收集钱包搬运候选（排除强还款已处理的）
  const candidates = eligible.filter(
    (tx) => !REPAYMENT_STRONG.some((k) => haystack(tx).includes(k)) && WALLET_OPS.some((k) => haystack(tx).includes(k)),
  )

  // 3) 跨平台配对：(out|neutral) ↔ (in|neutral)，金额相同、±3天、平台不同
  //    neutral↔neutral 也配（如 余额宝转出 ↔ 零钱充值），虽不影响收支但可完整呈现资金腾挪链路
  const used = new Set<string>()
  const outs = candidates.filter((c) => c.direction === 'out' || c.direction === 'neutral')
  const ins = candidates.filter((c) => c.direction === 'in' || c.direction === 'neutral')

  for (const out of outs) {
    if (used.has(out.id)) continue
    let best: Transaction | null = null
    let bestDays = Number.POSITIVE_INFINITY
    for (const inc of ins) {
      if (used.has(inc.id) || inc.platform === out.platform) continue
      if (Math.abs(inc.amount - out.amount) > 0.005) continue
      const d = daysBetween(out.time, inc.time)
      if (d > 3) continue
      if (d < bestDays) {
        best = inc
        bestDays = d
      }
    }
    if (best) {
      used.add(out.id)
      used.add(best.id)
      out.transferFlag = 'internal'
      out.flagSource = 'auto'
      out.confidence = 0.9
      out.pairId = best.id
      best.transferFlag = 'internal'
      best.flagSource = 'auto'
      best.confidence = 0.9
      best.pairId = out.id
      report.pairedCount++
      report.autoInternal++
    }
  }

  // 4) 其余交易的分级排查：
  //    - 未配对成功的钱包搬运候选：影响收支的（out/in）→ 0.55 进纠错队列；平台已标中性的 → 0.4 留痕
  //    - 含"还款"字样的软候选（如消费金融借款还款）→ repayment 0.55 进纠错队列
  for (const tx of eligible) {
    if (used.has(tx.id)) continue
    if (tx.confidence >= CONF_AUTO) continue // 强还款/配对成功等已定论
    const isWalletCandidate = WALLET_OPS.some((k) => haystack(tx).includes(k))
    const isSoftRepayment = !isWalletCandidate && REPAYMENT_SOFT.some((k) => haystack(tx).includes(k))
    if (!isWalletCandidate && !isSoftRepayment) continue
    if (tx.transferFlag && tx.flagSource === 'auto') continue

    if (isWalletCandidate && tx.direction === 'neutral') {
      tx.confidence = 0.4
      continue
    }
    if (isSoftRepayment) tx.transferFlag = 'repayment'
    tx.flagSource = 'auto'
    tx.confidence = 0.55
    report.reviewCandidates++
  }

  return report
}

/** 是否进入纠错队列 */
export function needsReview(tx: Transaction): boolean {
  if (tx.flagSource === 'manual') return false
  return tx.confidence >= CONF_REVIEW && tx.confidence < CONF_AUTO
}

/**
 * 是否计入收支统计。
 * - neutral 不计
 * - internal/repayment：置信达标或用户确认后排除；低置信软候选暂计入，等用户确认
 * - refund：原交易"已全额退款"（out 方向）净额为零不重复计；退款入账（in 方向）计收入
 */
export function countsAsFlow(tx: Transaction): boolean {
  if (tx.direction === 'neutral') return false
  if (tx.transferFlag === 'internal' || tx.transferFlag === 'repayment') {
    if (tx.flagSource === 'manual' || tx.confidence >= CONF_AUTO) return false
  }
  if (tx.transferFlag === 'refund' && tx.direction === 'out') return false
  return true
}

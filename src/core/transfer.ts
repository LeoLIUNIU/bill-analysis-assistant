import type { Transaction } from './schema'
import { daysBetween } from './parsers/detect'

/**
 * 转账对冲引擎 v1：让"支付宝转微信钱包"这类资金搬运不计入收支。
 *
 * 策略分层（宁可多问、不可错杀）：
 * 1. 强还款关键词（花呗还款/信用卡还款/白条还款）——消费在购买时已计，直接标记 internal（置信 0.9）
 * 2. 跨平台配对：金额相同(±0.005)、日期±3天、平台不同的两笔候选 → internal（置信 0.9，互设 pairId）
 * 3. **跨渠道去重**：银行"财付通/支付宝快捷支付"行 ↔ 微信/支付宝里银行卡支付的消费行——
 *    同一笔消费在两边各记一次，剔除银行侧渠道行（只留App侧，商户/分类信息更全）
 * 4. 其余弱候选（如未配对成功的"转账到银行卡"）→ 置信 0.55，进纠错队列让用户确认
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

/** 第三方支付渠道关键词：银行账单里这类行通常是微信/支付宝消费的渠道记录 */
const CHANNEL_RE = /财付通|微信|支付宝|快捷支付|tenpay/i

function haystack(tx: Transaction): string {
  return `${tx.type} ${tx.counterparty} ${tx.item}`
}

function isBankPlatform(platform: string): boolean {
  return platform !== 'wechat' && platform !== 'alipay'
}

/** 商户名重叠判定：一方包含另一方（≥4字）视为吻合 */
function merchantOverlap(bankText: string, appText: string): boolean {
  const b = bankText.trim()
  const a = appText.trim()
  if (b.length < 4 || a.length < 4) return false
  return a.includes(b) || b.includes(a)
}

export interface TransferReport {
  pairedCount: number
  autoInternal: number
  reviewCandidates: number
  /** 跨渠道去重：剔除的银行渠道行数（对应微信/支付宝侧消费保留） */
  dedupCount: number
}

/** 原地标记 txs 的 transferFlag / confidence / pairId。跳过已有手工修正的行。 */
export function detectTransfers(txs: Transaction[]): TransferReport {
  const report: TransferReport = { pairedCount: 0, autoInternal: 0, reviewCandidates: 0, dedupCount: 0 }
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

  // 5) 跨渠道去重：银行"财付通/支付宝快捷支付"行 ↔ App侧银行卡支付的消费行。
  //    同一笔消费两边各记一次：剔除银行渠道行（信息少），保留App侧行（商户/分类全）。
  report.dedupCount = dedupCrossChannel(eligible)

  return report
}

/**
 * 跨渠道去重。
 * 配对条件：金额精确相等(±0.005) + 日期±3天 + 银行行含渠道关键词 + App行支付方式为银行卡。
 * 贪心策略：同金额多候选时，优先商户名吻合者，再取日期最近者。
 * 非对称结果：银行行标记 internal 被排除；App行保留计数，仅互设 pairId 供查询。
 */
function dedupCrossChannel(eligible: Transaction[]): number {
  const bankRows = eligible.filter(
    (t) =>
      isBankPlatform(t.platform) &&
      t.direction === 'out' &&
      !t.transferFlag &&
      !t.pairId &&
      CHANNEL_RE.test(haystack(t)),
  )
  if (bankRows.length === 0) return 0

  const appRows = eligible.filter(
    (t) =>
      !isBankPlatform(t.platform) &&
      t.direction === 'out' &&
      !t.transferFlag &&
      !t.pairId &&
      countsAsFlow(t) &&
      /银行/.test(t.payMethod),
  )
  if (appRows.length === 0) return 0

  let deduped = 0
  for (const bank of bankRows) {
    if (bank.pairId) continue
    let best: Transaction | null = null
    let bestScore = -Infinity
    for (const app of appRows) {
      if (app.pairId) continue
      if (Math.abs(app.amount - bank.amount) > 0.005) continue
      const d = daysBetween(bank.time, app.time)
      if (d > 3) continue
      const merchantHit = merchantOverlap(bank.counterparty || bank.item, `${app.counterparty} ${app.item}`)
      const score = 100 - d * 10 + (merchantHit ? 50 : 0)
      if (score > bestScore) {
        best = app
        bestScore = score
      }
    }
    if (best) {
      const merchantHit = merchantOverlap(bank.counterparty || bank.item, `${best.counterparty} ${best.item}`)
      bank.transferFlag = 'internal'
      bank.flagSource = 'auto'
      bank.confidence = merchantHit ? 0.9 : 0.8
      bank.pairId = best.id
      // App侧保留计数，仅记录配对关系（透明可查）
      best.pairId = bank.id
      deduped++
    }
  }
  return deduped
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

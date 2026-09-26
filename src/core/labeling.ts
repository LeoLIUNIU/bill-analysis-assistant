import type { Transaction } from './schema'
import { countsAsFlow } from './transfer'

/**
 * 大额未知引导打标签：把"分析准确率"的一部分交给最了解真相的用户。
 *
 * 筛选 = 影响度 × 不确定度（两者同时满足才引导，避免打扰）：
 * - 影响度：金额 ≥ max(¥200, 支出P80)——大额才值得提问
 * - 不确定度：分类是兜底类（其他支出/其他收入）——规则已自信分类的不打扰
 * 按金额降序，每次最多引导 5 笔（防疲劳），跳过的不再提示。
 */

export const FALLBACK_CATEGORIES = ['其他支出', '其他收入']

export interface LabelCandidate {
  tx: Transaction
  /** 该笔占当期总支出的比例 */
  share: number
}

export interface UnlabeledPool {
  sum: number
  count: number
  share: number
}

function isFallbackCategory(cat: string): boolean {
  return FALLBACK_CATEGORIES.includes(cat)
}

function percentile80(amounts: number[]): number {
  if (amounts.length === 0) return 0
  const sorted = [...amounts].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))
  return sorted[idx]
}

/** 未分类池统计（含全部兜底分类交易，不设金额门槛） */
export function unlabeledPool(txs: Transaction[], totalExpense: number): UnlabeledPool {
  const pool = txs.filter(
    (t) => t.direction === 'out' && countsAsFlow(t) && isFallbackCategory(t.category),
  )
  const sum = Math.round(pool.reduce((s, t) => s + t.amount, 0) * 100) / 100
  return {
    sum,
    count: pool.length,
    share: totalExpense > 0 ? sum / totalExpense : 0,
  }
}

/**
 * 计算待标注清单：影响度×不确定度，按金额降序，默认最多 5 笔。
 * @param skipped 用户已跳过的流水ID
 */
export function computeLabelCandidates(
  txs: Transaction[],
  totalExpense: number,
  skipped?: ReadonlySet<string>,
  limit = 5,
): LabelCandidate[] {
  const flows = txs.filter(
    (t) => countsAsFlow(t) && isFallbackCategory(t.category) && !skipped?.has(t.id),
  )
  if (flows.length === 0) return []

  const amounts = txs
    .filter((t) => t.direction === 'out' && countsAsFlow(t))
    .map((t) => t.amount)
  const threshold = Math.max(200, percentile80(amounts))

  return flows
    .filter((t) => t.amount >= threshold || (totalExpense > 0 && t.amount / totalExpense >= 0.03))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .map((tx) => ({
      tx,
      share: totalExpense > 0 ? tx.amount / totalExpense : 0,
    }))
}

/** 分类建议：同收款方的历史标注优先，其次按收支方向给常见类目 */
export function suggestCategories(tx: Transaction, all: Transaction[]): string[] {
  const suggestions: string[] = []
  if (tx.counterparty) {
    const history = new Map<string, number>()
    for (const t of all) {
      if (t.id === tx.id || t.counterparty !== tx.counterparty) continue
      if (isFallbackCategory(t.category)) continue
      history.set(t.category, (history.get(t.category) ?? 0) + 1)
    }
    ;[...history.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat]) => suggestions.push(cat))
  }
  const defaults =
    tx.direction === 'in'
      ? ['工资薪水', '红包转账', '理财收益', '其他收入']
      : ['餐饮美食', '日常购物', '人情往来', '旅行度假']
  for (const d of defaults) {
    if (suggestions.length >= 4) break
    if (!suggestions.includes(d)) suggestions.push(d)
  }
  return suggestions.slice(0, 4)
}

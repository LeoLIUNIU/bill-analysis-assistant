import type { MonthlyAggregate, Transaction } from './schema'
import { countsAsFlow } from './transfer'

/**
 * 深度分析引擎：分类深析、支付方式、固定支出识别、收入构成。
 * 全部为纯函数，输入处理后的流水，输出可渲染的分析结构。
 */

const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
const pct = (n: number) => `${Math.round(n * 100)}%`

/** 单个分类的深度分析 */
export interface CategoryDetail {
  name: string
  total: number
  count: number
  avg: number
  maxTx: Transaction | null
  /** 该分类下的头部商户（按金额降序） */
  topMerchants: Array<{ name: string; total: number; count: number }>
  /** 占总支出的比例 */
  share: number
  /** 环比（上月同分类） */
  momPct: number | null
  /** 数据活跃月份数 */
  monthsActive: number
  /** 一句话解读（有数据依据才生成） */
  insight: string | null
}

export function categoryDetails(
  txs: Transaction[],
  totalExpense: number,
  prev?: MonthlyAggregate,
): CategoryDetail[] {
  const byCat = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const list = byCat.get(t.category) ?? []
    list.push(t)
    byCat.set(t.category, list)
  }

  const details: CategoryDetail[] = []
  for (const [name, list] of byCat) {
    const total = list.reduce((s, t) => s + t.amount, 0)
    const count = list.length
    const avg = total / count
    const maxTx = list.reduce((a, b) => (b.amount > a.amount ? b : a))

    const byMerchant = new Map<string, { total: number; count: number }>()
    for (const t of list) {
      const key = t.counterparty || t.item || '未知商户'
      const m = byMerchant.get(key) ?? { total: 0, count: 0 }
      m.total += t.amount
      m.count++
      byMerchant.set(key, m)
    }
    const topMerchants = [...byMerchant.entries()]
      .map(([merchant, v]) => ({ name: merchant, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    const prevTotal = prev?.byCategory?.[name]
    const momPct = prevTotal !== undefined && prevTotal > 0 ? (total - prevTotal) / prevTotal : null
    const monthsActive = new Set(list.map((t) => t.month)).size

    let insight: string | null = null
    if (momPct !== null && Math.abs(momPct) >= 0.3) {
      insight = `环比${momPct > 0 ? '多花' : '省下'} ¥${fmt(Math.abs(total - prevTotal!))}（${pct(Math.abs(momPct))}）`
    }
    if (!insight && topMerchants.length > 0 && topMerchants[0].total / total > 0.45 && count >= 3) {
      insight = `高度集中在「${topMerchants[0].name}」，占该分类 ${pct(topMerchants[0].total / total)}`
    }
    if (!insight && count >= 15 && avg < 40) {
      insight = `高频小额消费：${count} 笔、单笔均 ¥${fmt(avg)}，积少成多`
    }
    if (!insight && count === 1 && total > 0) {
      insight = `本期仅 1 笔 · ${maxTx.time.slice(5, 10)} ${maxTx.counterparty || maxTx.item}`
    }

    details.push({
      name,
      total: Math.round(total * 100) / 100,
      count,
      avg: Math.round(avg * 100) / 100,
      maxTx,
      topMerchants: topMerchants.map((m) => ({ ...m, total: Math.round(m.total * 100) / 100 })),
      share: totalExpense > 0 ? total / totalExpense : 0,
      momPct,
      monthsActive,
      insight,
    })
  }
  return details.sort((a, b) => b.total - a.total)
}

/** 支付方式/收入构成行 */
export interface BreakdownRow {
  name: string
  total: number
  count: number
}

/** 支付方式分析（仅支出） */
export function payMethodBreakdown(txs: Transaction[]): BreakdownRow[] {
  const by = new Map<string, { total: number; count: number }>()
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const key = t.payMethod || '未标注'
    const m = by.get(key) ?? { total: 0, count: 0 }
    m.total += t.amount
    m.count++
    by.set(key, m)
  }
  return [...by.entries()]
    .map(([name, v]) => ({ name, ...v, total: Math.round(v.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
}

/** 收入构成分析 */
export function incomeBreakdown(txs: Transaction[]): BreakdownRow[] {
  const by = new Map<string, { total: number; count: number }>()
  for (const t of txs) {
    if (t.direction !== 'in' || !countsAsFlow(t)) continue
    const m = by.get(t.category) ?? { total: 0, count: 0 }
    m.total += t.amount
    m.count++
    by.set(t.category, m)
  }
  return [...by.entries()]
    .map(([name, v]) => ({ name, ...v, total: Math.round(v.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
}

/**
 * 固定支出识别：同一收款方在 ≥2 个不同月份出现、金额相近（±15%）→ 判定为周期性支出。
 * 典型如房租、订阅、会员；帮用户算出"每月雷打不动要花多少"。
 */
export interface RecurringExpense {
  counterparty: string
  category: string
  months: string[]
  avgAmount: number
  lastAmount: number
}

export function recurringExpenses(txs: Transaction[]): RecurringExpense[] {
  const byParty = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const key = (t.counterparty || t.item || '').trim()
    if (!key || key === '/') continue
    const list = byParty.get(key) ?? []
    list.push(t)
    byParty.set(key, list)
  }

  const out: RecurringExpense[] = []
  for (const [party, list] of byParty) {
    const months = [...new Set(list.map((t) => t.month))].sort()
    if (months.length < 2) continue
    // 每月最多取最大一笔，避免高频商户（外卖）被误判为固定支出
    const perMonth = months.map((m) => {
      const txsOfMonth = list.filter((t) => t.month === m)
      return txsOfMonth.reduce((a, b) => (b.amount > a.amount ? b : a))
    })
    const amounts = perMonth.map((t) => t.amount)
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    // 金额波动需在 ±15% 内，且单笔不能太小（过滤每天买咖啡）
    if (max === 0 || min / max < 0.85 || min < 30) continue
    if (list.length / months.length > 2) continue

    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length
    out.push({
      counterparty: party,
      category: perMonth[perMonth.length - 1].category,
      months,
      avgAmount: Math.round(avg * 100) / 100,
      lastAmount: amounts[amounts.length - 1],
    })
  }
  return out.sort((a, b) => b.avgAmount - a.avgAmount)
}

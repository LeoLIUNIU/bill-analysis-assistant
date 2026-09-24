import type { MonthlyAggregate, Transaction } from './schema'
import { countsAsFlow } from './transfer'

/** 由明细聚合单月数据（存档与环比的最小单元，不含任何明细） */
export function aggregateMonth(month: string, txs: Transaction[]): MonthlyAggregate {
  const agg: MonthlyAggregate = {
    month,
    income: 0,
    expense: 0,
    byCategory: {},
    byIncomeSource: {},
    byMerchant: {},
    nightCount: 0,
    txnCount: 0,
  }

  for (const tx of txs) {
    if (tx.month !== month || !countsAsFlow(tx)) continue
    agg.txnCount++

    const hour = Number.parseInt(tx.time.slice(11, 13), 10)
    if (tx.direction === 'in') {
      agg.income += tx.amount
      agg.byIncomeSource[tx.category] = (agg.byIncomeSource[tx.category] ?? 0) + tx.amount
    } else {
      agg.expense += tx.amount
      agg.byCategory[tx.category] = (agg.byCategory[tx.category] ?? 0) + tx.amount
      agg.byMerchant[tx.counterparty] = (agg.byMerchant[tx.counterparty] ?? 0) + tx.amount
      if (hour >= 23 || hour < 6) agg.nightCount++
    }
  }

  roundRecord(agg.byCategory)
  roundRecord(agg.byIncomeSource)
  roundRecord(agg.byMerchant)
  agg.income = round2(agg.income)
  agg.expense = round2(agg.expense)
  return agg
}

/** 出现过的月份列表，降序 */
export function monthsOf(txs: Transaction[]): string[] {
  const set = new Set(txs.map((t) => t.month))
  return [...set].sort().reverse()
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 环比变化描述 */
export function momDiff(current: number, previous: number | undefined): { pct: number | null; dir: 'up' | 'down' | 'flat' } {
  if (previous === undefined || previous === 0) return { pct: null, dir: 'flat' }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 1) return { pct, dir: 'flat' }
  return { pct, dir: pct > 0 ? 'up' : 'down' }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function roundRecord(rec: Record<string, number>): void {
  for (const k of Object.keys(rec)) rec[k] = round2(rec[k])
}

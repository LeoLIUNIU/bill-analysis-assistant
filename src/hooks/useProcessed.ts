import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { processPipeline, reviewQueueOf } from '../core/pipeline'
import { aggregateMonth, monthsOf } from '../core/month'
import type { MonthlyAggregate } from '../core/schema'

/** 处理后的流水 + 月份列表 + 月度聚合（含存档历史月的合并视图） */
export function useProcessed() {
  const transactions = useStore((s) => s.transactions)
  const corrections = useStore((s) => s.corrections)
  const archiveMonths = useStore((s) => s.archiveMonths)
  const selectedMonth = useStore((s) => s.selectedMonth)

  return useMemo(() => {
    const processed = processPipeline(transactions, corrections)
    const queue = reviewQueueOf(processed)

    const months = monthsOf(processed)
    const liveMonths: Record<string, MonthlyAggregate> = {}
    for (const m of months) liveMonths[m] = aggregateMonth(m, processed)

    // 存档历史月 + 实时月合并（实时优先）
    const allAggregates: Record<string, MonthlyAggregate> = { ...archiveMonths, ...liveMonths }
    const allMonths = Object.keys(allAggregates).sort().reverse()

    const monthTx = selectedMonth
      ? processed.filter((t) => t.month === selectedMonth)
      : processed

    return {
      processed,
      queue,
      allMonths,
      allAggregates,
      monthTx,
      selectedAggregate:
        selectedMonth !== ''
          ? allAggregates[selectedMonth]
          : aggregateAll(processed, liveMonths, archiveMonths),
    }
  }, [transactions, corrections, archiveMonths, selectedMonth])
}

/** "全部月份"视图 = 实时明细聚合 + 无明细存档月的叠加 */
function aggregateAll(
  processed: ReturnType<typeof processPipeline>,
  liveMonths: Record<string, MonthlyAggregate>,
  archiveMonths: Record<string, MonthlyAggregate>,
): MonthlyAggregate {
  const txMonths = new Set(monthsOf(processed))
  const base: MonthlyAggregate = {
    month: 'all', income: 0, expense: 0, byCategory: {}, byIncomeSource: {},
    byMerchant: {}, nightCount: 0, txnCount: 0,
  }
  for (const agg of Object.values(liveMonths)) mergeAgg(base, agg)
  for (const [m, agg] of Object.entries(archiveMonths)) {
    if (!txMonths.has(m)) mergeAgg(base, agg)
  }
  return base
}

function mergeAgg(target: MonthlyAggregate, src: MonthlyAggregate): void {
  target.income += src.income
  target.expense += src.expense
  target.nightCount += src.nightCount
  target.txnCount += src.txnCount
  for (const [k, v] of Object.entries(src.byCategory)) target.byCategory[k] = (target.byCategory[k] ?? 0) + v
  for (const [k, v] of Object.entries(src.byIncomeSource)) target.byIncomeSource[k] = (target.byIncomeSource[k] ?? 0) + v
  for (const [k, v] of Object.entries(src.byMerchant)) target.byMerchant[k] = (target.byMerchant[k] ?? 0) + v
}

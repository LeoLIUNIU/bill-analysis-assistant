import { useMemo, useRef } from 'react'
import { useStore } from '../store/useStore'
import { useProcessed } from '../hooks/useProcessed'
import { navigate } from '../hooks/useHashRoute'
import { categoryDef } from '../core/categories'
import { momDiff } from '../core/month'
import type { MonthlyAggregate } from '../core/schema'
import { Chart, donutOption, sankeyOption, trendOption, type SankeyDatum } from '../components/charts'
import { Card, EmptyState, SectionTitle, fmtMoney } from '../components/ui'

export function ReportPage({ hasData }: { hasData: boolean }) {
  const { allMonths, allAggregates, selectedAggregate, monthTx } = useProcessed()
  const selectedMonth = useStore((s) => s.selectedMonth)
  const setSelectedMonth = useStore((s) => s.setSelectedMonth)
  const exportArchive = useStore((s) => s.exportArchive)
  const importArchiveText = useStore((s) => s.importArchiveText)
  const archiveInputRef = useRef<HTMLInputElement>(null)

  const agg = selectedAggregate
  const prev = selectedMonth ? allAggregates[momPrev(selectedMonth)] : undefined

  const donut = useMemo(() => {
    if (!agg) return null
    const data = Object.entries(agg.byCategory)
      .map(([name, value]) => ({ name, value, itemStyle: { color: categoryDef(name).color } }))
      .sort((a, b) => b.value - a.value)
    return donutOption(data, true)
  }, [agg])

  const trend = useMemo(() => {
    const months = allMonths.slice(0, 12).reverse()
    if (months.length < 2) return null
    return trendOption(
      months,
      months.map((m) => allAggregates[m]?.expense ?? 0),
      months.map((m) => allAggregates[m]?.income ?? 0),
      true,
    )
  }, [allMonths, allAggregates])

  const sankey = useMemo(() => buildSankey(monthTx, selectedMonth), [monthTx, selectedMonth])

  if (!hasData || !agg) return <NoData />

  const net = agg.income - agg.expense

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 月份选择 + 存档操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedMonth('')}
          className={monthChip(selectedMonth === '')}
        >
          全部
        </button>
        {allMonths.map((m) => (
          <button key={m} onClick={() => setSelectedMonth(m)} className={monthChip(selectedMonth === m)}>
            {m}
          </button>
        ))}
        <div className="ml-auto flex gap-2 text-xs">
          <button onClick={exportArchive} className="rounded-lg bg-stone-100 px-3 py-1.5 font-medium text-ink-soft hover:bg-stone-200">
            ⬇️ 导出存档
          </button>
          <button onClick={() => archiveInputRef.current?.click()} className="rounded-lg bg-stone-100 px-3 py-1.5 font-medium text-ink-soft hover:bg-stone-200">
            ⬆️ 导入存档
          </button>
          <input
            ref={archiveInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void f.text().then(importArchiveText)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {/* 总览卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard emoji="💵" label="收入" value={agg.income} diff={momDiff(agg.income, prev?.income)} color="#16a34a" />
        <StatCard emoji="💸" label="支出" value={agg.expense} diff={momDiff(agg.expense, prev?.expense)} color="#ea580c" />
        <StatCard
          emoji={net >= 0 ? '🐿️' : '🫠'}
          label="结余"
          value={net}
          signed
          color={net >= 0 ? '#0d9488' : '#dc2626'}
        />
        <Card className="p-4">
          <div className="text-xs text-ink-soft">结余率 / 笔数</div>
          <div className="mt-1.5 text-xl font-bold text-ink">
            {agg.income > 0 ? `${Math.round((net / agg.income) * 100)}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-ink-soft">共 {agg.txnCount} 笔收支 · 夜间消费 {agg.nightCount} 笔</div>
        </Card>
      </div>

      {/* 支出构成 + 桑基图 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle emoji="🍩" title="支出都去了哪" />
          {donut && Object.keys(agg.byCategory).length > 0 ? (
            <Chart option={donut} height={300} />
          ) : (
            <p className="py-10 text-center text-sm text-ink-soft">这个月还没有支出记录</p>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle emoji="🌊" title="钱从哪来 → 到哪去" desc="每条线的粗细就是金额大小；内部转账已自动对冲掉。" />
          {sankey.links.length > 0 ? (
            <Chart option={sankeyOption(sankey)} height={300} />
          ) : (
            <p className="py-10 text-center text-sm text-ink-soft">数据还不够画出流向图</p>
          )}
        </Card>
      </div>

      {/* 月度趋势 */}
      {trend && (
        <Card className="p-5">
          <SectionTitle emoji="📈" title="月度收支趋势" />
          <Chart option={trend} height={260} />
        </Card>
      )}

      {/* Top 商户 */}
      <TopMerchants agg={agg} />
    </div>
  )
}

function TopMerchants({ agg }: { agg: MonthlyAggregate }) {
  const top = Object.entries(agg.byMerchant)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  if (top.length === 0) return null
  const max = top[0][1]
  return (
    <Card className="p-5">
      <SectionTitle emoji="🏪" title="花钱最多的地方" />
      <div className="space-y-2.5">
        {top.map(([name, v], i) => (
          <div key={name} className="flex items-center gap-3 text-sm">
            <span className="w-5 text-right text-xs text-ink-soft">{i + 1}</span>
            <span className="w-32 truncate font-medium text-ink" title={name}>{name || '未知商户'}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-squirrel-400" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="w-24 text-right font-semibold text-ink">¥{fmtMoney(v)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function StatCard({ emoji, label, value, diff, signed = false, color }: {
  emoji: string
  label: string
  value: number
  diff?: { pct: number | null; dir: 'up' | 'down' | 'flat' }
  signed?: boolean
  color: string
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-soft">{emoji} {label}</div>
      <div className="mt-1.5 text-xl font-bold" style={{ color }}>
        {diff?.dir === 'down' && !signed ? '-' : signed && value < 0 ? '-' : ''}¥{fmtMoney(Math.abs(value))}
      </div>
      {diff && diff.pct !== null && (
        <div className={`mt-1 text-xs ${diff.dir === 'up' ? 'text-orange-500' : diff.dir === 'down' ? 'text-emerald-600' : 'text-ink-soft'}`}>
          {diff.dir === 'up' ? '↑' : diff.dir === 'down' ? '↓' : '～'}
          {Math.abs(Math.round(diff.pct))}% 环比
        </div>
      )}
    </Card>
  )
}

function monthChip(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-squirrel-500 text-white shadow-sm' : 'bg-white text-ink-soft ring-1 ring-stone-200 hover:bg-stone-50'
  }`
}

/** 桑基图数据：收入来源 → 平台钱包 → 支出类目 */
function buildSankey(
  txs: ReturnType<typeof useProcessed>['monthTx'],
  month: string,
): SankeyDatum {
  const nodeSet = new Map<string, { name: string; itemStyle?: { color: string } }>()
  const links = new Map<string, number>()
  const walletOf = (platform: string) => (platform === 'wechat' ? '微信钱包' : '支付宝')

  for (const tx of txs) {
    if (month && tx.month !== month) continue
    const wallet = walletOf(tx.platform)
    if (tx.direction === 'in') {
      nodeSet.set(tx.category, { name: tx.category, itemStyle: { color: categoryDef(tx.category).color } })
      nodeSet.set(wallet, { name: wallet, itemStyle: { color: '#fbbf24' } })
      const key = `${tx.category}→${wallet}`
      links.set(key, (links.get(key) ?? 0) + tx.amount)
    } else if (tx.direction === 'out') {
      nodeSet.set(wallet, { name: wallet, itemStyle: { color: '#fbbf24' } })
      nodeSet.set(tx.category, { name: tx.category, itemStyle: { color: categoryDef(tx.category).color } })
      const key = `${wallet}→${tx.category}`
      links.set(key, (links.get(key) ?? 0) + tx.amount)
    }
  }

  return {
    nodes: [...nodeSet.values()],
    links: [...links.entries()].map(([k, value]) => {
      const [source, target] = k.split('→')
      return { source, target, value: Math.round(value * 100) / 100 }
    }),
  }
}

function momPrev(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function NoData() {
  return (
    <EmptyState
      emoji="📊"
      title="还没有可分析的账单"
      desc="导入微信/支付宝账单后，这里会出现收支全貌、流向图和月度趋势。"
      action={
        <button onClick={() => navigate('import')} className="rounded-lg bg-squirrel-500 px-4 py-2 text-sm font-medium text-white hover:bg-squirrel-600">
          去导入账单
        </button>
      }
    />
  )
}

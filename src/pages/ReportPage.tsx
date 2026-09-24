import { useMemo, useRef } from 'react'
import { useStore } from '../store/useStore'
import { useProcessed } from '../hooks/useProcessed'
import { navigate } from '../hooks/useHashRoute'
import { categoryDef } from '../core/categories'
import { momDiff } from '../core/month'
import {
  WEEKDAY_LABELS,
  amountBuckets,
  categoryRows,
  generateInsights,
  weekdaySums,
  type Insight,
} from '../core/insights'
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
  const label = selectedMonth || '全部'
  const prev = selectedMonth ? allAggregates[momPrev(selectedMonth)] : undefined

  const insights = useMemo(
    () => (agg ? generateInsights(monthTx, agg, prev, label === '全部' ? '本期' : label) : []),
    [monthTx, agg, prev, label],
  )

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

  const sankey = useMemo(() => buildSankey(monthTx), [monthTx])

  const weekday = useMemo(() => {
    const sums = weekdaySums(monthTx)
    if (sums.every((v) => v === 0)) return null
    return {
      sums,
      max: Math.max(...sums),
      busiest: WEEKDAY_LABELS[sums.indexOf(Math.max(...sums))],
    }
  }, [monthTx])

  const buckets = useMemo(() => amountBuckets(monthTx), [monthTx])
  const catRows = useMemo(() => (agg && prev ? categoryRows(agg, prev) : []), [agg, prev])

  if (!hasData || !agg) return <NoData />

  const net = agg.income - agg.expense

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 月份选择 + 存档操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-ink-soft">分析范围</span>
        <button onClick={() => setSelectedMonth('')} className={monthChip(selectedMonth === '')}>
          全部
        </button>
        {allMonths.map((m) => (
          <button key={m} onClick={() => setSelectedMonth(m)} className={monthChip(selectedMonth === m)}>
            {m}
          </button>
        ))}
        <div className="ml-auto flex gap-2 text-xs">
          <button onClick={exportArchive} className="rounded-lg bg-white px-3 py-1.5 font-medium text-ink-soft ring-1 ring-stone-200 hover:ring-stone-300">
            ⬇️ 导出存档
          </button>
          <button onClick={() => archiveInputRef.current?.click()} className="rounded-lg bg-white px-3 py-1.5 font-medium text-ink-soft ring-1 ring-stone-200 hover:ring-stone-300">
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

      {/* 洞察区 */}
      {insights.length > 0 && (
        <Card className="p-5">
          <SectionTitle
            emoji="💡"
            title={`${label} 洞察`}
            desc="松鼠读完你的账单后想说的话——每句都有数据依据。"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.map((ins) => (
              <InsightCard key={ins.id} ins={ins} />
            ))}
          </div>
        </Card>
      )}

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
          <SectionTitle emoji="🌊" title="钱从哪来 → 到哪去" desc="线的粗细就是金额；内部转账已自动对冲。" />
          {sankey.links.length > 0 ? (
            <Chart option={sankeyOption(sankey)} height={300} />
          ) : (
            <p className="py-10 text-center text-sm text-ink-soft">数据还不够画出流向图</p>
          )}
        </Card>
      </div>

      {/* 消费习惯：周内规律 + 单笔分布 */}
      {(weekday || buckets.some((b) => b.count > 0)) && (
        <Card className="p-5">
          <SectionTitle emoji="🧭" title="消费习惯" desc="什么时候花钱、怎么个花法，规律都藏在里面。" />
          <div className="grid gap-6 lg:grid-cols-2">
            {weekday && (
              <div>
                <div className="mb-3 text-xs text-ink-soft">
                  周内规律 · 最能花的一天是 <b className="text-ink">{weekday.busiest}</b>
                </div>
                <div className="space-y-2">
                  {weekday.sums.map((v, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs">
                      <span className="w-8 shrink-0 text-ink-soft">{WEEKDAY_LABELS[i]}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded-md bg-stone-100">
                        <div
                          className={`h-full rounded-md ${i >= 5 ? 'bg-rose-300' : 'bg-squirrel-300'}`}
                          style={{ width: weekday.max > 0 ? `${(v / weekday.max) * 100}%` : 0 }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right font-semibold text-ink">
                        {v > 0 ? `¥${fmtMoney(v)}` : '—'}
                      </span>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] text-stone-400">红色为周末</p>
                </div>
              </div>
            )}
            {buckets.some((b) => b.count > 0) && (
              <div>
                <div className="mb-3 text-xs text-ink-soft">单笔金额分布 · 共 {buckets.reduce((s, b) => s + b.count, 0)} 笔支出</div>
                <div className="space-y-3">
                  {buckets.map((b, i) => {
                    const maxCount = Math.max(...buckets.map((x) => x.count), 1)
                    const colors = ['#fdba74', '#fb923c', '#ea580c']
                    return (
                      <div key={b.name}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-ink">{b.name}</span>
                          <span className="text-ink-soft">
                            {b.count} 笔 · <b className="text-ink">¥{fmtMoney(b.sum)}</b>
                          </span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-stone-100">
                          <div className="h-full rounded-full" style={{ width: `${(b.count / maxCount) * 100}%`, backgroundColor: colors[i] }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 月度趋势 */}
      {trend && (
        <Card className="p-5">
          <SectionTitle emoji="📈" title="月度收支趋势" />
          <Chart option={trend} height={260} />
        </Card>
      )}

      {/* 分类环比 */}
      {catRows.length > 0 && selectedMonth && (
        <Card className="p-5">
          <SectionTitle emoji="📊" title="分类环比" desc={`对比 ${momPrev(selectedMonth)} → ${selectedMonth}，看哪些类目在悄悄变化。`} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-ink-soft">
                  <th className="py-2 pr-2 font-medium">分类</th>
                  <th className="py-2 pr-2 text-right font-medium">本月</th>
                  <th className="py-2 pr-2 text-right font-medium">上月</th>
                  <th className="py-2 pr-2 text-right font-medium">变化</th>
                </tr>
              </thead>
              <tbody>
                {catRows.slice(0, 10).map((r) => (
                  <tr key={r.name} className="border-b border-stone-100">
                    <td className="py-2 pr-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                        <span>{categoryDef(r.name).emoji}</span>
                        {r.name}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold text-ink">¥{fmtMoney(r.current)}</td>
                    <td className="py-2 pr-2 text-right text-ink-soft">{r.previous !== undefined ? `¥${fmtMoney(r.previous)}` : '—'}</td>
                    <td className="py-2 pr-2 text-right">
                      {r.previous === undefined ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-600">新增类目</span>
                      ) : r.diffPct === null ? (
                        <span className="text-ink-soft">—</span>
                      ) : (
                        <span className={`font-semibold ${r.diffPct > 0.15 ? 'text-orange-600' : r.diffPct < -0.15 ? 'text-emerald-600' : 'text-ink-soft'}`}>
                          {r.diffPct > 0 ? '↑' : '↓'}
                          {Math.abs(Math.round(r.diffPct * 100))}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Top 商户 */}
      <TopMerchants agg={agg} />
    </div>
  )
}

/** 洞察卡片：左侧色条 + 图标标题 + 数据依据 */
function InsightCard({ ins }: { ins: Insight }) {
  const styles = {
    good: { bar: '#10b981', bg: '#ecfdf5' },
    warn: { bar: '#f59e0b', bg: '#fffbeb' },
    info: { bar: '#0ea5e9', bg: '#f0f9ff' },
  }[ins.kind]
  return (
    <div className="rounded-xl p-3.5" style={{ backgroundColor: styles.bg, boxShadow: `inset 3px 0 0 ${styles.bar}` }}>
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">{ins.icon}</span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink">{ins.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{ins.detail}</p>
        </div>
      </div>
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
    active ? 'bg-squirrel-500 text-white shadow-sm' : 'bg-white text-ink-soft ring-1 ring-stone-200 hover:ring-stone-300'
  }`
}

/** 桑基图数据：收入来源 → 平台钱包 → 支出类目 */
function buildSankey(txs: ReturnType<typeof useProcessed>['monthTx']): SankeyDatum {
  const nodeSet = new Map<string, { name: string; itemStyle?: { color: string } }>()
  const links = new Map<string, number>()
  const walletOf = (platform: string) => (platform === 'wechat' ? '微信钱包' : '支付宝')

  for (const tx of txs) {
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
      desc="导入微信/支付宝账单后，这里会出现收支全貌、消费洞察和习惯分析。"
      action={
        <button onClick={() => navigate('import')} className="rounded-lg bg-squirrel-500 px-4 py-2 text-sm font-medium text-white hover:bg-squirrel-600">
          去导入账单
        </button>
      }
    />
  )
}

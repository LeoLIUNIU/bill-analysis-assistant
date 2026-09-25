import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { useProcessed } from '../hooks/useProcessed'
import { navigate } from '../hooks/useHashRoute'
import { ALL_CATEGORIES, categoryDef } from '../core/categories'
import { momDiff } from '../core/month'
import {
  WEEKDAY_LABELS,
  amountBuckets,
  categoryRows,
  generateInsights,
  weekdaySums,
  type Insight,
} from '../core/insights'
import {
  categoryDetails,
  incomeBreakdown,
  payMethodBreakdown,
  recurringExpenses,
  type CategoryDetail,
} from '../core/analysis'
import { downloadReport, type ReportData } from '../core/report'
import { computePersona } from '../core/persona'
import { countsAsFlow, needsReview } from '../core/transfer'
import type { MonthlyAggregate, Transaction } from '../core/schema'
import { downloadTextFile } from '../core/archive'
import { Chart, donutOption, sankeyOption, trendOption, type SankeyDatum } from '../components/charts'
import { Card, EmptyState, FlagChip, PlatformBadge, SectionTitle, fmtMoney } from '../components/ui'

type Tab = 'overview' | 'spending' | 'transactions'

const TABS: Array<{ key: Tab; label: string; emoji: string }> = [
  { key: 'overview', label: '总览', emoji: '🗂️' },
  { key: 'spending', label: '花费分析', emoji: '🍽️' },
  { key: 'transactions', label: '交易记录', emoji: '📋' },
]

export function AnalysisPage({ hasData }: { hasData: boolean }) {
  const [tab, setTab] = useState<Tab>('overview')
  const { processed, queue, allMonths, allAggregates, selectedAggregate, monthTx } = useProcessed()
  const selectedMonth = useStore((s) => s.selectedMonth)
  const setSelectedMonth = useStore((s) => s.setSelectedMonth)
  const corrections = useStore((s) => s.corrections)
  const exportArchive = useStore((s) => s.exportArchive)
  const importArchiveText = useStore((s) => s.importArchiveText)
  const archiveInputRef = useRef<HTMLInputElement>(null)

  const label = selectedMonth || '全部'
  const prev = selectedMonth ? allAggregates[momPrev(selectedMonth)] : undefined
  const agg = selectedAggregate

  const insights = useMemo(
    () => (agg ? generateInsights(monthTx, agg, prev, selectedMonth || '本期') : []),
    [monthTx, agg, prev, selectedMonth],
  )
  const catDetails = useMemo(
    () => (agg ? categoryDetails(monthTx, agg.expense, prev) : []),
    [monthTx, agg, prev],
  )
  const payMethods = useMemo(() => payMethodBreakdown(monthTx), [monthTx])
  const incomes = useMemo(() => incomeBreakdown(monthTx), [monthTx])
  const recurring = useMemo(() => recurringExpenses(processed), [processed])
  const persona = useMemo(() => computePersona(monthTx), [monthTx])

  const handleDownloadReport = () => {
    if (!agg) return
    const data: ReportData = {
      label,
      generatedAt: new Date().toLocaleString('zh-CN'),
      agg,
      insights,
      categories: catDetails,
      payMethods,
      recurring,
      persona,
      txnCount: agg.txnCount,
    }
    downloadReport(data)
  }

  if (!hasData || !agg) {
    return (
      <EmptyState
        emoji="📊"
        title="还没有可分析的账单"
        desc="先在引导页上传微信/支付宝账单（可多个），一键分析后这里会出现完整报告。"
        action={
          <button onClick={() => navigate('guide')} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:bg-brand-700">
            去上传账单
          </button>
        }
      />
    )
  }

  return (
       <div className="mx-auto max-w-5xl">
      {/* 页头：标题 + 月份 + 下载报告 */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-4">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">账单分析</h1>
          <p className="mt-1 text-sm text-ink-soft">范围：{label} · {agg.txnCount} 笔有效收支 · 转账/还款已自动对冲</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportArchive}
            className="rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-ink ring-1 ring-slate-200 transition-all hover:ring-brand-300"
            title="导出JSON存档，换设备可导入恢复历史"
          >
            💾 存档
          </button>
          <button
            onClick={() => archiveInputRef.current?.click()}
            className="rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-ink ring-1 ring-slate-200 transition-all hover:ring-brand-300"
            title="导入此前导出的JSON存档"
          >
            📂 恢复
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
          <button
            onClick={handleDownloadReport}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:bg-brand-700"
          >
            ⬇️ 下载分析报告
          </button>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="mt-4 flex items-center gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/70">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                : 'text-ink-soft hover:bg-slate-50'
            }`}
          >
            <span className="mr-1">{t.emoji}</span>{t.label}
            {t.key === 'transactions' && queue.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-bold text-white">{queue.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 月份选择 */}
      <MonthBar
        months={allMonths}
        selected={selectedMonth}
        onSelect={setSelectedMonth}
      />

      {tab === 'overview' && (
        <OverviewTab agg={agg} prev={prev} monthTx={monthTx} allMonths={allMonths} allAggregates={allAggregates}
          insights={insights} incomes={incomes} payMethods={payMethods} />
      )}
      {tab === 'spending' && (
        <SpendingTab agg={agg} prev={prev} monthTx={monthTx} catDetails={catDetails} recurring={recurring} />
      )}
      {tab === 'transactions' && (
        <TransactionsTab processed={processed} queue={queue} months={allMonths} correctionsCount={Object.keys(corrections).length} />
      )}
    </div>
  )
}

/* ================= 页头组件 ================= */

function MonthBar({ months, selected, onSelect }: { months: string[]; selected: string; onSelect: (m: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button onClick={() => onSelect('')} className={monthChip(selected === '')}>全部</button>
      {months.map((m) => (
        <button key={m} onClick={() => onSelect(m)} className={monthChip(selected === m)}>{m}</button>
      ))}
    </div>
  )
}

function monthChip(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
    active ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30' : 'bg-white text-ink-soft ring-1 ring-slate-200 hover:ring-brand-300'
  }`
}

/* ================= Tab 1: 总览 ================= */

function OverviewTab({ agg, prev, monthTx, allMonths, allAggregates, insights, incomes, payMethods }: {
  agg: MonthlyAggregate
  prev?: MonthlyAggregate
  monthTx: Transaction[]
  allMonths: string[]
  allAggregates: Record<string, MonthlyAggregate>
  insights: Insight[]
  incomes: ReturnType<typeof incomeBreakdown>
  payMethods: ReturnType<typeof payMethodBreakdown>
}) {
  const donut = useMemo(() => {
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
  const net = agg.income - agg.expense

  return (
    <div className="mt-5 space-y-5">
      {/* 总览卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard emoji="💵" label="收入" value={agg.income} diff={momDiff(agg.income, prev?.income)} color="#059669" />
        <StatCard emoji="💸" label="支出" value={agg.expense} diff={momDiff(agg.expense, prev?.expense)} color="#4f46e5" />
        <StatCard emoji={net >= 0 ? '💰' : '🫠'} label="结余" value={net} signed color={net >= 0 ? '#0d9488' : '#dc2626'} />
        <Card className="p-4">
          <div className="text-xs text-ink-soft">结余率 / 笔数</div>
          <div className="mt-1.5 text-xl font-bold text-ink">
            {agg.income > 0 ? `${Math.round((net / agg.income) * 100)}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-ink-soft">共 {agg.txnCount} 笔收支 · 夜间 {agg.nightCount} 笔</div>
        </Card>
      </div>

      {/* 洞察 */}
      {insights.length > 0 && (
        <Card className="p-5">
          <SectionTitle emoji="💡" title="洞察" desc="分析引擎读完你的账单后想说的话——每句都有数据依据。" />
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.map((ins) => <InsightCard key={ins.id} ins={ins} />)}
          </div>
        </Card>
      )}

      {/* 构成图 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle emoji="🍩" title="支出构成" />
          {Object.keys(agg.byCategory).length > 0
            ? <Chart option={donut} height={300} />
            : <p className="py-10 text-center text-sm text-ink-soft">还没有支出记录</p>}
        </Card>
        <Card className="p-5">
          <SectionTitle emoji="🌊" title="钱从哪来 → 到哪去" desc="线的粗细就是金额；内部转账已自动对冲。" />
          {sankey.links.length > 0
            ? <Chart option={sankeyOption(sankey)} height={300} />
            : <p className="py-10 text-center text-sm text-ink-soft">数据还不够画出流向图</p>}
        </Card>
      </div>

      {/* 收入构成 + 支付方式 */}
      {(incomes.length > 0 || payMethods.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {incomes.length > 0 && (
            <Card className="p-5">
              <SectionTitle emoji="💵" title="收入构成" desc={`共 ${incomes.length} 类来源 · ¥${fmtMoney(agg.income)}`} />
              <BreakdownList rows={incomes} total={agg.income} colors={['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5']} />
            </Card>
          )}
          {payMethods.length > 0 && (
            <Card className="p-5">
              <SectionTitle emoji="💳" title="支付方式" desc="钱主要从哪个口袋出去" />
              <BreakdownList rows={payMethods} total={agg.expense} colors={['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff']} />
            </Card>
          )}
        </div>
      )}

      {/* 趋势 */}
      {trend && (
        <Card className="p-5">
          <SectionTitle emoji="📈" title="月度收支趋势" />
          <Chart option={trend} height={260} />
        </Card>
      )}
    </div>
  )
}

function BreakdownList({ rows, total, colors }: {
  rows: Array<{ name: string; total: number; count: number }>
  total: number
  colors: string[]
}) {
  const top = rows.slice(0, 6)
  return (
    <div className="space-y-3">
      {top.map((r, i) => (
        <div key={r.name}>
          <div className="flex items-center justify-between text-xs">
            <span className="max-w-60 truncate font-medium text-ink">{r.name}</span>
            <span className="text-ink-soft">
              {total > 0 ? `${Math.round((r.total / total) * 100)}% · ` : ''}<b className="text-ink">¥{fmtMoney(r.total)}</b> · {r.count} 笔
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: total > 0 ? `${(r.total / total) * 100}%` : 0, backgroundColor: colors[i % colors.length] }} />
          </div>
        </div>
      ))}
    </div>
  )
}

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

/* ================= Tab 2: 花费分析 ================= */

function SpendingTab({ agg, prev, monthTx, catDetails, recurring }: {
  agg: MonthlyAggregate
  prev?: MonthlyAggregate
  monthTx: Transaction[]
  catDetails: CategoryDetail[]
  recurring: ReturnType<typeof recurringExpenses>
}) {
  const [expanded, setExpanded] = useState<string | null>(catDetails[0]?.name ?? null)

  const weekday = useMemo(() => {
    const sums = weekdaySums(monthTx)
    if (sums.every((v) => v === 0)) return null
    return { sums, max: Math.max(...sums), busiest: WEEKDAY_LABELS[sums.indexOf(Math.max(...sums))] }
  }, [monthTx])

  const buckets = useMemo(() => amountBuckets(monthTx), [monthTx])
  const catMoM = useMemo(() => (prev ? categoryRows(agg, prev) : []), [agg, prev])
  const monthlyFixed = recurring.reduce((s, r) => s + r.avgAmount, 0)

  return (
    <div className="mt-5 space-y-5">
      {/* 固定支出 */}
      {recurring.length > 0 && (
        <Card className="p-5">
          <SectionTitle
            emoji="🔁"
            title={`固定支出 · 月均 ¥${fmtMoney(monthlyFixed)}`}
            desc="同一收款方连续多月、金额相近的支出（房租、订阅等），跨全部月份识别。"
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {recurring.slice(0, 6).map((r) => (
              <div key={r.counterparty} className="rounded-xl bg-slate-50 px-3.5 py-3">
                <div className="truncate text-sm font-semibold text-ink" title={r.counterparty}>{r.counterparty}</div>
                <div className="mt-1 text-xs text-ink-soft">
                  月均 <b className="text-ink">¥{fmtMoney(r.avgAmount)}</b> · 连续 {r.months.length} 个月 · {r.category}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 分类深析 */}
      <Card className="p-5">
        <SectionTitle emoji="🍽️" title="分类深析" desc="点击展开每个分类的商户构成、单笔结构、环比与解读。" />
        <div className="space-y-2">
          {catDetails.map((c) => {
            const def = categoryDef(c.name)
            const open = expanded === c.name
            return (
              <div key={c.name} className={`overflow-hidden rounded-xl ring-1 transition-all ${open ? 'ring-brand-200' : 'ring-slate-200'}`}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => setExpanded(open ? null : c.name)}
                >
                  <span className="text-xl">{def.emoji}</span>
                  <span className="w-20 shrink-0 text-sm font-semibold text-ink">{c.name}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(c.share * 100)}%`, backgroundColor: def.color }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs text-ink-soft">{Math.round(c.share * 100)}%</span>
                  <span className="w-24 shrink-0 text-right text-sm font-bold text-ink">¥{fmtMoney(c.total)}</span>
                  <span className={`shrink-0 text-xs text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3.5">
                    {c.insight && (
                      <p className="mb-3 rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-ink-soft ring-1 ring-slate-200">
                        💬 {c.insight}
                      </p>
                    )}
                    <div className="grid gap-2.5 sm:grid-cols-4">
                      <MiniStat label="笔数" value={`${c.count} 笔`} />
                      <MiniStat label="单笔均值" value={`¥${fmtMoney(c.avg)}`} />
                      <MiniStat
                        label="最大单笔"
                        value={c.maxTx ? `¥${fmtMoney(c.maxTx.amount)}` : '—'}
                        sub={c.maxTx ? `${c.maxTx.time.slice(5, 10)} ${c.maxTx.counterparty || c.maxTx.item}`.slice(0, 18) : undefined}
                      />
                      <MiniStat
                        label="环比"
                        value={c.momPct === null ? '—' : `${c.momPct > 0 ? '↑' : '↓'}${Math.abs(Math.round(c.momPct * 100))}%`}
                      />
                    </div>
                    {c.topMerchants.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-1.5 text-xs font-semibold text-ink-soft">主要商户</div>
                        <div className="space-y-1.5">
                          {c.topMerchants.map((m) => (
                            <div key={m.name} className="flex items-center gap-2.5 text-xs">
                              <span className="w-36 truncate text-ink" title={m.name}>{m.name}</span>
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <div className="h-full rounded-full" style={{ width: `${(m.total / c.topMerchants[0].total) * 100}%`, backgroundColor: def.color }} />
                              </div>
                              <span className="w-20 text-right text-ink-soft">¥{fmtMoney(m.total)} · {m.count}笔</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* 消费习惯 */}
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
                      <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className={`h-full rounded-md ${i >= 5 ? 'bg-rose-300' : 'bg-brand-300'}`}
                          style={{ width: weekday.max > 0 ? `${(v / weekday.max) * 100}%` : 0 }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right font-semibold text-ink">{v > 0 ? `¥${fmtMoney(v)}` : '—'}</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] text-slate-400">红色为周末</p>
                </div>
              </div>
            )}
            {buckets.some((b) => b.count > 0) && (
              <div>
                <div className="mb-3 text-xs text-ink-soft">单笔金额分布 · 共 {buckets.reduce((s, b) => s + b.count, 0)} 笔支出</div>
                <div className="space-y-3">
                  {buckets.map((b, i) => {
                    const maxCount = Math.max(...buckets.map((x) => x.count), 1)
                    const colors = ['#a5b4fc', '#818cf8', '#4f46e5']
                    return (
                      <div key={b.name}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-ink">{b.name}</span>
                          <span className="text-ink-soft">{b.count} 笔 · <b className="text-ink">¥{fmtMoney(b.sum)}</b></span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
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

      {/* 分类环比表 */}
      {catMoM.length > 0 && (
        <Card className="p-5">
          <SectionTitle emoji="📊" title="分类环比" desc="看哪些类目在悄悄变化。" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-ink-soft">
                  <th className="py-2 pr-2 font-medium">分类</th>
                  <th className="py-2 pr-2 text-right font-medium">本期</th>
                  <th className="py-2 pr-2 text-right font-medium">上期</th>
                  <th className="py-2 pr-2 text-right font-medium">变化</th>
                </tr>
              </thead>
              <tbody>
                {catMoM.slice(0, 10).map((r) => (
                  <tr key={r.name} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                        <span>{categoryDef(r.name).emoji}</span>{r.name}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold text-ink">¥{fmtMoney(r.current)}</td>
                    <td className="py-2 pr-2 text-right text-ink-soft">{r.previous !== undefined ? `¥${fmtMoney(r.previous)}` : '—'}</td>
                    <td className="py-2 pr-2 text-right">
                      {r.previous === undefined ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-600">新增</span>
                      ) : r.diffPct === null ? (
                        <span className="text-ink-soft">—</span>
                      ) : (
                        <span className={`font-semibold ${r.diffPct > 0.15 ? 'text-brand-600' : r.diffPct < -0.15 ? 'text-emerald-600' : 'text-ink-soft'}`}>
                          {r.diffPct > 0 ? '↑' : '↓'}{Math.abs(Math.round(r.diffPct * 100))}%
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
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-ink">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-slate-400" title={sub}>{sub}</div>}
    </div>
  )
}

/* ================= Tab 3: 交易记录 ================= */

interface TxFilter {
  month: string
  platform: string
  category: string
  direction: string
  flag: string
  search: string
}

function TransactionsTab({ processed, queue, months, correctionsCount }: {
  processed: Transaction[]
  queue: Transaction[]
  months: string[]
  correctionsCount: number
}) {
  const setCorrection = useStore((s) => s.setCorrection)
  const selectedMonth = useStore((s) => s.selectedMonth)
  const [filter, setFilter] = useState<TxFilter>({ month: '', platform: '', category: '', direction: '', flag: '', search: '' })
  const [sortBy, setSortBy] = useState<'time' | 'amount'>('time')
  const [limit, setLimit] = useState(60)
  const [onlyQueue, setOnlyQueue] = useState(false)
  const queueIds = useMemo(() => new Set(queue.map((q) => q.id)), [queue])

  const filtered = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    let list = processed
    const month = filter.month || selectedMonth
    if (month) list = list.filter((t) => t.month === month)
    if (filter.platform) list = list.filter((t) => t.platform === filter.platform)
    if (filter.category) list = list.filter((t) => t.category === filter.category)
    if (filter.direction) list = list.filter((t) => t.direction === filter.direction)
    if (filter.flag === 'transfer') list = list.filter((t) => t.transferFlag === 'internal' || t.transferFlag === 'repayment')
    else if (filter.flag === 'normal') list = list.filter((t) => !t.transferFlag)
    if (onlyQueue) list = list.filter((t) => queueIds.has(t.id))
    if (q) list = list.filter((t) => `${t.counterparty} ${t.item} ${t.category} ${t.type} ${t.payMethod}`.toLowerCase().includes(q))
    return [...list].sort((a, b) => (sortBy === 'time' ? b.time.localeCompare(a.time) : b.amount - a.amount))
  }, [processed, filter, sortBy, onlyQueue, queueIds, selectedMonth])

  const exportCSV = () => {
    const header = ['时间', '平台', '交易对方', '商品', '分类', '收/支', '金额', '支付方式', '状态', '标记']
    const flagLabel: Record<string, string> = { internal: '内部转账', repayment: '信用还款', refund: '退款' }
    const lines = filtered.map((t) => [
      t.time,
      t.platform === 'wechat' ? '微信' : '支付宝',
      t.counterparty, t.item, t.category,
      t.direction === 'in' ? '收入' : t.direction === 'out' ? '支出' : '中性',
      String(t.amount), t.payMethod, t.status,
      t.transferFlag ? flagLabel[t.transferFlag] : '',
    ])
    const csv = '\ufeff' + [header, ...lines]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    downloadTextFile(`交易记录_${filtered.length}笔.csv`, csv, 'text/csv;charset=utf-8')
  }

  const selectCls = 'rounded-lg border-0 bg-slate-100 px-2.5 py-1.5 text-sm text-ink outline-none'

  return (
    <div className="mt-5 space-y-5">
      {/* 待确认队列 */}
      {queue.length > 0 && (
        <Card className="border-l-4 border-l-amber-400 p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <h3 className="text-base font-bold text-ink">{queue.length} 笔交易待确认</h3>
          </div>
          <p className="mt-1 text-xs text-ink-soft">这些可能是转账/还款也可能是正常消费，点一下标记真实性质，统计立刻更准。</p>
          <div className="mt-4 space-y-3">
            {queue.map((tx) => (
              <div key={tx.id} className="rounded-xl bg-slate-50 p-4 transition-colors hover:bg-amber-50/60">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PlatformBadge platform={tx.platform} />
                  <span className="text-xs text-ink-soft">{tx.time.slice(5, 16)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {tx.counterparty || tx.item || '未知商户'}
                    <span className="ml-1.5 text-xs font-normal text-ink-soft">{tx.item}</span>
                  </span>
                  <span className={`shrink-0 text-base font-bold ${tx.direction === 'in' ? 'text-emerald-600' : 'text-brand-600'}`}>
                    {tx.direction === 'in' ? '+' : '-'}¥{fmtMoney(tx.amount)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={chipCls} onClick={() => setCorrection(tx.id, { transferFlag: 'internal' })}>🔁 内部转账</button>
                  <button className={chipCls} onClick={() => setCorrection(tx.id, { transferFlag: 'repayment' })}>💳 信用还款</button>
                  <button className={chipCls} onClick={() => setCorrection(tx.id, { transferFlag: 'refund' })}>↩️ 退款</button>
                  <button className={chipPrimaryCls} onClick={() => setCorrection(tx.id, { transferFlag: 'normal' })}>
                    ✅ {tx.direction === 'in' ? '是收入' : '是支出'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 筛选与表格 */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-ink">📋 交易记录</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-ink-soft">{filtered.length} 条</span>
          {correctionsCount > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">已手工修正 {correctionsCount} 条</span>
          )}
          <button
            onClick={exportCSV}
            className="ml-auto rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-slate-200 transition-all hover:ring-brand-300"
          >
            ⬇️ 导出筛选结果 CSV
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={selectCls} value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}>
            <option value="">全部月份{selectedMonth ? '' : '（跟随上方选择）'}</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={selectCls} value={filter.platform} onChange={(e) => setFilter({ ...filter, platform: e.target.value })}>
            <option value="">全部平台</option>
            <option value="wechat">微信</option>
            <option value="alipay">支付宝</option>
          </select>
          <select className={selectCls} value={filter.direction} onChange={(e) => setFilter({ ...filter, direction: e.target.value })}>
            <option value="">收+支</option>
            <option value="out">仅支出</option>
            <option value="in">仅收入</option>
            <option value="neutral">仅中性</option>
          </select>
          <select className={selectCls} value={filter.flag} onChange={(e) => setFilter({ ...filter, flag: e.target.value })}>
            <option value="">全部性质</option>
            <option value="normal">正常收支</option>
            <option value="transfer">转账/还款</option>
          </select>
          <select className={selectCls} value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
            <option value="">全部分类</option>
            {ALL_CATEGORIES.filter((c) => c.kind === 'expense' || c.kind === 'income').map((c) => (
              <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
            ))}
          </select>
          <input
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            placeholder="🔍 搜索商户 / 商品 / 支付方式"
            className="min-w-44 flex-1 rounded-lg border-0 bg-slate-100 px-3 py-1.5 text-sm outline-none ring-1 ring-transparent transition-shadow focus:bg-white focus:ring-brand-400"
          />
          <button
            onClick={() => setSortBy(sortBy === 'time' ? 'amount' : 'time')}
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-slate-200"
          >
            ⇅ {sortBy === 'time' ? '按时间' : '按金额'}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={onlyQueue} onChange={(e) => setOnlyQueue(e.target.checked)} className="accent-brand-500" />
            只看待确认
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-170 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-ink-soft">
                <th className="py-2 pr-2 font-medium">时间</th>
                <th className="py-2 pr-2 font-medium">平台</th>
                <th className="py-2 pr-2 font-medium">商户/事项</th>
                <th className="py-2 pr-2 font-medium">分类</th>
                <th className="py-2 pr-2 font-medium">性质</th>
                <th className="py-2 pr-2 font-medium">支付方式</th>
                <th className="py-2 pr-2 text-right font-medium">金额</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((tx) => (
                <tr key={tx.id} className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${countsAsFlow(tx) ? '' : 'opacity-45'}`}>
                  <td className="whitespace-nowrap py-2 pr-2 text-xs text-ink-soft">{tx.time.slice(5, 16)}</td>
                  <td className="py-2 pr-2"><PlatformBadge platform={tx.platform} /></td>
                  <td className="max-w-56 py-2 pr-2">
                    <div className="truncate font-medium text-ink" title={tx.item}>{tx.counterparty || tx.item}</div>
                    <div className="truncate text-xs text-ink-soft">{tx.item}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      className="cursor-pointer rounded-md border-0 bg-slate-100 px-1.5 py-0.5 text-xs text-ink-soft outline-none hover:bg-slate-200"
                      value={tx.category}
                      onChange={(e) => setCorrection(tx.id, { category: e.target.value })}
                    >
                      <optgroup label="支出">
                        {ALL_CATEGORIES.filter((c) => c.kind === 'expense').map((c) => (
                          <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="收入">
                        {ALL_CATEGORIES.filter((c) => c.kind === 'income').map((c) => (
                          <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    {needsReview(tx) ? (
                      <button className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-200"
                        onClick={() => setCorrection(tx.id, { transferFlag: 'normal' })}>
                        待确认→是{tx.direction === 'in' ? '收入' : '支出'}
                      </button>
                    ) : (
                      <FlagChip tx={tx} />
                    )}
                  </td>
                  <td className="max-w-28 truncate py-2 pr-2 text-xs text-ink-soft" title={tx.payMethod}>{tx.payMethod || '—'}</td>
                  <td className={`whitespace-nowrap py-2 pr-2 text-right font-semibold ${tx.direction === 'in' ? 'text-emerald-600' : tx.direction === 'neutral' ? 'text-slate-400' : 'text-brand-600'}`}>
                    {tx.direction === 'in' ? '+' : ''}{fmtMoney(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="mt-3 text-center">
            <button className="rounded-lg bg-slate-100 px-4 py-1.5 text-sm text-ink-soft transition-colors hover:bg-slate-200"
              onClick={() => setLimit(limit + 100)}>
              加载更多（剩 {filtered.length - limit} 条）
            </button>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          💡 灰色行不参与收支统计（内部转账/还款/退款/中性交易）；点击分类下拉可直接修改，修正会被永久记住。
        </p>
      </Card>
    </div>
  )
}

const chipCls =
  'rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-slate-200 transition-all hover:-translate-y-px hover:ring-brand-400 hover:text-brand-700'

const chipPrimaryCls =
  'rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-brand-700'

/* ================= 通用 ================= */

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
        <div className={`mt-1 text-xs ${diff.dir === 'up' ? 'text-brand-600' : diff.dir === 'down' ? 'text-emerald-600' : 'text-ink-soft'}`}>
          {diff.dir === 'up' ? '↑' : diff.dir === 'down' ? '↓' : '～'}{Math.abs(Math.round(diff.pct))}% 环比
        </div>
      )}
    </Card>
  )
}

function buildSankey(txs: Transaction[]): SankeyDatum {
  const nodeSet = new Map<string, { name: string; itemStyle?: { color: string } }>()
  const links = new Map<string, number>()
  const walletOf = (platform: string) => (platform === 'wechat' ? '微信钱包' : '支付宝')

  for (const tx of txs) {
    const wallet = walletOf(tx.platform)
    if (tx.direction === 'in') {
      nodeSet.set(tx.category, { name: tx.category, itemStyle: { color: categoryDef(tx.category).color } })
      nodeSet.set(wallet, { name: wallet, itemStyle: { color: '#818cf8' } })
      const key = `${tx.category}→${wallet}`
      links.set(key, (links.get(key) ?? 0) + tx.amount)
    } else if (tx.direction === 'out') {
      nodeSet.set(wallet, { name: wallet, itemStyle: { color: '#818cf8' } })
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

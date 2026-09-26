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
  deepMining,
  shoppingSpend,
  incomeBreakdown,
  payMethodBreakdown,
  recurringExpenses,
  type CategoryDetail,
} from '../core/analysis'
import { downloadReport, type ReportData } from '../core/report'
import { computePersona } from '../core/persona'
import { computeLabelCandidates, unlabeledPool } from '../core/labeling'
import { LabelingModal } from '../components/LabelingModal'
import { countsAsFlow, needsReview } from '../core/transfer'
import { BANK_META, platformName, type Correction, type MonthlyAggregate, type Platform, type Transaction } from '../core/schema'
import { downloadTextFile } from '../core/archive'
import { Chart, donutOption, multiLineOption, sankeyOption, stackedBarOption, trendOption, type DonutDetail, type SankeyDatum } from '../components/charts'
import { Card, EmptyState, FlagChip, PlatformBadge, SectionTitle, fmtMoney, fmtTxTime } from '../components/ui'

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
  const mining = useMemo(() => deepMining(monthTx, processed), [monthTx, processed])
  const skippedLabelIds = useStore((s) => s.skippedLabelIds)
  const skipLabel = useStore((s) => s.skipLabel)
  const [labelingOpen, setLabelingOpen] = useState(false)
  const [poolBefore, setPoolBefore] = useState(0)
  const labelCandidates = useMemo(
    () => computeLabelCandidates(processed, agg?.expense ?? 0, new Set(skippedLabelIds)),
    [processed, agg, skippedLabelIds],
  )
  const pool = useMemo(() => unlabeledPool(processed, agg?.expense ?? 0), [processed, agg])
  const openLabeling = () => {
    setPoolBefore(pool.sum)
    setLabelingOpen(true)
  }
  const handleLabelConfirm = (id: string, category: string, memo?: string) => {
    useStore.getState().setCorrection(id, { category, memo })
  }
  const persona = useMemo(() => computePersona(monthTx), [monthTx])
  const shopping = useMemo(() => shoppingSpend(monthTx, agg?.expense ?? 0), [monthTx, agg])
  const budgetMonthly = useStore((s) => s.budgetMonthly)
  const setBudgetMonthly = useStore((s) => s.setBudgetMonthly)
  const budgetByCategory = useStore((s) => s.budgetByCategory)
  const setBudgetCategory = useStore((s) => s.setBudgetCategory)
  // 分类月度趋势：Top5 类目 × 月份
  const catTrend = useMemo(() => {
    const months = allMonths.slice(0, 12).reverse()
    if (months.length < 2) return null
    const totals: Record<string, number> = {}
    for (const m of months) {
      for (const [cat, v] of Object.entries(allAggregates[m]?.byCategory ?? {})) {
        totals[cat] = (totals[cat] ?? 0) + v
      }
    }
    const top5 = Object.entries(totals).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n]) => n)
    return {
      months,
      series: top5.map((cat) => ({
        name: cat,
        color: categoryDef(cat).color,
        data: months.map((m) => Math.round((allAggregates[m]?.byCategory[cat] ?? 0) * 100) / 100),
      })),
    }
  }, [allMonths, allAggregates])
  // 电商平台月度堆叠
  const shopTrend = useMemo(() => {
    const months = allMonths.slice(0, 12).reverse()
    if (months.length < 2) return null
    const platformTotals: Record<string, number> = {}
    const perMonth = months.map((m) => {
      const rows = shoppingSpend(processed.filter((t) => t.month === m), 0)
      const rec: Record<string, number> = {}
      for (const r of rows) {
        rec[r.platform] = r.total
        platformTotals[r.platform] = (platformTotals[r.platform] ?? 0) + r.total
      }
      return rec
    })
    const topPlatforms = Object.entries(platformTotals).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n]) => n)
    const palette = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9']
    return {
      months,
      series: topPlatforms.map((p, idx) => ({
        name: p,
        color: palette[idx % palette.length],
        data: perMonth.map((rec) => Math.round((rec[p] ?? 0) * 100) / 100),
      })),
    }
  }, [allMonths, processed])

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
      mining,
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
      <div className="neu-inset mt-4 flex items-center gap-1.5 rounded-2xl p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-300 ${
              tab === t.key
                ? 'neu-raised accent-text'
                : 'text-ink-soft hover:text-ink'
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
          insights={insights} incomes={incomes} payMethods={payMethods} catDetails={catDetails}
          budget={{ monthly: budgetMonthly, monthExpense: agg.expense, monthCount: Math.max(1, allMonths.length), scope: selectedMonth || '全部' }}
          onSetBudget={setBudgetMonthly}
          catRows={Object.entries(agg.byCategory).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, spent]) => ({
            name, emoji: categoryDef(name).emoji, spent: Math.round(spent * 100) / 100,
          }))}
          onSetCategory={setBudgetCategory}
          catBudgets={budgetByCategory}
          labelBanner={labelCandidates.length > 0 ? {
            count: labelCandidates.length,
            sum: labelCandidates.reduce((s, c) => s + c.tx.amount, 0),
            share: agg.expense > 0 ? labelCandidates.reduce((s, c) => s + c.tx.amount, 0) / agg.expense : 0,
          } : null}
          onStartLabeling={openLabeling} />
      )}
      {tab === 'spending' && (
        <SpendingTab agg={agg} prev={prev} monthTx={monthTx} catDetails={catDetails} recurring={recurring} mining={mining} shopping={shopping}
          catTrend={catTrend} shopTrend={shopTrend} />
      )}
      {tab === 'transactions' && (
        <TransactionsTab processed={processed} queue={queue} months={allMonths} correctionsCount={Object.keys(corrections).length}
          corrections={corrections} labelCount={labelCandidates.length} onStartLabeling={openLabeling} />
      )}
        {labelingOpen && (
          <LabelingModal
            candidates={labelCandidates}
            all={processed}
            poolBefore={poolBefore}
            poolAfter={pool.sum}
            onConfirm={handleLabelConfirm}
            onSkip={skipLabel}
            onClose={() => setLabelingOpen(false)}
          />
        )}
    </div>
  )
}


function BudgetCard({ budget, onSet, catRows, onSetCategory, catBudgets }: {
  budget: { monthly: number; monthExpense: number; monthCount: number; scope: string }
  onSet: (v: number) => void
  catRows: Array<{ name: string; emoji: string; spent: number }>
  onSetCategory: (cat: string, v: number) => void
  catBudgets: Record<string, number>
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [showCats, setShowCats] = useState(false)

  if (!budget.monthly && !editing) {
    return (
      <button
        onClick={() => { setInput(''); setEditing(true) }}
        className="flex w-full items-center gap-2 rounded-2xl bg-white px-5 py-3 text-left text-sm text-ink-soft ring-1 ring-dashed ring-slate-300 transition-all hover:ring-brand-400"
      >
        🎯 设定月度预算，让分析带一个行动目标
      </button>
    )
  }

  // 口径：单月=当月支出；全部=月均支出
  const baseline = budget.scope === '全部'
    ? budget.monthExpense / budget.monthCount
    : budget.monthExpense
  const pct = budget.monthly > 0 ? Math.min(150, (baseline / budget.monthly) * 100) : 0
  const over = baseline > budget.monthly

  return (
    <Card className="p-4">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-ink">🎯 每月预算</span>
          <input
            autoFocus
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入金额"
            className="w-32 rounded-lg border-0 bg-slate-100 px-3 py-1.5 outline-none ring-1 ring-transparent focus:ring-brand-400"
          />
          <button
            onClick={() => { onSet(Number.parseFloat(input) || 0); setEditing(false) }}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            保存
          </button>
          <button onClick={() => setEditing(false)} className="px-2 py-1.5 text-xs text-ink-soft hover:text-ink">取消</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-ink">🎯 月度预算 ¥{budget.monthly.toLocaleString('zh-CN')}</span>
          <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${over ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className={`font-bold ${over ? 'text-red-500' : 'text-emerald-600'}`}>
            {budget.scope === '全部' ? '月均' : budget.scope} ¥{baseline.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-ink-soft">{Math.round(pct)}%{over ? ' · 超支' : ''}</span>
          <button onClick={() => setEditing(true)} className="ml-auto text-xs text-ink-soft hover:text-ink">修改</button>
        </div>
      )}

      {/* 按类目细化 */}
      <button
        onClick={() => setShowCats(!showCats)}
        className="mt-3 text-xs font-medium text-ink-soft hover:text-ink"
      >
        {showCats ? '▾ 收起类目预算' : '▸ 按类目细化预算'}
      </button>
      {showCats && (
        <div className="mt-2 space-y-2.5">
          {catRows.map((r) => {
            const limit = catBudgets[r.name] ?? 0
            const base = budget.scope === '全部' ? r.spent / Math.max(1, budget.monthCount) : r.spent
            const p = limit > 0 ? Math.min(150, (base / limit) * 100) : 0
            return (
              <div key={r.name} className="flex items-center gap-2.5 text-xs">
                <span className="w-24 shrink-0 truncate font-medium text-ink">{r.emoji} {r.name}</span>
                <input
                  type="number"
                  value={limit || ''}
                  placeholder="0"
                  onChange={(e) => onSetCategory(r.name, Number.parseFloat(e.target.value) || 0)}
                  className="w-20 shrink-0 rounded-md border-0 bg-slate-100 px-2 py-1 text-right outline-none ring-1 ring-transparent focus:ring-brand-400"
                />
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${limit > 0 && base > limit ? 'bg-red-400' : limit > 0 && p > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: limit > 0 ? `${Math.min(100, p)}%` : 0 }}
                  />
                </div>
                <span className={`w-24 shrink-0 text-right ${limit > 0 && base > limit ? 'font-bold text-red-500' : 'text-ink-soft'}`}>
                  {budget.scope === '全部' ? '月均 ' : ''}¥{base.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            )
          })}
          <p className="pt-1 text-[11px] text-slate-400">输入月预算金额（填 0 清除）。{budget.scope === '全部' ? '进度条按月均消费对比。' : '进度条按当月消费对比。'}</p>
        </div>
      )}
    </Card>
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
  return `rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-300 ${
    active ? 'neu-inset accent-text font-semibold' : 'neu-raised neu-hover text-ink-soft'
  }`
}

/* ================= Tab 1: 总览 ================= */

function OverviewTab({ agg, prev, monthTx, allMonths, allAggregates, insights, incomes, payMethods, catDetails, labelBanner, onStartLabeling, budget, onSetBudget, catBudgets, onSetCategory }: {
  agg: MonthlyAggregate
  prev?: MonthlyAggregate
  monthTx: Transaction[]
  allMonths: string[]
  allAggregates: Record<string, MonthlyAggregate>
  insights: Insight[]
  incomes: ReturnType<typeof incomeBreakdown>
  payMethods: ReturnType<typeof payMethodBreakdown>
  catDetails: CategoryDetail[]
  catRows: Array<{ name: string; emoji: string; spent: number }>
  onSetCategory: (cat: string, v: number) => void
  catBudgets: Record<string, number>
  labelBanner: { count: number; sum: number; share: number } | null
  onStartLabeling: () => void
  budget: { monthly: number; monthExpense: number; monthCount: number; scope: string }
  onSetBudget: (v: number) => void
}) {
  const donut = useMemo(() => {
    const data = Object.entries(agg.byCategory)
      .map(([name, value]) => ({ name, value, itemStyle: { color: categoryDef(name).color } }))
      .sort((a, b) => b.value - a.value)
    const details: Record<string, DonutDetail> = {}
    for (const c of catDetails) {
      details[c.name] = {
        count: c.count,
        avg: c.avg,
        top: c.topMerchants[0] ? `${c.topMerchants[0].name} ¥${c.topMerchants[0].total.toLocaleString('zh-CN')}` : '',
      }
    }
    return donutOption(data, true, details)
  }, [agg, catDetails])

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
      {/* 大额未知标注横幅 */}
      {labelBanner && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-canvas px-5 py-4 accent-bar">
          <span className="text-lg">🏷️</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink">
              {labelBanner.count} 笔大额支出待标注，涉及 ¥{fmtMoney(labelBanner.sum)}
            </div>
            <div className="mt-0.5 text-xs text-ink-soft">
              占总支出 {Math.round(labelBanner.share * 100)}%——它们现在被归在"其他支出"里。花一分钟告诉松鼠是什么，分析会准很多。
            </div>
          </div>
          <button
            onClick={onStartLabeling}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:bg-brand-700"
          >
            去标注 →
          </button>
        </div>
      )}

      {/* 预算 */}
      <BudgetCard
        budget={budget}
        onSet={onSetBudget}
        catBudgets={catBudgets}
        catRows={Object.entries(agg.byCategory).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, spent]) => ({
          name, emoji: categoryDef(name).emoji, spent: Math.round(spent * 100) / 100,
        }))}
        onSetCategory={onSetCategory}
      />

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
              {payMethods.some((p) => p.name === '未标注') && (
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  「未标注」多为微信零钱或其他未记录支付方式的交易；银行渠道行已统一显示为银行名。
                </p>
              )}
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
  const [open, setOpen] = useState(false)
  const styles = {
    good: { bar: '#10b981', bg: '#ecfdf5' },
    warn: { bar: '#f59e0b', bg: '#fffbeb' },
    info: { bar: '#0ea5e9', bg: '#f0f9ff' },
  }[ins.kind]
  return (
    <div className="rounded-xl p-3.5" style={{ backgroundColor: styles.bg, boxShadow: `inset 3px 0 0 ${styles.bar}` }}>
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">{ins.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-ink">{ins.title}</span>
            {ins.group && (
              <span className="rounded bg-white/70 px-1.5 py-px text-[10px] font-semibold text-ink-soft ring-1 ring-slate-200/80">
                {ins.group}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{ins.detail}</p>
          {ins.items && ins.items.length > 0 && (
            <>
              <button
                className="mt-1.5 text-[11px] font-medium text-brand-600 hover:underline"
                onClick={() => setOpen(!open)}
              >
                {open ? '收起清单 ▴' : '查看对冲清单 ▾'}
              </button>
              {open && (
                <div className="mt-2 space-y-1.5 rounded-lg bg-white/80 p-2.5">
                  {ins.items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[11px]">
                      <span className="w-28 shrink-0 truncate text-ink">{it.main}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-400">{it.sub}</span>
                      <span className="shrink-0 font-semibold text-ink">¥{it.amount.toLocaleString('zh-CN')}</span>
                    </div>
                  ))}
                  {ins.title.includes('44') || ins.title.includes('10') ? null : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ================= Tab 2: 花费分析 ================= */

function SpendingTab({ agg, prev, monthTx, catDetails, recurring, mining, shopping, catTrend, shopTrend }: {
  agg: MonthlyAggregate
  prev?: MonthlyAggregate
  monthTx: Transaction[]
  catDetails: CategoryDetail[]
  recurring: ReturnType<typeof recurringExpenses>
  mining: ReturnType<typeof deepMining>
  shopping: ReturnType<typeof shoppingSpend>
  catTrend: { months: string[]; series: Array<{ name: string; data: number[]; color: string }> } | null
  shopTrend: { months: string[]; series: Array<{ name: string; data: number[]; color: string }> } | null
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
      {/* 深度挖掘 */}
      <DeepMiningCard mining={mining} expense={agg.expense} />

      {/* 电商平台消费 */}
      {shopping.length > 0 && (
        <Card className="p-5">
          <SectionTitle
            emoji="🛍️"
            title="电商平台消费"
            desc="京东/淘宝天猫/拼多多/美团/饿了么的消费没有独立账单，但已从支付渠道账单的商户信息中自动识别汇总。"
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {shopping.map((s) => (
              <div key={s.platform} className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-ink">{s.platform}</span>
                  <span className="text-sm font-bold text-brand-600">¥{fmtMoney(s.total)}</span>
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  {s.count} 笔 · 占支出 {Math.round(s.share * 100)}% · 主消费：{s.topMerchants[0]?.name ?? '—'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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

      {/* 分类月度趋势 */}
      {catTrend && (
        <Card className="p-5">
          <SectionTitle emoji="📉" title="分类月度趋势" desc="Top 5 支出类目的逐月走势——谁在悄悄上涨一目了然。" />
          <Chart option={multiLineOption(catTrend.months, catTrend.series, true)} height={260} />
        </Card>
      )}

      {/* 电商平台月度趋势 */}
      {shopTrend && shopping.length > 0 && (
        <Card className="p-5">
          <SectionTitle emoji="🛍️" title="电商平台月度趋势" desc="各平台的月度消费堆叠。" />
          <Chart option={stackedBarOption(shopTrend.months, shopTrend.series, true)} height={240} />
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

/* ================= 深度挖掘卡片 ================= */

function DeepMiningCard({ mining, expense }: { mining: ReturnType<typeof deepMining>; expense: number }) {
  const { subscriptions, subscriptionMonthlyTotal, lattes, latteTotal, selfInvest, thrifty, takeawayTotal, emotional } = mining
  const hasAny =
    subscriptions.length > 0 || lattes.length > 0 || selfInvest.total > 0 ||
    emotional.night.count > 0 || emotional.monthStart.count > 0 || emotional.monthEnd.count > 0
  if (!hasAny) return null

  const yearCost = (monthly: number) => `折算一年 ¥${fmtMoney(monthly * 12)}`

  return (
    <Card className="p-5 ring-1 ring-brand-100">
      <SectionTitle
        emoji="⛏️"
        title="深度挖掘"
        desc="账单背后容易被忽视的地方——每一条都来自你的真实数据。"
      />
      <div className="space-y-4">
        {/* 扣费刺客 */}
        {subscriptions.length > 0 && (
          <MiningBlock
            tone="danger"
            icon="🗡️"
            title={`扣费刺客 · 每月悄悄扣走 ¥${fmtMoney(subscriptionMonthlyTotal)}`}
            subtitle={yearCost(subscriptionMonthlyTotal)}
          >
            {subscriptions.slice(0, 6).map((s) => (
              <div key={s.name} className="flex items-center gap-2.5 text-xs">
                <span className="w-40 truncate font-medium text-ink" title={s.name}>
                  {s.name}{s.autoRenew && <span className="ml-1 rounded bg-rose-100 px-1 py-px text-[10px] text-rose-600">自动续费</span>}
                </span>
                <span className="text-ink-soft">{s.category}</span>
                <span className="ml-auto shrink-0 text-ink-soft">连续 {s.months} 个月 · 最近 {s.lastDate}</span>
                <span className="w-20 shrink-0 text-right font-bold text-ink">¥{fmtMoney(s.monthlyAvg)}/月</span>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
              周期性小额扣费，单次不起眼、全年加起来 ¥{fmtMoney(subscriptionMonthlyTotal * 12)}。不用的会员，现在去关还来得及。
            </p>
          </MiningBlock>
        )}

        {/* 拿铁因子 */}
        {lattes.length > 0 && (
          <MiningBlock
            tone="warn"
            icon="☕"
            title={`拿铁因子 · 高频小额累计 ¥${fmtMoney(latteTotal)}`}
            subtitle={`单笔 ≤¥50 且 ≥4 次的同一消费`}
          >
            {lattes.slice(0, 5).map((l) => (
              <div key={l.name} className="flex items-center gap-2.5 text-xs">
                <span className="w-40 truncate font-medium text-ink" title={l.name}>{l.name}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${(l.total / lattes[0].total) * 100}%` }} />
                </div>
                <span className="shrink-0 text-ink-soft">{l.count} 次 · 均 ¥{fmtMoney(l.avg)}</span>
                <span className="w-20 shrink-0 text-right font-bold text-ink">¥{fmtMoney(l.total)}</span>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
              每次 ¥{fmtMoney(lattes[0].avg)} 不多，但 {lattes[0].count} 次加起来就是 ¥{fmtMoney(lattes[0].total)}——这就是经典的"拿铁因子"。
            </p>
          </MiningBlock>
        )}

        {/* 投资自己 / 省钱 */}
        {(selfInvest.total > 0 || thrifty.total > 0) && (
          <MiningBlock
            tone="good"
            icon="🌱"
            title="被忽略的好消费"
            subtitle="花在自己身上的钱，值得被看见"
          >
            <div className="grid gap-2.5 sm:grid-cols-3">
              {selfInvest.total > 0 && (
                <div className="rounded-xl bg-emerald-50 px-3.5 py-3">
                  <div className="text-xs font-semibold text-emerald-700">📚 投资自己</div>
                  <div className="mt-1 text-lg font-bold text-emerald-800">¥{fmtMoney(selfInvest.total)}</div>
                  <div className="mt-0.5 text-[11px] text-emerald-600">{selfInvest.categories.join(' · ')} · {selfInvest.count} 笔{expense > 0 ? ` · 占支出 ${Math.round((selfInvest.total / expense) * 100)}%` : ''}</div>
                </div>
              )}
              {thrifty.total > 0 && (
                <div className="rounded-xl bg-teal-50 px-3.5 py-3">
                  <div className="text-xs font-semibold text-teal-700">🛒 省钱型消费</div>
                  <div className="mt-1 text-lg font-bold text-teal-800">¥{fmtMoney(thrifty.total)}</div>
                  <div className="mt-0.5 text-[11px] text-teal-600">超市/生鲜自购 {thrifty.count} 笔{takeawayTotal > 0 ? ` · 同期外卖 ¥${fmtMoney(takeawayTotal)}` : ''}</div>
                </div>
              )}
              {takeawayTotal > 0 && (
                <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                  <div className="text-xs font-semibold text-slate-500">🛵 对照：外卖餐饮</div>
                  <div className="mt-1 text-lg font-bold text-slate-700">¥{fmtMoney(takeawayTotal)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{thrifty.total > 0 ? `自购食材每花 ¥1，外卖花了 ¥${(takeawayTotal / Math.max(thrifty.total, 0.01)).toFixed(1)}` : '多为解决型就餐'}</div>
                </div>
              )}
            </div>
          </MiningBlock>
        )}

        {/* 情绪消费 */}
        {(emotional.night.count > 0 || emotional.monthStart.count > 0 || emotional.monthEnd.count > 0) && (
          <MiningBlock
            tone="info"
            icon="🌙"
            title="特定时刻的情绪消费"
            subtitle="深夜、月初、月底的弹性支出——那时候花的钱，往往不是刚需"
          >
            <div className="grid gap-2.5 sm:grid-cols-3">
              <WindowChip label="🌙 深夜（23:00–6:00）" win={emotional.night} color="indigo" />
              <WindowChip label="🌅 月初（1–3号）" win={emotional.monthStart} color="sky" />
              <WindowChip label="🌇 月底（25号后）" win={emotional.monthEnd} color="rose" />
            </div>
            {(emotional.night.examples.length > 0 || emotional.monthStart.examples.length > 0) && (
              <div className="mt-2.5 space-y-1 text-[11px] leading-relaxed text-slate-400">
                {emotional.night.examples.slice(0, 2).map((e, i) => (
                  <div key={'n' + i}>深夜：{e.name} ¥{fmtMoney(e.amount)}（{e.date}）</div>
                ))}
                {emotional.monthStart.examples.slice(0, 1).map((e, i) => (
                  <div key={'s' + i}>月初：{e.name} ¥{fmtMoney(e.amount)}（{e.date}）</div>
                ))}
              </div>
            )}
          </MiningBlock>
        )}
      </div>
    </Card>
  )
}

function MiningBlock({ tone, icon, title, subtitle, children }: {
  tone: 'danger' | 'warn' | 'good' | 'info'
  icon: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const tones = {
    danger: { bar: '#f43f5e', bg: '#fff1f2' },
    warn: { bar: '#f59e0b', bg: '#fffbeb' },
    good: { bar: '#10b981', bg: '#ecfdf5' },
    info: { bar: '#6366f1', bg: '#eef2ff' },
  }[tone]
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: tones.bg, boxShadow: `inset 3px 0 0 ${tones.bar}` }}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-bold text-ink">{icon} {title}</span>
        <span className="text-[11px] text-slate-500">{subtitle}</span>
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  )
}

function WindowChip({ label, win, color }: { label: string; win: { total: number; count: number }; color: 'indigo' | 'sky' | 'rose' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 [&_b]:text-indigo-800',
    sky: 'bg-sky-50 text-sky-700 [&_b]:text-sky-800',
    rose: 'bg-rose-50 text-rose-700 [&_b]:text-rose-800',
  }[color]
  return (
    <div className={`rounded-xl px-3.5 py-3 ${colors}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-1 text-lg font-bold">{win.count > 0 ? `¥${fmtMoney(win.total)}` : '无'}</div>
      <div className="mt-0.5 text-[11px] opacity-70">{win.count > 0 ? `${win.count} 笔弹性支出` : '这个时段很克制'}</div>
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

function TransactionsTab({ processed, queue, months, correctionsCount, corrections, labelCount, onStartLabeling }: {
  processed: Transaction[]
  queue: Transaction[]
  months: string[]
  correctionsCount: number
  corrections: Record<string, Correction>
  labelCount: number
  onStartLabeling: () => void
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
      platformName(t.platform),
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
      {/* 大额未知标注入口 */}
      {labelCount > 0 && queue.length === 0 && (
        <button
          onClick={onStartLabeling}
          className="neu-raised neu-hover flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left"
        >
          <span className="text-lg">🏷️</span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
            {labelCount} 笔大额支出待标注
            <span className="ml-2 font-normal text-ink-soft">标注后分析更准</span>
          </span>
          <span className="text-brand-600">→</span>
        </button>
      )}

      {/* 待确认队列 */}
      {queue.length > 0 && (
        <Card className="border-l-4 border-l-amber-400 p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <h3 className="text-base font-bold text-ink">{queue.length} 笔交易待确认</h3>
          </div>
          <p className="mt-1 text-xs text-ink-soft">这些可能是转账/还款也可能是正常消费，点一下标记真实性质，统计立刻更准。</p>
          <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
            <li>💳 <b>信用还款</b>：白条/花呗/信用卡的消费在购买当时已计入支出，还款只是还钱，选它可避免重复计算。</li>
            <li>✅ <b>是支出/是收入</b>：这笔钱是第一次计入（比如直接从银行卡付的一笔消费），选它。</li>
            <li>拿不准就先跳过——它仍会按当前规则统计，随时可以在下面表格里改。</li>
          </ul>
          <div className="mt-4 space-y-3">
            {queue.map((tx) => (
              <div key={tx.id} className="rounded-xl bg-slate-50 p-4 transition-colors hover:bg-amber-50/60">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PlatformBadge platform={tx.platform} />
                  <span className="text-xs text-ink-soft">{fmtTxTime(tx)}</span>
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
            {Object.entries(BANK_META).map(([code, m]) => (
              <option key={code} value={code}>{m.name}</option>
            ))}
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
                  <td className="whitespace-nowrap py-2 pr-2 text-xs text-ink-soft">{fmtTxTime(tx)}</td>
                  <td className="py-2 pr-2"><PlatformBadge platform={tx.platform} /></td>
                  <td className="max-w-56 py-2 pr-2">
                    <div className="truncate font-medium text-ink" title={tx.item}>{tx.counterparty || tx.item}</div>
                    <div className="truncate text-xs text-ink-soft">{tx.item}</div>
                    {corrections[tx.id]?.memo && (
                      <div className="truncate text-[11px] text-brand-600" title={corrections[tx.id]?.memo}>📝 {corrections[tx.id]?.memo}</div>
                    )}
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
  const walletOf = (platform: string) =>
    platform === 'wechat' ? '微信钱包'
    : platform === 'alipay' ? '支付宝'
    : platformName(platform as Platform)

  for (const tx of txs) {
    // 已对冲的银行渠道行不进流向图（App侧同行已代表该笔消费）
    if (!countsAsFlow(tx)) continue
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

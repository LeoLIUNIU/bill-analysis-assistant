import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { useProcessed } from '../hooks/useProcessed'
import { navigate } from '../hooks/useHashRoute'
import { ALL_CATEGORIES } from '../core/categories'
import { countsAsFlow, needsReview } from '../core/transfer'
import { Card, EmptyState, FlagChip, PlatformBadge, fmtMoney } from '../components/ui'

export function ReviewPage({ hasData }: { hasData: boolean }) {
  const { queue } = useProcessed()
  const setCorrection = useStore((s) => s.setCorrection)

  if (!hasData) return <NoData />

  const done = queue.length === 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 页头 */}
      <div className="pb-1 pt-6 text-center">
        <div className="text-4xl">{done ? '✅' : '🔍'}</div>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">
          {done ? '全部核对完毕' : `${queue.length} 笔交易待确认`}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          {done
            ? '没有拿不准的账单了，自动对冲引擎工作正常。'
            : '这些交易可能是转账 / 还款，也可能是正常消费。点一下告诉松鼠真相，统计立刻更准。'}
        </p>
      </div>

      {/* 待确认队列 */}
      {!done && (
        <Card className="border-l-4 border-l-amber-400 p-5">
          <div className="space-y-3">
            {queue.map((tx) => (
              <div key={tx.id} className="rounded-xl bg-stone-50 p-4 transition-colors hover:bg-amber-50/60">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PlatformBadge platform={tx.platform} />
                  <span className="text-xs text-ink-soft">{tx.time.slice(5, 16)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {tx.counterparty || tx.item || '未知商户'}
                    <span className="ml-1.5 text-xs font-normal text-ink-soft">{tx.item}</span>
                  </span>
                  <span className={`shrink-0 text-base font-bold ${tx.direction === 'in' ? 'text-emerald-600' : 'text-orange-600'}`}>
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

      <AllTransactions />
    </div>
  )
}

const chipCls =
  'rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-stone-200 transition-all hover:-translate-y-px hover:ring-squirrel-400 hover:text-squirrel-700'

const chipPrimaryCls =
  'rounded-full bg-squirrel-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-squirrel-600'

function AllTransactions() {
  const { processed, queue, allMonths } = useProcessed()
  const selectedMonth = useStore((s) => s.selectedMonth)
  const setSelectedMonth = useStore((s) => s.setSelectedMonth)
  const setCorrection = useStore((s) => s.setCorrection)
  const [search, setSearch] = useState('')
  const [onlyQueue, setOnlyQueue] = useState(false)
  const [limit, setLimit] = useState(50)

  const queueIds = useMemo(() => new Set(queue.map((q) => q.id)), [queue])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = processed
    if (selectedMonth) list = list.filter((t) => t.month === selectedMonth)
    if (onlyQueue) list = list.filter((t) => queueIds.has(t.id))
    if (q) {
      list = list.filter((t) =>
        `${t.counterparty} ${t.item} ${t.category} ${t.type}`.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => b.time.localeCompare(a.time))
  }, [processed, selectedMonth, onlyQueue, search, queueIds])

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-base font-bold text-ink">📋 全部流水</h2>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-ink-soft">{filtered.length} 条</span>
        <select
          className="rounded-lg border-0 bg-stone-100 px-2.5 py-1.5 text-sm text-ink outline-none"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          <option value="">全部月份</option>
          {allMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 搜索商户 / 商品 / 分类"
          className="min-w-36 flex-1 rounded-lg border-0 bg-stone-100 px-3 py-1.5 text-sm outline-none ring-1 ring-transparent transition-shadow focus:bg-white focus:ring-squirrel-400"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-soft">
          <input type="checkbox" checked={onlyQueue} onChange={(e) => setOnlyQueue(e.target.checked)} className="accent-squirrel-500" />
          只看待确认
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-170 text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-ink-soft">
              <th className="py-2 pr-2 font-medium">时间</th>
              <th className="py-2 pr-2 font-medium">平台</th>
              <th className="py-2 pr-2 font-medium">商户/事项</th>
              <th className="py-2 pr-2 font-medium">分类</th>
              <th className="py-2 pr-2 font-medium">性质</th>
              <th className="py-2 pr-2 text-right font-medium">金额</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((tx) => (
              <tr key={tx.id} className={`border-b border-stone-100 transition-colors hover:bg-stone-50 ${countsAsFlow(tx) ? '' : 'opacity-45'}`}>
                <td className="whitespace-nowrap py-2 pr-2 text-xs text-ink-soft">{tx.time.slice(5, 16)}</td>
                <td className="py-2 pr-2"><PlatformBadge platform={tx.platform} /></td>
                <td className="max-w-56 py-2 pr-2">
                  <div className="truncate font-medium text-ink" title={tx.item}>{tx.counterparty || tx.item}</div>
                  <div className="truncate text-xs text-ink-soft">{tx.item}</div>
                </td>
                <td className="py-2 pr-2">
                  <select
                    className="cursor-pointer rounded-md border-0 bg-stone-100 px-1.5 py-0.5 text-xs text-ink-soft outline-none hover:bg-stone-200"
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
                <td className={`whitespace-nowrap py-2 pr-2 text-right font-semibold ${tx.direction === 'in' ? 'text-emerald-600' : tx.direction === 'neutral' ? 'text-stone-400' : 'text-orange-600'}`}>
                  {tx.direction === 'in' ? '+' : ''}{fmtMoney(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="mt-3 text-center">
          <button className="rounded-lg bg-stone-100 px-4 py-1.5 text-sm text-ink-soft transition-colors hover:bg-stone-200"
            onClick={() => setLimit(limit + 100)}>
            加载更多（剩 {filtered.length - limit} 条）
          </button>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        💡 点击「分类」下拉可直接改分类；灰色行不参与收支统计（内部转账 / 还款 / 退款 / 中性交易）。你的每次修正都会被记住，重复导入不会丢失。
      </p>
    </Card>
  )
}

function NoData() {
  return (
    <EmptyState
      emoji="🗂️"
      title="还没有账单数据"
      desc="先去导入页上传微信/支付宝账单，或用演示数据体验完整流程。"
      action={
        <button onClick={() => navigate('import')} className="rounded-lg bg-squirrel-500 px-4 py-2 text-sm font-medium text-white hover:bg-squirrel-600">
          去导入账单
        </button>
      }
    />
  )
}

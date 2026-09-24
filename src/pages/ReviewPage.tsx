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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {queue.length > 0 ? (
        <Card className="border-l-4 border-l-amber-400 p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <h2 className="text-lg font-semibold text-ink">{queue.length} 笔交易待确认</h2>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            这些交易可能是转账/还款，也可能是正常消费。点一下告诉松鼠真相，统计立刻更准。
          </p>
          <div className="mt-4 space-y-3">
            {queue.map((tx) => (
              <div key={tx.id} className="rounded-xl bg-stone-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PlatformBadge platform={tx.platform} />
                  <span className="text-xs text-ink-soft">{tx.time.slice(5, 16)}</span>
                  <span className="font-medium text-ink">{tx.counterparty || tx.item || '未知商户'}</span>
                  <span className={tx.direction === 'in' ? 'font-semibold text-emerald-600' : 'font-semibold text-orange-600'}>
                    {tx.direction === 'in' ? '+' : '-'}{fmtMoney(tx.amount)}
                  </span>
                  <span className="text-xs text-ink-soft">{tx.item}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={chipCls} onClick={() => setCorrection(tx.id, { transferFlag: 'internal' })}>🔁 内部转账</button>
                  <button className={chipCls} onClick={() => setCorrection(tx.id, { transferFlag: 'repayment' })}>💳 信用还款</button>
                  <button className={chipCls} onClick={() => setCorrection(tx.id, { transferFlag: 'refund' })}>↩️ 退款</button>
                  <button className={chipCls} onClick={() => setCorrection(tx.id, { transferFlag: 'normal' })}>
                    ✅ {tx.direction === 'in' ? '是收入' : '是支出'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-ink-soft">
          ✅ 没有待确认的交易。自动对冲引擎已在正常工作。
        </Card>
      )}

      <AllTransactions />
    </div>
  )
}

const chipCls =
  'rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-squirrel-400 hover:bg-squirrel-50 hover:text-squirrel-700'

function AllTransactions() {
  const { processed, queue } = useProcessed()
  const selectedMonth = useStore((s) => s.selectedMonth)
  const setSelectedMonth = useStore((s) => s.setSelectedMonth)
  const allMonths = useProcessed().allMonths
  const setCorrection = useStore((s) => s.setCorrection)
  const [search, setSearch] = useState('')
  const [onlyQueue, setOnlyQueue] = useState(false)
  const [limit, setLimit] = useState(50)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = processed
    if (selectedMonth) list = list.filter((t) => t.month === selectedMonth)
    if (onlyQueue) list = list.filter((t) => queue.some((q2) => q2.id === t.id))
    if (q) {
      list = list.filter((t) =>
        `${t.counterparty} ${t.item} ${t.category} ${t.type}`.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => b.time.localeCompare(a.time))
  }, [processed, selectedMonth, onlyQueue, search, queue])

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-ink">📋 全部流水</h2>
        <select
          className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm text-ink"
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
          placeholder="搜索商户 / 商品 / 分类"
          className="min-w-40 flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-squirrel-400"
        />
        <label className="flex items-center gap-1.5 text-sm text-ink-soft">
          <input type="checkbox" checked={onlyQueue} onChange={(e) => setOnlyQueue(e.target.checked)} />
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
              <tr key={tx.id} className={`border-b border-stone-100 ${countsAsFlow(tx) ? '' : 'opacity-50'}`}>
                <td className="whitespace-nowrap py-2 pr-2 text-xs text-ink-soft">{tx.time.slice(5, 16)}</td>
                <td className="py-2 pr-2"><PlatformBadge platform={tx.platform} /></td>
                <td className="max-w-56 py-2 pr-2">
                  <div className="truncate font-medium text-ink" title={tx.item}>{tx.counterparty || tx.item}</div>
                  <div className="truncate text-xs text-ink-soft">{tx.item}</div>
                </td>
                <td className="py-2 pr-2">
                  <select
                    className="rounded-md border-0 bg-stone-100 px-1 py-0.5 text-xs text-ink-soft outline-none"
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
                    <button className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-200"
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
          <button className="rounded-lg bg-stone-100 px-4 py-1.5 text-sm text-ink-soft hover:bg-stone-200"
            onClick={() => setLimit(limit + 100)}>
            加载更多（剩 {filtered.length - limit} 条）
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        💡 点击分类可直接修改；灰色行不参与收支统计（内部转账 / 还款 / 退款 / 中性交易）。
        {selectedMonth && allMonths.length > 0 && (
          <button className="ml-1 text-squirrel-600 hover:underline" onClick={() => setSelectedMonth('')}>查看全部月份</button>
        )}
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

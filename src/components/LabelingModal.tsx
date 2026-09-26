import { useMemo, useState } from 'react'
import type { LabelCandidate } from '../core/labeling'
import { suggestCategories } from '../core/labeling'
import { ALL_CATEGORIES, categoryDef } from '../core/categories'
import type { Transaction } from '../core/schema'
import { fmtTxTime, PlatformBadge, fmtMoney } from './ui'
import { useI18n } from '../i18n'

/**
 * 大额未知引导打标签 · 向导弹窗。
 * 一次只问一笔：交易上下文 + 选择题式分类建议 + 可选事项备注 + 零成本跳过。
 * 每标注一笔，顶部实时显示未分类占比的变化（让用户看见标注在改变结果）。
 */

export function LabelingModal({
  candidates,
  all,
  poolBefore,
  poolAfter,
  onConfirm,
  onSkip,
  onClose,
}: {
  candidates: LabelCandidate[]
  all: Transaction[]
  /** 标注前的未分类金额（用于展示改善幅度） */
  poolBefore: number
  /** 当前的未分类金额（随标注实时下降） */
  poolAfter: number
  onConfirm: (id: string, category: string, memo?: string) => void
  onSkip: (id: string) => void
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [memo, setMemo] = useState('')
  const [showAll, setShowAll] = useState(false)
  const { L } = useI18n()

  const current = candidates[index]
  const suggestions = useMemo(
    () => (current ? suggestCategories(current.tx, all) : []),
    [current, all],
  )

  if (!current) {
    // 全部处理完
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-5xl">🎉</div>
          <h3 className="mt-4 text-lg font-bold text-ink">{L.card.doneTitle}</h3>
          <p className="mt-2 text-sm text-ink-soft">
            {L.card.doneDesc(fmtMoney(poolBefore), fmtMoney(poolAfter))}
          </p>
          <button
            onClick={onClose}
            className="mt-6 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {L.card.doneBtn}
          </button>
        </div>
      </div>
    )
  }

  const tx = current.tx

  const pick = (category: string) => {
    onConfirm(tx.id, category, memo.trim() || undefined)
    setMemo('')
    setIndex((i) => i + 1)
  }

  const skip = () => {
    onSkip(tx.id)
    setIndex((i) => i + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 进度 */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 pt-5 pb-4">
          <span className="text-xs font-semibold text-ink-soft">
            {L.card.labeling(index + 1, candidates.length)}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(index / candidates.length) * 100}%` }} />
          </div>
          <button onClick={onClose} className="text-xs text-ink-soft hover:text-ink">{L.card.later}</button>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-ink-soft">{L.card.askExpense(fmtMoney(tx.amount))}</p>

          {/* 交易上下文 */}
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm">
              <PlatformBadge platform={tx.platform} />
              <span className="text-xs text-ink-soft">{fmtTxTime(tx)}</span>
              {tx.payMethod && <span className="text-xs text-ink-soft">· {tx.payMethod}</span>}
            </div>
            <div className="mt-1.5 text-lg font-bold text-ink">{tx.counterparty || tx.item || L.common.unknownMerchant}</div>
            {tx.item && tx.item !== tx.counterparty && (
              <div className="text-xs text-ink-soft">{tx.item}</div>
            )}
          </div>

          {/* 分类建议 */}
          <div className="mt-4">
            <div className="text-xs font-semibold text-ink-soft">{L.card.pickTpl}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((cat) => {
                const def = categoryDef(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => pick(cat)}
                    className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-slate-200 transition-all hover:-translate-y-px hover:text-brand-700"
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = def.color)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
                  >
                    {def.emoji} {cat}
                  </button>
                )
              })}
              {!showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  className="rounded-full px-3.5 py-1.5 text-xs font-medium text-ink-soft ring-1 ring-dashed ring-slate-300 hover:text-ink"
                >
                  {L.card.otherCat}
                </button>
              )}
            </div>
            {showAll && (
              <select
                autoFocus
                className="mt-2 w-full rounded-lg border-0 bg-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-brand-400"
                value=""
                onChange={(e) => {
                  if (e.target.value) pick(e.target.value)
                  setShowAll(false)
                }}
              >
                <option value="" disabled>{L.card.selectCat}</option>
                <optgroup label={L.analysis.expense}>
                  {ALL_CATEGORIES.filter((c) => c.kind === 'expense').map((c) => (
                    <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
                  ))}
                </optgroup>
                <optgroup label={L.analysis.income}>
                  {ALL_CATEGORIES.filter((c) => c.kind === 'income').map((c) => (
                    <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
                  ))}
                </optgroup>
              </select>
            )}
          </div>

          {/* 事项备注 */}
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={L.card.memoPh}
            className="mt-4 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-transparent transition-shadow focus:bg-white focus:ring-brand-400"
          />
        </div>

        {/* 底部操作 */}
        <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-4">
          <span className="text-[11px] text-slate-400">
            {L.card.remainNote(fmtMoney(poolAfter))}
          </span>
          <button
            onClick={skip}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-slate-100"
          >
            {L.card.skipThis}
          </button>
        </div>
      </div>
    </div>
  )
}

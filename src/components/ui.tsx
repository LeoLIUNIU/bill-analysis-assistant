import type { ReactNode } from 'react'
import { categoryDef } from '../core/categories'
import { BANK_META, platformName, type BankCode, type Platform } from '../core/schema'
import type { Transaction } from '../core/schema'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70 ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ emoji, title, desc }: { emoji: string; title: string; desc?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-ink">
        <span className="mr-1.5">{emoji}</span>
        {title}
      </h2>
      {desc && <p className="mt-1 text-sm text-ink-soft">{desc}</p>}
    </div>
  )
}

const PLATFORM_COLORS: Partial<Record<Platform, string>> = {
  wechat: '#07c160',
  alipay: '#1677ff',
}

export function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform as Platform] ?? BANK_META[platform as BankCode]?.color ?? '#64748b'
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color, backgroundColor: `${color}14` }}
    >
      {platformName(platform as Platform)}
    </span>
  )
}

export const FLAG_LABEL: Record<string, string> = {
  internal: '已对冲',
  repayment: '信用还款',
  refund: '退款',
}

export function FlagChip({ tx }: { tx: Transaction }) {
  if (!tx.transferFlag) return null
  const colors: Record<string, { color: string; bg: string }> = {
    internal: { color: '#a8a29e', bg: '#a8a29e1a' },
    repayment: { color: '#c2410c', bg: '#ffedd5' },
    refund: { color: '#4d7c0f', bg: '#ecfccb' },
  }
  const c = colors[tx.transferFlag]
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: c.color, backgroundColor: c.bg }}>
      {FLAG_LABEL[tx.transferFlag]}
    </span>
  )
}

export function CategoryChip({ name }: { name: string }) {
  const def = categoryDef(name)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: def.color, backgroundColor: `${def.color}14` }}
    >
      <span>{def.emoji}</span>
      {def.name}
    </span>
  )
}

export function fmtMoney(n: number, showAmount = true): string {
  if (!showAmount) return '¥ ***'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function EmptyState({ emoji, title, desc, action }: { emoji: string; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl">{emoji}</div>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">{desc}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

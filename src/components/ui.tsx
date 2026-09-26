import type { ReactNode } from 'react'
import { categoryDef } from '../core/categories'
import { BANK_META, hasRealTime, platformName, type BankCode, type Platform } from '../core/schema'
import type { Transaction } from '../core/schema'
import { useI18n } from '../i18n'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`neu-raised ${className}`}>
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

export function FlagChip({ tx }: { tx: Transaction }) {
  const { L } = useI18n()
  if (!tx.transferFlag) return null
  const labels: Record<string, string> = {
    internal: L.common.flags.internal,
    repayment: L.common.flags.repayment,
    refund: L.common.flags.refund,
  }
  const colors: Record<string, { color: string; bg: string }> = {
    internal: { color: '#a8a29e', bg: '#a8a29e1a' },
    repayment: { color: '#c2410c', bg: '#ffedd5' },
    refund: { color: '#4d7c0f', bg: '#ecfccb' },
  }
  const c = colors[tx.transferFlag]
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: c.color, backgroundColor: c.bg }}>
      {labels[tx.transferFlag]}
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

export function fmtTxTime(tx: Transaction): string {
  return hasRealTime(tx) ? tx.time.slice(5, 16) : tx.time.slice(5, 10)
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

import { useStore } from '../store/useStore'
import { Card } from '../components/ui'
import { useI18n } from '../i18n'

export function PrivacyPage() {
  const { L } = useI18n()
  const transactions = useStore((s) => s.transactions)
  const clearAll = useStore((s) => s.clearAll)

  return (
    <div className="mx-auto max-w-2xl">
      {/* 页头 */}
      <div className="pb-2 pt-8 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">{L.privacy.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{L.privacy.desc}</p>
      </div>

      <div className="space-y-5 pt-4">
        <Card className="p-6">
          <h2 className="text-base font-bold text-ink">{L.privacy.tierTitle}</h2>
          <p className="mt-1 text-xs text-ink-soft">{L.privacy.tierDesc}</p>
          <div className="mt-4 space-y-3 text-sm">
            <Tier emoji="🧾" title={L.privacy.tierRaw[0]} body={L.privacy.tierRaw[1]} tone="good" />
            <Tier emoji="📊" title={L.privacy.tierResults[0]} body={L.privacy.tierResults[1]} tone="good" />
            <Tier emoji="☁️" title={L.privacy.tierServer[0]} body={L.privacy.tierServer[1]} tone="good" />
            <Tier emoji="🍪" title={L.privacy.tierStats[0]} body={L.privacy.tierStats[1]} tone="good" />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-ink">{L.privacy.manageTitle}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
            <p>{L.privacy.manageIntro(transactions.length)}</p>
            <p>
              {L.privacy.manageExport}<br />
              {L.privacy.manageDelete}
            </p>
            <button
              onClick={clearAll}
              className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-100"
            >
              {L.privacy.clearBtn}
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-ink">{L.privacy.ghTitle}</h2>
          <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-soft">
            <p>{L.privacy.ghBody}</p>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-ink">{L.privacy.termsTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {L.privacy.terms}
          </p>
        </Card>
      </div>
    </div>
  )
}

function Tier({ emoji, title, body, tone }: { emoji: string; title: string; body: string; tone: 'good' | 'warn' }) {
  const colors =
    tone === 'good'
      ? { bg: '#f0fdf4', ring: '#bbf7d0', title: '#166534' }
      : { bg: '#fffbeb', ring: '#fde68a', title: '#92400e' }
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: colors.bg, boxShadow: `inset 0 0 0 1px ${colors.ring}` }}>
      <div className="font-semibold" style={{ color: colors.title }}>
        {emoji} {title}
      </div>
      <p className="mt-1.5 leading-relaxed text-ink-soft">{body}</p>
    </div>
  )
}

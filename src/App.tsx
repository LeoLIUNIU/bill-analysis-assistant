import { useEffect } from 'react'
import { useHashRoute, navigate, type Route } from './hooks/useHashRoute'
import { useStore } from './store/useStore'
import { useProcessed } from './hooks/useProcessed'
import { GuidePage } from './pages/GuidePage'
import { AnalysisPage } from './pages/AnalysisPage'
import { CardPage } from './pages/CardPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { useI18n } from './i18n'

const NAV: Array<{ key: Route; emoji: string; labelKey: 'guide' | 'analysis' | 'card' | 'privacy'; needData?: boolean }> = [
  { key: 'guide', emoji: '📥', labelKey: 'guide' },
  { key: 'analysis', emoji: '📊', labelKey: 'analysis', needData: true },
  { key: 'card', emoji: '🐾', labelKey: 'card', needData: true },
  { key: 'privacy', emoji: '🔒', labelKey: 'privacy' },
]

export default function App() {
  const route = useHashRoute()
  const { lang, setLang, L } = useI18n()
  const transactions = useStore((s) => s.transactions)
  const { queue } = useProcessed()
  const hasData = transactions.length > 0

  // 无数据时访问需要数据的页面 → 引导回引导页
  useEffect(() => {
    if (!hasData && (route === 'analysis' || route === 'card')) {
      navigate('guide')
    }
  }, [hasData, route])

  const reviewCount = hasData ? queue.length : 0

  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button className="flex shrink-0 items-center gap-2.5" onClick={() => navigate('guide')}>
            <span className="neu-inset flex h-8 w-8 items-center justify-center rounded-[10px]">
              <svg width="16" height="16" viewBox="0 0 100 100" aria-hidden>
                <rect x="24" y="52" width="12" height="24" rx="4" fill="#fff" opacity="0.95" />
                <rect x="44" y="36" width="12" height="40" rx="4" fill="#fff" opacity="0.95" />
                <rect x="64" y="24" width="12" height="52" rx="4" fill="#fff" opacity="0.95" />
              </svg>
            </span>
            <span className="whitespace-nowrap text-lg font-bold text-ink">{L.app.name}</span>
          </button>
          <nav className="ml-auto flex items-center gap-1.5">
            {NAV.map((n) => {
              const disabled = n.needData && !hasData
              const active = route === n.key
              return (
                <button
                  key={n.key}
                  onClick={() => !disabled && navigate(n.key)}
                  className={`relative rounded-full px-3 py-1.5 text-sm font-semibold transition-all duration-300 sm:px-4 ${
                    active
                      ? 'neu-inset accent-text'
                      : disabled
                        ? 'cursor-not-allowed text-slate-400'
                        : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  <span className="mr-1">{n.emoji}</span>
                  <span className="hidden sm:inline">{L.nav[n.labelKey]}</span>
                  {n.key === 'analysis' && reviewCount > 0 && !disabled && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                      {reviewCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="neu-raised neu-hover ml-1 shrink-0 rounded-full px-2.5 py-1.5 text-xs font-bold text-ink-soft"
            title="切换语言 / Switch language"
          >
            {lang === 'zh' ? 'EN' : '中'}
          </button>
        </div>
      </header>

      {/* 内容 */}
      <main className="flex-1 px-4 pb-12 pt-2">
        {route === 'guide' && <GuidePage hasData={hasData} />}
        {route === 'analysis' && <AnalysisPage hasData={hasData} />}
        {route === 'card' && <CardPage hasData={hasData} />}
        {route === 'privacy' && <PrivacyPage />}
      </main>

      {/* 页脚 */}
      <footer className="neu-inset" style={{ borderRadius: 0 }}>
        <div className="mx-auto max-w-5xl px-4 py-4 text-center text-xs leading-relaxed text-ink-soft">
          {L.app.name} · {L.app.footer}
          <br />
          <button className="mt-1 text-brand-600 hover:underline" onClick={() => navigate('privacy')}>
            {L.app.privacyLink}
          </button>
        </div>
      </footer>
    </div>
  )
}

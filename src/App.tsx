import { useEffect } from 'react'
import { useHashRoute, navigate, type Route } from './hooks/useHashRoute'
import { useStore } from './store/useStore'
import { useProcessed } from './hooks/useProcessed'
import { GuidePage } from './pages/GuidePage'
import { AnalysisPage } from './pages/AnalysisPage'
import { CardPage } from './pages/CardPage'
import { PrivacyPage } from './pages/PrivacyPage'

const NAV: Array<{ key: Route; emoji: string; label: string; needData?: boolean }> = [
  { key: 'guide', emoji: '📥', label: '引导' },
  { key: 'analysis', emoji: '📊', label: '账单分析', needData: true },
  { key: 'card', emoji: '🐾', label: '报告卡片', needData: true },
  { key: 'privacy', emoji: '🔒', label: '隐私' },
]

export default function App() {
  const route = useHashRoute()
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
      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button className="flex shrink-0 items-center gap-2.5" onClick={() => navigate('guide')}>
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 100 100" aria-hidden>
                <rect x="24" y="52" width="12" height="24" rx="4" fill="#fff" opacity="0.95" />
                <rect x="44" y="36" width="12" height="40" rx="4" fill="#fff" opacity="0.95" />
                <rect x="64" y="24" width="12" height="52" rx="4" fill="#fff" opacity="0.95" />
              </svg>
            </span>
            <span className="whitespace-nowrap text-lg font-bold text-ink">账单分析助手</span>
          </button>
          <nav className="ml-auto flex items-center gap-1.5">
            {NAV.map((n) => {
              const disabled = n.needData && !hasData
              const active = route === n.key
              return (
                <button
                  key={n.key}
                  onClick={() => !disabled && navigate(n.key)}
                  className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4 ${
                    active
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                      : disabled
                        ? 'cursor-not-allowed text-slate-300'
                        : 'text-ink-soft hover:bg-slate-100 hover:text-ink'
                  }`}
                >
                  <span className="mr-1">{n.emoji}</span>
                  <span className="hidden sm:inline">{n.label}</span>
                  {n.key === 'analysis' && reviewCount > 0 && !disabled && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                      {reviewCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
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
      <footer className="border-t border-slate-200/60 bg-white/70">
        <div className="mx-auto max-w-5xl px-4 py-4 text-center text-xs leading-relaxed text-ink-soft">
          账单分析助手 · 账单仅在本地浏览器解析与存储，永不上传服务器 · 内部转账/还款自动对冲，不计入收支 · 分析结果仅供个人参考
          <br />
          <button className="mt-1 text-brand-600 hover:underline" onClick={() => navigate('privacy')}>
            查看隐私承诺 →
          </button>
        </div>
      </footer>
    </div>
  )
}

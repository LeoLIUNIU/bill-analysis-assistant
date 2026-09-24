import { useEffect } from 'react'
import { useHashRoute, navigate, type Route } from './hooks/useHashRoute'
import { useStore } from './store/useStore'
import { useProcessed } from './hooks/useProcessed'
import { ImportPage } from './pages/ImportPage'
import { ReviewPage } from './pages/ReviewPage'
import { ReportPage } from './pages/ReportPage'
import { CardPage } from './pages/CardPage'
import { PrivacyPage } from './pages/PrivacyPage'

const NAV: Array<{ key: Route; emoji: string; label: string }> = [
  { key: 'import', emoji: '📥', label: '导入' },
  { key: 'review', emoji: '🔍', label: '核对' },
  { key: 'report', emoji: '📊', label: '报表' },
  { key: 'card', emoji: '🐾', label: '人格' },
  { key: 'privacy', emoji: '🔒', label: '隐私' },
]

export default function App() {
  const route = useHashRoute()
  const transactions = useStore((s) => s.transactions)
  const { queue } = useProcessed()
  const hasData = transactions.length > 0

  // 无数据时访问需要数据的页面 → 引导回导入页
  useEffect(() => {
    if (!hasData && (route === 'review' || route === 'report' || route === 'card')) {
      navigate('import')
    }
  }, [hasData, route])

  const reviewCount = hasData ? queue.length : 0

  return (
    <div className="flex min-h-svh flex-col bg-cream">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button className="flex shrink-0 items-center gap-2" onClick={() => navigate('import')}>
            <span className="text-2xl">🐿️</span>
            <span className="whitespace-nowrap text-lg font-bold text-ink">松鼠助手</span>
            <span className="hidden whitespace-nowrap rounded-full bg-squirrel-100 px-1.5 py-0.5 text-[10px] font-medium text-squirrel-700 sm:inline">演示版</span>
          </button>
          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => navigate(n.key)}
                className={`relative rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                  route === n.key
                    ? 'bg-squirrel-500 text-white shadow-sm'
                    : 'text-ink-soft hover:bg-stone-100'
                }`}
              >
                <span className="sm:mr-1">{n.emoji}</span>
                <span className="hidden sm:inline">{n.label}</span>
                {n.key === 'review' && reviewCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {reviewCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 内容 */}
      <main className="flex-1 px-4 pb-12 pt-4">
        {route === 'import' && <ImportPage hasData={hasData} />}
        {route === 'review' && <ReviewPage hasData={hasData} />}
        {route === 'report' && <ReportPage hasData={hasData} />}
        {route === 'card' && <CardPage hasData={hasData} />}
        {route === 'privacy' && <PrivacyPage />}
      </main>

      {/* 页脚 */}
      <footer className="border-t border-stone-200/70 bg-white/60">
        <div className="mx-auto max-w-4xl px-4 py-4 text-center text-xs leading-relaxed text-ink-soft">
          🐿️ 松鼠助手演示版 · 账单仅在本地浏览器解析与存储，不上传任何服务器 · 分析结果仅供个人参考
          <br />
          <button className="mt-1 text-squirrel-600 hover:underline" onClick={() => navigate('privacy')}>
            查看隐私承诺 →
          </button>
        </div>
      </footer>
    </div>
  )
}

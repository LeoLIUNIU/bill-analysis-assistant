import { useMemo, useRef, useState } from 'react'
import { FINANCE_APPS, type FinanceApp } from '../apps'
import { isDemoTxn, useStore } from '../store/useStore'
import { navigate } from '../hooks/useHashRoute'
import { monthsOf } from '../core/month'
import { Card } from '../components/ui'
import { useI18n } from '../i18n'

export function GuidePage({ hasData }: { hasData: boolean }) {
  const { lang, L } = useI18n()
  const importFiles = useStore((s) => s.importFiles)
  const loadDemo = useStore((s) => s.loadDemo)
  const clearDemo = useStore((s) => s.clearDemo)
  const results = useStore((s) => s.importResults)
  const clearResults = useStore((s) => s.clearImportResults)
  const hasDemo = useStore((s) => s.transactions.some(isDemoTxn))
  const allTx = useStore((s) => s.transactions)
  const summary = useMemo(() => {
    const wechat = allTx.filter((t) => t.platform === 'wechat').length
    const alipay = allTx.filter((t) => t.platform === 'alipay').length
    const bank = allTx.filter((t) => t.platform !== 'wechat' && t.platform !== 'alipay').length
    const ms = monthsOf(allTx)
    return {
      total: allTx.length,
      desc:
        ms.length > 0
          ? L.guide.summary(wechat, alipay, bank, ms[ms.length - 1], ms[0])
          : '',
    }
  }, [allTx, lang, L])
  const [dragging, setDragging] = useState(false)
  /** 单选查看：一次只展示一个APP的账单下载路径，再点一次收起 */
  const [guideKey, setGuideKey] = useState<string | null>('wechat')
  const fileRef = useRef<HTMLInputElement>(null)

  const guideApp: FinanceApp | null = FINANCE_APPS.find((a) => a.key === guideKey) ?? null
  const stepsOf = (app: FinanceApp) => (lang === 'en' && app.stepsEn ? app.stepsEn : app.steps)
  const noteOf = (app: FinanceApp) => (lang === 'en' && app.noteEn ? app.noteEn : app.note)

  const toggleApp = (key: string) => {
    setGuideKey((cur) => (cur === key ? null : key))
  }

  /** 上传只入库不跳转——支持先传完所有文件，再点「一键分析」 */
  const pickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    await importFiles(Array.from(list))
  }

  /** 一键分析：定位到最新月份并进入报表 */
  const analyze = () => {
    const latest = monthsOf(useStore.getState().transactions)[0]
    if (latest) useStore.getState().setSelectedMonth(latest)
    navigate('analysis')
  }

  const scrollToStep1 = () => {
    document.getElementById('step-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const uploadHint = L.guide.uploadMain

  return (
    <div className="mx-auto max-w-4xl">
      {/* ---------- Hero ---------- */}
      <section className="pb-10 pt-10 text-center sm:pt-14">
        <div className="mx-auto mb-5 inline-flex items-center gap-1.5 neu-inset-sm px-3 py-1 text-xs font-medium text-ink-soft">
          {L.guide.pill}
        </div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
          {L.guide.heroTitle1}
          <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">
            {L.guide.heroTitle2}
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
          {L.guide.heroDesc}
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => { loadDemo(); navigate('analysis') }}
            className="neu-raised neu-hover neu-press rounded-xl px-6 py-3 text-sm font-bold accent-text"
          >
            {L.guide.demo}
          </button>
          <button
            onClick={scrollToStep1}
            className="neu-raised neu-hover rounded-xl px-6 py-3 text-sm font-semibold text-ink"
          >
            {L.guide.start}
          </button>
          {hasData && (
            <button
              onClick={analyze}
              className="neu-raised neu-hover neu-press rounded-xl px-6 py-3 text-sm font-bold text-emerald-700"
            >
              {L.guide.analyze}
            </button>
          )}
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-2 text-xs text-ink-soft">
          <span className="neu-inset-sm px-3 py-1.5 font-medium text-emerald-700">{L.guide.feat1}</span>
          <span className="neu-inset-sm px-3 py-1.5 font-medium text-orange-700">{L.guide.feat2}</span>
          <span className="neu-inset-sm px-3 py-1.5 font-medium text-sky-700">{L.guide.feat3}</span>
          <span className="neu-inset-sm px-3 py-1.5 font-medium text-ink-soft">{L.guide.feat4}</span>
        </div>
      </section>

      {/* ---------- 演示数据提醒 ---------- */}
      {hasDemo && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <span>🐘 {L.guide.demoBanner}</span>
          <button
            onClick={clearDemo}
            className="ml-auto rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
          >
            {L.guide.clearDemo}
          </button>
        </div>
      )}

      {/* ---------- Step 01 如何下载账单 ---------- */}
      <section id="step-1" className="scroll-mt-20">
        <StepHeading no="01" title={L.guide.step1} desc={L.guide.step1Desc} />
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3">
          {FINANCE_APPS.map((app) => {
            const active = guideKey === app.key
            return (
              <button
                key={app.key}
                onClick={() => toggleApp(app.key)}
                className={`group relative flex flex-col items-center gap-2 rounded-2xl p-3 pb-2.5 transition-all duration-300 ${
                  active
                    ? 'neu-inset'
                    : 'neu-raised neu-hover'
                }`}
              >
                {active && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white shadow">
                    ▾
                  </span>
                )}
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-[14px] text-lg font-bold text-white shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${app.color}, ${app.color2})` }}
                >
                  {app.logoChar}
                </span>
                <span className="text-xs font-semibold text-ink">{app.name}</span>
                <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ${app.supported ? 'bg-emerald-100 text-emerald-700' : app.badge ? 'bg-brand-100 text-brand-700' : 'bg-stone-100 text-stone-400'}`}>
                  {app.badge ?? (app.supported ? L.guide.parseBadge : L.guide.soonBadge)}
                </span>
              </button>
            )
          })}
        </div>

        {/* 指南面板 */}
        {guideApp && (
          <Card className="mt-4 p-5">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${guideApp.color}, ${guideApp.color2})` }}
              >
                {guideApp.logoChar}
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink">{guideApp.name} · {L.guide.guidePath}</h3>
                <p className="text-xs text-ink-soft">
                  {guideApp.supported ? L.guide.guideAuto : L.guide.guideWip}
                </p>
              </div>
              {guideApp.supported && (
                <span className="ml-auto hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 sm:block">
                  {L.guide.guideOk}
                </span>
              )}
            </div>
            <ol className="mt-4 space-y-2.5">
              {stepsOf(guideApp).map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ backgroundColor: `${guideApp.color}1a`, color: guideApp.color }}
                  >
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            {noteOf(guideApp) && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">💡 {noteOf(guideApp)}</p>
            )}
          </Card>
        )}
      </section>

      {/* ---------- Step 02 上传 ---------- */}
      <section className="mt-14">
        <StepHeading no="02" title={L.guide.step2} desc={L.guide.step2Desc} />
        <Card className="overflow-hidden">
          <div
            className={`flex flex-col items-center justify-center border-2 border-dashed p-10 transition-colors ${
              dragging ? 'border-brand-400 bg-brand-50' : 'border-stone-300 bg-white'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFiles(e.dataTransfer.files) }}
            onClick={() => fileRef.current?.click()}
            role="button"
            aria-label={L.guide.uploadAria}
          >
            <div className="text-4xl">📥</div>
            <p className="mt-3 font-medium text-ink">{uploadHint}{L.guide.uploadOr}</p>
            <p className="mt-1 text-xs text-ink-soft">{L.guide.uploadSub}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pdf,text/csv"
              multiple
              className="hidden"
              onChange={(e) => { pickFiles(e.target.files); e.target.value = '' }}
            />
          </div>
        </Card>

        {/* 导入结果 */}
        {results.length > 0 && (
          <Card className="mt-3 divide-y divide-stone-100">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span>{r.ok ? '✅' : '❌'}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                {r.ok ? (
                  <span className="shrink-0 text-ink-soft">{r.platform} · {r.count ? L.guide.rowsUnit(r.count) : L.guide.imported}</span>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-right text-xs text-red-500">{r.error}</span>
                )}
              </div>
            ))}
            <div className="flex justify-end px-4 py-2">
              <button className="text-xs text-ink-soft hover:text-ink" onClick={clearResults}>{L.common.close}</button>
            </div>
          </Card>
        )}
        {/* 数据概览 + 一键分析 */}
        {hasData && (
          <Card className="mt-3 overflow-hidden ring-2 ring-brand-200">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">{L.guide.readyTotal(summary.total)}</div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  {summary.desc} · {L.guide.readyHint}
                </div>
              </div>
              <button
                onClick={analyze}
                className="ml-auto neu-raised neu-hover neu-press rounded-xl px-6 py-3 text-sm font-bold accent-text"
              >
                {L.guide.analyze}
              </button>
            </div>
          </Card>
        )}
      </section>

      {/* ---------- Step 03 ---------- */}
      <section className="mt-14 pb-6">
        <StepHeading no="03" title={L.guide.step3} desc={L.guide.step3Desc} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            { icon: '🔁', t: L.guide.f1t, d: L.guide.f1d },
            { icon: '🔍', t: L.guide.f2t, d: L.guide.f2d },
            { icon: '💡', t: L.guide.f3t, d: L.guide.f3d },
            { icon: '🐾', t: L.guide.f4t, d: L.guide.f4d },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 transition-shadow hover:shadow-md">
              <div className="text-2xl">{f.icon}</div>
              <div className="mt-2 text-sm font-bold text-ink">{f.t}</div>
              <div className="mt-1 text-xs leading-relaxed text-ink-soft">{f.d}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-ink-soft">
          {L.guide.localNote}
          <button className="ml-1 text-brand-600 hover:underline" onClick={() => navigate('privacy')}>{L.app.privacyLink.replace(' →', '')}</button>
        </p>
      </section>
    </div>
  )
}

/** 大号幽灵数字 + 标题的分节头（funblocks 风格） */
function StepHeading({ no, title, desc }: { no: string; title: string; desc?: string }) {
  return (
    <div className="relative mb-5 pl-16 sm:pl-20">
      <span
        aria-hidden
        className="pointer-events-none absolute -left-1 -top-3 select-none text-6xl font-black tracking-tighter text-stone-200/90 sm:text-7xl"
      >
        {no}
      </span>
      <h2 className="pt-3 text-xl font-bold text-ink sm:text-2xl">{title}</h2>
      {desc && <p className="mt-1 text-sm text-ink-soft">{desc}</p>}
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { useProcessed } from '../hooks/useProcessed'
import { useStore } from '../store/useStore'
import { navigate } from '../hooks/useHashRoute'
import { computePersona, animalText, type PersonaResult } from '../core/persona'
import { countsAsFlow } from '../core/transfer'
import { categoryDef } from '../core/categories'
import { Card, EmptyState, SectionTitle } from '../components/ui'
import { useI18n, type Dict, type Lang } from '../i18n'

/** 四套报告卡片模板：幻彩渐变 / 柔光新拟态 / 午夜玻璃 / 数据海报 */
const TEMPLATES = [
  { key: 'gradient', swatch: 'linear-gradient(135deg,#e879f9,#6366f1)' },
  { key: 'soft', swatch: '#e0e5ec' },
  { key: 'midnight', swatch: 'linear-gradient(135deg,#1e2438,#0f1424)' },
  { key: 'poster', swatch: '#ffffff' },
] as const

type TplKey = (typeof TEMPLATES)[number]['key']

export function CardPage({ hasData }: { hasData: boolean }) {
  const { lang, L } = useI18n()
  const { monthTx } = useProcessed()
  const selectedMonth = useStore((s) => s.selectedMonth)
  const [showAmount, setShowAmount] = useState(true)
  const [tpl, setTpl] = useState<TplKey>('gradient')
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const persona: PersonaResult | null = useMemo(() => computePersona(monthTx), [monthTx])

  const topCats = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const t of monthTx) {
      if (t.direction === 'out' && countsAsFlow(t)) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount
    }
    return Object.entries(byCat)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
  }, [monthTx])

  if (!hasData) return <NoData />

  const month = selectedMonth || L.card.allMonths

  const download = async () => {
    if (!cardRef.current) return
    setBusy(true)
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `bill-lens-persona_${selectedMonth || 'all'}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  const tplLabel: Record<TplKey, string> = {
    gradient: L.card.tplGradient,
    soft: L.card.tplSoft,
    midnight: L.card.tplMidnight,
    poster: L.card.tplPoster,
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="pb-2 pt-6 text-center">
        <div className="text-4xl">🐾</div>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">{L.card.title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          {L.card.desc}
        </p>
      </div>

      {!persona ? (
        <div className="pt-4">
          <EmptyState
            emoji="🐾"
            title={L.card.needMore}
            desc={L.card.needMoreDesc}
            action={
              <button onClick={() => navigate('guide')} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                {L.card.goImport}
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 pt-4">
          {/* 模板选择 */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => setTpl(t.key)}
                className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-xs font-semibold transition-all duration-300 ${
                  tpl === t.key ? 'neu-inset accent-text' : 'neu-raised neu-hover text-ink-soft'
                }`}
              >
                <span className="h-6 w-9 rounded-full" style={{ background: t.swatch }} />
                {tplLabel[t.key]}
              </button>
            ))}
          </div>

          {/* 操作条 */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm">
            <button
              onClick={() => setShowAmount(!showAmount)}
              className="neu-raised neu-hover rounded-xl px-4 py-2.5 font-semibold text-ink"
            >
              {showAmount ? L.card.hideAmount : L.card.showAmount}
            </button>
            <button
              onClick={() => void download()}
              disabled={busy}
              className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? L.card.generating : L.card.savePng}
            </button>
          </div>

          {/* 卡片渲染 */}
          <div ref={cardRef}>
            {tpl === 'gradient' && <GradientCard persona={persona} month={month} showAmount={showAmount} topCats={topCats} lang={lang} L={L} />}
            {tpl === 'soft' && <SoftCard persona={persona} month={month} showAmount={showAmount} topCats={topCats} lang={lang} L={L} />}
            {tpl === 'midnight' && <MidnightCard persona={persona} month={month} showAmount={showAmount} topCats={topCats} lang={lang} L={L} />}
            {tpl === 'poster' && <PosterCard persona={persona} month={month} showAmount={showAmount} topCats={topCats} lang={lang} L={L} />}
          </div>

          {/* 人格推导说明 */}
          <Card className="w-full max-w-xl p-5">
            <SectionTitle emoji="🧮" title={L.card.howTitle} desc={L.card.howDesc} />
            <div className="space-y-4">
              <DimBar label={L.card.dSavings} hint={persona.dims.savingsRate === null ? '—' : `${Math.round(persona.dims.savingsRate * 100)}%`} ratio={persona.dims.savingsRate === null ? 0 : Math.max(0, Math.min(1, persona.dims.savingsRate))} color="#6d5dfc" />
              <DimBar label={L.card.dConcentration} hint={persona.dims.concentration === null ? '—' : L.card.concHint(Math.round(persona.dims.concentration * 100))} ratio={persona.dims.concentration ?? 0} color="#0ea5e9" />
              <DimBar label={L.card.dNight} hint={persona.dims.nightRatio === null ? '—' : `${Math.round(persona.dims.nightRatio * 100)}%`} ratio={persona.dims.nightRatio ?? 0} color="#8b5cf6" />
              <div className="grid grid-cols-3 gap-3 pt-1">
                <DimChip label={L.card.dMedian} value={persona.dims.medianAmount === null ? '—' : `¥${fmt(persona.dims.medianAmount)}`} />
                <DimChip label={L.card.dVolatility} value={persona.dims.volatility === null ? '—' : persona.dims.volatility > 1.1 ? L.card.volHigh : L.card.volSteady} />
                <DimChip label={L.card.dCount} value={L.card.txCountUnit(persona.dims.txnCount)} />
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ---------- 共用 ---------- */

interface TplProps {
  persona: PersonaResult
  month: string
  showAmount: boolean
  topCats: Array<{ name: string; total: number }>
  lang: Lang
  L: Dict
}

const baseCard: React.CSSProperties = {
  position: 'relative',
  color: '#fff',
  fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
  overflow: 'hidden',
}

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function statsOf(p: PersonaResult, L: Dict): Array<{ key: 'income' | 'expense' | 'rate'; label: string; value: string; color: string }> {
  return [
    { key: 'income', label: L.card.statIncome, value: `¥${fmt(p.dims.income)}`, color: '#16a34a' },
    { key: 'expense', label: L.card.statExpense, value: `¥${fmt(p.dims.expense)}`, color: '#ea580c' },
    {
      key: 'rate',
      label: L.card.statRate,
      value: p.dims.savingsRate === null ? '—' : `${Math.round(p.dims.savingsRate * 100)}%`,
      color: '#0d9488',
    },
  ]
}

function mixText(p: PersonaResult, lang: Lang): string {
  const at = animalText(p.primary, lang)
  if (!p.secondary || !p.mix) return ''
  const st = animalText(p.secondary, lang)
  return `${p.mix[0]}% ${at.name} + ${p.mix[1]}% ${st.name} ${p.secondary.emoji}`
}

/* ---------- 模板一：幻彩渐变 ---------- */

function GradientCard({ persona: p, month, showAmount, topCats, lang, L }: TplProps) {
  const at = animalText(p.primary, lang)
  return (
    <div style={{ ...baseCard, background: 'linear-gradient(135deg,#e879f9,#6366f1)', width: 360, borderRadius: 24, padding: '22px 22px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.9)' }}>{L.card.reportLabel}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{month}</span>
      </div>

      <div style={{ textAlign: 'center', margin: '16px 0 6px' }}>
        <div style={{ fontSize: 84, lineHeight: 1 }}>{p.primary.emoji}</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#ffffff', marginTop: 8 }}>{L.card.personaType(at.name)}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>「{at.epithet}」</div>
        {p.secondary && p.mix && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>{mixText(p, lang)}</div>
        )}
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.95)', textAlign: 'center', margin: '8px 6px 14px' }}>
        {at.copy}
      </p>

      <div style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '12px 16px' }}>
        {statsOf(p, L).map((s) => (
          <StatRow key={s.key} label={s.label} value={s.value} show={showAmount || s.key === 'rate'} color={s.color} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13.5 }}>
          <span style={{ color: '#57534e' }}>{L.card.statFav}</span>
          <span style={{ fontWeight: 700, color: '#6d5dfc' }}>{topCats[0]?.name ?? '—'}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 12 }}>
        {L.card.localNote}
      </div>
    </div>
  )
}

function StatRow({ label, value, show, color }: { label: string; value: string; show: boolean; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13.5 }}>
      <span style={{ color: '#57534e' }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{show ? value : '¥ ***'}</span>
    </div>
  )
}

/* ---------- 模板二：柔光新拟态 ---------- */

function SoftCard({ persona: p, month, showAmount, topCats, lang, L }: TplProps) {
  const at = animalText(p.primary, lang)
  return (
    <div style={{ ...baseCard, background: '#e0e5ec', width: 360, borderRadius: 28, padding: '22px 22px 16px', boxShadow: '10px 10px 22px #b8bcc2, -10px -10px 22px #ffffff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6d5dfc', letterSpacing: 1 }}>{L.card.reportLabel}</span>
        <span style={{ fontSize: 12, color: '#6d7590' }}>{month}</span>
      </div>

      {/* 新拟态凹面圆盘中的动物 */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0 10px' }}>
        <div style={{
          width: 128, height: 128, borderRadius: '50%', background: '#e0e5ec',
          border: '1px solid #cdd4e2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64,
        }}>
          {p.primary.emoji}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#3a4160' }}>{L.card.personaType(at.name)}</div>
        <div style={{ fontSize: 13, color: '#6d5dfc', fontWeight: 600, marginTop: 4 }}>「{at.epithet}」</div>
        {p.secondary && p.mix && (
          <div style={{ fontSize: 12, color: '#6d7590', marginTop: 5 }}>{mixText(p, lang)}</div>
        )}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.7, color: '#4a5170', textAlign: 'center', margin: '10px 6px 14px' }}>
        {at.copy}
      </p>

      {/* 凹陷数据井 */}
      <div style={{ background: '#d8deea', borderRadius: 16, padding: '12px 16px', border: '1px solid #cdd4e2' }}>
        {statsOf(p, L).map((s) => (
          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid #cdd4e2' }}>
            <span style={{ color: '#6d7590' }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: '#3a4160' }}>
              {s.key === 'rate' || !showAmount ? (s.key === 'rate' ? s.value : '¥ ***') : s.value}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
          <span style={{ color: '#6d7590' }}>{L.card.statFav}</span>
          <span style={{ fontWeight: 700, color: '#3a4160' }}>{topCats[0]?.name ?? '—'}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#6d7590', marginTop: 12 }}>
        {L.card.localNote}
      </div>
    </div>
  )
}

/* ---------- 模板三：午夜玻璃 ---------- */

function MidnightCard({ persona: p, month, showAmount, topCats, lang, L }: TplProps) {
  const at = animalText(p.primary, lang)
  return (
    <div style={{ ...baseCard, background: 'linear-gradient(160deg,#232a44 0%,#12172b 100%)', width: 360, borderRadius: 24, padding: '22px 22px 16px', border: '1px solid rgba(255,255,255,0.12)' }}>
      {/* 装饰光斑 */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(109,93,252,0.25)' }} />
      <div style={{ position: 'absolute', bottom: -30, left: -30, width: 110, height: 110, borderRadius: '50%', background: 'rgba(14,165,233,0.18)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>{L.card.personaReport} · {month}</span>
        <span style={{ fontSize: 12, color: '#f5c76a', fontWeight: 600 }}>{L.app.name}</span>
      </div>

      <div style={{ textAlign: 'center', margin: '16px 0 8px', position: 'relative' }}>
        <div style={{ fontSize: 80, lineHeight: 1 }}>{p.primary.emoji}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', marginTop: 8 }}>{L.card.personaTypeX(at.name, '')}</div>
        <div style={{ fontSize: 13, color: '#f5c76a', marginTop: 4 }}>{at.epithet}</div>
        {p.secondary && p.mix && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{mixText(p, lang)}</div>
        )}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', textAlign: 'center', margin: '8px 6px 14px', position: 'relative' }}>
        {at.copy}
      </p>

      {/* 玻璃数据板 */}
      <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '12px 16px', position: 'relative' }}>
        {statsOf(p, L).map((s) => (
          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: 'rgba(255,255,255,0.65)' }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: '#f5c76a' }}>{showAmount ? s.value : '¥ ***'}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>{L.card.statFav}</span>
          <span style={{ fontWeight: 700, color: '#ffffff' }}>{topCats[0]?.name ?? '—'}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 12, position: 'relative' }}>
        {L.card.localNote}
      </div>
    </div>
  )
}

/* ---------- 模板四：数据海报 ---------- */

function PosterCard({ persona: p, month, showAmount, topCats, lang, L }: TplProps) {
  const at = animalText(p.primary, lang)
  const st = p.secondary ? animalText(p.secondary, lang) : null
  const maxCat = topCats[0]?.total ?? 1
  return (
    <div style={{ ...baseCard, background: '#ffffff', width: 360, borderRadius: 20, color: '#1a1a2e' }}>
      {/* 顶部落款带 */}
      <div style={{ background: '#6d5dfc', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', letterSpacing: 1 }}>{L.app.name}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{month}</span>
      </div>

      <div style={{ padding: '18px 20px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#a0a5b8', letterSpacing: 2 }}>{L.card.posterTotal}</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: '#1a1a2e', lineHeight: 1.15, letterSpacing: -1 }}>
          {showAmount ? `¥${fmt(p.dims.expense)}` : '¥ ***'}
        </div>
        <div style={{ fontSize: 12, color: '#6d7590', marginTop: 2 }}>
          {L.card.posterIncome} {showAmount ? `¥${fmt(p.dims.income)}` : '¥ ***'} · {L.card.statRate} {p.dims.savingsRate === null ? '—' : `${Math.round(p.dims.savingsRate * 100)}%`}
        </div>

        {/* 分类小条形 */}
        <div style={{ marginTop: 14 }}>
          {topCats.map((c, i) => {
            const def = categoryDef(c.name)
            return (
              <div key={c.name} style={{ marginBottom: i < topCats.length - 1 ? 8 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                  <span style={{ color: '#4a5170', fontWeight: 600 }}>{def.emoji} {c.name}</span>
                  <span style={{ color: '#8a8fa3' }}>{showAmount ? `¥${fmt(c.total)}` : '***'}</span>
                </div>
                <div style={{ height: 6, background: '#eef0f6', borderRadius: 3, marginTop: 3 }}>
                  <div style={{ width: `${maxCat > 0 ? (c.total / maxCat) * 100 : 0}%`, height: '100%', borderRadius: 3, background: def.color }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* 人格盖章区 */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, background: '#f4f5fb', borderRadius: 12, padding: '10px 14px' }}>
          <div style={{ fontSize: 34 }}>{p.primary.emoji}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>
              {L.card.personaTypeX(at.name, st?.name ?? '')}
            </div>
            <div style={{ fontSize: 11, color: '#6d7590' }}>{at.epithet}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.65, color: '#4a5170', marginTop: 10 }}>
          {at.copy}
        </div>

        <div style={{ borderTop: '1px dashed #d8dde8', marginTop: 12, paddingTop: 8, fontSize: 10.5, color: '#a0a5b8', textAlign: 'center' }}>
          🐾 {L.card.localNote}
        </div>
      </div>
    </div>
  )
}

/* ---------- 其他 ---------- */

function DimBar({ label, hint, ratio, color }: { label: string; hint: string; ratio: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-ink-soft">{hint}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function DimChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-ink">{value}</div>
    </div>
  )
}

function NoData() {
  const { L } = useI18n()
  return (
    <EmptyState
      emoji="🐾"
      title={L.card.noDataTitle}
      desc={L.card.noDataDesc}
      action={
        <button onClick={() => navigate('guide')} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          {L.card.goImport}
        </button>
      }
    />
  )
}

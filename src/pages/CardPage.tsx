import { useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { useProcessed } from '../hooks/useProcessed'
import { useStore } from '../store/useStore'
import { navigate } from '../hooks/useHashRoute'
import { computePersona, type PersonaResult } from '../core/persona'
import { countsAsFlow } from '../core/transfer'
import { categoryDef } from '../core/categories'
import { Card, EmptyState, SectionTitle } from '../components/ui'

/** 四套报告卡片模板：幻彩渐变 / 柔光新拟态 / 午夜玻璃 / 数据海报 */
const TEMPLATES = [
  { key: 'gradient', name: '幻彩渐变', swatch: 'linear-gradient(135deg,#e879f9,#6366f1)' },
  { key: 'soft', name: '柔光新拟态', swatch: '#e0e5ec' },
  { key: 'midnight', name: '午夜玻璃', swatch: 'linear-gradient(135deg,#1e2438,#0f1424)' },
  { key: 'poster', name: '数据海报', swatch: '#ffffff' },
] as const

type TplKey = (typeof TEMPLATES)[number]['key']

export function CardPage({ hasData }: { hasData: boolean }) {
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

  const download = async () => {
    if (!cardRef.current) return
    setBusy(true)
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `账单分析助手_消费人格_${selectedMonth || '全部'}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="pb-2 pt-6 text-center">
        <div className="text-4xl">🐾</div>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">你的消费人格</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          由你的真实账单推导。挑一个喜欢的模板，生成专属报告卡片。
        </p>
      </div>

      {!persona ? (
        <div className="pt-4">
          <EmptyState
            emoji="🐾"
            title="数据还不够画出你的动物人格"
            desc="至少需要 8 笔支出。多导入一些账单，或切到全部月份再来看看。"
            action={
              <button onClick={() => navigate('guide')} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                去导入账单
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
                {t.name}
              </button>
            ))}
          </div>

          {/* 操作条 */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm">
            <button
              onClick={() => setShowAmount(!showAmount)}
              className="neu-raised neu-hover rounded-xl px-4 py-2.5 font-semibold text-ink"
            >
              {showAmount ? '🙈 切换为金额隐藏版' : '🐵 切换为金额可见版'}
            </button>
            <button
              onClick={() => void download()}
              disabled={busy}
              className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? '生成中…' : '🖼️ 保存卡片 PNG'}
            </button>
          </div>

          {/* 卡片渲染 */}
          <div ref={cardRef}>
            {tpl === 'gradient' && <GradientCard persona={persona} month={selectedMonth || '全部月份'} showAmount={showAmount} topCats={topCats} />}
            {tpl === 'soft' && <SoftCard persona={persona} month={selectedMonth || '全部月份'} showAmount={showAmount} topCats={topCats} />}
            {tpl === 'midnight' && <MidnightCard persona={persona} month={selectedMonth || '全部月份'} showAmount={showAmount} topCats={topCats} />}
            {tpl === 'poster' && <PosterCard persona={persona} month={selectedMonth || '全部月份'} showAmount={showAmount} topCats={topCats} />}
          </div>

          {/* 人格推导说明 */}
          <Card className="w-full max-w-xl p-5">
            <SectionTitle emoji="🧮" title="这个人格是怎么算出来的" desc="5 个维度全部由真实账单推导。" />
            <div className="space-y-4">
              <DimBar label="🐿️ 结余率" hint={persona.dims.savingsRate === null ? '—' : `${Math.round(persona.dims.savingsRate * 100)}%`} ratio={persona.dims.savingsRate === null ? 0 : Math.max(0, Math.min(1, persona.dims.savingsRate))} color="#6d5dfc" />
              <DimBar label="🎯 消费集中度" hint={persona.dims.concentration === null ? '—' : `${Math.round(persona.dims.concentration * 100)}% 集中在最大类目`} ratio={persona.dims.concentration ?? 0} color="#0ea5e9" />
              <DimBar label="🦉 夜间消费占比" hint={persona.dims.nightRatio === null ? '—' : `${Math.round(persona.dims.nightRatio * 100)}%`} ratio={persona.dims.nightRatio ?? 0} color="#8b5cf6" />
              <div className="grid grid-cols-3 gap-3 pt-1">
                <DimChip label="单笔中位数" value={persona.dims.medianAmount === null ? '—' : `¥${fmt(persona.dims.medianAmount)}`} />
                <DimChip label="消费波动" value={persona.dims.volatility === null ? '—' : persona.dims.volatility > 1.1 ? '大起大落' : '平稳'} />
                <DimChip label="支出笔数" value={`${persona.dims.txnCount} 笔`} />
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

function statsOf(p: PersonaResult): Array<{ label: string; value: string; color: string }> {
  return [
    { label: '本期收入', value: `¥${fmt(p.dims.income)}`, color: '#16a34a' },
    { label: '本期支出', value: `¥${fmt(p.dims.expense)}`, color: '#ea580c' },
    {
      label: '结余率',
      value: p.dims.savingsRate === null ? '—' : `${Math.round(p.dims.savingsRate * 100)}%`,
      color: '#0d9488',
    },
  ]
}

function mixText(p: PersonaResult): string {
  return p.secondary && p.mix
    ? `${p.mix[0]}% ${p.primary.name} + ${p.mix[1]}% ${p.secondary.name} ${p.secondary.emoji}`
    : ''
}

/* ---------- 模板一：幻彩渐变 ---------- */

function GradientCard({ persona: p, month, showAmount, topCats }: TplProps) {
  return (
    <div style={{ ...baseCard, background: 'linear-gradient(135deg,#e879f9,#6366f1)', width: 360, borderRadius: 24, padding: '22px 22px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.9)' }}>账单分析助手 · 消费人格报告</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{month}</span>
      </div>

      <div style={{ textAlign: 'center', margin: '16px 0 6px' }}>
        <div style={{ fontSize: 84, lineHeight: 1 }}>{p.primary.emoji}</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#ffffff', marginTop: 8 }}>{p.primary.name}型人格</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>「{p.primary.epithet}」</div>
        {p.secondary && p.mix && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>{mixText(p)}</div>
        )}
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.95)', textAlign: 'center', margin: '8px 6px 14px' }}>
        {p.statement}
      </p>

      <div style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '12px 16px' }}>
        {statsOf(p).map((s) => (
          <StatRow key={s.label} label={s.label} value={s.value} show={showAmount || s.label === '结余率'} color={s.color} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13.5 }}>
          <span style={{ color: '#57534e' }}>最爱的花钱类目</span>
          <span style={{ fontWeight: 700, color: '#6d5dfc' }}>{topCats[0]?.name ?? '—'}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 12 }}>
        账单只在本地浏览器解析，放心分享
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

function SoftCard({ persona: p, month, showAmount, topCats }: TplProps) {
  return (
    <div style={{ ...baseCard, background: '#e0e5ec', width: 360, borderRadius: 28, padding: '22px 22px 16px', boxShadow: '10px 10px 22px #b8bcc2, -10px -10px 22px #ffffff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6d5dfc', letterSpacing: 1 }}>账单分析助手 · 消费人格报告</span>
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
        <div style={{ fontSize: 26, fontWeight: 800, color: '#3a4160' }}>{p.primary.name}型人格</div>
        <div style={{ fontSize: 13, color: '#6d5dfc', fontWeight: 600, marginTop: 4 }}>「{p.primary.epithet}」</div>
        {p.secondary && p.mix && (
          <div style={{ fontSize: 12, color: '#6d7590', marginTop: 5 }}>{mixText(p)}</div>
        )}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.7, color: '#4a5170', textAlign: 'center', margin: '10px 6px 14px' }}>
        {p.statement}
      </p>

      {/* 凹陷数据井 */}
      <div style={{ background: '#d8deea', borderRadius: 16, padding: '12px 16px', border: '1px solid #cdd4e2' }}>
        {statsOf(p).map((s) => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid #cdd4e2' }}>
            <span style={{ color: '#6d7590' }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: '#3a4160' }}>
              {s.label === '结余率' || !showAmount ? (s.label === '结余率' ? s.value : '¥ ***') : s.value}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
          <span style={{ color: '#6d7590' }}>最爱的花钱类目</span>
          <span style={{ fontWeight: 700, color: '#3a4160' }}>{topCats[0]?.name ?? '—'}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#6d7590', marginTop: 12 }}>
        账单只在本地浏览器解析，放心分享
      </div>
    </div>
  )
}

/* ---------- 模板三：午夜玻璃 ---------- */

function MidnightCard({ persona: p, month, showAmount, topCats }: TplProps) {
  return (
    <div style={{ ...baseCard, background: 'linear-gradient(160deg,#232a44 0%,#12172b 100%)', width: 360, borderRadius: 24, padding: '22px 22px 16px', border: '1px solid rgba(255,255,255,0.12)' }}>
      {/* 装饰光斑 */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(109,93,252,0.25)' }} />
      <div style={{ position: 'absolute', bottom: -30, left: -30, width: 110, height: 110, borderRadius: '50%', background: 'rgba(14,165,233,0.18)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>消费人格报告 · {month}</span>
        <span style={{ fontSize: 12, color: '#f5c76a', fontWeight: 600 }}>账单分析助手</span>
      </div>

      <div style={{ textAlign: 'center', margin: '16px 0 8px', position: 'relative' }}>
        <div style={{ fontSize: 80, lineHeight: 1 }}>{p.primary.emoji}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', marginTop: 8 }}>{p.primary.name}型</div>
        <div style={{ fontSize: 13, color: '#f5c76a', marginTop: 4 }}>{p.primary.epithet}</div>
        {p.secondary && p.mix && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{mixText(p)}</div>
        )}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', textAlign: 'center', margin: '8px 6px 14px', position: 'relative' }}>
        {p.statement}
      </p>

      {/* 玻璃数据板 */}
      <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '12px 16px', position: 'relative' }}>
        {statsOf(p).map((s) => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: 'rgba(255,255,255,0.65)' }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: '#f5c76a' }}>{showAmount ? s.value : '¥ ***'}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>最爱的花钱类目</span>
          <span style={{ fontWeight: 700, color: '#ffffff' }}>{topCats[0]?.name ?? '—'}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 12, position: 'relative' }}>
        数据本地处理 · 未分类支出不参与统计
      </div>
    </div>
  )
}

/* ---------- 模板四：数据海报 ---------- */

function PosterCard({ persona: p, month, showAmount, topCats }: TplProps) {
  const maxCat = topCats[0]?.total ?? 1
  return (
    <div style={{ ...baseCard, background: '#ffffff', width: 360, borderRadius: 20, color: '#1a1a2e' }}>
      {/* 顶部落款带 */}
      <div style={{ background: '#6d5dfc', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', letterSpacing: 1 }}>账单分析助手</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{month}</span>
      </div>

      <div style={{ padding: '18px 20px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#a0a5b8', letterSpacing: 2 }}>本期总支出</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: '#1a1a2e', lineHeight: 1.15, letterSpacing: -1 }}>
          {showAmount ? `¥${fmt(p.dims.expense)}` : '¥ ***'}
        </div>
        <div style={{ fontSize: 12, color: '#6d7590', marginTop: 2 }}>
          收入 {showAmount ? `¥${fmt(p.dims.income)}` : '¥ ***'} · 结余率 {p.dims.savingsRate === null ? '—' : `${Math.round(p.dims.savingsRate * 100)}%`}
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
              {p.primary.name}型{p.secondary ? ` × ${p.secondary.name}型` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#6d7590' }}>{p.primary.epithet}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.65, color: '#4a5170', marginTop: 10 }}>
          {p.statement}
        </div>

        <div style={{ borderTop: '1px dashed #d8dde8', marginTop: 12, paddingTop: 8, fontSize: 10.5, color: '#a0a5b8', textAlign: 'center' }}>
          🐾 账单只在本地浏览器解析，放心分享
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
  return (
    <EmptyState
      emoji="🐾"
      title="还没有账单数据"
      desc="导入账单后，我们会根据你的真实消费，为你匹配一只专属动物。"
      action={
        <button onClick={() => navigate('guide')} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          去导入账单
        </button>
      }
    />
  )
}

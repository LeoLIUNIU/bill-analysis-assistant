import { useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { useProcessed } from '../hooks/useProcessed'
import { useStore } from '../store/useStore'
import { navigate } from '../hooks/useHashRoute'
import { computePersona, type PersonaResult } from '../core/persona'
import { countsAsFlow } from '../core/transfer'
import { Card, EmptyState, SectionTitle } from '../components/ui'

export function CardPage({ hasData }: { hasData: boolean }) {
  const { monthTx } = useProcessed()
  const selectedMonth = useStore((s) => s.selectedMonth)
  const [showAmount, setShowAmount] = useState(true)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const persona: PersonaResult | null = useMemo(() => computePersona(monthTx), [monthTx])
  const topCat = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const t of monthTx) {
      if (t.direction === 'out' && countsAsFlow(t)) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount
    }
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]
    return top ? top[0] : null
  }, [monthTx])

  if (!hasData) return <NoData />

  const download = async () => {
    if (!cardRef.current) return
    setBusy(true)
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `松鼠助手_消费人格_${selectedMonth || '全部'}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* 页头 */}
      <div className="pb-2 pt-6 text-center">
        <div className="text-4xl">🐾</div>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">你的消费人格</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          由你的真实账单推导，不是随机贴标签。选个月份看看这个月的你像哪只小动物。
        </p>
      </div>

      {!persona ? (
        <div className="pt-4">
          <EmptyState
            emoji="🐾"
            title="数据还不够画出你的动物人格"
            desc="至少需要 8 笔支出。多导入一些账单，或切到「全部」月份再来看看。"
            action={
              <button onClick={() => navigate('import')} className="rounded-lg bg-squirrel-500 px-4 py-2 text-sm font-medium text-white hover:bg-squirrel-600">
                去导入账单
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-7 pt-4">
          {/* 操作条 */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm">
            <button
              onClick={() => setShowAmount(!showAmount)}
              className="rounded-xl bg-white px-4 py-2.5 font-semibold text-ink ring-1 ring-stone-200 transition-all hover:-translate-y-px hover:ring-stone-300"
            >
              {showAmount ? '🙈 切换为金额隐藏版' : '🐵 切换为金额可见版'}
            </button>
            <button
              onClick={() => void download()}
              disabled={busy}
              className="rounded-xl bg-squirrel-500 px-4 py-2.5 font-semibold text-white shadow-lg shadow-squirrel-500/25 transition-all hover:-translate-y-px hover:bg-squirrel-600 disabled:opacity-60"
            >
              {busy ? '生成中…' : '🖼️ 保存卡片 PNG'}
            </button>
          </div>

          {/* 分享卡片：全部用内联 hex 样式，保证 html2canvas 导出一致 */}
          <div ref={cardRef} style={{ ...cardStyle, background: cardBg(persona) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600, letterSpacing: 1 }}>
                松鼠助手 · 消费人格报告
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{selectedMonth || '全部月份'}</span>
            </div>

            <div style={{ textAlign: 'center', margin: '18px 0 6px' }}>
              <div style={{ fontSize: 88, lineHeight: 1 }}>{persona.primary.emoji}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#ffffff', marginTop: 10 }}>
                {persona.primary.name}型人格
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>
                「{persona.primary.epithet}」
              </div>
              {persona.secondary && persona.mix && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>
                  {persona.mix[0]}% {persona.primary.name} + {persona.mix[1]}% {persona.secondary.name} {persona.secondary.emoji}
                </div>
              )}
            </div>

            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.95)', textAlign: 'center', margin: '10px 12px 16px' }}>
              {persona.statement}
            </p>

            <div style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '12px 16px' }}>
              <StatRow label="本期收入" value={`¥${fmt(persona.dims.income)}`} show={showAmount} color="#16a34a" />
              <StatRow label="本期支出" value={`¥${fmt(persona.dims.expense)}`} show={showAmount} color="#ea580c" />
              <StatRow
                label="结余率"
                value={persona.dims.savingsRate === null ? '—' : `${Math.round(persona.dims.savingsRate * 100)}%`}
                show={showAmount}
                color="#0d9488"
              />
              <StatRow
                label="最爱的花钱类目"
                value={topCat ?? '—'}
                show
                color="#8b5cf6"
              />
            </div>

            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 12 }}>
              🐿️ 松鼠助手 · 账单只在本地浏览器解析，放心分享
            </div>
          </div>

          {/* 人格是怎么算出来的 */}
          <Card className="w-full max-w-xl p-5">
            <SectionTitle emoji="🧮" title="这个人格是怎么算出来的" desc="5 个维度全部由真实账单推导。" />
            <div className="space-y-4">
              <DimBar
                label="🐿️ 结余率"
                hint={persona.dims.savingsRate === null ? '本期无收入数据' : `${Math.round(persona.dims.savingsRate * 100)}%`}
                ratio={persona.dims.savingsRate === null ? 0 : Math.max(0, Math.min(1, persona.dims.savingsRate))}
                color="#10b981"
              />
              <DimBar
                label="🎯 消费集中度"
                hint={persona.dims.concentration === null ? '数据不足' : `${Math.round(persona.dims.concentration * 100)}% 集中在最大类目`}
                ratio={persona.dims.concentration ?? 0}
                color="#8b5cf6"
              />
              <DimBar
                label="🦉 夜间消费占比"
                hint={persona.dims.nightRatio === null ? '数据不足' : `${Math.round(persona.dims.nightRatio * 100)}%`}
                ratio={persona.dims.nightRatio ?? 0}
                color="#6366f1"
              />
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

/** 维度进度条（结余率/集中度/夜间占比都是 0–1 的比率） */
function DimBar({ label, hint, ratio, color }: { label: string; hint: string; ratio: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-ink-soft">{hint}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function StatRow({ label, value, show, color }: { label: string; value: string; show: boolean; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13.5 }}>
      <span style={{ color: '#57534e' }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{show ? value : '¥ ***'}</span>
    </div>
  )
}

function DimChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-center">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-ink">{value}</div>
    </div>
  )
}

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

const cardStyle: React.CSSProperties = {
  width: 360,
  borderRadius: 24,
  padding: '22px 22px 18px',
  color: '#fff',
  boxShadow: '0 20px 40px -12px rgba(249,115,22,0.35)',
  fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
}

function cardBg(p: PersonaResult): string {
  const gradients: Record<string, string> = {
    squirrel: 'linear-gradient(135deg,#fbbf24,#f97316)',
    hamster: 'linear-gradient(135deg,#facc15,#d97706)',
    butterfly: 'linear-gradient(135deg,#e879f9,#8b5cf6)',
    owl: 'linear-gradient(135deg,#818cf8,#475569)',
    panda: 'linear-gradient(135deg,#94a3b8,#374151)',
    bee: 'linear-gradient(135deg,#a3e635,#eab308)',
    hedgehog: 'linear-gradient(135deg,#fb923c,#f43f5e)',
    migratory: 'linear-gradient(135deg,#38bdf8,#0891b2)',
  }
  return gradients[p.primary.key] ?? gradients.squirrel
}

function NoData() {
  return (
    <EmptyState
      emoji="🐾"
      title="还没有账单数据"
      desc="导入账单后，松鼠会根据你的真实消费给你领一只专属动物。"
      action={
        <button onClick={() => navigate('import')} className="rounded-lg bg-squirrel-500 px-4 py-2 text-sm font-medium text-white hover:bg-squirrel-600">
          去导入账单
        </button>
      }
    />
  )
}

import type { Insight } from './insights'
import type { BreakdownRow, CategoryDetail, DeepMining, RecurringExpense } from './analysis'
import type { MonthlyAggregate } from './schema'
import type { PersonaResult } from './persona'

/**
 * 一键下载分析报告：生成自包含 HTML 文件（内联样式、无外部依赖），
 * 浏览器打开即可阅读，Ctrl+P 可另存为 PDF。
 */

export interface ReportData {
  label: string
  generatedAt: string
  agg: MonthlyAggregate
  insights: Insight[]
  categories: CategoryDetail[]
  payMethods: BreakdownRow[]
  recurring: RecurringExpense[]
  persona: PersonaResult | null
  txnCount: number
  mining?: DeepMining
}

const fmt = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt0 = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
const pct = (n: number) => `${Math.round(n * 100)}%`
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildReportHTML(d: ReportData): string {
  const net = d.agg.income - d.agg.expense
  const savingsRate = d.agg.income > 0 ? net / d.agg.income : null

  const statCard = (label: string, value: string, sub = '') =>
    `<div class="stat"><div class="stat-l">${label}</div><div class="stat-v">${value}</div>${sub ? `<div class="stat-s">${sub}</div>` : ''}</div>`

  const insightRows = d.insights
    .map(
      (i) => `<li class="ins ins-${i.kind}"><span class="ins-icon">${i.icon}</span><div>
        <div class="ins-t">${esc(i.title)}</div><div class="ins-d">${esc(i.detail)}</div></div></li>`,
    )
    .join('')

  const catRows = d.categories
    .map((c) => {
      const mom = c.momPct === null ? '—' : `${c.momPct > 0 ? '↑' : '↓'}${Math.abs(Math.round(c.momPct * 100))}%`
      const merchants = c.topMerchants.slice(0, 3).map((m) => `${esc(m.name)} ¥${fmt0(m.total)}`).join(' · ')
      return `<tr>
        <td>${esc(c.name)}</td>
        <td class="r">¥${fmt(c.total)}</td>
        <td class="r">${pct(c.share)}</td>
        <td class="r">${c.count}</td>
        <td class="r">¥${fmt0(c.avg)}</td>
        <td class="r">${mom}</td>
        <td class="m">${merchants}</td>
      </tr>`
    })
    .join('')

  const payRows = d.payMethods
    .slice(0, 8)
    .map(
      (p) =>
        `<tr><td>${esc(p.name)}</td><td class="r">¥${fmt(p.total)}</td><td class="r">${p.count} 笔</td></tr>`,
    )
    .join('')

  const recurringRows = d.recurring
    .slice(0, 10)
    .map(
      (r) =>
        `<tr><td>${esc(r.counterparty)}</td><td>${esc(r.category)}</td><td class="r">¥${fmt(r.avgAmount)}</td><td class="r">${r.months.length} 个月</td></tr>`,
    )
    .join('')

  const miningBlock = (() => {
    const m = d.mining
    if (!m) return ''
    const subs = m.subscriptions.length > 0
      ? `<h2>🗡️ 扣费刺客（月均 ¥${fmt(m.subscriptionMonthlyTotal)}）</h2>
         <table><thead><tr><th>项目</th><th>分类</th><th class="r">月均</th><th class="r">连续月数</th><th class="r">最近扣费</th></tr></thead>
         <tbody>${m.subscriptions.slice(0, 10).map((s) => `<tr><td>${esc(s.name)}${s.autoRenew ? '（自动续费）' : ''}</td><td>${esc(s.category)}</td><td class="r">¥${fmt(s.monthlyAvg)}</td><td class="r">${s.months}</td><td class="r">${esc(s.lastDate)}</td></tr>`).join('')}</tbody></table>`
      : ''
    const lattes = m.lattes.length > 0
      ? `<h2>☕ 拿铁因子（高频小额累计 ¥${fmt(m.latteTotal)}）</h2>
         <table><thead><tr><th>商户</th><th class="r">次数</th><th class="r">单均</th><th class="r">合计</th></tr></thead>
         <tbody>${m.lattes.slice(0, 8).map((l) => `<tr><td>${esc(l.name)}</td><td class="r">${l.count}</td><td class="r">¥${fmt(l.avg)}</td><td class="r">¥${fmt(l.total)}</td></tr>`).join('')}</tbody></table>`
      : ''
    const emo = m.emotional
    const emoAny = emo.night.count + emo.monthStart.count + emo.monthEnd.count > 0
    const emoBlock = emoAny
      ? `<h2>🌙 情绪消费</h2>
         <div class="stats">
          ${statCard('深夜（23–6点）', emo.night.count > 0 ? `¥${fmt(emo.night.total)}` : '无', emo.night.count > 0 ? `${emo.night.count} 笔` : '')}
          ${statCard('月初（1–3号）', emo.monthStart.count > 0 ? `¥${fmt(emo.monthStart.total)}` : '无', emo.monthStart.count > 0 ? `${emo.monthStart.count} 笔` : '')}
          ${statCard('月底（25号后）', emo.monthEnd.count > 0 ? `¥${fmt(emo.monthEnd.total)}` : '无', emo.monthEnd.count > 0 ? `${emo.monthEnd.count} 笔` : '')}
         </div>`
      : ''
    const good = m.selfInvest.total > 0
      ? `<h2>🌱 被忽略的好消费</h2>
         <div class="stats">
          ${statCard('投资自己', `¥${fmt(m.selfInvest.total)}`, `${m.selfInvest.categories.join(' · ')} · ${m.selfInvest.count} 笔`)}
          ${m.thrifty.total > 0 ? statCard('省钱型自购', `¥${fmt(m.thrifty.total)}`, `超市/生鲜 ${m.thrifty.count} 笔`) : ''}
          ${m.takeawayTotal > 0 ? statCard('对照：外卖餐饮', `¥${fmt(m.takeawayTotal)}`) : ''}
         </div>`
      : ''
    return subs + lattes + emoBlock + good
  })()

  const personaBlock = d.persona    ? `<div class="persona">
        <div class="p-emoji">${d.persona.primary.emoji}</div>
        <div class="p-name">${esc(d.persona.primary.name)}型 · ${esc(d.persona.primary.epithet)}</div>
        ${d.persona.secondary && d.persona.mix ? `<div class="p-mix">${d.persona.mix[0]}% ${esc(d.persona.primary.name)} + ${d.persona.mix[1]}% ${esc(d.persona.secondary.name)} ${d.persona.secondary.emoji}</div>` : ''}
        <div class="p-copy">${esc(d.persona.statement)}</div>
      </div>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>账单分析报告 · ${esc(d.label)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif; color: #1a1a2e; background: #f5f6fa; line-height: 1.6; }
  .page { max-width: 860px; margin: 0 auto; padding: 40px 28px 60px; }
  .cover { background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; border-radius: 20px; padding: 34px 34px 30px; margin-bottom: 26px; }
  .cover .app { font-size: 13px; letter-spacing: 2px; opacity: .85; }
  .cover h1 { margin: 10px 0 6px; font-size: 28px; }
  .cover .meta { font-size: 13px; opacity: .85; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 12px; margin-bottom: 26px; }
  .stat { background: #fff; border-radius: 14px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(26,26,46,.06); }
  .stat-l { font-size: 12px; color: #8a8fa3; }
  .stat-v { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .stat-s { font-size: 12px; color: #8a8fa3; margin-top: 2px; }
  h2 { font-size: 17px; margin: 30px 0 12px; }
  ul.insights { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .ins { background: #fff; border-radius: 12px; padding: 12px 16px; display: flex; gap: 10px; box-shadow: 0 1px 3px rgba(26,26,46,.06); border-left: 3px solid #0ea5e9; }
  .ins-good { border-left-color: #10b981; } .ins-warn { border-left-color: #f59e0b; }
  .ins-icon { font-size: 18px; }
  .ins-t { font-weight: 700; font-size: 14px; }
  .ins-d { font-size: 12.5px; color: #6b7080; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(26,26,46,.06); font-size: 13px; }
  th, td { padding: 9px 12px; text-align: left; border-bottom: 1px solid #f0f1f5; }
  th { background: #fafafd; color: #8a8fa3; font-weight: 600; font-size: 12px; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; }
  td.m { color: #8a8fa3; font-size: 12px; }
  .persona { text-align: center; background: #fff; border-radius: 16px; padding: 26px; box-shadow: 0 1px 3px rgba(26,26,46,.06); }
  .p-emoji { font-size: 52px; }
  .p-name { font-size: 18px; font-weight: 700; margin-top: 6px; }
  .p-mix { font-size: 13px; color: #8a8fa3; margin-top: 2px; }
  .p-copy { font-size: 13.5px; color: #6b7080; margin-top: 8px; }
  footer { margin-top: 34px; text-align: center; font-size: 12px; color: #a0a5b8; }
  @media print {
    body { background: #fff; }
    .page { padding: 0; }
    .cover, .stat, .ins, table, .persona { box-shadow: none; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="cover">
    <div class="app">账单分析助手</div>
    <h1>${esc(d.label)} 收支分析报告</h1>
    <div class="meta">生成于 ${esc(d.generatedAt)} · 共 ${d.txnCount} 笔有效收支 · 本报告由本地浏览器生成，不含任何上传数据</div>
  </div>

  <div class="stats">
    ${statCard('收入', `¥${fmt(d.agg.income)}`)}
    ${statCard('支出', `¥${fmt(d.agg.expense)}`)}
    ${statCard('结余', `${net < 0 ? '-' : ''}¥${fmt(Math.abs(net))}`)}
    ${statCard('结余率', savingsRate === null ? '—' : pct(savingsRate), `夜间消费 ${d.agg.nightCount} 笔`)}
  </div>

  <h2>💡 洞察</h2>
  <ul class="insights">${insightRows || '<li class="ins"><div class="ins-d">本期数据不足以生成洞察</div></li>'}</ul>

  <h2>📊 花费分析 · 分类明细</h2>
  <table>
    <thead><tr><th>分类</th><th class="r">金额</th><th class="r">占比</th><th class="r">笔数</th><th class="r">单均</th><th class="r">环比</th><th>主要商户</th></tr></thead>
    <tbody>${catRows || '<tr><td colspan="7">无支出数据</td></tr>'}</tbody>
  </table>

  ${d.payMethods.length > 0 ? `<h2>💳 支付方式</h2>
  <table>
    <thead><tr><th>方式</th><th class="r">金额</th><th class="r">笔数</th></tr></thead>
    <tbody>${payRows}</tbody>
  </table>` : ''}

  ${d.recurring.length > 0 ? `<h2>🔁 固定支出（跨月识别）</h2>
  <table>
    <thead><tr><th>收款方</th><th>分类</th><th class="r">月均</th><th class="r">连续月数</th></tr></thead>
    <tbody>${recurringRows}</tbody>
  </table>` : ''}

  <h2>🐾 消费人格</h2>
  ${personaBlock || '<div class="persona"><div class="p-copy">数据不足，未生成消费人格</div></div>'}

  ${miningBlock}

  <footer>账单分析助手 · 数据全程本地处理 · 内部转账/还款已自动对冲，不计入收支</footer>
</div>
</body>
</html>`
}

export function downloadReport(data: ReportData): void {
  const html = buildReportHTML(data)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // 文件名禁止斜杠：日期取 ISO 形式
  a.download = `账单分析报告_${data.label}_${data.generatedAt.replace(/[/: ]/g, '-').slice(0, 16)}.html`
  a.click()
  URL.revokeObjectURL(url)
}

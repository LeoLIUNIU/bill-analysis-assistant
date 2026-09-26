import type { Lang } from '../i18n'
import type { MonthlyAggregate, Transaction } from './schema'
import { countsAsFlow } from './transfer'

/**
 * 洞察引擎：把流水与聚合数据翻译成人话（中/英双语模板）。
 * 每条洞察都有数据依据（detail 里带具体数字），宁可少说、不说错话。
 */

export type InsightGroup = 'scope' | 'conclusion' | 'anomaly' | 'structure' | 'habit' | 'detail'

export interface InsightItem {
  main: string
  sub: string
  amount: number
}

export interface Insight {
  id: string
  kind: 'good' | 'warn' | 'info'
  icon: string
  title: string
  detail: string
  /** 分组标签：scope（统计口径说明）/conclusion/anomaly/structure/habit/detail */
  group?: InsightGroup
  /** 排序权重，小者优先展示（未指定时按生成顺序） */
  priority?: number
  /** 可展开的明细清单（如跨渠道去重的对冲清单） */
  items?: InsightItem[]
}

const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
const pct = (n: number) => `${Math.round(n * 100)}%`

/** 双语文案表：每条洞察一个模板函数，返回 [title, detail] */
const T = {
  savings: {
    zh: (r: string, inc: string, exp: string, net: string): [string, string] => {
      if (Number(r.replace('%', '')) >= 30) return [`结余率 ${r}，存钱小能手`, `收入 ¥${inc} − 支出 ¥${exp} = ¥${net} 进了小金库，超过了大多数同龄人。`]
      if (Number(r.replace('%', '')) >= 10) return [`结余率 ${r}，稳中有余`, `收入 ¥${inc}，支出 ¥${exp}，结余 ¥${net}。想再上一个台阶，看看下面几条。`]
      return [`结余率 ${r}，贴地飞行`, `收入 ¥${inc}，支出 ¥${exp}。刚好收支平衡，建议给大头类目设个预算。`]
    },
    en: (r: string, inc: string, exp: string, net: string): [string, string] => {
      const v = Number(r.replace('%', ''))
      if (v >= 30) return [`Savings rate ${r} — a natural saver`, `Income ¥${inc} − expense ¥${exp} = ¥${net} saved. Ahead of most peers.`]
      if (v >= 10) return [`Savings rate ${r} — steady`, `Income ¥${inc}, expense ¥${exp}, saved ¥${net}. Check below for ways to improve.`]
      return [`Savings rate ${r} — break-even`, `Income ¥${inc}, expense ¥${exp}. You are breaking even — a budget for big categories may help.`]
    },
  },
  overspend: {
    zh: (all: boolean, e: string, i: string, gap: string): [string, string] => [
      all ? '统计期内支出超过了收入' : '本期支出超过了收入',
      `支出 ¥${e} > 收入 ¥${i}，缺口 ¥${gap}。若是大件或集中缴费属正常，否则值得看看钱花哪了。`,
    ],
    en: (all: boolean, e: string, i: string, gap: string): [string, string] => [
      all ? 'Expenses exceeded income over this period' : 'Expenses exceeded income this month',
      `Expense ¥${e} > income ¥${i}, a gap of ¥${gap}. Normal for big purchases or bundled bills — otherwise worth a look.`,
    ],
  },
  noIncome: {
    zh: (): [string, string] => ['没有检测到收入流水', '本期只统计到支出。工资若走银行卡，等银行账单解析上线后可补全收支对比。'],
    en: (): [string, string] => ['No income detected', 'Only expenses were counted in this scope. Bank statement parsing will complete the picture.'],
  },
  mom: {
    zh: (dir: string, d: string, pe: string, ce: string, big: boolean): [string, string] => [
      `支出环比${dir} ${d}`,
      `上月 ¥${pe} → 本期 ¥${ce}，${big ? '变化有点猛' : '波动在正常范围'}。`,
    ],
    en: (dir: string, d: string, pe: string, ce: string, big: boolean): [string, string] => [
      `Expenses ${dir === '涨' ? 'up' : 'down'} ${d} MoM`,
      `Last month ¥${pe} → this period ¥${ce} — ${big ? 'quite a swing' : 'within a normal range'}.`,
    ],
  },
  topCat: {
    zh: (share: string, name: string, total: string): [string, string] => [`${share} 的钱花在了「${name}」`, `共 ¥${total}，是本期最大的支出类目。`],
    en: (share: string, name: string, total: string): [string, string] => [`${share} of spending went to “${name}”`, `¥${total} in total — your biggest category this period.`],
  },
  dining: {
    zh: (share: string, total: string, over: boolean, prevShare?: string): [string, string] => [
      over ? `吃饭占 ${share}${prevShare ?? ''}` : `吃饭占 ${share}${prevShare ?? ''}`,
      over ? `餐饮 ¥${total}，超过总支出的三分之一——干饭人的快乐，也是最容易省钱的地方。` : `餐饮 ¥${total}，结构健康，没有干饭过度。`,
    ],
    en: (share: string, total: string, over: boolean, prevShare?: string): [string, string] => [
      `Food is ${share} of spending${prevShare ?? ''}`,
      over ? `Dining ¥${total} is over a third of total spending — the easiest place to save.` : `Dining ¥${total} — a healthy structure, no over-ordering.`,
    ],
  },
  fixed: {
    zh: (share: string, total: string, flex: string): [string, string] => [`住与通讯等刚性支出占 ${share}`, `¥${total} 是雷打不动的部分；剩下 ¥${flex} 才是弹性空间。`],
    en: (share: string, total: string, flex: string): [string, string] => [`Fixed costs (housing/comms) are ${share}`, `¥${total} is locked in; ¥${flex} is your flexible space.`],
  },
  night: {
    zh: (n: number, ratio: string, over: boolean): [string, string] => [
      `${n} 笔深夜消费（23:00–6:00）`,
      over ? `占支出笔数的 ${ratio}。深夜下单的快乐是即时的，账单是永恒的。` : `占支出笔数的 ${ratio}，夜猫子指数可控。`,
    ],
    en: (n: number, ratio: string, over: boolean): [string, string] => [
      `${n} late-night purchases (23:00–6:00)`,
      over ? `${ratio} of expense rows. Late-night joy is instant; the bill is forever.` : `${ratio} of expense rows — night-owl level under control.`,
    ],
  },
  styleSmall: {
    zh: (mid: string, mean: string): [string, string] => ['高频小额型选手', `单笔中位数仅 ¥${mid}，远低于平均值 ¥${mean}——钱是在一杯杯奶茶、一单单外卖里溜走的，聚沙成塔。`],
    en: (mid: string, mean: string): [string, string] => ['Small & frequent spender', `Median ticket ¥${mid} is well below the ¥${mean} average — money slips away one coffee, one delivery at a time.`],
  },
  styleBig: {
    zh: (mid: string, mean: string): [string, string] => ['低频大额型选手', `单笔中位数 ¥${mid}，明显高于平均值 ¥${mean}——你不常花钱，一花就是大事。`],
    en: (mid: string, mean: string): [string, string] => ['Big & rare spender', `Median ticket ¥${mid} is well above the ¥${mean} average — you rarely spend, but when you do, it is big.`],
  },
  weekendSpend: {
    zh: (w: string, d: string): [string, string] => ['周末才是主战场', `周末日均 ¥${w}，是工作日（¥${d}）的 1.5 倍以上——快乐充值主要发生在周末。`],
    en: (w: string, d: string): [string, string] => ['Weekends are the main stage', `Weekend daily ¥${w} is over 1.5× the weekday ¥${d} — the fun budget lives on weekends.`],
  },
  weekdaySpend: {
    zh: (d: string, w: string): [string, string] => ['工作日花得更多', `工作日日均 ¥${d}，高于周末的 ¥${w}——通勤、工作餐是主力，周末反而宅得省钱。`],
    en: (d: string, w: string): [string, string] => ['Weekdays cost more', `Weekday daily ¥${d} beats the weekend ¥${w} — commutes and work lunches dominate.`],
  },
  biggest: {
    zh: (amount: string, share: string, who: string, date: string): [string, string] => [`最大一笔 ¥${amount}，占总支出 ${share}`, `${who}（${date}）——一笔就定了本期的基调。`],
    en: (amount: string, share: string, who: string, date: string): [string, string] => [`Largest single: ¥${amount}, ${share} of spending`, `${who} (${date}) — one transaction set the tone.`],
  },
  social: {
    zh: (total: string, share: string): [string, string] => [`人情往来 ¥${total}`, `占支出 ${share}。红包与礼物是社交货币，记得也给自己留一点。`],
    en: (total: string, share: string): [string, string] => [`Gifts & transfers ¥${total}`, `${share} of spending. Red packets are social currency — keep some for yourself too.`],
  },
  refund: {
    zh: (total: string): [string, string] => [`成功追回退款 ¥${total}`, '这些已自动从支出里冲减，不用手动处理。'],
    en: (total: string): [string, string] => [`Refunds recovered ¥${total}`, 'Automatically netted out of expenses — nothing to do.'],
  },
  dedup: {
    zh: (n: number, total: string): [string, string] => [`${n} 笔跨渠道重复已对冲（¥${total}）`, '这些消费同时出现在银行流水和微信/支付宝账单里，分析时只保留了信息更全的App侧记录，避免重复计算。'],
    en: (n: number, total: string): [string, string] => [`${n} cross-channel duplicates excluded (¥${total})`, 'These purchases appeared in both bank and WeChat/Alipay bills — only the richer app-side record is counted.'],
  },
}

export function generateInsights(
  txs: Transaction[],
  agg: MonthlyAggregate,
  prev?: MonthlyAggregate,
  label = '本期',
  lang: Lang = 'zh',
): Insight[] {
  const appSideLabel = lang === 'en' ? 'matches app-side' : '对应App侧'
  const flows = txs.filter(countsAsFlow)
  const outs = flows.filter((t) => t.direction === 'out')
  if (outs.length === 0) return []

  const key = lang as 'zh' | 'en'
  const ZH = lang === 'zh'
  const { income, expense } = agg
  const out: Insight[] = []

  // —— 1. 结余率总评 ——
  if (income > 0) {
    const rate = (income - expense) / income
    let title: string, detail: string, kind: 'good' | 'warn' | 'info'
    if (rate < 0) {
      const [t, d] = T.overspend[key](label === '全部' || label === 'All', fmt(expense), fmt(income), fmt(expense - income))
      title = t; detail = d; kind = 'warn'
    } else {
      const [t, d] = T.savings[key](pct(rate), fmt(income), fmt(expense), fmt(income - expense))
      title = t; detail = d; kind = rate >= 0.3 ? 'good' : 'info'
    }
    out.push({ id: 'savings', kind, icon: '🐿️', title, detail })
  } else {
    const [title, detail] = T.noIncome[key]()
    out.push({ id: 'no-income', kind: 'info', icon: '💵', title, detail })
  }

  // —— 2. 总支出环比 ——
  if (prev && prev.expense > 0) {
    const d = (expense - prev.expense) / prev.expense
    const big = Math.abs(d) >= 0.2
    const [title, detail] = T.mom[key](d > 0 ? '涨' : '降', pct(Math.abs(d)), fmt(prev.expense), fmt(expense), big)
    out.push({ id: 'mom', kind: big ? (d > 0 ? 'warn' : 'good') : 'info', icon: d > 0 ? '📈' : '📉', title, detail })
  }

  // —— 2.5 跨渠道去重（提前说，避免被条数上限截断；这是统计口径的一部分） ——
  const deduped = txs.filter(
    (t) => t.pairId && t.transferFlag === 'internal' && t.direction === 'out' && t.platform !== 'wechat' && t.platform !== 'alipay',
  )
  if (deduped.length > 0) {
    const dedupSum = deduped.reduce((s, t) => s + t.amount, 0)
    const [title, detail] = T.dedup[key](deduped.length, fmt(dedupSum))
    const items = deduped.slice(0, 8).map((t) => {
      const app = txs.find((x) => x.id === t.pairId)
      return {
        main: `${t.time.slice(5, 10)} ${(t.counterparty || t.item || '未知').slice(0, 14)}`,
        sub: app ? `${appSideLabel}：${(app.counterparty || app.item || '').slice(0, 14)}` : 'App side',
        amount: t.amount,
      }
    })
    out.push({ id: 'dedup', kind: 'good', icon: '🔀', title, detail, items })
  }

  // —— 3. 最大支出类目 ——
  const cats = Object.entries(agg.byCategory).sort((a, b) => b[1] - a[1])
  if (cats.length > 0 && expense > 0) {
    const [name, v] = cats[0]
    const share = v / expense
    out.push({
      id: 'top-cat',
      kind: share > 0.5 && name !== '住房水电' ? 'warn' : 'info',
      icon: '🎯',
      title: ZH ? `${pct(share)} 的钱花在了「${name}」` : `${pct(share)} of spending went to “${name}”`,
      detail: ZH ? `共 ¥${fmt(v)}，是${label === '全部' ? '统计期内' : '本期'}最大的支出类目。` : `¥${fmt(v)} in total — your biggest category.`,
    })
  }

  // —— 4. 餐饮结构 ——
  const dining = agg.byCategory['餐饮美食'] ?? 0
  if (dining > 0 && expense > 0) {
    const share = dining / expense
    const prevDining = prev?.byCategory?.['餐饮美食']
    const prevShare = prevDining !== undefined && prev && prev.expense > 0 ? `（${ZH ? '上月' : 'last month'} ${pct(prevDining / prev.expense)}）` : undefined
    const [title, detail] = T.dining[key](pct(share), fmt(dining), share > 0.35, prevShare)
    out.push({ id: 'dining', kind: share > 0.35 ? 'warn' : 'info', icon: '🍜', title, detail })
  }

  // —— 5. 刚性支出 ——
  const fixed = (agg.byCategory['住房水电'] ?? 0) + (agg.byCategory['通讯网络'] ?? 0)
  if (fixed > 0 && expense > 0) {
    const [title, detail] = T.fixed[key](pct(fixed / expense), fmt(fixed), fmt(expense - fixed))
    out.push({ id: 'fixed', kind: 'info', icon: '🏠', title, detail })
  }

  // —— 6. 夜间消费（银行无时间行不参与） ——
  const nightRows = outs.filter((t) => {
    if (!hasRealTime(t)) return false
    const h = Number.parseInt(t.time.slice(11, 13), 10)
    return h >= 23 || h < 6
  })
  if (nightRows.length > 0) {
    const ratio = nightRows.length / outs.length
    const [title, detail] = T.night[key](nightRows.length, pct(ratio), ratio > 0.2)
    out.push({ id: 'night', kind: ratio > 0.2 ? 'warn' : 'info', icon: '🦉', title, detail })
  }

  // —— 7. 花钱风格：中位数 vs 均值 ——
  if (outs.length >= 6) {
    const amounts = outs.map((t) => t.amount).sort((a, b) => a - b)
    const mid = amounts[Math.floor(amounts.length / 2)]
    const mean = expense / outs.length
    if (mid <= mean * 0.5 && mid < 100) {
      const [title, detail] = T.styleSmall[key](fmt(mid), fmt(mean))
      out.push({ id: 'style', kind: 'info', icon: '🐝', title, detail })
    } else if (mid >= mean * 1.5 && mid >= 200) {
      const [title, detail] = T.styleBig[key](fmt(mid), fmt(mean))
      out.push({ id: 'style', kind: 'info', icon: '🦔', title, detail })
    }
  }

  // —— 8. 周末 vs 工作日 ——
  const weekend = { sum: 0, days: new Set<string>() }
  const weekday = { sum: 0, days: new Set<string>() }
  for (const t of outs) {
    const d = new Date(t.time.replace(' ', 'T')).getDay()
    const day = t.time.slice(0, 10)
    if (d === 0 || d === 6) {
      weekend.sum += t.amount
      weekend.days.add(day)
    } else {
      weekday.sum += t.amount
      weekday.days.add(day)
    }
  }
  const wAvg = weekend.days.size > 0 ? weekend.sum / weekend.days.size : 0
  const dAvg = weekday.days.size > 0 ? weekday.sum / weekday.days.size : 0
  if (wAvg > 0 && dAvg > 0 && wAvg / dAvg >= 1.5) {
    const [title, detail] = T.weekendSpend[key](fmt(wAvg), fmt(dAvg))
    out.push({ id: 'weekend', kind: 'info', icon: '🎉', title, detail })
  } else if (dAvg > 0 && wAvg > 0 && dAvg / wAvg >= 1.5) {
    const [title, detail] = T.weekdaySpend[key](fmt(dAvg), fmt(wAvg))
    out.push({ id: 'weekend', kind: 'info', icon: '💼', title, detail })
  }

  // —— 9. 最大单笔 ——
  const biggest = outs.reduce((a, b) => (b.amount > a.amount ? b : a))
  if (biggest.amount / expense > 0.15) {
    const [title, detail] = T.biggest[key](
      fmt(biggest.amount), pct(biggest.amount / expense),
      ZH ? `${biggest.counterparty || biggest.item}（${biggest.time.slice(5, 10)}）` : `${biggest.counterparty || biggest.item} (${biggest.time.slice(5, 10)})`,
      '',
    )
    out.push({ id: 'biggest', kind: 'info', icon: '🐋', title, detail })
  }

  // —— 10. 人情往来 ——
  const social = agg.byCategory['人情往来'] ?? 0
  if (social > 0 && expense > 0) {
    const [title, detail] = T.social[key](fmt(social), pct(social / expense))
    out.push({ id: 'social', kind: 'info', icon: '🧧', title, detail })
  }

  // —— 11. 退款追回 ——
  const refundTotal = flows
    .filter((t) => t.transferFlag === 'refund' && t.direction === 'in')
    .reduce((s, t) => s + t.amount, 0)
  if (refundTotal > 0) {
    const [title, detail] = T.refund[key](fmt(refundTotal))
    out.push({ id: 'refund', kind: 'good', icon: '↩️', title, detail })
  }

  // —— 分组与优先级（口径1 → 结论2 → 异常/结构3 → 习惯/明细5+） ——
  const META: Record<string, { group: InsightGroup; priority: number }> = {
    dedup: { group: 'scope', priority: 1 },
    refund: { group: 'scope', priority: 1 },
    savings: { group: 'conclusion', priority: 2 },
    'no-income': { group: 'conclusion', priority: 2 },
    mom: { group: 'conclusion', priority: 2 },
    'top-cat': { group: 'structure', priority: 3 },
    dining: { group: 'structure', priority: 3 },
    fixed: { group: 'structure', priority: 3 },
    night: { group: 'habit', priority: 5 },
    weekend: { group: 'habit', priority: 5 },
    style: { group: 'habit', priority: 5 },
    biggest: { group: 'detail', priority: 5 },
    social: { group: 'detail', priority: 6 },
  }
  for (const ins of out) {
    const meta = META[ins.id]
    if (meta) {
      ins.group = meta.group
      ins.priority = meta.priority
    }
  }
  out.sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))

  return out.slice(0, 8)
}

import { hasRealTime } from './schema'

/** 周一→周日 的支出合计（用于周内规律图） */
export function weekdaySums(txs: Transaction[]): number[] {
  const sums = new Array<number>(7).fill(0)
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const d = new Date(t.time.replace(' ', 'T')).getDay() // 0=周日
    sums[(d + 6) % 7] += t.amount
  }
  return sums.map((v) => Math.round(v * 100) / 100)
}

export const WEEKDAY_LABELS = {
  zh: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const

/** 单笔金额分布：<50 小额 / 50–500 中额 / ≥500 大额 */
export function amountBuckets(txs: Transaction[]): Array<{ name: string; count: number; sum: number }> {
  const buckets = [
    { name: '小额（<¥50）', nameEn: 'Small (<¥50)', count: 0, sum: 0 },
    { name: '中额（¥50–500）', nameEn: 'Mid (¥50–500)', count: 0, sum: 0 },
    { name: '大额（≥¥500）', nameEn: 'Large (≥¥500)', count: 0, sum: 0 },
  ]
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const i = t.amount < 50 ? 0 : t.amount < 500 ? 1 : 2
    buckets[i].count++
    buckets[i].sum += t.amount
  }
  return buckets.map((b) => ({ ...b, sum: Math.round(b.sum * 100) / 100 }))
}

/** 分类环比行（按本期金额降序） */
export interface CategoryRow {
  name: string
  current: number
  previous?: number
  diffPct: number | null
}

export function categoryRows(agg: MonthlyAggregate, prev?: MonthlyAggregate): CategoryRow[] {
  return Object.entries(agg.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([name, current]) => {
      const previous = prev?.byCategory?.[name]
      const diffPct =
        previous !== undefined && previous > 0 ? (current - previous) / previous : null
      return { name, current, previous, diffPct }
    })
}

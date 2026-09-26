import type { MonthlyAggregate, Transaction } from './schema'
import { countsAsFlow } from './transfer'

/**
 * 洞察引擎：把流水与聚合数据翻译成人话。
 * 每条洞察都有数据依据（detail 里带具体数字），宁可少说、不说错话。
 */

export type InsightGroup = '口径' | '结论' | '异常' | '结构' | '习惯' | '明细'

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
  /** 分组标签：口径（统计口径说明）/结论/异常/结构/习惯/明细 */
  group?: InsightGroup
  /** 排序权重，小者优先展示（未指定时按生成顺序） */
  priority?: number
  /** 可展开的明细清单（如跨渠道去重的对冲清单） */
  items?: InsightItem[]
}

const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
const pct = (n: number) => `${Math.round(n * 100)}%`

export function generateInsights(
  txs: Transaction[],
  agg: MonthlyAggregate,
  prev?: MonthlyAggregate,
  label = '本期',
): Insight[] {
  const flows = txs.filter(countsAsFlow)
  const outs = flows.filter((t) => t.direction === 'out')
  if (outs.length === 0) return []

  const { income, expense } = agg
  const out: Insight[] = []

  // —— 1. 结余率总评 ——
  if (income > 0) {
    const rate = (income - expense) / income
    if (rate >= 0.3) {
      out.push({
        id: 'savings', kind: 'good', icon: '🐿️',
        title: `结余率 ${pct(rate)}，存钱小能手`,
        detail: `收入 ¥${fmt(income)} − 支出 ¥${fmt(expense)} = ¥${fmt(income - expense)} 进了小金库，超过了大多数同龄人。`,
      })
    } else if (rate >= 0.1) {
      out.push({
        id: 'savings', kind: 'good', icon: '🐿️',
        title: `结余率 ${pct(rate)}，稳中有余`,
        detail: `收入 ¥${fmt(income)}，支出 ¥${fmt(expense)}，结余 ¥${fmt(income - expense)}。想再上一个台阶，看看下面几条。`,
      })
    } else if (rate >= 0) {
      out.push({
        id: 'savings', kind: 'info', icon: '🐿️',
        title: `结余率 ${pct(rate)}，贴地飞行`,
        detail: `收入 ¥${fmt(income)}，支出 ¥${fmt(expense)}。刚好收支平衡，建议给大头类目设个预算。`,
      })
    } else {
      out.push({
        id: 'savings', kind: 'warn', icon: '🫠',
        title: label === '全部' ? '统计期内支出超过了收入' : '本期支出超过了收入',
        detail: `支出 ¥${fmt(expense)} > 收入 ¥${fmt(income)}，缺口 ¥${fmt(expense - income)}。若是大件或集中缴费属正常，否则值得看看钱花哪了。`,
      })
    }
  } else {
    out.push({
      id: 'no-income', kind: 'info', icon: '💵',
      title: '没有检测到收入流水',
      detail: '本期只统计到支出。工资若走银行卡，等银行账单解析上线后可补全收支对比。',
    })
  }

  // —— 2. 总支出环比 ——
  if (prev && prev.expense > 0) {
    const d = (expense - prev.expense) / prev.expense
    const big = Math.abs(d) >= 0.2
    out.push({
      id: 'mom',
      kind: big ? (d > 0 ? 'warn' : 'good') : 'info',
      icon: d > 0 ? '📈' : '📉',
      title: `支出环比${d > 0 ? '涨' : '降'} ${pct(Math.abs(d))}`,
      detail: `上月 ¥${fmt(prev.expense)} → ${label} ¥${fmt(expense)}，${big ? '变化有点猛' : '波动在正常范围'}。`,
    })
  }

  // —— 2.5 跨渠道去重（提前说，避免被条数上限截断；这是统计口径的一部分） ——
  const deduped = txs.filter(
    (t) => t.pairId && t.transferFlag === 'internal' && t.direction === 'out' && t.platform !== 'wechat' && t.platform !== 'alipay',
  )
  if (deduped.length > 0) {
    const dedupSum = deduped.reduce((s, t) => s + t.amount, 0)
    const items = deduped.slice(0, 8).map((t) => {
      const app = txs.find((x) => x.id === t.pairId)
      return {
        main: `${t.time.slice(5, 10)} ${(t.counterparty || t.item || '未知').slice(0, 14)}`,
        sub: app ? `对应App侧：${(app.counterparty || app.item || '').slice(0, 14)}` : '对应App侧消费记录',
        amount: t.amount,
      }
    })
    out.push({
      id: 'dedup', kind: 'good', icon: '🔀',
      title: `${deduped.length} 笔跨渠道重复已对冲（¥${fmt(dedupSum)}）`,
      detail: '这些消费同时出现在银行流水和微信/支付宝账单里，分析时只保留了信息更全的App侧记录，避免重复计算。',
      items,
    })
  }

  // —— 3. 最大支出类目 ——
  const cats = Object.entries(agg.byCategory).sort((a, b) => b[1] - a[1])
  if (cats.length > 0 && expense > 0) {
    const [name, v] = cats[0]
    const share = v / expense
    const prevV = prev?.byCategory?.[name]
    const trend = prevV !== undefined && prevV > 0 ? `，${v > prevV ? '比上月多花' : '比上月省下'} ¥${fmt(Math.abs(v - prevV))}` : ''
    out.push({
      id: 'top-cat',
      kind: share > 0.5 && name !== '住房水电' ? 'warn' : 'info',
      icon: '🎯',
      title: `${pct(share)} 的钱花在了「${name}」`,
      detail: `共 ¥${fmt(v)}，是${label}最大的支出类目${trend}。`,
    })
  }

  // —— 4. 餐饮结构 ——
  const dining = agg.byCategory['餐饮美食'] ?? 0
  if (dining > 0 && expense > 0) {
    const share = dining / expense
    const prevDining = prev?.byCategory?.['餐饮美食']
    const trend = prevDining !== undefined && prevDining > 0
      ? `（上月 ${pct(prevDining / prev!.expense)}）`
      : ''
    out.push({
      id: 'dining',
      kind: share > 0.35 ? 'warn' : 'info',
      icon: '🍜',
      title: `吃饭占 ${pct(share)}${trend}`,
      detail: share > 0.35
        ? `餐饮 ¥${fmt(dining)}，超过总支出的三分之一——干饭人的快乐，也是最容易省钱的地方。`
        : `餐饮 ¥${fmt(dining)}，结构健康，没有干饭过度。`,
    })
  }

  // —— 5. 刚性支出 ——
  const fixed = (agg.byCategory['住房水电'] ?? 0) + (agg.byCategory['通讯网络'] ?? 0)
  if (fixed > 0 && expense > 0) {
    const share = fixed / expense
    out.push({
      id: 'fixed',
      kind: 'info',
      icon: '🏠',
      title: `住与通讯等刚性支出占 ${pct(share)}`,
      detail: `¥${fmt(fixed)} 是雷打不动的部分；剩下 ¥${fmt(expense - fixed)} 才是弹性空间。`,
    })
  }

  // —— 6. 夜间消费 ——
  if (agg.nightCount > 0) {
    const ratio = agg.nightCount / outs.length
    out.push({
      id: 'night',
      kind: ratio > 0.2 ? 'warn' : 'info',
      icon: '🦉',
      title: `${agg.nightCount} 笔深夜消费（23:00–6:00）`,
      detail: ratio > 0.2
        ? `占支出笔数的 ${pct(ratio)}。深夜下单的快乐是即时的，账单是永恒的。`
        : `占支出笔数的 ${pct(ratio)}，夜猫子指数可控。`,
    })
  }

  // —— 7. 花钱风格：中位数 vs 均值 ——
  if (outs.length >= 6) {
    const amounts = outs.map((t) => t.amount).sort((a, b) => a - b)
    const mid = amounts[Math.floor(amounts.length / 2)]
    const mean = expense / outs.length
    if (mid <= mean * 0.5 && mid < 100) {
      out.push({
        id: 'style', kind: 'info', icon: '🐝',
        title: '高频小额型选手',
        detail: `单笔中位数仅 ¥${fmt(mid)}，远低于平均值 ¥${fmt(mean)}——钱是在一杯杯奶茶、一单单外卖里溜走的，聚沙成塔。`,
      })
    } else if (mid >= mean * 1.5 && mid >= 200) {
      out.push({
        id: 'style', kind: 'info', icon: '🦔',
        title: '低频大额型选手',
        detail: `单笔中位数 ¥${fmt(mid)}，明显高于平均值 ¥${fmt(mean)}——你不常花钱，一花就是大事。`,
      })
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
    out.push({
      id: 'weekend', kind: 'info', icon: '🎉',
      title: '周末才是主战场',
      detail: `周末日均 ¥${fmt(wAvg)}，是工作日（¥${fmt(dAvg)}）的 ${wAvg / dAvg >= 2 ? '2 倍以上' : '1.5 倍以上'}——快乐充值主要发生在周末。`,
    })
  } else if (dAvg > 0 && wAvg > 0 && dAvg / wAvg >= 1.5) {
    out.push({
      id: 'weekend', kind: 'info', icon: '💼',
      title: '工作日花得更多',
      detail: `工作日日均 ¥${fmt(dAvg)}，高于周末的 ¥${fmt(wAvg)}——通勤、工作餐是主力，周末反而宅得省钱。`,
    })
  }

  // —— 9. 最大单笔 ——
  const biggest = outs.reduce((a, b) => (b.amount > a.amount ? b : a))
  if (biggest.amount / expense > 0.15) {
    out.push({
      id: 'biggest', kind: 'info', icon: '🐋',
      title: `最大一笔 ¥${fmt(biggest.amount)}，占总支出 ${pct(biggest.amount / expense)}`,
      detail: `${biggest.counterparty || biggest.item}（${biggest.time.slice(5, 10)}）——一笔就定了本期的基调。`,
    })
  }

  // —— 10. 人情往来 ——
  const social = agg.byCategory['人情往来'] ?? 0
  if (social > 0 && expense > 0) {
    out.push({
      id: 'social', kind: 'info', icon: '🧧',
      title: `人情往来 ¥${fmt(social)}`,
      detail: `占支出 ${pct(social / expense)}。红包与礼物是社交货币，记得也给自己留一点。`,
    })
  }

  // —— 11. 退款追回 ——
  const refundTotal = flows
    .filter((t) => t.transferFlag === 'refund' && t.direction === 'in')
    .reduce((s, t) => s + t.amount, 0)
  if (refundTotal > 0) {
    out.push({
      id: 'refund', kind: 'good', icon: '↩️',
      title: `成功追回退款 ¥${fmt(refundTotal)}`,
      detail: '这些已自动从支出里冲减，不用手动处理。',
    })
  }

  // 分组与优先级：口径(1) → 结论(2) → 异常/结构(3) → 习惯/明细(5+)
  const META: Record<string, { group: InsightGroup; priority: number }> = {
    dedup: { group: '口径', priority: 1 },
    refund: { group: '口径', priority: 1 },
    savings: { group: '结论', priority: 2 },
    'no-income': { group: '结论', priority: 2 },
    mom: { group: '结论', priority: 2 },
    'top-cat': { group: '结构', priority: 3 },
    dining: { group: '结构', priority: 3 },
    fixed: { group: '结构', priority: 3 },
    night: { group: '习惯', priority: 5 },
    weekend: { group: '习惯', priority: 5 },
    style: { group: '习惯', priority: 5 },
    biggest: { group: '明细', priority: 5 },
    social: { group: '明细', priority: 6 },
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

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 单笔金额分布：<50 小额 / 50–500 中额 / ≥500 大额 */
export function amountBuckets(txs: Transaction[]): Array<{ name: string; count: number; sum: number }> {
  const buckets = [
    { name: '小额（<¥50）', count: 0, sum: 0 },
    { name: '中额（¥50–500）', count: 0, sum: 0 },
    { name: '大额（≥¥500）', count: 0, sum: 0 },
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

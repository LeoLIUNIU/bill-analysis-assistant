import type { MonthlyAggregate, Transaction } from './schema'
import { countsAsFlow } from './transfer'

/**
 * 深度分析引擎：分类深析、支付方式、固定支出识别、收入构成。
 * 全部为纯函数，输入处理后的流水，输出可渲染的分析结构。
 */

const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
const pct = (n: number) => `${Math.round(n * 100)}%`

/** 单个分类的深度分析 */
export interface CategoryDetail {
  name: string
  total: number
  count: number
  avg: number
  maxTx: Transaction | null
  /** 该分类下的头部商户（按金额降序） */
  topMerchants: Array<{ name: string; total: number; count: number }>
  /** 占总支出的比例 */
  share: number
  /** 环比（上月同分类） */
  momPct: number | null
  /** 数据活跃月份数 */
  monthsActive: number
  /** 一句话解读（有数据依据才生成） */
  insight: string | null
}

export function categoryDetails(
  txs: Transaction[],
  totalExpense: number,
  prev?: MonthlyAggregate,
): CategoryDetail[] {
  const byCat = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const list = byCat.get(t.category) ?? []
    list.push(t)
    byCat.set(t.category, list)
  }

  const details: CategoryDetail[] = []
  for (const [name, list] of byCat) {
    const total = list.reduce((s, t) => s + t.amount, 0)
    const count = list.length
    const avg = total / count
    const maxTx = list.reduce((a, b) => (b.amount > a.amount ? b : a))

    const byMerchant = new Map<string, { total: number; count: number }>()
    for (const t of list) {
      const key = t.counterparty || t.item || '未知商户'
      const m = byMerchant.get(key) ?? { total: 0, count: 0 }
      m.total += t.amount
      m.count++
      byMerchant.set(key, m)
    }
    const topMerchants = [...byMerchant.entries()]
      .map(([merchant, v]) => ({ name: merchant, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    const prevTotal = prev?.byCategory?.[name]
    const momPct = prevTotal !== undefined && prevTotal > 0 ? (total - prevTotal) / prevTotal : null
    const monthsActive = new Set(list.map((t) => t.month)).size

    let insight: string | null = null
    if (momPct !== null && Math.abs(momPct) >= 0.3) {
      insight = `环比${momPct > 0 ? '多花' : '省下'} ¥${fmt(Math.abs(total - prevTotal!))}（${pct(Math.abs(momPct))}）`
    }
    if (!insight && topMerchants.length > 0 && topMerchants[0].total / total > 0.45 && count >= 3) {
      insight = `高度集中在「${topMerchants[0].name}」，占该分类 ${pct(topMerchants[0].total / total)}`
    }
    if (!insight && count >= 15 && avg < 40) {
      insight = `高频小额消费：${count} 笔、单笔均 ¥${fmt(avg)}，积少成多`
    }
    if (!insight && count === 1 && total > 0) {
      insight = `本期仅 1 笔 · ${maxTx.time.slice(5, 10)} ${maxTx.counterparty || maxTx.item}`
    }

    details.push({
      name,
      total: Math.round(total * 100) / 100,
      count,
      avg: Math.round(avg * 100) / 100,
      maxTx,
      topMerchants: topMerchants.map((m) => ({ ...m, total: Math.round(m.total * 100) / 100 })),
      share: totalExpense > 0 ? total / totalExpense : 0,
      momPct,
      monthsActive,
      insight,
    })
  }
  return details.sort((a, b) => b.total - a.total)
}

/** 支付方式/收入构成行 */
export interface BreakdownRow {
  name: string
  total: number
  count: number
}

/** 支付方式分析（仅支出） */
export function payMethodBreakdown(txs: Transaction[]): BreakdownRow[] {
  const by = new Map<string, { total: number; count: number }>()
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const key = t.payMethod || '未标注'
    const m = by.get(key) ?? { total: 0, count: 0 }
    m.total += t.amount
    m.count++
    by.set(key, m)
  }
  return [...by.entries()]
    .map(([name, v]) => ({ name, ...v, total: Math.round(v.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
}

/** 收入构成分析 */
export function incomeBreakdown(txs: Transaction[]): BreakdownRow[] {
  const by = new Map<string, { total: number; count: number }>()
  for (const t of txs) {
    if (t.direction !== 'in' || !countsAsFlow(t)) continue
    const m = by.get(t.category) ?? { total: 0, count: 0 }
    m.total += t.amount
    m.count++
    by.set(t.category, m)
  }
  return [...by.entries()]
    .map(([name, v]) => ({ name, ...v, total: Math.round(v.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
}

/**
 * 固定支出识别：同一收款方在 ≥2 个不同月份出现、金额相近（±15%）→ 判定为周期性支出。
 * 典型如房租、订阅、会员；帮用户算出"每月雷打不动要花多少"。
 */
export interface RecurringExpense {
  counterparty: string
  category: string
  months: string[]
  avgAmount: number
  lastAmount: number
}

export function recurringExpenses(txs: Transaction[], minAmount = 30): RecurringExpense[] {
  const byParty = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const key = (t.counterparty || t.item || '').trim()
    if (!key || key === '/') continue
    const list = byParty.get(key) ?? []
    list.push(t)
    byParty.set(key, list)
  }

  const out: RecurringExpense[] = []
  for (const [party, list] of byParty) {
    const months = [...new Set(list.map((t) => t.month))].sort()
    if (months.length < 2) continue
    // 每月最多取最大一笔，避免高频商户（外卖）被误判为固定支出
    const perMonth = months.map((m) => {
      const txsOfMonth = list.filter((t) => t.month === m)
      return txsOfMonth.reduce((a, b) => (b.amount > a.amount ? b : a))
    })
    const amounts = perMonth.map((t) => t.amount)
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    // 金额波动需在 ±15% 内，且单笔不能太小（按调用方门槛过滤）
    if (max === 0 || min / max < 0.85 || min < minAmount) continue
    if (list.length / months.length > 2) continue

    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length
    out.push({
      counterparty: party,
      category: perMonth[perMonth.length - 1].category,
      months,
      avgAmount: Math.round(avg * 100) / 100,
      lastAmount: amounts[amounts.length - 1],
    })
  }
  return out.sort((a, b) => b.avgAmount - a.avgAmount)
}

/* ================= 深度挖掘：账单背后容易被忽视的地方 ================= */

/** 扣费刺客：月均 ≤100 的周期性扣费（订阅/会员/自动续费），单笔不起眼、全年累加可观 */
export interface SubscriptionAssassin {
  name: string
  category: string
  monthlyAvg: number
  months: number
  lastDate: string
  /** 命中自动续费类关键词 */
  autoRenew: boolean
}

/** 拿铁因子：单次小、频率高、加起来多的消费（同一商户） */
export interface LatteFactor {
  name: string
  count: number
  total: number
  avg: number
  category: string
}

export interface WindowStat {
  total: number
  count: number
  examples: Array<{ name: string; amount: number; date: string }>
}

export interface DeepMining {
  subscriptions: SubscriptionAssassin[]
  subscriptionMonthlyTotal: number
  lattes: LatteFactor[]
  latteTotal: number
  /** 投资自己：学习成长 + 医疗健康 */
  selfInvest: { total: number; count: number; categories: string[] }
  /** 省钱型消费：超市/生鲜自购（对比外卖） */
  thrifty: { total: number; count: number }
  takeawayTotal: number
  /** 情绪消费：深夜 / 月初 / 月底的弹性支出 */
  emotional: { night: WindowStat; monthStart: WindowStat; monthEnd: WindowStat }
}

const AUTO_RENEW_WORDS = ['会员', '续费', '订阅', 'vip', '云服务', '网盘', '自动续费', '音乐', '视频', '爱奇艺', '腾讯视频', '优酷', 'bilibili', '哔哩哔哩', '得到', '知乎', '网课']
const LATTE_MIN_COUNT = 4
const LATTE_MAX_AVG = 50
const TAKEAWAY_WORDS = ['外卖', '美团', '饿了么', '肯德基', '麦当劳', '必胜客', '瑞幸', '星巴克', '奶茶', '咖啡']
const THRIFTY_WORDS = ['超市', '盒马', '叮咚', '买菜', '生鲜', '山姆', '菜市场', '永辉', '物美']
/** 弹性消费分类（情绪消费只看这些；房租水电话费不算情绪） */
const DISCRETIONARY = new Set(['餐饮美食', '文娱休闲', '服饰美容', '日常购物', '其他支出'])

function emptyWindow(): WindowStat {
  return { total: 0, count: 0, examples: [] }
}

/**
 * 深度挖掘。
 * @param txs 当前分析范围的流水（决定统计窗口）
 * @param allTxs 全部流水（跨月，用于识别周期性扣费）
 */
export function deepMining(txs: Transaction[], allTxs: Transaction[]): DeepMining {
  const outs = txs.filter((t) => t.direction === 'out' && countsAsFlow(t))
  const allOuts = allTxs.filter((t) => t.direction === 'out' && countsAsFlow(t))

  // —— 1. 扣费刺客：周期性小额扣费（允许 ¥15 级的视频会员类订阅） ——
  const recurring = recurringExpenses(allTxs, 1)
  const subscriptions: SubscriptionAssassin[] = []
  for (const r of recurring) {
    if (r.avgAmount > 100 || r.avgAmount <= 0) continue
    const related = allOuts.filter((t) => (t.counterparty || t.item).trim() === r.counterparty)
    const lastDate = related.length > 0 ? related.reduce((a, b) => (b.time > a.time ? b : a)).time.slice(0, 10) : ''
    subscriptions.push({
      name: r.counterparty,
      category: r.category,
      monthlyAvg: r.avgAmount,
      months: r.months.length,
      lastDate,
      autoRenew: AUTO_RENEW_WORDS.some((w) => r.counterparty.toLowerCase().includes(w) || r.category.includes(w)),
    })
  }
  const subscriptionMonthlyTotal = Math.round(subscriptions.reduce((s, r) => s + r.monthlyAvg, 0) * 100) / 100

  // —— 2. 拿铁因子：高频小额同一商户 ——
  const byParty = new Map<string, Transaction[]>()
  for (const t of outs) {
    const key = (t.counterparty || t.item || '').trim()
    if (!key || key === '/') continue
    const list = byParty.get(key) ?? []
    list.push(t)
    byParty.set(key, list)
  }
  const lattes: LatteFactor[] = []
  for (const [name, list] of byParty) {
    const total = list.reduce((s, t) => s + t.amount, 0)
    const avg = total / list.length
    if (list.length >= LATTE_MIN_COUNT && avg <= LATTE_MAX_AVG) {
      lattes.push({
        name,
        count: list.length,
        total: Math.round(total * 100) / 100,
        avg: Math.round(avg * 100) / 100,
        category: list[0].category,
      })
    }
  }
  lattes.sort((a, b) => b.total - a.total)
  const latteTotal = Math.round(lattes.reduce((s, l) => s + l.total, 0) * 100) / 100

  // —— 3. 投资自己 / 省钱型消费 ——
  const investCats = ['学习成长', '医疗健康']
  const selfInvestTx = outs.filter((t) => investCats.includes(t.category))
  const selfInvest = {
    total: Math.round(selfInvestTx.reduce((s, t) => s + t.amount, 0) * 100) / 100,
    count: selfInvestTx.length,
    categories: [...new Set(selfInvestTx.map((t) => t.category))],
  }

  const thriftyTx = outs.filter((t) => {
    const text = `${t.counterparty}${t.item}`.toLowerCase()
    return THRIFTY_WORDS.some((w) => text.includes(w))
  })
  const thrifty = {
    total: Math.round(thriftyTx.reduce((s, t) => s + t.amount, 0) * 100) / 100,
    count: thriftyTx.length,
  }
  const takeawayTotal =
    Math.round(outs.filter((t) => TAKEAWAY_WORDS.some((w) => `${t.counterparty}${t.item}`.toLowerCase().includes(w)))
      .reduce((s, t) => s + t.amount, 0) * 100) / 100

  // —— 4. 情绪消费：深夜 / 月初 / 月底 ——
  const disc = outs.filter((t) => DISCRETIONARY.has(t.category))
  const night = emptyWindow()
  const monthStart = emptyWindow()
  const monthEnd = emptyWindow()
  for (const t of disc) {
    const hour = Number.parseInt(t.time.slice(11, 13), 10)
    const day = Number.parseInt(t.time.slice(8, 10), 10)
    let win: WindowStat | null = null
    if (hour >= 23 || hour < 6) win = night
    else if (day <= 3) win = monthStart
    else if (day >= 25) win = monthEnd
    if (win) {
      win.total += t.amount
      win.count++
      win.examples.push({ name: t.counterparty || t.item, amount: t.amount, date: t.time.slice(5, 10) })
    }
  }
  for (const w of [night, monthStart, monthEnd]) {
    w.total = Math.round(w.total * 100) / 100
    w.examples.sort((a, b) => b.amount - a.amount)
    w.examples = w.examples.slice(0, 3)
  }

  return { subscriptions, subscriptionMonthlyTotal, lattes, latteTotal, selfInvest, thrifty, takeawayTotal, emotional: { night, monthStart, monthEnd } }
}

/* ================= 电商平台消费识别 ================= */

export interface ShopPlatformRow {
  platform: string
  total: number
  count: number
  share: number
  topMerchants: Array<{ name: string; total: number }>
}

/** 购物/生活平台的商户名特征（从微信/支付宝/银行账单的商户与商品文本中识别） */
const SHOP_PLATFORM_RULES: Array<{ platform: string; re: RegExp }> = [
  { platform: '淘宝/天猫', re: /淘宝|天猫|taobao/i },
  { platform: '京东', re: /京东|京喜|jd\.com/i },
  { platform: '拼多多', re: /拼多多|多多买菜|pdd/i },
  { platform: '美团', re: /美团|meituan/i },
  { platform: '饿了么', re: /饿了么|ele\.me/i },
]

/**
 * 电商平台消费分析：京东/淘宝天猫/拼多多/美团/饿了么的消费虽无独立账单，
 * 但都经支付渠道结算——从账单的商户与商品文本中识别平台归属并汇总。
 */
export function shoppingSpend(txs: Transaction[], totalExpense: number): ShopPlatformRow[] {
  const by = new Map<string, { total: number; count: number; merchants: Map<string, number> }>()
  for (const t of txs) {
    if (t.direction !== 'out' || !countsAsFlow(t)) continue
    const text = `${t.counterparty} ${t.item}`
    for (const rule of SHOP_PLATFORM_RULES) {
      if (!rule.re.test(text)) continue
      const entry = by.get(rule.platform) ?? { total: 0, count: 0, merchants: new Map<string, number>() }
      entry.total += t.amount
      entry.count++
      // 商户名优先；微信账单常见脱敏横线名（"-----"），退回商品描述
      const rawName = t.counterparty || t.item || '未知商户'
      const mkey = /^[-—_s]+$/.test(rawName) ? t.item || rawName : rawName
      entry.merchants.set(mkey, (entry.merchants.get(mkey) ?? 0) + t.amount)
      by.set(rule.platform, entry)
      break // 每笔只归入第一个命中的平台
    }
  }
  return [...by.entries()]
    .map(([platform, v]) => ({
      platform,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
      topMerchants: [...v.merchants.entries()]
        .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3),
      share: totalExpense > 0 ? v.total / totalExpense : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

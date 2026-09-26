import type { Transaction } from './schema'
import { countsAsFlow } from './transfer'
import { hasRealTime } from './schema'

/**
 * 动物人格：由真实消费数据推导，不随机贴标签。
 * 5个维度 → 8只动物打分，取最高为主人格、次高为副人格。
 * 文案原则：宠溺幽默、绝不审判——用户可以自嘲，产品不能先嘲笑。
 */

export interface AnimalDef {
  key: string
  emoji: string
  name: string
  epithet: string
  copy: string
  gradient: string
}

export const ANIMALS: AnimalDef[] = [
  {
    key: 'squirrel', emoji: '🐿️', name: '松鼠', epithet: '均衡守护型',
    copy: '收支稳稳当当，该花花、该存存，森林里最让人羡慕的作息。',
    gradient: 'from-amber-400 to-orange-500',
  },
  {
    key: 'hamster', emoji: '🐹', name: '仓鼠', epithet: '囤货大师',
    copy: '每一粒粮食都要搬进洞里才安心，存钱罐见了你都想喊师父。',
    gradient: 'from-yellow-400 to-amber-600',
  },
  {
    key: 'butterfly', emoji: '🦋', name: '蝴蝶', epithet: '随心花蝶',
    copy: '钱包的花期到了就尽情飞，落在哪朵花上全看心情。偶尔也停一停嘛。',
    gradient: 'from-fuchsia-400 to-purple-500',
  },
  {
    key: 'owl', emoji: '🦉', name: '猫头鹰', epithet: '夜色消费者',
    copy: '深夜的购物车，藏着白天不敢下的单。夜色温柔，下单也温柔。',
    gradient: 'from-indigo-400 to-slate-600',
  },
  {
    key: 'panda', emoji: '🐼', name: '熊猫', epithet: '专一氪金型',
    copy: '认定了就猛吃一种竹子，"专一"这个词就是为你发明的。',
    gradient: 'from-slate-400 to-gray-600',
  },
  {
    key: 'bee', emoji: '🐝', name: '蜜蜂', epithet: '小口勤食型',
    copy: '小额高频，勤勤恳恳，生活里每一口小小的甜都逃不过你的采撷。',
    gradient: 'from-lime-400 to-yellow-500',
  },
  {
    key: 'hedgehog', emoji: '🦔', name: '刺猬', epithet: '大事担当型',
    copy: '平时安静，出手就是大事。低频大额选手，你的消费很有分量。',
    gradient: 'from-orange-400 to-rose-500',
  },
  {
    key: 'migratory', emoji: '🦢', name: '候鸟', epithet: '周期爆花型',
    copy: '花钱像候鸟迁徙，一阵一阵：来的时候声势浩大，走的时候悄无声息。',
    gradient: 'from-sky-400 to-cyan-600',
  },
]

export interface PersonaResult {
  primary: AnimalDef
  secondary: AnimalDef | null
  /** 主副占比（0-100），secondary 为 null 时只有 primary 的 100 */
  mix: [number, number] | null
  dims: Dimensions
  statement: string
}

interface Dimensions {
  savingsRate: number | null
  concentration: number | null
  nightRatio: number | null
  volatility: number | null
  medianAmount: number | null
  txnCount: number
  income: number
  expense: number
}

const MIN_TXNS = 8

export function computePersona(txs: Transaction[]): PersonaResult | null {
  const flows = txs.filter(countsAsFlow)
  const ins = flows.filter((t) => t.direction === 'in')
  const outs = flows.filter((t) => t.direction === 'out')
  const income = ins.reduce((s, t) => s + t.amount, 0)
  const expense = outs.reduce((s, t) => s + t.amount, 0)

  if (outs.length < MIN_TXNS) return null

  // 维度1：结余率
  let savingsRate: number | null = null
  if (income > 0) savingsRate = (income - expense) / income
  else if (expense === 0) savingsRate = 1

  // 维度2：消费集中度（最大支出类目占比）
  const byCat: Record<string, number> = {}
  for (const t of outs) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount
  const catTotal = Object.values(byCat).reduce((s, v) => s + v, 0)
  const concentration = catTotal > 0 ? Math.max(...Object.values(byCat)) / catTotal : null

  // 维度3：夜间支出占比（23:00-6:00）
  const nightCount = outs.filter((t) => {
    if (!hasRealTime(t)) return false
    const h = Number.parseInt(t.time.slice(11, 13), 10)
    return h >= 23 || h < 6
  }).length
  const nightRatio = outs.length > 0 ? nightCount / outs.length : null

  // 维度4：日消费波动（日支出的变异系数）
  const byDay: Record<string, number> = {}
  for (const t of outs) {
    const day = t.time.slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + t.amount
  }
  const dailyVals = Object.values(byDay)
  let volatility: number | null = null
  if (dailyVals.length >= 4) {
    const mean = dailyVals.reduce((s, v) => s + v, 0) / dailyVals.length
    if (mean > 0) {
      const variance = dailyVals.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyVals.length
      volatility = Math.sqrt(variance) / mean
    }
  }

  // 维度5：单笔中位金额
  const amounts = outs.map((t) => t.amount).sort((a, b) => a - b)
  const mid = Math.floor(amounts.length / 2)
  const medianAmount =
    amounts.length % 2 === 0 ? (amounts[mid - 1] + amounts[mid]) / 2 : amounts[mid]

  const dims: Dimensions = {
    savingsRate, concentration, nightRatio, volatility, medianAmount,
    txnCount: outs.length, income: round2(income), expense: round2(expense),
  }

  // —— 打分表：每个维度的取值给对应动物加分 ——
  const score: Record<string, number> = {
    squirrel: 0, hamster: 0, butterfly: 0, owl: 0,
    panda: 0, bee: 0, hedgehog: 0, migratory: 0,
  }

  if (savingsRate !== null) {
    if (savingsRate >= 0.45) score.hamster += 2
    else if (savingsRate >= 0.1) score.squirrel += 2
    else if (savingsRate < 0) score.butterfly += 2
    else score.butterfly += 1
  }
  if (concentration !== null && concentration >= 0.5) score.panda += 2
  if (nightRatio !== null && nightRatio >= 0.2) score.owl += 2
  if (volatility !== null && volatility >= 1.1) score.migratory += 2
  if (medianAmount !== null) {
    if (medianAmount <= 30 && outs.length >= 15) score.bee += 2
    if (medianAmount >= 200 && outs.length <= 15) score.hedgehog += 2
  }
  // 均衡兜底分：没有突出特征时松鼠得分最高
  score.squirrel += 0.6

  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1])
  const [k1, s1] = ranked[0]
  const [k2, s2] = ranked[1]
  const primary = ANIMALS.find((a) => a.key === k1)!
  const secondaryDef = s2 > 0 && s2 >= s1 * 0.4 ? ANIMALS.find((a) => a.key === k2)! : null

  const mix: [number, number] | null = secondaryDef
    ? [Math.round((s1 / (s1 + s2)) * 100), Math.round((s2 / (s1 + s2)) * 100)]
    : null

  return {
    primary,
    secondary: secondaryDef,
    mix,
    dims,
    statement: primary.copy,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

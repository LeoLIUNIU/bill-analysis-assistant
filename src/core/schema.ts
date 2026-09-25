/** 统一流水模型：微信 / 支付宝 / 银行账单解析后都归一到这里 */

/** 支持的银行代码（六大行 + 招商/中信/平安），'bank' 为未识别银行的通用兜底 */
export type BankCode = 'icbc' | 'abc' | 'boc' | 'ccb' | 'bocom' | 'psbc' | 'cmb' | 'citic' | 'pab' | 'bank'

export type Platform = 'wechat' | 'alipay' | BankCode

export const BANK_META: Record<BankCode, { name: string; color: string; color2: string }> = {
  icbc: { name: '工商银行', color: '#c7000b', color2: '#9d0009' },
  abc: { name: '农业银行', color: '#009944', color2: '#007a36' },
  boc: { name: '中国银行', color: '#d31119', color2: '#a30e14' },
  ccb: { name: '建设银行', color: '#0066b3', color2: '#00508c' },
  bocom: { name: '交通银行', color: '#004b8d', color2: '#003a6e' },
  psbc: { name: '邮储银行', color: '#007a33', color2: '#006128' },
  cmb: { name: '招商银行', color: '#c8102e', color2: '#9c0c24' },
  citic: { name: '中信银行', color: '#d31119', color2: '#a30e14' },
  pab: { name: '平安银行', color: '#f26f21', color2: '#d55e18' },
  bank: { name: '银行账户', color: '#475569', color2: '#334155' },
}

export function platformName(p: Platform): string {
  if (p === 'wechat') return '微信'
  if (p === 'alipay') return '支付宝'
  return BANK_META[p]?.name ?? p
}

/** 收支方向。neutral = 平台内资金腾挪（零钱充值/提现、余额宝等），不计收支 */
export type Direction = 'in' | 'out' | 'neutral'

/**
 * 资金性质标记。
 * - internal: 内部转账（跨平台/账户间搬运，如支付宝转微信零钱、余额宝存取）
 * - repayment: 信用还款（花呗/信用卡/白条还款——消费在购买时已计，还款不重复计）
 * - refund: 退款（冲减对应支出）
 * - null / undefined: 正常收支
 */
export type TransferFlag = 'internal' | 'repayment' | 'refund'

/** 标记来源：算法自动 / 用户手工修正 */
export type FlagSource = 'auto' | 'manual'

export interface Transaction {
  /** 稳定ID：平台 + 平台方单号哈希；无单号时用整行内容哈希 */
  id: string
  platform: Platform
  /** ISO 格式 "2025-08-01 12:30:45"（原样保留，排序/分组安全） */
  time: string
  /** 月份键 "2025-08" */
  month: string
  counterparty: string
  item: string
  /** 正数金额（元） */
  amount: number
  direction: Direction
  /** 分类（清洗+分类引擎+用户覆盖之后的结果） */
  category: string
  /** 支付方式（零钱/银行卡/花呗/余额宝…），仅展示用 */
  payMethod: string
  /** 平台方交易状态（支付成功/退款/交易关闭…），仅展示用 */
  status: string
  /** 平台原始类型/交易类型，仅展示用 */
  type: string
  /** 平台方单号（用于去重与稳定ID） */
  billNo: string
  /** 资金性质标记（对冲引擎自动 + 用户修正后的最终值） */
  transferFlag: TransferFlag | null
  flagSource: FlagSource | null
  /** 置信度 0-1，>=0.8 自动排除收支；0.5~0.8 进纠错队列 */
  confidence: number
  /** 与之配对的另一笔流水ID（跨平台对冲成功时双方互指） */
  pairId?: string
  /** 用户在纠错队列选择的分类覆盖 */
  categoryOverride?: string
  /** 演示数据标记：一键体验生成的账单，可一键清除 */
  isDemo?: boolean
}

export interface ParsedBill {
  platform: Platform
  /** 解析到的原始行数（含被清洗掉的） */
  rowCount: number
  transactions: Transaction[]
  /** 账单覆盖的时间范围（由数据推断） */
  range?: [string, string]
}

/** 单月聚合：存档与环比的最小数据单元（不含任何明细） */
export interface MonthlyAggregate {
  month: string
  income: number
  expense: number
  /** 分类支出：分类名 -> 金额 */
  byCategory: Record<string, number>
  /** 收入来源：来源分类 -> 金额 */
  byIncomeSource: Record<string, number>
  /** 商户支出 Top：商户 -> 金额（存档时可截断） */
  byMerchant: Record<string, number>
  /** 夜间(23:00-6:00)支出笔数与总笔数 */
  nightCount: number
  txnCount: number
}

/** 用户修正记录（纠错队列 + 手改分类），按流水ID持久化。'normal' = 恢复为正常收支 */
export interface Correction {
  transferFlag?: TransferFlag | 'normal'
  category?: string
}

export interface Archive {
  version: 1
  exportedAt: string
  app: 'songshu-assistant'
  /** 月份 -> 聚合 */
  months: Record<string, MonthlyAggregate>
  /** 流水ID -> 修正 */
  corrections: Record<string, Correction>
}

/** 消费分类定义 */
export interface CategoryDef {
  name: string
  emoji: string
  color: string
  /** 支出类 or 收入类 */
  kind: 'expense' | 'income'
}

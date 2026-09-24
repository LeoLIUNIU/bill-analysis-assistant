import type { Transaction } from './schema'

/**
 * 数据清洗：
 * 1. 丢弃无效状态交易（已撤销/已关闭/已失效——钱没有真实易手）
 * 2. 识别退款：
 *    - 微信原交易状态"已全额退款"→ 净额为零，标记 refund（不计支出）
 *    - 微信"转账-退款"/支付宝退款入账行（收入方向）→ 标记 refund
 */
export function cleanTransactions(txs: Transaction[]): { kept: Transaction[]; dropped: number } {
  const kept: Transaction[] = []
  let dropped = 0

  for (const tx of txs) {
    if (isInvalidStatus(tx)) {
      dropped++
      continue
    }
    markRefund(tx)
    kept.push(tx)
  }
  return { kept, dropped }
}

function isInvalidStatus(tx: Transaction): boolean {
  const s = tx.status
  if (tx.platform === 'wechat') {
    return /撤销|失效|已退票/.test(s)
  }
  // alipay
  return /交易关闭|等待付款|等待确认/.test(s)
}

function markRefund(tx: Transaction): void {
  if (tx.platform === 'wechat') {
    if (tx.status.includes('全额退款')) {
      tx.transferFlag = 'refund'
      tx.flagSource = 'auto'
      tx.confidence = 1
      return
    }
    if (tx.direction === 'in' && (tx.type.includes('退款') || tx.item.includes('退款'))) {
      tx.transferFlag = 'refund'
      tx.flagSource = 'auto'
      tx.confidence = 1
    }
    return
  }
  // alipay：收入方向、状态或商品带"退款"
  if (tx.direction === 'in' && (/退款/.test(tx.status) || /退款/.test(tx.item) || /退款/.test(tx.type))) {
    tx.transferFlag = 'refund'
    tx.flagSource = 'auto'
    tx.confidence = 1
  }
}

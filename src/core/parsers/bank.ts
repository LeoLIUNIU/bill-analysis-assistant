import type { BankCode, Direction, Transaction } from '../schema'
import { transactionId } from '../ids'
import { findHeaderRow, monthOf, normalizeHeader, splitLines } from './detect'
import Papa from 'papaparse'

/**
 * 通用银行账单解析器。
 *
 * 银行导出格式各家不一（列名、方向标志、日期格式、正负号约定），因此不写死列位置，
 * 而是按表头模糊映射列，并支持四种方向约定：
 *   1. 收/支 列（收入/支出）
 *   2. 借贷标志（借=支出、贷=收入，工行/建行等常见）
 *   3. 转入/转出（中国银行等常见）
 *   4. 无方向列时按金额正负号（负=支出）
 * 另支持「收入金额/支出金额」双列格式（取非零列定方向）。
 */

export interface BankParseResult {
  transactions: Transaction[]
  dropped: number
}

/* ---------------- 日期与金额归一 ---------------- */

/** 银行日期格式归一为 "YYYY-MM-DD HH:mm:ss"；无法解析返回 null */
export function parseBankDate(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim()
  if (!s) return null
  // 2025-08-01 12:00:00 / 2025/8/1 / 2025.8.1 / 2025年8月1日
  const m = s.match(/^(\d{4})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})日?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const [, y, mo, d, h = '00', mi = '00', se = '00'] = m
    return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(se)}`
  }
  // 08/01 或 08-01 或 8月1日（信用卡账单常见，年份取自账单期标题）
  const md = s.match(/^(\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?/)
  if (md && fallbackYear) {
    const [, mo, d, h = '00', mi = '00'] = md
    return `${fallbackYear}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:00`
  }
  // 20250801 / 20250801120000
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 8) {
    const y = digits.slice(0, 4)
    const mo = digits.slice(4, 6)
    const d = digits.slice(6, 8)
    const h = digits.slice(8, 10) || '00'
    const mi = digits.slice(10, 12) || '00'
    const se = digits.slice(12, 14) || '00'
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${mo}-${d} ${pad(h)}:${pad(mi)}:${pad(se)}`
    }
  }
  return null
}

function pad(v: string): string {
  return v.padStart(2, '0')
}

function parseNum(raw: string): number {
  const cleaned = raw.replace(/[¥￥,""\s元人民币]/g, '')
  if (!cleaned) return NaN
  return Number.parseFloat(cleaned)
}

/* ---------------- 列映射 ---------------- */

interface BankColumns {
  date: number
  amount: number
  /** 收入金额列（双列格式） */
  amountIn: number
  /** 支出金额列（双列格式） */
  amountOut: number
  dir: number
  counterparty: number
  item: number
  type: number
  payAccount: number
  status: number
  billNo: number
}

function detectColumns(header: string[]): BankColumns | null {
  const cols = header.map(normalizeHeader)
  const find = (...names: string[]) => {
    for (const n of names) {
      const idx = cols.findIndex((h) => h === n)
      if (idx !== -1) return idx
    }
    for (const n of names) {
      const idx = cols.findIndex((h) => h.includes(n))
      if (idx !== -1) return idx
    }
    return -1
  }

  const date = find('交易日期', '记账日期', '入账日期', '交易时间', '记账日', '交易日', '日期')
  if (date === -1) return null

  // 金额列：优先"交易金额"，排除"余额"
  let amount = -1
  const amountCandidates = cols
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.includes('金额') && !h.includes('余额'))
  amount = amountCandidates.find(({ h }) => h === '交易金额')?.i
    ?? amountCandidates.find(({ h }) => h.includes('金额'))?.i ?? -1

  // 双列格式：收入金额(转入金额/贷方金额) + 支出金额(转出金额/借方金额)
  const amountIn = cols.findIndex((h) => (h.includes('收入') || h.includes('转入') || h.includes('贷方')) && h.includes('金额'))
  const amountOut = cols.findIndex((h) => (h.includes('支出') || h.includes('转出') || h.includes('借方')) && h.includes('金额'))
  if (amount === -1 && amountIn !== -1 && amountOut !== -1) amount = amountIn

  if (amount === -1) return null

  const dir = cols.findIndex((h) => (h.includes('收/支') || h.includes('收支') || h.includes('借贷') || h === '标志' || h.includes('方向')) && !h.includes('金额'))
  let counterparty = find('对方户名', '交易对方', '商户名称', '交易场所', '对方名称')
  let item = find('交易摘要', '摘要', '商品说明', '交易描述', '用途', '附言', '备注')
  const type = find('交易类型', '业务类型', '交易渠道')
  const payAccount = find('账户', '卡号', '卡种')
  const status = find('交易状态', '状态')
  const billNo = find('流水号', '凭证号', '交易单号', '记录号')

  if (counterparty !== -1 && counterparty === item) {
    // 同一列时拆开：另找一个含"对方/商户/场所"的列做 counterparty，找不到就只用 item
    const alt = cols.findIndex((h, i) => i !== item && (h.includes('对方') || h.includes('商户') || h.includes('场所')))
    counterparty = alt !== -1 ? alt : -1
  }

  return { date, amount, amountIn, amountOut, dir, counterparty, item, type, payAccount, status, billNo }
}

/* ---------------- 方向解析 ---------------- */

function resolveDirection(raw: string): Direction | null {
  const v = raw.trim()
  if (!v) return null
  if (/收入|贷|转入|存入|入账/.test(v)) return 'in'
  if (/支出|借|转出|消费|支取|取出/.test(v)) return 'out'
  return null
}

/* ---------------- 行解析 ---------------- */

export function bankFromRows(allRows: string[][], platform: BankCode, sourceFile: string): BankParseResult {
  const joined = allRows.map((r) => r.join('◆'))
  const headerIdx = findHeaderRow(joined, [['日期', '时间', '记账日', '交易日'], ['金额']])
  if (headerIdx === -1) throw new Error(`未找到${sourceFile}账单表头`)

  const header = allRows[headerIdx]
  const cols = detectColumns(header)
  if (!cols) throw new Error(`${sourceFile}账单列结构无法识别：需要日期与金额列`)

  // 信用卡账单年份推断：表头前的元信息里找 "2026" 这类年份（账单周期），
  // 用于解析 MM/DD 形式的交易日
  const fallbackYear = (() => {
    for (let i = headerIdx - 1; i >= 0; i--) {
      const m = allRows[i]?.join(' ').match(/20\d{2}/)
      if (m) return Number(m[0])
    }
    // 表头之后找不到就往表头数据行上找（有些PDF元信息在表头下）
    const m = joined.slice(headerIdx + 1, headerIdx + 6).join(' ').match(/20\d{2}/)
    return m ? Number(m[0]) : undefined
  })()

  // 方向约定探测：无方向列且金额全为正 → 判断是否信用卡模式
  // （信用卡账单：交易金额恒为正，消费=支出，还款/退货=入账）
  let hasNegative = false
  let creditSignal = /信用卡|贷记卡/.test(joined.slice(0, Math.max(headerIdx, 1)).join(' '))
  for (let r = headerIdx + 1; r < Math.min(allRows.length, headerIdx + 60); r++) {
    const row = allRows[r]
    if (!row) continue
    const v = parseNum(row[cols.amount] ?? '')
    if (Number.isFinite(v) && v < 0) hasNegative = true
    const text = `${cols.type !== -1 ? row[cols.type] ?? '' : ''}${cols.item !== -1 ? row[cols.item] ?? '' : ''}`
    if (/消费|取现|支出/.test(text)) creditSignal = true
  }

  const bankLabel = platform === 'bank' ? '银行卡' : undefined
  const txs: Transaction[] = []
  let dropped = 0

  for (let r = headerIdx + 1; r < allRows.length; r++) {
    const row = allRows[r]
    if (!row || row.length < 2) continue

    const time = parseBankDate(row[cols.date] ?? '', fallbackYear)
    if (!time) {
      // 末尾统计行/空行等，静默跳过
      if ((row[cols.date] ?? '').trim()) dropped++
      continue
    }

    // 方向与金额
    let direction: Direction | null = null
    let amount = NaN
    if (cols.dir !== -1) direction = resolveDirection(row[cols.dir] ?? '')
    if (cols.amountIn !== -1 && cols.amountOut !== -1) {
      const vIn = parseNum(row[cols.amountIn] ?? '')
      const vOut = parseNum(row[cols.amountOut] ?? '')
      if (Number.isFinite(vIn) && vIn > 0) {
        direction = direction ?? 'in'
        amount = vIn
      } else if (Number.isFinite(vOut) && vOut > 0) {
        direction = direction ?? 'out'
        amount = vOut
      }
    } else {
      amount = parseNum(row[cols.amount] ?? '')
      if (Number.isFinite(amount) && direction === null) {
        if (amount < 0) {
          // 负数金额 = 支出（最常见的银行符号约定）
          direction = 'out'
        } else if (amount > 0) {
          const text = `${row[cols.type] ?? ''}${row[cols.item] ?? ''}${row[cols.counterparty] ?? ''}`
          // 信用卡模式：无方向列、金额恒正——还款/退货是入账，其余（消费/取现）是支出
          if (hasNegative) {
            direction = 'in' // 借记卡正负号约定：正=收入
          } else if (creditSignal) {
            direction = /还款|退货|退款|贷记/.test(text) ? 'in' : 'out'
          } else {
            // 借记卡导出无符号无方向列：按关键词兜底
            direction = resolveDirection(text) ?? 'out'
          }
        }
      }
      if (Number.isFinite(amount)) amount = Math.abs(amount)
    }

    if (direction === null || !Number.isFinite(amount) || amount === 0) {
      dropped++
      continue
    }

    const counterparty = cols.counterparty !== -1 ? (row[cols.counterparty] ?? '').trim() : ''
    const item = cols.item !== -1 ? (row[cols.item] ?? '').trim() : ''
    const type = cols.type !== -1 ? (row[cols.type] ?? '').trim() : ''
    const status = cols.status !== -1 ? (row[cols.status] ?? '').trim() : ''
    const billNo = cols.billNo !== -1 ? (row[cols.billNo] ?? '').trim() : ''
    const payAccount = cols.payAccount !== -1 ? (row[cols.payAccount] ?? '').trim() : ''

    txs.push({
      id: transactionId(platform, billNo, row.join('|')),
      platform,
      time,
      month: monthOf(time),
      counterparty,
      item: item || type,
      amount,
      direction,
      category: '',
      payMethod: payAccount || bankLabel || '银行卡',
      status,
      type: type || item,
      billNo,
      transferFlag: null,
      flagSource: null,
      confidence: 0,
    })
  }

  return { transactions: txs, dropped }
}

/** CSV 文本入口 */
export function parseBankCsv(text: string, platform: BankCode): Transaction[] {
  const headerIdx = findHeaderRow(splitLines(text), [['日期', '时间'], ['金额']])
  if (headerIdx === -1) throw new Error('未找到银行账单表头：需要包含日期与金额列')
  const parsed = Papa.parse<string[]>(splitLines(text).slice(headerIdx).join('\n'), { skipEmptyLines: 'greedy' })
  const result = bankFromRows(parsed.data, platform, '银行')
  return result.transactions
}

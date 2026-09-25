import type { Platform } from '../schema'

/**
 * 文件解码与平台识别。
 * 微信账单导出为 UTF-8，支付宝导出为 GBK——先按严格 UTF-8 解码，
 * 失败则回退 GBK（浏览器/Node 的 TextDecoder 原生支持 gbk）。
 */
export function decodeBuffer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      // 环境不支持 gbk 时尽力而为
      return new TextDecoder('utf-8').decode(buf)
    }
  }
}

export function detectPlatform(text: string): Platform | null {
  const head = text.slice(0, 4000)
  if (head.includes('微信支付账单明细') || head.includes('微信支付交易明细')) return 'wechat'
  if (head.includes('支付宝')) return 'alipay'
  // 银行：文件头部通常带银行全称（注意"中国工商银行"不含"中国银行"连续子串，顺序安全）
  const banks: Array<[RegExp, Platform]> = [
    [/工商银行/, 'icbc'],
    [/农业银行/, 'abc'],
    [/中国银行/, 'boc'],
    [/建设银行/, 'ccb'],
    [/交通银行/, 'bocom'],
    [/邮(政)?储(蓄)?银行/, 'psbc'],
    [/招商银行/, 'cmb'],
    [/中信银行/, 'citic'],
    [/平安银行/, 'pab'],
  ]
  for (const [re, code] of banks) {
    if (re.test(head)) return code
  }
  // 兜底：按表头特征判断
  if (head.includes('交易类型') && head.includes('当前状态')) return 'wechat'
  if (head.includes('交易分类') || head.includes('商品说明')) return 'alipay'
  return null
}

/**
 * 在前 N 行里找表头行。required 是"列名组"数组，每组内任一关键词命中即算该组满足，
 * 全部组满足的行认定为表头。各平台导出的元信息行数不固定，按列名定位而非固定行号。
 */
export function findHeaderRow(lines: string[], required: string[][]): number {
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const line = lines[i]
    if (required.every((group) => group.some((k) => line.includes(k)))) return i
  }
  return -1
}

/** 归一化表头名：去空格、统一括号，兼容全角/半角 */
export function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')')
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

export function monthOf(time: string): string {
  // time 形如 "2025-08-01 12:30:45"
  const m = time.match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  // 兜底：尝试 Date 解析（应对 2025/8/1 之类）
  const d = new Date(time.replace(/\//g, '-'))
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return '未知月份'
}

/** 金额字符串 → 数字："¥1,234.56"、"1234.56"、带引号空格均兼容；非法返回 NaN */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[¥￥,""\s元]/g, '')
  if (!cleaned) return NaN
  return Number.parseFloat(cleaned)
}

/** "2025-08-02 09:00:00" 与 "2025-08-05" 之间的天数差（绝对值，取整） */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a.replace(/\//g, '-').slice(0, 19).replace(' ', 'T')).getTime()
  const db = new Date(b.replace(/\//g, '-').slice(0, 19).replace(' ', 'T')).getTime()
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((da - db) / 86400000))
}

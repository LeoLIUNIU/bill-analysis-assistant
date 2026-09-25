import type { ParsedBill } from '../schema'
import { detectPlatform } from './detect'
import { bankFromRows } from './bank'

/**
 * 银行 PDF 账单解析（文本型 PDF；扫描件/图片版无法提取文字，会给出友好报错）。
 *
 * PDF 里没有"行"的概念，只有带坐标的文字碎片。重建流程：
 *   1. pdf.js 提取每页文字项（str + x/y 坐标）
 *   2. 按 y 坐标聚类成行（容差 3pt）
 *   3. 行内按 x 间距切分成单元格（间距 > 5pt 即新列）
 *   4. 重建出的行数组交给通用银行解析器（模糊列映射 + 方向约定）
 */

export interface PdfTextItem {
  str: string
  x: number
  y: number
  w: number
}

const LINE_Y_TOLERANCE = 3
const CELL_GAP = 5

/** 文字碎片 → 表格行（每行是单元格数组） */
export function groupPdfTextItems(items: PdfTextItem[]): string[][] {
  const valid = items
    .filter((it) => it.str && it.str.trim().length > 0)
    .map((it) => ({ ...it, str: it.str.replace(/\s+/g, ' ').trim() }))

  // 按 y 降序（PDF 原点在左下）聚类成行
  const sorted = [...valid].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Array<{ y: number; items: PdfTextItem[] }> = []
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= LINE_Y_TOLERANCE)
    if (line) line.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }

  const rows: string[][] = []
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    const cells: string[] = []
    let prev: PdfTextItem | null = null
    for (const it of line.items) {
      const gap = prev ? it.x - (prev.x + prev.w) : Number.POSITIVE_INFINITY
      if (prev === null || gap > CELL_GAP) cells.push(it.str)
      else cells[cells.length - 1] += it.str // 同一单元格内的连续碎片
      prev = it
    }
    const cleaned = cells.map((c) => c.trim()).filter((c) => c.length > 0)
    // 过滤页码/装饰行
    const joined = cleaned.join(' ')
    if (cleaned.length === 0) continue
    if (/^第\s*\d+\s*页/.test(joined) || /^共\s*\d+\s*页$/.test(joined)) continue
    if (/^Page\s*\d+/i.test(joined)) continue
    rows.push(cleaned)
  }
  return rows
}

/** 重建的行 → 账单（银行账单走通用解析器；无法识别时给出针对性报错） */
export function pdfRowsToBill(rows: string[][]): ParsedBill {
  const headText = rows.slice(0, 60).map((r) => r.join(' ')).join('\n')
  const platform = detectPlatform(headText)

  const candidates: Array<Parameters<typeof bankFromRows>[1]> = []
  if (platform && platform !== 'wechat' && platform !== 'alipay') {
    candidates.push(platform)
  }
  candidates.push('bank')

  let lastError: Error | null = null
  for (const code of candidates) {
    try {
      const result = bankFromRows(rows, code, '银行PDF')
      if (result.transactions.length > 0) {
        const times = result.transactions.map((t) => t.time).sort()
        return {
          platform: code,
          rowCount: rows.length,
          transactions: result.transactions,
          range: [times[0], times[times.length - 1]],
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }

  const hasAnyText = rows.some((r) => r.length > 0)
  throw new Error(
    hasAnyText
      ? `PDF账单结构无法识别：${lastError?.message ?? '未找到含日期与金额的交易表'}。如为微信/支付宝账单请导出 CSV/Excel 格式`
      : '这个PDF没有可提取的文字层（可能是扫描件/图片版账单），暂不支持。请在银行APP内寻找 CSV/Excel 导出入口',
  )
}

/** PDF 文件入口：懒加载 pdf.js，逐页提取文字并重建表格 */
export async function parseBillPdf(buf: ArrayBuffer): Promise<ParsedBill> {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
  }).promise

  const maxPages = Math.min(doc.numPages, 50)
  const rows: string[][] = []
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items: PdfTextItem[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const x = item.transform[4]
      const y = item.transform[5]
      const w = item.width ?? 0
      items.push({ str: item.str, x, y, w })
    }
    rows.push(...groupPdfTextItems(items))
    page.cleanup()
  }
  void doc.cleanup()

  if (rows.length < 3) {
    throw new Error('这个PDF没有可提取的文字层（可能是扫描件/图片版账单），暂不支持。请在银行APP内寻找 CSV/Excel 导出入口')
  }
  return pdfRowsToBill(rows)
}

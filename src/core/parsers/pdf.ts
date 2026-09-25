import type { ParsedBill } from '../schema'
import { detectPlatform } from './detect'
import { bankFromRows } from './bank'

/**
 * 银行 PDF 账单解析（文本型 PDF；扫描件/图片版无法提取文字，会给出友好报错）。
 *
 * PDF 里没有"行"的概念，只有带坐标的文字碎片。重建流程：
 *   1. pdf.js 提取每页文字项（str + x/y 坐标 + 宽度）
 *   2. 按 y 坐标聚类成行（容差 3pt），行内按 x 间距切成单元格（保留每格的 x/w）
 *   3. 找到表头行（含"日期"与"金额"关键词），按**x 坐标区间**把数据单元格对齐到表头列
 *      —— 关键：银行PDF的 收入金额/支出金额 两列每行只有一列有值，空列不产生文字，
 *         若按数组顺序对齐会整体错位（支出被当成收入）。必须按坐标对齐。
 *   4. 对齐后的行数组交给通用银行解析器（方向约定 + 清洗 + 分类）
 */

export interface PdfTextItem {
  str: string
  x: number
  y: number
  w: number
}

/** 带坐标的单元格 */
export interface PdfCell {
  text: string
  x: number
  w: number
}

const LINE_Y_TOLERANCE = 3
const CELL_GAP = 5

/** 文字碎片 → 带坐标的表格行 */
export function groupPdfPositionedRows(items: PdfTextItem[]): PdfCell[][] {
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

  const rows: PdfCell[][] = []
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    const cells: PdfCell[] = []
    let prev: PdfTextItem | null = null
    for (const it of line.items) {
      const gap = prev ? it.x - (prev.x + prev.w) : Number.POSITIVE_INFINITY
      if (prev === null || gap > CELL_GAP) {
        cells.push({ text: it.str, x: it.x, w: it.w })
      } else {
        // 同一单元格内的连续碎片：拼接文本，扩展宽度
        const last = cells[cells.length - 1]
        last.text += it.str
        last.w = it.x + it.w - last.x
      }
      prev = it
    }
    const cleaned = cells
      .map((c) => ({ ...c, text: c.text.trim() }))
      .filter((c) => c.text.length > 0)
    if (cleaned.length === 0) continue
    const joined = cleaned.map((c) => c.text).join(' ')
    // 过滤页码/装饰行
    if (/^第\s*\d+\s*页/.test(joined) || /^共\s*\d+\s*页$/.test(joined)) continue
    if (/^Page\s*\d+/i.test(joined)) continue
    rows.push(cleaned)
  }
  return rows
}

/** 兼容接口：只要文本行（无坐标）的场景 */
export function groupPdfTextItems(items: PdfTextItem[]): string[][] {
  return groupPdfPositionedRows(items).map((row) => row.map((c) => c.text))
}

/**
 * 表头列 x 区间：第 i 列覆盖 [x_i, x_{i+1})（最后一列到 +∞）。
 * 金额列常为右对齐（数值起点略早于表头起点），中心点判定可容忍。
 */
function assignCellsToColumns(row: PdfCell[], headerXs: number[]): string[] {
  const out = new Array<string>(headerXs.length).fill('')
  for (const cell of row) {
    const center = cell.x + cell.w / 2
    let col = headerXs.length - 1
    for (let i = 0; i < headerXs.length; i++) {
      if (center < headerXs[i]) {
        col = Math.max(0, i - 1)
        break
      }
    }
    out[col] = out[col] ? `${out[col]} ${cell.text}` : cell.text
  }
  return out
}

/** 定位行 → 找表头并按坐标对齐 → 通用银行解析 */
function alignedRowsToBill(posRows: PdfCell[][]): ParsedBill {
  // 表头行：同时含"日期"与"金额"关键词的行
  let headerIdx = -1
  for (let i = 0; i < Math.min(posRows.length, 60); i++) {
    const texts = posRows[i].map((c) => c.text)
    if (texts.some((t) => /日期|记账日|交易日/.test(t)) && texts.some((t) => t.includes('金额'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    throw new Error('未找到含日期与金额的交易表')
  }

  const headerCells = posRows[headerIdx]
  const headerTexts = headerCells.map((c) => c.text)
  const headerXs = headerCells.map((c) => c.x)

  // 组装解析数组：保留表头前的元信息行（银行名→平台识别、账单周期→MM/DD年份推断），
  // 表头行原样保留，数据行按坐标对齐到表头列
  const aligned: string[][] = []
  for (let i = 0; i < headerIdx; i++) {
    aligned.push(posRows[i].map((c) => c.text))
  }
  aligned.push(headerTexts)
  for (let i = headerIdx + 1; i < posRows.length; i++) {
    aligned.push(assignCellsToColumns(posRows[i], headerXs))
  }

  const headText = aligned.slice(0, 60).map((r) => r.join(' ')).join('\n')
  const detected = detectPlatform(headText)

  const candidates: Array<Parameters<typeof bankFromRows>[1]> = []
  if (detected && detected !== 'wechat' && detected !== 'alipay') candidates.push(detected)
  candidates.push('bank')

  let lastError: Error | null = null
  for (const code of candidates) {
    try {
      const result = bankFromRows(aligned, code, '银行PDF')
      if (result.transactions.length > 0) {
        const times = result.transactions.map((t) => t.time).sort()
        return {
          platform: code,
          rowCount: aligned.length,
          transactions: result.transactions,
          range: [times[0], times[times.length - 1]],
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw new Error(
    `PDF账单结构无法识别：${lastError?.message ?? '未找到含日期与金额的交易表'}。如为微信/支付宝账单请导出 CSV/Excel 格式`,
  )
}

/** 带坐标行版本（真实提取路径；空列按坐标对齐不串位） */
export function pdfPositionedRowsToBill(posRows: PdfCell[][]): ParsedBill {
  return alignedRowsToBill(posRows)
}

/** 纯字符串行版本（测试与简单场景用；行必须完整无空列，空列场景用坐标对齐的 parseBillPdf） */
export function pdfRowsToBill(rows: string[][]): ParsedBill {
  // 合成等距 x 坐标：第 i 列映射回第 i 个表头列（恒等对齐）
  return alignedRowsToBill(rows.map((r) => r.map((t, i) => ({ text: t, x: i * 10000, w: 100 }))))
}

/** PDF 文件入口：懒加载 pdf.js，逐页提取文字并按坐标重建表格 */
export async function parseBillPdf(buf: ArrayBuffer): Promise<ParsedBill> {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
  }).promise

  const maxPages = Math.min(doc.numPages, 50)
  const posRows: PdfCell[][] = []
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items: PdfTextItem[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width ?? 0 })
    }
    posRows.push(...groupPdfPositionedRows(items))
    page.cleanup()
  }
  void doc.cleanup()

  if (posRows.length < 3) {
    throw new Error('这个PDF没有可提取的文字层（可能是扫描件/图片版账单），暂不支持。请在银行APP内寻找 CSV/Excel 导出入口')
  }
  return alignedRowsToBill(posRows)
}

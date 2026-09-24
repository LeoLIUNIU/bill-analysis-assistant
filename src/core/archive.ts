import type { Archive, Correction, MonthlyAggregate } from './schema'

export function buildArchive(
  months: Record<string, MonthlyAggregate>,
  corrections: Record<string, Correction>,
): Archive {
  return {
    version: 1,
    app: 'songshu-assistant',
    exportedAt: new Date().toISOString(),
    months,
    corrections,
  }
}

export function serializeArchive(archive: Archive): string {
  return JSON.stringify(archive, null, 2)
}

/** 解析存档文件；结构不合法时抛错 */
export function parseArchive(text: string): Archive {
  const raw = JSON.parse(text) as Archive
  if (raw?.app !== 'songshu-assistant' || raw?.version !== 1 || typeof raw.months !== 'object') {
    throw new Error('这不是有效的松鼠助手存档文件')
  }
  return raw
}

export function downloadTextFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

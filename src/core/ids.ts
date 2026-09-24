/** FNV-1a 32位哈希，生成稳定流水ID（同一条账单每次导入ID一致） */
export function stableId(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function transactionId(platform: string, billNo: string, rowRaw: string): string {
  const base = billNo ? `${platform}|${billNo}` : `${platform}|${rowRaw}`
  return stableId(base)
}

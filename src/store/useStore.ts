import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Correction, MonthlyAggregate, ParsedBill, Transaction } from '../core/schema'
import { aggregateMonth, monthsOf } from '../core/month'
import { mergeTransactions, parseBillFile, parseBillText, processPipeline } from '../core/pipeline'
import { buildArchive, downloadTextFile, parseArchive, serializeArchive } from '../core/archive'
import { DEMO_FILES } from '../demo/samples'

export interface ImportResult {
  name: string
  ok: boolean
  platform?: string
  count?: number
  range?: [string, string]
  error?: string
}

interface SongshuState {
  transactions: Transaction[]
  corrections: Record<string, Correction>
  /** 存档导入的历史月聚合（无明细），与当前数据合并参与环比 */
  archiveMonths: Record<string, MonthlyAggregate>
  selectedMonth: string
  importResults: ImportResult[]

  importFiles: (files: File[]) => Promise<void>
  loadDemo: () => void
  setCorrection: (id: string, corr: Correction) => void
  clearCorrection: (id: string) => void
  setSelectedMonth: (month: string) => void
  importArchiveText: (text: string) => void
  exportArchive: () => void
  clearAll: () => void
  clearImportResults: () => void
}

export const useStore = create<SongshuState>()(
  persist(
    (set, get) => ({
      transactions: [],
      corrections: {},
      archiveMonths: {},
      selectedMonth: '',
      importResults: [],

      importFiles: async (files) => {
        const results: ImportResult[] = []
        let all: Transaction[] = get().transactions
        for (const file of files) {
          try {
            const bill: ParsedBill = await parseBillFile(file)
            all = mergeTransactions(all, bill.transactions)
            results.push({
              name: file.name,
              ok: true,
              platform: bill.platform === 'wechat' ? '微信' : '支付宝',
              count: bill.transactions.length,
              range: bill.range,
            })
          } catch (e) {
            results.push({ name: file.name, ok: false, error: e instanceof Error ? e.message : String(e) })
          }
        }
        set({ transactions: all, importResults: results })
      },

      loadDemo: () => {
        let all = get().transactions
        for (const f of DEMO_FILES) {
          try {
            all = mergeTransactions(all, parseBillText(f.text).transactions)
          } catch {
            // 演示数据由单测保证，理论上不会走到这里
          }
        }
        set({ transactions: all, importResults: DEMO_FILES.map((f) => ({ name: f.name, ok: true, count: 0 })) })
      },

      setCorrection: (id, corr) => {
        set((s) => ({ corrections: { ...s.corrections, [id]: corr } }))
      },

      clearCorrection: (id) => {
        set((s) => {
          const next = { ...s.corrections }
          delete next[id]
          return { corrections: next }
        })
      },

      setSelectedMonth: (month) => set({ selectedMonth: month }),

      importArchiveText: (text) => {
        const archive = parseArchive(text)
        set((s) => ({
          archiveMonths: { ...archive.months, ...s.archiveMonths },
          corrections: { ...s.corrections, ...archive.corrections },
        }))
      },

      exportArchive: () => {
        const { archiveMonths, corrections, transactions } = get()
        // 当前有明细的月份用实时聚合覆盖存档（保持最新）
        const months: Record<string, MonthlyAggregate> = { ...archiveMonths }
        for (const m of monthsOf(transactions)) {
          months[m] = aggregateFor(m, transactions)
        }
        const archive = buildArchive(months, corrections)
        const stamp = new Date().toISOString().slice(0, 10)
        downloadTextFile(`松鼠助手存档_${stamp}.json`, serializeArchive(archive))
      },

      clearAll: () => {
        if (window.confirm('确定清空本浏览器的所有账单数据吗？此操作不可恢复。')) {
          set({ transactions: [], corrections: {}, archiveMonths: {}, importResults: [], selectedMonth: '' })
        }
      },

      clearImportResults: () => set({ importResults: [] }),
    }),
    {
      name: 'songshu-store-v1',
      partialize: (s) => ({
        transactions: s.transactions,
        corrections: s.corrections,
        archiveMonths: s.archiveMonths,
        selectedMonth: s.selectedMonth,
      }),
    },
  ),
)

function aggregateFor(month: string, txs: Transaction[]): MonthlyAggregate {
  return aggregateMonth(month, processPipeline(txs, useStore.getState().corrections))
}

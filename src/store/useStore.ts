import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Correction, MonthlyAggregate, ParsedBill, Transaction } from '../core/schema'
import { platformName } from '../core/schema'
import { aggregateMonth, monthsOf } from '../core/month'
import { mergeTransactions, parseBillFile, parseBillText, processPipeline } from '../core/pipeline'
import { buildArchive, downloadTextFile, parseArchive, serializeArchive } from '../core/archive'
import { ALIPAY_SAMPLE_CSV, DEMO_FILES, WECHAT_SAMPLE_CSV } from '../demo/samples'

/** 演示账单的稳定ID集合：兼容旧版本导入、尚无 isDemo 标记的存量数据 */
export const DEMO_IDS: ReadonlySet<string> = (() => {
  const ids = new Set<string>()
  for (const text of [WECHAT_SAMPLE_CSV, ALIPAY_SAMPLE_CSV]) {
    try {
      for (const t of parseBillText(text).transactions) ids.add(t.id)
    } catch {
      // 演示数据由单测保证，理论上不会走到这里
    }
  }
  return ids
})()

export const isDemoTxn = (t: Transaction): boolean => Boolean(t.isDemo) || DEMO_IDS.has(t.id)

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
  /** 大额未知标注中用户选择跳过的流水ID */
  skippedLabelIds: string[]
  /** 月度预算（0=未设定） */
  budgetMonthly: number
  setBudgetMonthly: (v: number) => void

  importFiles: (files: File[]) => Promise<ImportResult[]>
  loadDemo: () => void
  clearDemo: () => void
  setCorrection: (id: string, corr: Correction) => void
  skipLabel: (id: string) => void
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
      skippedLabelIds: [],
      budgetMonthly: 0,
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
        // 同名文件的结果覆盖旧记录，不同文件累积——支持"传完一个再传下一个"
        const names = new Set(files.map((f) => f.name))
        const mergedResults = [...get().importResults.filter((r) => !names.has(r.name)), ...results]
        set({ transactions: all, importResults: mergedResults })
        return results
      },

      loadDemo: () => {
        let all = get().transactions
        for (const f of DEMO_FILES) {
          try {
            const txs = parseBillText(f.text).transactions.map((t) => ({ ...t, isDemo: true }))
            all = mergeTransactions(all, txs)
          } catch {
            // 演示数据由单测保证，理论上不会走到这里
          }
        }
        set({ transactions: all, importResults: DEMO_FILES.map((f) => ({ name: f.name, ok: true, count: 0 })) })
      },

      clearDemo: () => {
        set((s) => ({ transactions: s.transactions.filter((t) => !isDemoTxn(t)) }))
      },

      setCorrection: (id, corr) => {
        set((s) => ({
          corrections: { ...s.corrections, [id]: { ...s.corrections[id], ...corr } },
        }))
      },

      setBudgetMonthly: (v) => {
        set({ budgetMonthly: Math.max(0, Math.round(v)) })
      },

      skipLabel: (id) => {
        set((s) => ({
          skippedLabelIds: s.skippedLabelIds.includes(id)
            ? s.skippedLabelIds
            : [...s.skippedLabelIds, id],
        }))
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
        downloadTextFile(`账单分析助手存档_${stamp}.json`, serializeArchive(archive))
      },

      clearAll: () => {
        if (window.confirm('确定清空本浏览器的所有账单数据吗？此操作不可恢复。')) {
          set({ transactions: [], corrections: {}, archiveMonths: {}, importResults: [], selectedMonth: '', skippedLabelIds: [], budgetMonthly: 0 })
        }
      },

      clearImportResults: () => set({ importResults: [] }),
    }),
    {
      name: 'songshu-store-v1',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // 旧版解析器曾把银行行的"账户余额/摘要"误写入支付方式；迁移为银行名
        let migrated = false
        for (const t of state.transactions as Transaction[]) {
          const isBank = t.platform !== 'wechat' && t.platform !== 'alipay'
          if (isBank && t.payMethod !== platformName(t.platform)) {
            t.payMethod = platformName(t.platform)
            migrated = true
          }
        }
        void migrated
      },
      partialize: (s) => ({
        transactions: s.transactions,
        corrections: s.corrections,
        archiveMonths: s.archiveMonths,
        selectedMonth: s.selectedMonth,
        skippedLabelIds: s.skippedLabelIds,
        budgetMonthly: s.budgetMonthly,
      }),
    },
  ),
)

function aggregateFor(month: string, txs: Transaction[]): MonthlyAggregate {
  return aggregateMonth(month, processPipeline(txs, useStore.getState().corrections))
}

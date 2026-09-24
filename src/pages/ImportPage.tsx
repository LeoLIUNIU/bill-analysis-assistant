import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { navigate } from '../hooks/useHashRoute'
import { Card, SectionTitle } from '../components/ui'

export function ImportPage({ hasData }: { hasData: boolean }) {
  const importFiles = useStore((s) => s.importFiles)
  const loadDemo = useStore((s) => s.loadDemo)
  const results = useStore((s) => s.importResults)
  const clearResults = useStore((s) => s.clearImportResults)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    void importFiles(Array.from(list))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Hero */}
      <div className="pt-4 text-center">
        <div className="text-5xl">🐿️</div>
        <h1 className="mt-3 text-2xl font-bold text-ink">松鼠助手</h1>
        <p className="mt-2 text-ink-soft">
          上传微信 / 支付宝账单，看清钱从哪来、到哪去。
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">🔒 账单只在你的浏览器里解析，永不上传</span>
          <span className="rounded-full bg-orange-50 px-3 py-1 font-medium text-orange-700">🔁 转账还款不算收支，自动对冲</span>
          <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700">🐿️ 一键纠错，越用越准</span>
        </div>
      </div>

      {/* 上传区 */}
      <Card className="overflow-hidden">
        <div
          className={`flex flex-col items-center justify-center border-2 border-dashed p-10 transition-colors ${
            dragging ? 'border-squirrel-400 bg-squirrel-50' : 'border-stone-300 bg-white'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pickFiles(e.dataTransfer.files)
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          aria-label="上传账单文件"
        >
          <div className="text-4xl">📥</div>
          <p className="mt-3 font-medium text-ink">把账单 CSV / Excel 拖到这里，或点击选择文件</p>
          <p className="mt-1 text-xs text-ink-soft">支持微信、支付宝导出的"用于个人对账"文件（CSV / xlsx，可多选）· 文件不会离开你的设备</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            multiple
            className="hidden"
            onChange={(e) => {
              pickFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-stone-100 px-4 py-3 text-sm">
          <button
            onClick={() => { loadDemo(); navigate('report') }}
            className="rounded-lg bg-squirrel-500 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-squirrel-600"
          >
            🎮 一键体验（演示数据）
          </button>
          <a
            href="#guide-wechat"
            className="rounded-lg px-3 py-2 font-medium text-ink-soft transition-colors hover:bg-stone-100"
          >
            怎么导出账单？
          </a>
          {hasData && (
            <button
              onClick={() => navigate('report')}
              className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-emerald-600"
            >
              查看我的报表 →
            </button>
          )}
        </div>
      </Card>

      {/* 导入结果 */}
      {results.length > 0 && (
        <Card className="divide-y divide-stone-100">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span>{r.ok ? '✅' : '❌'}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
              {r.ok ? (
                <span className="shrink-0 text-ink-soft">
                  {r.platform} · {r.count ? `${r.count} 笔` : '已导入'}
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-right text-xs text-red-500">{r.error}</span>
              )}
            </div>
          ))}
          <div className="flex justify-end px-4 py-2">
            <button className="text-xs text-ink-soft hover:text-ink" onClick={clearResults}>关闭</button>
          </div>
        </Card>
      )}

      {/* 导出教程 */}
      <Card className="p-5">
        <SectionTitle emoji="📖" title="导出账单教程" desc="两个平台都只需操作一次，之后每月花两分钟就能更新。" />
        <GuideWeChat />
        <GuideAlipay />
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          💡 提示：账单文件是加密压缩包，解压密码会通过平台的"服务通知"下发。解压后得到 CSV 或 Excel(xlsx) 文件，再拖进上面的上传框（两种都支持）。
          邮件可能需要等待几分钟到 24 小时，属正常现象。
        </p>
      </Card>
    </div>
  )
}

function GuideWeChat() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-stone-200">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink hover:bg-stone-50"
        onClick={() => setOpen(!open)}
      >
        <span>💬 微信 · 账单导出步骤</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <ol className="list-decimal space-y-2 px-9 py-4 text-sm leading-relaxed text-ink-soft">
          <li>打开微信 → 右下角「我」→「服务」→「钱包」</li>
          <li>进入「账单」→ 右上角「常见问题」→「下载账单」</li>
          <li>选择用途「<b>用于个人对账</b>」（不要选"用于证明材料"）</li>
          <li>选择账单时间范围（首次建议导出一整年）→ 下一步</li>
          <li>填写你的邮箱地址，提交申请</li>
          <li>等待邮件（一般几分钟，最长 24 小时）；解压密码通过「微信支付」服务通知发送</li>
          <li>下载附件并解压，得到 CSV 文件，回到本页上传</li>
        </ol>
      )}
    </div>
  )
}

function GuideAlipay() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-stone-200">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink hover:bg-stone-50"
        onClick={() => setOpen(!open)}
      >
        <span>💙 支付宝 · 账单导出步骤</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <ol className="list-decimal space-y-2 px-9 py-4 text-sm leading-relaxed text-ink-soft">
          <li>打开支付宝 →「我的」→「账单」</li>
          <li>右上角「…」→「开具交易流水证明」</li>
          <li>选择「<b>用于个人对账</b>」</li>
          <li>选择时间范围（首次建议拉满可导出的最长时间）→ 填写邮箱 → 发送</li>
          <li>等待邮件；解压密码通过「支付宝」服务通知或申请记录页查看</li>
          <li>下载解压得到 CSV 文件，回到本页上传</li>
        </ol>
      )}
    </div>
  )
}

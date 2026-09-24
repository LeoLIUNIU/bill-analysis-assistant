import { useStore } from '../store/useStore'
import { Card, SectionTitle } from '../components/ui'

export function PrivacyPage() {
  const transactions = useStore((s) => s.transactions)
  const clearAll = useStore((s) => s.clearAll)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="pt-4 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="mt-3 text-2xl font-bold text-ink">隐私承诺</h1>
        <p className="mt-2 text-sm text-ink-soft">我们连账号都没有——只存你自愿留下的数据。</p>
      </div>

      <Card className="p-6">
        <SectionTitle emoji="🛡️" title="数据分层承诺" desc="每一层都写清楚存不存、存哪、怎么删。" />
        <div className="space-y-3 text-sm">
          <Tier
            emoji="🧾"
            title="原始账单（CSV 内容）"
            body="只在你浏览器的内存里解析，解析完不保留原始文件内容，永不发送到任何服务器。你甚至可以在浏览器开发者工具的 Network 面板里验证：除页面本身外没有任何网络请求。"
            tone="good"
          />
          <Tier
            emoji="📊"
            title="分析结果（流水、分类、报表）"
            body="保存在你本地浏览器的 localStorage 里，换浏览器/换设备不会自动跟随。可随时在报表页「导出存档」备份成 JSON 文件，在新设备「导入存档」恢复。"
            tone="good"
          />
          <Tier
            emoji="☁️"
            title="服务器存储"
            body="本站没有后端服务器，没有任何账号系统，没有数据库。不存在“拖库”泄露账单的可能——因为服务器上根本没有你的账单。"
            tone="good"
          />
          <Tier
            emoji="🍪"
            title="统计与追踪"
            body="无埋点、无 Cookie 追踪、无第三方统计脚本。"
            tone="good"
          />
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle emoji="🧹" title="你的数据，你说了算" />
        <div className="space-y-3 text-sm text-ink-soft">
          <p>
            当前浏览器里存有 <b className="text-ink">{transactions.length}</b> 笔流水（仅本地）。
          </p>
          <p>
            · 导出存档：在「收支报表」页点击「⬇️ 导出存档」，得到 JSON 文件自主保管。<br />
            · 彻底删除：点击下方按钮，立即清空本浏览器的全部数据，无需联系我们，也无法被我们找回。
          </p>
          <button
            onClick={clearAll}
            className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-100"
          >
            🗑️ 清空本浏览器的全部账单数据
          </button>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle emoji="📄" title="使用条款（简版）" />
        <p className="text-sm leading-relaxed text-ink-soft">
          松鼠助手是个人账单分析工具，分析结果仅供个人记账参考，不构成任何财务或投资建议。
          账单数据来源于你本人导出的文件，请在分享报告卡片时自行确认是否包含金额等敏感信息（金额隐藏版可一键切换）。
        </p>
      </Card>
    </div>
  )
}

function Tier({ emoji, title, body, tone }: { emoji: string; title: string; body: string; tone: 'good' | 'warn' }) {
  const colors =
    tone === 'good'
      ? { bg: '#f0fdf4', ring: '#bbf7d0', title: '#166534' }
      : { bg: '#fffbeb', ring: '#fde68a', title: '#92400e' }
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: colors.bg, boxShadow: `inset 0 0 0 1px ${colors.ring}` }}>
      <div className="font-semibold" style={{ color: colors.title }}>
        {emoji} {title}
      </div>
      <p className="mt-1.5 leading-relaxed text-ink-soft">{body}</p>
    </div>
  )
}

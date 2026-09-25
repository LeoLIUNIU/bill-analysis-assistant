import { useStore } from '../store/useStore'
import { Card } from '../components/ui'

export function PrivacyPage() {
  const transactions = useStore((s) => s.transactions)
  const clearAll = useStore((s) => s.clearAll)

  return (
    <div className="mx-auto max-w-2xl">
      {/* 页头 */}
      <div className="pb-2 pt-8 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">隐私承诺</h1>
        <p className="mt-2 text-sm text-ink-soft">我们连账号都没有——只存你自愿留在浏览器里的数据。</p>
      </div>

      <div className="space-y-5 pt-4">
        <Card className="p-6">
          <h2 className="text-base font-bold text-ink">🛡️ 数据分层承诺</h2>
          <p className="mt-1 text-xs text-ink-soft">每一层都写清楚存不存、存哪、怎么删。</p>
          <div className="mt-4 space-y-3 text-sm">
            <Tier
              emoji="🧾"
              title="原始账单（CSV / Excel 内容）"
              body="只在你浏览器的内存里解析，解析完即丢弃原始内容，永不发送到任何服务器。你可以在浏览器开发者工具的 Network 面板验证：除页面本身外没有任何携带账单数据的网络请求。"
              tone="good"
            />
            <Tier
              emoji="📊"
              title="分析结果（流水、分类、报表）"
              body="保存在你本地浏览器的 localStorage 里，换浏览器 / 换设备不会自动跟随。可随时在报表页「导出存档」备份成 JSON 文件，在新设备「导入存档」恢复。"
              tone="good"
            />
            <Tier
              emoji="☁️"
              title="服务器存储"
              body="本站没有后端服务器，没有账号系统，没有数据库。不存在被拖库泄露账单的可能——因为服务器上根本没有你的账单。"
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
          <h2 className="text-base font-bold text-ink">🧹 你的数据，你说了算</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
            <p>
              当前浏览器里存有 <b className="text-ink">{transactions.length}</b> 笔流水（仅本地）。
            </p>
            <p>
              · <b className="text-ink">导出存档</b>：在「账单分析」页点「💾 存档」，得到 JSON 文件自己保管。<br />
              · <b className="text-ink">彻底删除</b>：点下方按钮立即清空本浏览器全部数据，无需联系我们，也无法被我们找回。
            </p>
            <button
              onClick={clearAll}
              className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-100"
            >
              🗑️ 清空本浏览器的全部账单数据
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-ink">🌐 关于本站部署（GitHub Pages）</h2>
          <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-soft">
            <p>
              本站部署在 GitHub Pages 上，是一个<b className="text-ink">纯静态网站</b>：没有后端服务器，没有数据库，没有账号系统。
            </p>
            <p>
              · <b className="text-ink">你的账单绝对安全</b>：解析与分析全部在你的浏览器内存中完成，账单数据从头到尾没有、也不可能被发送到 GitHub 或任何第三方。你可以在浏览器开发者工具的 Network 面板验证。<br />
              · <b className="text-ink">网站地址是公开的</b>：任何知道网址的人都能打开这个工具网站本身（就像任何人都能打开一个在线计算器），但他们看到的只是空白的工具，<b className="text-ink">无法看到任何人的账单数据</b>。<br />
              · 分析结果只存在你自己浏览器的 localStorage 里，换设备不会跟随；可通过「存档」功能导出 JSON 自主保管。<br />
              · 全站强制 HTTPS，无 Cookie、无埋点、无第三方统计脚本。
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-ink">📄 使用条款（简版）</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            账单分析助手是纯本地运行的个人账单分析工具，分析结果仅供个人记账参考，不构成任何财务或投资建议。
            账单数据来源于你本人导出的文件；分享报告卡片前请自行确认是否包含敏感信息（卡片提供金额隐藏版）。
          </p>
        </Card>
      </div>
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

/** 金融APP目录：导入向导的选择项与各自的账单获取路径 */

export interface FinanceApp {
  key: string
  name: string
  /** 图标方块里的单字 */
  logoChar: string
  /** 品牌色（渐变起点） */
  color: string
  color2: string
  /** 是否已支持自动解析 */
  supported: boolean
  /** 获取账单的路径步骤 */
  steps: string[]
  note?: string
}

export const FINANCE_APPS: FinanceApp[] = [
  {
    key: 'wechat',
    name: '微信支付',
    logoChar: '微',
    color: '#07c160',
    color2: '#0a9d4f',
    supported: true,
    steps: [
      '微信 → 我 → 服务 → 钱包 → 账单',
      '右上角「常见问题」→「下载账单」',
      '用途选「用于个人对账」（别选证明材料）',
      '选时间范围（首次建议一整年）→ 填邮箱',
      '等邮件（几分钟~24小时），解压密码在「微信支付」服务通知里',
      '解压得到 CSV / Excel，回本页上传',
    ],
    note: '导出的是加密压缩包，先解压再上传',
  },
  {
    key: 'alipay',
    name: '支付宝',
    logoChar: '支',
    color: '#1677ff',
    color2: '#0e5fd8',
    supported: true,
    steps: [
      '支付宝 → 我的 → 账单',
      '右上角「…」→「开具交易流水证明」',
      '选「用于个人对账」',
      '选时间范围 → 填邮箱 → 发送',
      '解压密码在「支付宝」服务通知或申请记录里查看',
      '解压得到 CSV，回本页上传',
    ],
    note: '余额宝收益、转账、还款都会被正确对冲',
  },
  {
    key: 'unionpay',
    name: '云闪付',
    logoChar: '云',
    color: '#d71e1e',
    color2: '#a31515',
    supported: false,
    steps: [
      '云闪付APP → 我的 → 交易记录，可查名下银行卡消费',
      '云闪付目前不提供"个人对账"导出文件',
      '银行卡消费建议从各银行APP单独导出流水',
    ],
    note: '银行账单解析即将上线',
  },
  {
    key: 'jd',
    name: '京东金融',
    logoChar: '京',
    color: '#e1251b',
    color2: '#b01d16',
    supported: false,
    steps: [
      '京东金融APP → 我的 → 账单',
      '目前仅支持页面查看，暂无对账文件导出',
      '京东消费大多通过微信/支付宝/银行卡支付，可从支付渠道账单覆盖',
    ],
  },
  {
    key: 'cmb',
    name: '招商银行',
    logoChar: '招',
    color: '#c8102e',
    color2: '#9c0c24',
    supported: false,
    steps: [
      '招商银行APP → 我的 → 账单',
      '选择卡号与月份 → 申请电子账单发送至邮箱',
      '借记卡：我的 → 收支流水 可查询与邮件导出',
    ],
    note: '银行账单解析即将上线',
  },
  {
    key: 'citic',
    name: '中信银行',
    logoChar: '中',
    color: '#d31119',
    color2: '#a30e14',
    supported: false,
    steps: [
      '中信银行APP / 动卡空间 → 账单',
      '申请电子账单（邮件/PDF）',
      '信用卡交易明细可在APP内查询',
    ],
    note: '银行账单解析即将上线',
  },
  {
    key: 'icbc',
    name: '工商银行',
    logoChar: '工',
    color: '#c7000b',
    color2: '#9d0009',
    supported: false,
    steps: [
      '中国工商银行APP → 我的 → 账单流水',
      '可申请电子对账单发送至邮箱',
    ],
    note: '银行账单解析即将上线',
  },
  {
    key: 'ccb',
    name: '建设银行',
    logoChar: '建',
    color: '#0066b3',
    color2: '#00508c',
    supported: false,
    steps: [
      '建设银行APP → 查询 → 明细查询',
      '储蓄卡交易明细支持导出',
    ],
    note: '银行账单解析即将上线',
  },
  {
    key: 'abc',
    name: '农业银行',
    logoChar: '农',
    color: '#009944',
    color2: '#007a36',
    supported: false,
    steps: [
      '农业银行APP → 我的 → 账单',
      '交易明细可查询与导出',
    ],
    note: '银行账单解析即将上线',
  },
  {
    key: 'meituan',
    name: '美团',
    logoChar: '美',
    color: '#ffc300',
    color2: '#e0aa00',
    supported: false,
    steps: [
      '美团APP → 我的 → 钱包 → 账单',
      '目前仅支持页面查看',
      '美团支付大多扣款自微信/支付宝/银行卡，可从支付渠道账单覆盖',
    ],
  },
]

export function appOf(key: string): FinanceApp | undefined {
  return FINANCE_APPS.find((a) => a.key === key)
}

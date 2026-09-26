/** 金融APP目录：引导板块的选择项与各自的账单获取路径（2026年核实版本） */

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
  /** 覆盖默认徽章文案（如购物平台的"自动识别"） */
  badge?: string
}

const WECHAT: FinanceApp = {
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
}

const ALIPAY: FinanceApp = {
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
  note: '余额宝、转账、还款都会被自动对冲',
}

/**
 * 银行APP菜单版本繁多、路径常变，通用技巧：在APP首页搜索框搜「流水」「交易流水打印」「明细打印」。
 * 以下步骤为 2026 年核实的主流路径，搜不到时优先用搜索框。
 */
const BANKS: FinanceApp[] = [
  {
    key: 'icbc', name: '工商银行', logoChar: '工', color: '#c7000b', color2: '#9d0009',
    supported: true,
    steps: [
      '工商银行APP → 首页【账户】→【明细打印】',
      '选账号与起止时间 → 填邮箱 → 提交',
      '或在首页搜索框搜「历史明细打印」直达',
    ],
    note: '支持常见导出格式(CSV/Excel/PDF)，试运行',
  },
  {
    key: 'abc', name: '农业银行', logoChar: '农', color: '#009944', color2: '#007a36',
    supported: true,
    steps: [
      '农业银行APP → 首页【明细查询】',
      '右上角【导出】（部分版本为右上角「三个点」→ 数据导出）',
      '选时间跨度（如近半年）→ 填邮箱 → 接收',
    ],
    note: '支持常见导出格式，试运行',
  },
  {
    key: 'boc', name: '中国银行', logoChar: '中', color: '#d31119', color2: '#a30e14',
    supported: true,
    steps: [
      '中国银行APP → 首页搜索框搜「交易流水打印」',
      '选择账户与时间段 → 申请打印',
      '流水文件发送至邮箱，下载后回本页上传',
    ],
    note: '路径经用户验证；支持常见导出格式，试运行',
  },
  {
    key: 'ccb', name: '建设银行', logoChar: '建', color: '#0066b3', color2: '#00508c',
    supported: true,
    steps: [
      '建设银行APP → 首页搜索「交易流水打印」→ 立即申请',
      '或：【账户查询】→ 选账户 →【交易明细】→ 右上角【导出】',
      '选账户与时间段 → 填邮箱（PDF格式）',
    ],
    note: '支持常见导出格式，试运行',
  },
  {
    key: 'bocom', name: '交通银行', logoChar: '交', color: '#004b8d', color2: '#003a6e',
    supported: true,
    steps: [
      '交通银行APP → 首页 → 我的账户 →【明细清单】',
      '选「电子版」→ 选时间段 →【去开立】',
      '填邮箱接收电子流水清单；或搜索「交易明细」直达',
    ],
    note: '支持常见导出格式，试运行',
  },
  {
    key: 'psbc', name: '邮储银行', logoChar: '邮', color: '#007a33', color2: '#006128',
    supported: true,
    steps: [
      '邮储银行APP → 账户页 →【交易明细】→【申请流水】',
      '选时间段 → 填邮箱接收',
      '若APP内找不到，可到柜台/智能柜台办理电子流水',
    ],
    note: '支持常见导出格式，试运行',
  },
  {
    key: 'cmb', name: '招商银行', logoChar: '招', color: '#c8102e', color2: '#9c0c24',
    supported: true,
    steps: [
      '招商银行APP → 首页搜索「流水打印」→ 选电子版（直接下载PDF）',
      '或：我的 → 全部 → 便民 →【打印交易流水】',
      '可导出近五年活期明细发送至邮箱',
    ],
    note: 'CSV/Excel/PDF 均支持',
  },
  {
    key: 'citic', name: '中信银行', logoChar: '信', color: '#d31119', color2: '#a30e14',
    supported: true,
    steps: [
      '中信银行APP → 首页搜索「交易流水打印」→ 申请打印',
      '选账户与时间段 → 填邮箱接收（PDF）',
      '信用卡账单：动卡空间APP → 账单 → 电子账单',
    ],
    note: 'PDF账单已支持解析',
  },
  {
    key: 'pab', name: '平安银行', logoChar: '安', color: '#f26f21', color2: '#d55e18',
    supported: true,
    steps: [
      '平安口袋银行APP →【收支分析】→ 右上角「更多」→【打印流水】',
      '或在首页搜索「打印流水」直达',
      '选账户、日期、用途 → 电子版 → 填邮箱',
    ],
    note: '支持常见导出格式，试运行',
  },
]

/**
 * 购物/生活平台：多数不提供个人账单文件导出，但它们的消费都经微信/支付宝/银行卡支付，
 * 上传支付渠道账单后，本站按商户名自动识别平台归属并做消费分析。
 */
const SHOP_APPS: FinanceApp[] = [
  {
    key: 'jd', name: '京东', logoChar: '京', color: '#e1251b', color2: '#b01d16',
    supported: false,
    badge: '自动识别',
    steps: [
      '京东/京东金融APP → 我的 → 账单/白条，可查消费记录',
      '京东消费大多经微信/支付宝/银行卡支付',
      '上传支付渠道账单后，本站自动识别京东系消费并分析',
    ],
    note: '白条用户：京东金融APP可开具交易流水证明',
  },
  {
    key: 'taobao', name: '淘宝', logoChar: '淘', color: '#ff5000', color2: '#d94400',
    supported: false,
    badge: '自动识别',
    steps: [
      '淘宝购物默认通过支付宝付款，支付宝账单全覆盖',
      '淘宝APP → 我的 → 账单 → 账单服务 → 申请账单导出',
      '上传支付宝账单后，本站自动识别淘宝/天猫消费',
    ],
    note: '上传支付宝账单即可覆盖',
  },
  {
    key: 'pdd', name: '拼多多', logoChar: '拼', color: '#e02e24', color2: '#b8241d',
    supported: false,
    badge: '自动识别',
    steps: [
      '拼多多APP → 个人中心 → 我的订单，可查消费记录',
      '支付走微信/支付宝/多多钱包，无官方账单导出',
      '上传微信/支付宝账单后，本站自动识别拼多多消费',
    ],
    note: '多多钱包消费在银行账单中显示为渠道扣款',
  },
  {
    key: 'meituan', name: '美团', logoChar: '美', color: '#f59e0b', color2: '#d97706',
    supported: false,
    badge: '自动识别',
    steps: [
      '美团APP → 我的 → 钱包 → 账单，可查美团系消费',
      '支付多走微信/支付宝/银行卡，无官方账单导出',
      '上传支付渠道账单后，本站自动识别美团/外卖消费',
    ],
    note: '含美团外卖、到店、酒旅',
  },
]

export const FINANCE_APPS: FinanceApp[] = [WECHAT, ALIPAY, ...BANKS, ...SHOP_APPS]

export function appOf(key: string): FinanceApp | undefined {
  return FINANCE_APPS.find((a) => a.key === key)
}

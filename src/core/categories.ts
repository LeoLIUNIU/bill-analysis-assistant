import type { CategoryDef, Transaction } from './schema'

/** 支出分类 */
export const EXPENSE_CATEGORIES: CategoryDef[] = [
  { name: '餐饮美食', emoji: '🍜', color: '#f97316', kind: 'expense' },
  { name: '交通出行', emoji: '🚇', color: '#0ea5e9', kind: 'expense' },
  { name: '日常购物', emoji: '🛒', color: '#8b5cf6', kind: 'expense' },
  { name: '住房水电', emoji: '🏠', color: '#14b8a6', kind: 'expense' },
  { name: '居家生活', emoji: '🧺', color: '#10b981', kind: 'expense' },
  { name: '文娱休闲', emoji: '🎬', color: '#ec4899', kind: 'expense' },
  { name: '服饰美容', emoji: '👗', color: '#d946ef', kind: 'expense' },
  { name: '医疗健康', emoji: '💊', color: '#ef4444', kind: 'expense' },
  { name: '学习成长', emoji: '📚', color: '#6366f1', kind: 'expense' },
  { name: '通讯网络', emoji: '📱', color: '#06b6d4', kind: 'expense' },
  { name: '人情往来', emoji: '🎁', color: '#f43f5e', kind: 'expense' },
  { name: '宠物', emoji: '🐱', color: '#a16207', kind: 'expense' },
  { name: '旅行度假', emoji: '✈️', color: '#f59e0b', kind: 'expense' },
  { name: '其他支出', emoji: '📦', color: '#78716c', kind: 'expense' },
]

/** 收入分类 */
export const INCOME_CATEGORIES: CategoryDef[] = [
  { name: '工资薪水', emoji: '💰', color: '#22c55e', kind: 'income' },
  { name: '红包转账', emoji: '🧧', color: '#fb7185', kind: 'income' },
  { name: '理财收益', emoji: '📈', color: '#0d9488', kind: 'income' },
  { name: '退款', emoji: '↩️', color: '#84cc16', kind: 'income' },
  { name: '其他收入', emoji: '💵', color: '#a3a3a3', kind: 'income' },
]

/** 中性交易与被对冲掉的内部转账的展示分类 */
export const NEUTRAL_CATEGORY: CategoryDef = {
  name: '资金腾挪', emoji: '🔁', color: '#a8a29e', kind: 'expense',
}

export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, NEUTRAL_CATEGORY]

export function categoryDef(name: string): CategoryDef {
  return ALL_CATEGORIES.find((c) => c.name === name) ?? NEUTRAL_CATEGORY
}

/**
 * 关键词分类规则：按顺序第一个命中生效。
 * 具体规则（如"京东图书"→学习成长）必须排在宽泛规则（如"京东"→日常购物）之前。
 */
const EXPENSE_RULES: Array<{ cat: string; keywords: string[] }> = [
  { cat: '学习成长', keywords: ['图书', '书籍', '书店', '学费', '培训', '课程', '网校', '考试报名', '得到', '樊登', '知乎会员'] },
  { cat: '文娱休闲', keywords: ['电影', '猫眼', '淘票票', '游戏', 'steam', '网易云', 'qq音乐', '腾讯视频', '爱奇艺', '优酷', 'bilibili', '哔哩哔哩', 'ktv', '视频会员', '大会员', '景点', '游乐园', '密室', '剧本杀', '健身', '游泳', '球馆'] },
  { cat: '通讯网络', keywords: ['话费', '中国移动', '中国联通', '中国电信', '流量', '宽带', '充值中心'] },
  { cat: '住房水电', keywords: ['房租', '租房', '物业', '水费', '电费', '燃气', '供暖', '热力', '电费缴纳', '生活缴费'] },
  { cat: '餐饮美食', keywords: ['外卖', '美团', '饿了么', '麦当劳', '肯德基', '星巴克', '瑞幸', '咖啡', '奶茶', '餐厅', '饭店', '食堂', '小吃', '火锅', '烧烤', '面馆', '早餐', '夜宵', '甜品', '蛋糕', '烘焙', '零食', '卤味', '便当'] },
  { cat: '交通出行', keywords: ['滴滴', '高德打车', '打车', '出租车', '地铁', '公交', '乘车码', '12306', '铁路', '机票', '航空', '加油', '中石化', '中石油', '共享单车', '哈啰', '停车费', 'etc', '网约车'] },
  { cat: '医疗健康', keywords: ['医院', '药店', '药房', '药品', '体检', '挂号', '口腔', '牙科', '问诊', '丁香'] },
  { cat: '服饰美容', keywords: ['服饰', '女装', '男装', '化妆品', '口红', '护肤', '理发', '美发', '美甲', '美容', '优衣库', '屈臣氏', '丝芙兰'] },
  { cat: '宠物', keywords: ['宠物', '猫粮', '狗粮', '猫砂', '萌宠'] },
  { cat: '旅行度假', keywords: ['酒店', '民宿', '携程', '去哪儿', '飞猪', '门票', '度假', '订房', '民宿'] },
  { cat: '人情往来', keywords: ['红包', '礼物', '礼金', '亲属卡', '代付', '转账给'] },
  { cat: '居家生活', keywords: ['家政', '保洁', '洗衣', '维修', '快递', '顺丰', '菜鸟', '邮政', '搬家'] },
  { cat: '日常购物', keywords: ['淘宝', '天猫', '京东', '拼多多', '唯品会', '得物', '闲鱼', '超市', '便利店', '盒马', '山姆', '叮咚买菜', '数码', '手机'] },
]

const INCOME_RULES: Array<{ cat: string; keywords: string[] }> = [
  { cat: '退款', keywords: ['退款', '退票', '退款成功'] },
  { cat: '工资薪水', keywords: ['工资', '薪资', '劳务', '奖金', '报销', '津贴'] },
  { cat: '理财收益', keywords: ['收益发放', '余额宝-收益', '利息', '分红', '基金-收益'] },
  { cat: '红包转账', keywords: ['红包', '转账'] },
]

/** 支付宝"交易分类"列 → 本站分类 的别名表 */
const ALIPAY_CATEGORY_ALIAS: Record<string, string> = {
  餐饮美食: '餐饮美食',
  交通出行: '交通出行',
  服饰装扮: '服饰美容',
  美容美发: '服饰美容',
  生活服务: '居家生活',
  文化休闲: '文娱休闲',
  教育文化: '学习成长',
  医疗健康: '医疗健康',
  日用百货: '日常购物',
  充值: '通讯网络',
  通讯: '通讯网络',
  宠物: '宠物',
  住宿: '旅行度假',
  旅游度假: '旅行度假',
  人情往来: '人情往来',
  投资理财: '理财收益',
  工资: '工资薪水',
  转账: '红包转账',
  退款: '退款',
}

function matches(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((k) => lower.includes(k))
}

/**
 * 自动分类。
 * 优先级：支付宝自带交易分类（映射表）> 关键词规则 > 兜底。
 */
export function autoCategorize(tx: Transaction): string {
  const haystack = `${tx.type} ${tx.counterparty} ${tx.item} ${tx.payMethod}`

  if (tx.platform === 'alipay' && tx.type && ALIPAY_CATEGORY_ALIAS[tx.type]) {
    return ALIPAY_CATEGORY_ALIAS[tx.type]
  }

  const rules = tx.direction === 'in' ? INCOME_RULES : EXPENSE_RULES
  for (const rule of rules) {
    if (matches(haystack, rule.keywords)) return rule.cat
  }

  // 兜底：微信红包收入 / 无命中
  if (tx.direction === 'in') return '其他收入'
  return '其他支出'
}

/** 应用分类覆盖（用户在纠错队列/明细里的手改优先于一切自动结果） */
export function applyCategoryOverride(tx: Transaction, override?: string): string {
  return override ?? tx.category
}

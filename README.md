# 账单分析助手 📊

主打账单分析的纯本地工具网站：上传微信 / 支付宝账单（CSV / Excel），
自动完成转账对冲、智能分类、深度分析与洞察，一键下载分析报告、生成消费人格卡片。

**零后端**：没有服务器、没有账号、没有数据库。原始账单只在浏览器内存中解析，
分析结果仅保存在 localStorage，可导出 JSON 存档随身携带。

## 三大板块

1. **📥 引导**：金融APP选择向导——微信/支付宝/六大行/招商/中信/平安各自的账单导出路径指引；
   多文件累积上传 → 一键分析
2. **📊 账单分析**（主打功能）：
   - 总览：收支结余/环比、数据驱动的洞察卡片、支出构成环形图、资金流向桑基图、
     收入构成、支付方式分析、月度趋势
   - 花费分析：分类深析（可展开：商户构成/单笔结构/环比/解读）、固定支出识别（跨月）、
     周内规律、单笔金额分布、分类环比表
   - 交易记录：多条件筛选查询表（月份/平台/方向/性质/分类/搜索/排序）、
     待确认纠错队列、筛选结果 CSV 导出
   - 一键下载分析报告（自包含 HTML，可打印成 PDF）
3. **🐾 报告卡片**：动物消费人格（5维度推导8种动物）、金额可见/隐藏双版本、PNG 导出

## 账单分析的准确性设计

- 内部转账对冲：跨平台同额配对（如支付宝→微信零钱）、余额宝/零钱存取、
  花呗/信用卡还款均不计入收支；银行卡转账进钱包同理被识别
- 退款自动冲减；已撤销/关闭交易过滤
- 拿不准的交易进"待确认队列"让用户一键定性质，修正永久生效
- 重复导入自动去重；分类可手改且优先于自动结果

## 开发

```bash
npm install
npm run dev        # 本地开发（base 为 '/'，不受 GitHub Pages 子路径影响）
npm run build      # 生产构建（输出 dist/，base=/bill-analysis-assistant/）
npm run preview    # 预览生产构建
npx vitest run     # 核心引擎单元测试
```

## 部署到 GitHub Pages

1. 在 GitHub 创建名为 `bill-analysis-assistant` 的仓库，推送代码到 `main` 分支
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**
3. 推送后 `.github/workflows/deploy.yml` 自动构建发布，
   访问 `https://<用户名>.github.io/bill-analysis-assistant/`
4. 若仓库名不同，同步修改 `vite.config.ts` 里的 `repoName`

隐私：GitHub Pages 只托管静态文件；账单解析全程在用户浏览器完成，不会上传。

## 路线图

银行账单解析（六大行+招商/中信/平安）、截图识别、邮件月报、跨用户匿名基准。

## 目录结构

```
src/
  core/          纯函数引擎：解析/清洗/分类/对冲/洞察/深度分析/人格/报告/存档（含单测）
  store/         zustand + localStorage 持久化
  pages/         Guide引导 / Analysis分析（三tab）/ Card卡片 / Privacy隐私
  components/    通用 UI 与 ECharts 封装
  apps.ts        金融APP目录（含各APP取账单路径）
  demo/          内置演示账单（一键体验）
tests/           单元测试
```

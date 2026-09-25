import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// GitHub Pages 部署在 https://<user>.github.io/<repo>/ 子路径下，base 必须与仓库名一致。
// 本地开发（npm run dev）不受影响；若部署到自定义域名或 <user>.github.io 根路径，改为 '/'。
const repoName = 'bill-analysis-assistant'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES !== 'false' ? `/${repoName}/` : '/',
  plugins: [react(), tailwindcss()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
})

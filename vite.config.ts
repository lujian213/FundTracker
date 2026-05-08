import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: false,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  base: './', // Use relative paths for GitHub Pages compatibility
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React 核心
          if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler')) {
            return 'react-vendor';
          }
          // Markdown 渲染及其依赖
          if (id.includes('react-markdown') || id.includes('remark-gfm') ||
              id.includes('rehype-raw') || id.includes('unified') ||
              id.includes('remark') || id.includes('rehype') ||
              id.includes('micromark') || id.includes('mdast')) {
            return 'markdown';
          }
          // UI 组件库
          if (id.includes('react-day-picker') || id.includes('dompurify')) {
            return 'ui';
          }
          // 定时任务解析器
          if (id.includes('cron-parser')) {
            return 'cron-parser';
          }
          // OCR 库（懒加载）
          if (id.includes('tesseract.js') || id.includes('tesseract.js-core')) {
            return 'tesseract';
          }
          // AI 侧边栏组件、详情模态框及持仓分析模态框（合并为一个大 chunk，避免循环依赖）
          if (id.includes('AISidePanelBase') || id.includes('AIPortfolioAnalysisModal') ||
              id.includes('PositionsModal') || id.includes('InvestmentDraftModal') ||
              id.includes('FundAISidePanel') || id.includes('IndexAISidePanel') ||
              id.includes('FundDetailsModal') || id.includes('IndexDetailsModal')) {
            return 'ai-panels';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    fs: {
      // Allow serving files from node_modules for tesseract.js
      allow: ['..'],
    },
  }
});

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
          // AI 侧边栏组件（包含大量 markdown 渲染）
          if (id.includes('AISidePanelBase') || id.includes('AIPortfolioAnalysisModal')) {
            return 'ai-panels';
          }
          // 详情模态框（大组件）
          if (id.includes('FundDetailsModal') || id.includes('IndexDetailsModal')) {
            return 'detail-modals';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
  }
});

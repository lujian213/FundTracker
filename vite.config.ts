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
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心
          'react-vendor': ['react', 'react-dom'],
          // Markdown 渲染
          'markdown': ['react-markdown', 'remark-gfm'],
          // UI 组件
          'ui': ['react-day-picker', 'dompurify'],
          // 定时任务解析器
          'cron-parser': ['cron-parser'],
        },
      },
    },
  },
  server: {
    port: 3000,
  }
});

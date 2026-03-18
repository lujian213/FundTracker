import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
        },
      },
    },
  },
  server: {
    port: 3000,
  }
});

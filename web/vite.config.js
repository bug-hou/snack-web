import { defineConfig } from 'vite';

// 后端地址：本地开发默认指向 3000，可用 VITE_DEV_API_TARGET 覆盖
const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/uploads': { target: apiTarget, changeOrigin: true }
    }
  },
  build: { outDir: 'dist' }
});

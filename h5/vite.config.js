import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 后端地址：本地开发默认指向 3000，可用 VITE_DEV_API_TARGET 覆盖
const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:3000';

// 站点可能在子目录下托管，用相对路径打包更稳；路由本身是 hash 模式，不受影响
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/uploads': { target: apiTarget, changeOrigin: true }
    }
  },
  build: { outDir: 'dist', assetsDir: 'assets' }
});

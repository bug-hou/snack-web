import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 站点可能在子目录下托管，用相对路径打包更稳；路由本身是 hash 模式，不受影响
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets' }
});

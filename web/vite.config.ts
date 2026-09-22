import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' —— 线上是 GitHub Pages 子路径 /snapsaga-trip-prototype/web/，
// 绝对路径会让产物里的 /assets/*.js 404。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    // 产物要 commit 进仓库（Pages 从分支提供、没有 CI），关掉压缩变量名的可读性权衡另见 README
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
});

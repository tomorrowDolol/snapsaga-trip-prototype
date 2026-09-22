import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

/**
 * GitHub Pages 会从 `web/index.html` 提供 `…/web/`，而 Vite 的入口必须另有其名
 * （否则构建产物会把源入口覆盖掉）。所以：
 *   - Vite 源入口 = `web/app.html` → 产物 `dist/app.html`
 *   - `web/index.html` 由 `npm run build` 末尾的 `scripts/publish-entry.mjs` 生成
 *     （把产物里的 `./` 改写成 `./dist/`），和 `dist/` 一样是**要提交的构建产物**
 * 这样 `…/web/` 与 `…/web/dist/` 两个地址都能打开应用。
 */
export default defineConfig({
  // base './' —— 线上是子路径 /snapsaga-trip-prototype/web/dist/，绝对路径会让 /assets/*.js 404
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      // 开发时 `/` 依然直接打开应用（源入口叫 app.html 只是为了给 index.html 让路）
      name: 'snapsaga-dev-entry',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') req.url = '/app.html';
          next();
        });
      },
    },
  ],
  server: { open: '/app.html' },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: { input: { app: resolve(__dirname, 'app.html') } },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
});

/**
 * 生成 `web/index.html`（Pages 的 `…/web/` 需要它）。
 *
 * 为什么需要：Vite 的源入口叫 `app.html`（产物 `dist/app.html`），而 GitHub Pages 请求
 * `…/web/` 时只会找 `web/index.html`。这里把产物 HTML 里的相对引用整体加一层 `./dist/`，
 * 于是 `/web/` 与 `/web/dist/` 都能打开应用。
 *
 * ⚠️ 生成物要和 `dist/` 一起提交（Pages 从分支提供、没有 CI 构建）；**不要手改 `web/index.html`**。
 * 用法：npm run build 会自动调用（见 package.json）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const distHtmlPath = resolve(WEB, 'dist', 'app.html');
const outPath = resolve(WEB, 'index.html');

if (!existsSync(distHtmlPath)) {
  console.error('dist/app.html 不存在：先跑 vite build');
  process.exit(1);
}

const distHtml = readFileSync(distHtmlPath, 'utf8');
// 把所有 "./xxx" 引用改写为 "./dist/xxx"（已经是 ./dist/ 的不动）
const published = distHtml.replace(/(href|src)="\.\/(?!dist\/)/g, '$1="./dist/');

const banner = `<!-- ⚠️ 本文件由 npm run build 生成（web/scripts/publish-entry.mjs），不要手改。
     它的作用：GitHub Pages 请求 …/web/ 时只会找 web/index.html，而 Vite 产物在 web/dist/。
     改界面请改 web/app.html 与 web/src/**，然后重新 npm run build。 -->\n`;

writeFileSync(outPath, banner + published);
console.log(`写出 web/index.html（引用 dist/ 产物，${published.length} 字节）`);

// —— 同时把入口也放进 dist/ 本身 ——
// 为什么：manifest 的 start_url 是 "./"，而 manifest 位于 /web/dist/ 下，于是 iOS「添加到主屏幕」
// 后点图标打开的是 **/web/dist/**；那里只有 app.html、没有 index.html，Pages 直接 404。
// 补上 dist/index.html 后：① 已装到主屏的图标不用重新添加就能恢复；
// ② 装出来的应用落在 SW 作用域（/web/dist/）内，离线可用。
// dist/app.html 的引用本来就是相对 dist 的（./assets/...），所以原样再写一份即可。
const distOutPath = resolve(WEB, 'dist', 'index.html');
writeFileSync(
  distOutPath,
  '<!-- ⚠️ 由 npm run build 生成（web/scripts/publish-entry.mjs）：让 /web/dist/ 也能打开应用。\n' +
    '     原因：manifest 的 start_url="./" 解析到 /web/dist/，iOS 添加到主屏后打开的正是它。 -->\n' +
    distHtml,
);
console.log(`写出 web/dist/index.html（PWA start_url 落点，${distHtml.length} 字节）`);

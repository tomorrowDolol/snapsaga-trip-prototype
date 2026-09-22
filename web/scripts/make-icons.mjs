/**
 * 从 public/icon.svg 生成 PWA 需要的 PNG 图标（192 / 512 / apple-touch-icon 180）。
 * 一次性脚本，产物提交进仓库（Pages 从分支提供，没有 CI 构建）：
 *   node scripts/make-icons.mjs
 * 需要本机有 playwright（本地或全局）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPlaywright } from '../tools/playwright.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '..', 'public');

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const pw = await loadPlaywright();
if (!pw) {
  console.error('找不到 playwright，无法生成图标（npm i -g playwright 或本机安装后重试）');
  process.exit(1);
}

const svg = await readFile(resolve(PUBLIC, 'icon.svg'), 'utf8');
const browser = await pw.chromium.launch();
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace(
        '<svg ',
        `<svg width="${t.size}" height="${t.size}" `,
      )}</body></html>`,
    );
    const buf = await page.screenshot({ omitBackground: true });
    await writeFile(resolve(PUBLIC, t.file), buf);
    console.log(`写出 public/${t.file}（${t.size}×${t.size}, ${buf.length} 字节）`);
    await page.close();
  }
} finally {
  await browser.close();
}

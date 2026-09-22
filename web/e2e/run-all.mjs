/**
 * 统一 e2e 入口：依次跑五组验收脚本（真 Chromium + 真 IndexedDB，只 stub 相机与生图接口）。
 * 需要先 npm run build（脚本跑的是 dist 产物，不是 dev server）。
 *   node e2e/run-all.mjs
 * 对应根目录原型的四个验收脚本：ss_e2e.cjs / check_thumbs.cjs / check_capture.cjs / check_ai_base.cjs。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');

if (!existsSync(resolve(DIST, 'app.html'))) {
  console.error('dist/app.html 不存在：先跑 npm run build');
  process.exit(1);
}

const scripts = [
  ['主链路（快门不阻塞 / 并发 9 / 刷新恢复 / 失败重试 / 归档）', 'acceptance-main-chain.e2e.mjs'],
  ['主题模式（两种产出 / 边拍边收 / 多图上限 9 / 并发 9）', 'acceptance-theme-mode.e2e.mjs'],
  ['缩略图与增量渲染（13 项）', 'acceptance-thumbs.e2e.mjs'],
  ['拍照三环境与能力约束（15 项）', 'acceptance-capture.e2e.mjs'],
  ['AI 默认 Base 真浏览器生效（9 项）', 'acceptance-ai-base.e2e.mjs'],
];

const run = (file) =>
  new Promise((res) => {
    const p = spawn(process.execPath, [resolve(HERE, file)], { stdio: 'inherit' });
    p.on('exit', (code) => res(code ?? 1));
  });

let failed = 0;
for (const [label, file] of scripts) {
  console.log(`\n${'='.repeat(72)}\n=== ${label}  →  e2e/${file}\n${'='.repeat(72)}`);
  const code = await run(file);
  if (code !== 0) failed++;
}

console.log(`\n${'='.repeat(72)}`);
if (failed) {
  console.log(`e2e 结论: FAIL —— ${failed}/${scripts.length} 组未通过`);
  process.exit(1);
}
console.log(`e2e 结论: PASS —— ${scripts.length}/${scripts.length} 组全部通过`);

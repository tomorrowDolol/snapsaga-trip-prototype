#!/usr/bin/env node
/**
 * 组装要发布到 GitHub Pages 的站点目录（CI 与本地共用同一份逻辑，避免"线上形状和本地不一致"）。
 *
 * 为什么需要它：Pages 从仓库根提供时，站点形状 = 仓库形状；改成 GitHub Actions 发布后，
 * 站点形状 = 我们上传的产物形状。这个脚本把"什么该上线"写成代码：
 *   /                 → 根 index.html（单文件原型，冻结在 v0.6）
 *   /docs/ /tools/    → 文档与工具（含 ios-probe.html）
 *   /web/             → React 版：web/index.html（构建生成的入口）+ web/dist/**（构建产物）
 *
 * 用法: node scripts/assemble-site.mjs [输出目录，默认 _site]
 * 前置: 先在 web/ 里跑过 npm run build（CI 里由 workflow 负责）。
 */
import { cp, mkdir, rm, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(repoRoot, process.argv[2] || '_site');

const SKIP_DIRS = new Set(['.git', 'node_modules', '_site', '.cindy-worktrees', '.vite', '.zsh', '.DS_Store']);

/** 递归复制，按名字跳过依赖/缓存/输出目录 */
async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyTree(s, d);
    else if (entry.isSymbolicLink()) continue;           // 软链不入库/不上线
    else await cp(s, d);
  }
}

const must = [
  ['index.html', '根原型入口'],
  ['web/index.html', 'web 入口（由 npm run build 生成）'],
  ['web/dist/assets', 'web 构建产物'],
];
const missing = must.filter(([p]) => !existsSync(path.join(repoRoot, p))).map(([p, what]) => `${p}（${what}）`);
if (missing.length) {
  console.error('[assemble-site] 缺少必要文件，先跑 web/ 的 npm run build：\n  - ' + missing.join('\n  - '));
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await copyTree(repoRoot, outDir);

// 冒烟：产物里必须同时有原型入口和 web 入口
for (const p of ['index.html', 'web/index.html', 'web/dist/manifest.webmanifest', 'docs/iteration-log.md', 'tools/ios-probe.html']) {
  const st = await stat(path.join(outDir, p)).catch(() => null);
  if (!st) { console.error(`[assemble-site] 产物缺少 ${p}`); process.exit(1); }
}

const size = (await readdir(path.join(outDir, 'web/dist/assets'))).length;
console.log(`[assemble-site] 已组装 → ${outDir}`);
console.log(`[assemble-site] 含 根原型 index.html · web/ 入口 · web/dist/assets ${size} 个文件 · docs/ · tools/`);

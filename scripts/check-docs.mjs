#!/usr/bin/env node
/**
 * check-docs.mjs — 文档防腐烂检查（零依赖、秒级；CI 与本地跑同一份）
 *
 * 用法: node scripts/check-docs.mjs
 *
 * 检查项（任一失败 → 退出码 1）：
 *  1. 内部链接：所有 markdown 相对链接的目标文件存在，且 `#锚点` 在该文件的标题里存在
 *     （代码块内的链接与标题不算）
 *  2. K 编号：每个 `K<n>` 恰好被定义一次（表格行 `| K<n> |`），编号从 1 起连续无缺口；
 *     任何出现过的 K 编号都必须有定义处（含代码注释里的引用）
 *  3. 首屏与归档分工：docs/iteration-log.md「活跃已知问题」表里不得出现已解决/已过期/已缓解标记；
 *     docs/iteration-history.md 的 K 行必须带状态标记
 *  4. 文档地图：仓库里每个 *.md 都必须出现在 README.md 的「文档地图」表里
 *  5. 版本号：iteration-log 与 iteration-history 的版本小节集合一致；
 *     iteration-log 顶部 `<!-- check-docs: root-version=… web-version=… -->` 与
 *     index.html / web/src/components/AppHeader.tsx 页头的 `TRIP PROTOTYPE vX.Y` 一致
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '_site', 'dist', '.vite', '.cindy-worktrees', '.idea', '.vscode']);
const TEXT_EXT = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.yml', '.yaml', '.html']);

const REL = (p) => path.relative(repoRoot, p).split(path.sep).join('/');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const LOG = 'docs/iteration-log.md';
const HISTORY = 'docs/iteration-history.md';
const README = 'README.md';

const RESOLVED_MARK = /已解决|已过期|已缓解/;
const ACTIVE_HEADING = /^##\s+活跃已知问题/;
const DOC_MAP_HEADING = /^##\s+文档地图/;

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

/** 递归收集文件（跳过依赖/产物/站点输出目录；软链不跟进） */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** 去掉代码块（``` / ~~~）后的行，返回 [行号, 内容] —— 链接与标题检查都不看代码块 */
function nonFenceLines(text) {
  const out = [];
  let inFence = false;
  text.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence) out.push([i + 1, line]);
  });
  return out;
}

/** GitHub 风格的标题锚点（CJK 保留，标点去掉，空格转 -） */
function slugify(text) {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function headingSlugs(text) {
  const slugs = new Set();
  for (const [, line] of nonFenceLines(text)) {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) slugs.add(slugify(m[2]));
  }
  return slugs;
}

/** 取某个 `## 标题` 到下一个 `## ` 之间的内容 */
function section(text, headingRe) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

const allFiles = walk(repoRoot);
const mdFiles = allFiles.filter((f) => f.endsWith('.md'));
const textFiles = allFiles.filter((f) => TEXT_EXT.has(path.extname(f)));

// ── 1. 内部链接（含锚点）──────────────────────────────────────────────
const slugCache = new Map();
const slugsOf = (rel) => {
  if (!slugCache.has(rel)) slugCache.set(rel, headingSlugs(read(rel)));
  return slugCache.get(rel);
};

let linkCount = 0;
for (const file of mdFiles) {
  const rel = REL(file);
  for (const [lineNo, line] of nonFenceLines(readFileSync(file, 'utf8'))) {
    for (const m of line.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[2];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // 外链（http/mailto/…）
      linkCount++;
      const hashAt = target.indexOf('#');
      const rawPath = hashAt < 0 ? target : target.slice(0, hashAt);
      const anchor = hashAt < 0 ? '' : target.slice(hashAt + 1);
      const targetRel = rawPath
        ? REL(path.resolve(path.dirname(file), decodeURIComponent(rawPath)))
        : rel;
      const targetAbs = path.join(repoRoot, targetRel);
      if (rawPath && !existsSync(targetAbs)) {
        fail(`${rel}:${lineNo} 链接目标不存在 → ${target}（解析为 ${targetRel}）`);
        continue;
      }
      if (anchor && targetRel.endsWith('.md')) {
        if (!slugsOf(targetRel).has(slugify(decodeURIComponent(anchor)))) {
          fail(`${rel}:${lineNo} 锚点不存在 → ${target}（${targetRel} 里没有该标题）`);
        }
      }
    }
  }
}

// ── 2. K 编号：唯一、连续、有定义 ────────────────────────────────────
const kDefs = new Map(); // 'K1' -> [{ rel, line, text }]
const kRowsOfFile = new Map();
for (const file of mdFiles) {
  const rel = REL(file);
  for (const [lineNo, line] of nonFenceLines(readFileSync(file, 'utf8'))) {
    const m = /^\|\s*(K\d+)\s*\|/.exec(line);
    if (!m) continue;
    if (!kDefs.has(m[1])) kDefs.set(m[1], []);
    kDefs.get(m[1]).push({ rel, line: lineNo, text: line });
    kRowsOfFile.set(rel, (kRowsOfFile.get(rel) || 0) + 1);
  }
}
for (const [id, defs] of kDefs) {
  if (defs.length > 1) {
    const places = defs.map((d) => `${d.rel}:${d.line}`).join(' 与 ');
    fail(`${id} 被重复定义 ${defs.length} 次 → ${places}（同一编号全仓库只能有一处表格定义）`);
  }
}
const kIds = [...kDefs.keys()].map((id) => Number(id.slice(1))).sort((a, b) => a - b);
const maxK = kIds.length ? kIds[kIds.length - 1] : 0;
const expectedK = Array.from({ length: maxK }, (_, i) => i + 1);
const missingK = expectedK.filter((n) => !kIds.includes(n));
const extraK = kIds.filter((n) => n < 1 || n > maxK);
if (missingK.length) fail(`K 编号不连续：缺 K${missingK.join(' / K')}（编号是历史锚点，不许删号或跳号）`);
if (extraK.length) fail(`K 编号异常：K${extraK.join(' / K')}`);

const mentions = new Set();
for (const file of textFiles) {
  const rel = REL(file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bK\d{1,3}\b/g)) {
    mentions.add(m[0]);
    if (!kDefs.has(m[0])) {
      const lineNo = text.slice(0, m.index).split('\n').length;
      fail(`${rel}:${lineNo} 引用了没有定义的编号 ${m[0]}（要在 iteration-log 或 iteration-history 里定义，或删掉引用）`);
    }
  }
}

// ── 3. 首屏与归档分工 ───────────────────────────────────────────────
const logText = read(LOG);
const historyText = read(HISTORY);

const activeSection = section(logText, ACTIVE_HEADING);
if (!activeSection) fail(`${LOG} 缺少「## 活跃已知问题」小节`);
else {
  let rows = 0;
  let inActive = false;
  for (const [lineNo, line] of nonFenceLines(logText)) {
    if (/^##\s/.test(line)) inActive = ACTIVE_HEADING.test(line);
    else if (inActive && /^\|\s*K\d+\s*\|/.test(line)) {
      rows++;
      if (RESOLVED_MARK.test(line)) {
        fail(`${LOG}:${lineNo} 活跃问题表里含已解决/已过期/已缓解字样 → 应移到设计内取舍表或 ${HISTORY} 存档`);
      }
    }
  }
  if (!rows) fail(`${LOG} 活跃问题表没有任何 K 行`);
  if (!/^\|\s*#\s*\|/m.test(activeSection)) notes.push(`${LOG} 活跃问题表没找到表头`);
}
for (const [id, defs] of kDefs) {
  if (defs.length !== 1) continue;
  const { rel, line, text } = defs[0];
  if (rel === HISTORY && !RESOLVED_MARK.test(text)) {
    fail(`${HISTORY}:${line} ${id} 缺状态标记（已解决 / 已过期 / 已缓解）——归档表只收已收尾的条目`);
  }
}

// ── 4. 文档地图覆盖所有 markdown ────────────────────────────────────
const readmeText = read(README);
const mapSection = section(readmeText, DOC_MAP_HEADING);
if (!mapSection) fail(`${README} 缺少「## 文档地图」小节`);
else {
  const listed = new Set();
  for (const [, line] of nonFenceLines(mapSection)) {
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target) continue;
      listed.add(REL(path.resolve(repoRoot, target)));
    }
  }
  for (const file of mdFiles) {
    const rel = REL(file);
    if (!listed.has(rel)) fail(`${rel} 没有登记进 ${README} 的「文档地图」表`);
  }
}

// ── 5. 版本号一致性 ─────────────────────────────────────────────────
const versionsOf = (text) => new Set([...text.matchAll(/^#{2,3}\s+v(\d+\.\d+)\b/gm)].map((m) => m[1]));
const logVersions = versionsOf(logText);
const histVersions = versionsOf(historyText);
const onlyLog = [...logVersions].filter((v) => !histVersions.has(v));
const onlyHist = [...histVersions].filter((v) => !logVersions.has(v));
if (onlyLog.length) fail(`${LOG} 有版本摘要但 ${HISTORY} 没有对应小节：v${onlyLog.join(' / v')}`);
if (onlyHist.length) fail(`${HISTORY} 有版本小节但 ${LOG} 没有摘要：v${onlyHist.join(' / v')}`);
if (!logVersions.size) fail(`${LOG} 没有找到任何「## vX.Y」版本小节`);

const marker = /check-docs:\s*root-version=(v\d+\.\d+)\s+web-version=(v\d+\.\d+)/.exec(logText);
if (!marker) {
  fail(`${LOG} 缺少版本标记注释：<!-- check-docs: root-version=vX.Y web-version=vX.Y -->`);
} else {
  const [, rootClaim, webClaim] = marker;
  const rootHead = /TRIP PROTOTYPE (v\d+\.\d+)/.exec(read('index.html'));
  const webHead = /TRIP PROTOTYPE (v\d+\.\d+)/.exec(read('web/src/components/AppHeader.tsx'));
  if (!rootHead) fail('index.html 页头找不到 `TRIP PROTOTYPE vX.Y`');
  else if (rootHead[1] !== rootClaim) fail(`版本不一致：index.html 是 ${rootHead[1]}，${LOG} 标记为 ${rootClaim}`);
  if (!webHead) fail('web/src/components/AppHeader.tsx 页头找不到 `TRIP PROTOTYPE vX.Y`');
  else if (webHead[1] !== webClaim) fail(`版本不一致：AppHeader.tsx 是 ${webHead[1]}，${LOG} 标记为 ${webClaim}`);
  for (const [name, v] of [['root-version', rootClaim], ['web-version', webClaim]]) {
    if (!logVersions.has(v.slice(1))) fail(`${LOG} 的 ${name} ${v} 在版本摘要里没有对应小节`);
  }
}

// ── 输出 ───────────────────────────────────────────────────────────
console.log(`[check-docs] 扫描 ${mdFiles.length} 个 markdown / ${linkCount} 条内部链接 / ` +
  `K1–K${maxK}（${kDefs.size} 个编号，${mentions.size} 个被引用）/ ` +
  `版本 v${[...logVersions].sort().join(' v')}`);
for (const n of notes) console.log(`[check-docs] 提示：${n}`);
if (failures.length) {
  console.error(`\n[check-docs] ✗ ${failures.length} 处问题：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[check-docs] ✓ 全部通过（链接 / K 编号 / 首屏归档分工 / 文档地图 / 版本号）');

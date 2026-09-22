/**
 * 解析 playwright（本地 node_modules 优先，其次全局安装）。
 * 不把 playwright 放进 dependencies：它的浏览器包很大，且本机/CI 通常已全局装好。
 * 拿不到就返回 null，调用方决定是跳过还是失败。
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [];
  try {
    candidates.push(require.resolve('playwright'));
  } catch {
    /* 本地没装，试全局 */
  }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (root) candidates.push(`${root}/playwright/index.js`);
  } catch {
    /* 拿不到全局路径就算了 */
  }
  for (const c of candidates) {
    try {
      const m = await import(pathToFileURL(c).href);
      const pw = m.default ?? m;
      if (pw?.chromium) return pw;
    } catch {
      /* 换下一个候选 */
    }
  }
  return null;
}

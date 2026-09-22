/**
 * AI 生图默认 Base 验收（真浏览器 + 真 localStorage）。
 * 来源：snapsaga_queue_check/check_ai_base.cjs —— 断言逐条保留，只换成仓库内实现并对准 React 构建产物。
 *
 * 唯一一处适配：原脚本靠 `document.documentElement.innerHTML` 数 openai.com 出现次数（原型把源码内联在
 * HTML 里）。React 版的源码在构建产物 JS 里，所以这里把「页面 HTML + 所有 script[src] 的文本」一起数，
 * 断言仍是「只有 1 处、且界面里 0 处」—— 没有放松。
 * 跑法：npm run build && node e2e/acceptance-ai-base.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const PORT = Number(process.env.SS_AIBASE_PORT || 8198);
const EXPECT = 'https://api.klong.lat/v1';

let fails = [];
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = await loadPlaywright();
if (!pw) {
  console.error('找不到 playwright');
  process.exit(1);
}
const server = await serveDir(DIST, PORT);
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
const url = `${server.url}/app.html`;

try {
  console.log('\n[1] 全新用户（localStorage 全空）');
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(500);
  const fresh = await page.evaluate(() => {
    openSettings();
    return {
      credsBase: aiCreds().base,
      inputValue: document.querySelector('#aiBase').value,
      placeholder: document.querySelector('#aiBase').placeholder,
      model: aiCreds().model,
    };
  });
  check('aiCreds().base 就是新默认（生图请求会用它）', fresh.credsBase === EXPECT, fresh.credsBase);
  check('设置框预填值 = 新默认', fresh.inputValue === EXPECT, fresh.inputValue);
  check('占位文案不再指向 openai', !/openai/i.test(fresh.placeholder), fresh.placeholder);
  check('model 默认 gpt-image-2', fresh.model === 'gpt-image-2', fresh.model);
  const openaiHits = await page.evaluate(async () => {
    const dom = document.documentElement.innerHTML;
    let bundle = '';
    for (const s of [...document.querySelectorAll('script[src]')]) {
      try {
        bundle += await (await fetch(s.src)).text();
      } catch {
        /* 拿不到就算了 */
      }
    }
    return {
      dom: (dom.match(/api\.openai\.com/g) || []).length,
      total: ((dom + bundle).match(/api\.openai\.com\/v1/g) || []).length,
    };
  });
  check(
    'openai 只剩迁移用常量一处（界面 HTML 里 0 处、产物里 1 处）',
    openaiHits.dom === 0 && openaiHits.total === 1,
    JSON.stringify(openaiHits),
  );

  console.log('\n[2] 只填了 Key（没碰 Base）→ 应视为已配置');
  await page.evaluate(() => localStorage.setItem('ss_ai_key', 'sk-demo'));
  await page.reload();
  await sleep(400);
  const onlyKey = await page.evaluate(() => ({ base: aiCreds().base, key: aiCreds().key }));
  check('未填 Base 时 base 仍非空', !!onlyKey.base, onlyKey.base);
  check('base = 新默认', onlyKey.base === EXPECT, onlyKey.base);

  console.log('\n[3] 旧默认（有人沿用 openai 存过）应自动切到新默认');
  await page.evaluate(() => localStorage.setItem('ss_ai_base', 'https://api.openai.com/v1'));
  await page.reload();
  await sleep(400);
  const legacy = await page.evaluate(() => aiCreds().base);
  check('old default → 新默认', legacy === EXPECT, legacy);

  console.log('\n[4] 用户显式配了自定义 Base → 必须尊重，不覆盖');
  await page.evaluate(() => localStorage.setItem('ss_ai_base', 'https://my.gateway.example/v1/'));
  await page.reload();
  await sleep(400);
  const custom = await page.evaluate(() => aiCreds().base);
  check('自定义 base 保留且去掉尾部斜杠', custom === 'https://my.gateway.example/v1', custom);

  console.log('\n[5] 生图请求实际打到哪个地址');
  const reqUrl = await page.evaluate(async () => {
    localStorage.setItem('ss_ai_key', 'sk-demo');
    localStorage.removeItem('ss_ai_base');
    let seen = null;
    const orig = window.fetch;
    window.fetch = (u, o) => {
      seen = String(u);
      return Promise.reject(new Error('stub stop'));
    };
    try {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await aiRedrawCore(blob, null, 0.7);
    } catch {
      /* 预期在 stub 处中断 */
    }
    window.fetch = orig;
    return seen;
  });
  check('请求 URL = <新默认>/images/edits', reqUrl === EXPECT + '/images/edits', String(reqUrl));
} catch (e) {
  console.log('  [异常]', e.message);
  fails.push('脚本异常: ' + e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n结论: ${fails.length ? 'FAIL ' + fails.join(' / ') : 'PASS 全部通过'}`);
process.exit(fails.length ? 1 : 0);

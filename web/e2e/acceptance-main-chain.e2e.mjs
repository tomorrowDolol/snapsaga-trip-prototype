/**
 * 端到端主链路验收（真 Chromium + 真 IndexedDB；只把「相机」与「AI 生图接口」换成 stub）。
 *
 * 来源：/tmp/ss_e2e.cjs（根目录原型的 33 项验收脚本）——断言逐条保留、未放松，只把
 * 「python3 静态服务 + require 全局 playwright」换成仓库内零依赖实现，并对准 React 构建产物
 * （web/dist）。相机与 AI 接口的 stub 方式与原脚本一致。
 *
 * 覆盖：快门不阻塞 / 队列并发 9 + 排队 / 刷新恢复续跑 / 失败重试 / 归档 AI 相册 / objectURL 有界 / 清空数据。
 *
 * v0.8 唯一的结构性改动：并发上限按设计稿从 4 改为 9（队列、guard、文档同步改），
 * 所以 [1] 的连拍数从 6 提到 10（10 张才能观察到「9 个在跑 + 1 个排队」）。断言本身没有放松。
 * 跑法：npm run build && node e2e/acceptance-main-chain.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');

const PORT = Number(process.env.SS_E2E_PORT || 8199);
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=';

let failures = [];
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures.push(name);
};

/** 页面初始化脚本：相机 stub + AI 生图接口 stub + objectURL 计数（与原脚本相同） */
const init = () => {
  // ---- 相机 stub：canvas 动画流 ----
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext('2d');
  let t = 0;
  setInterval(() => {
    t++;
    ctx.fillStyle = `hsl(${(t * 7) % 360},70%,50%)`;
    ctx.fillRect(0, 0, 640, 480);
  }, 40);
  const stream = c.captureStream(10);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => stream, enumerateDevices: async () => [] },
  });

  // ---- AI 生图接口 stub（只拦 images/edits）----
  const TINY = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=';
  const jsonError = (status, msg) =>
    new Response(JSON.stringify({ error: { message: msg } }), { status, headers: { 'content-type': 'application/json' } });

  window.__genDelay = Number(localStorage.getItem('ss_e2e_delay') || 300);
  window.__failMode = 'ok'; // 'ok' | 'failOnce' | 'failAll'
  window.__aiCalls = 0;
  window.__aiConcurrent = 0;
  window.__aiPeak = 0;
  const orig = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/images/edits')) {
      window.__aiCalls++;
      window.__aiConcurrent++;
      window.__aiPeak = Math.max(window.__aiPeak, window.__aiConcurrent);
      await new Promise((r) => setTimeout(r, window.__genDelay));
      window.__aiConcurrent--;
      if (window.__failMode === 'failAll') return jsonError(500, 'stub: 服务端 500');
      if (window.__failMode === 'failOnce') {
        window.__failMode = 'ok';
        return jsonError(500, 'stub: 服务端 500');
      }
      return new Response(JSON.stringify({ data: [{ b64_json: TINY }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return orig(url, opts);
  };
  window.__failNext = () => {
    window.__failMode = 'failOnce';
  };

  // ---- objectURL 计数 ----
  const _c = URL.createObjectURL.bind(URL);
  const _r = URL.revokeObjectURL.bind(URL);
  window.__urlStats = { created: 0, revoked: 0 };
  window.__urlTag = new Map();
  window.__blobErr = [];
  URL.createObjectURL = (b) => {
    window.__urlStats.created++;
    const u = _c(b);
    try {
      const st = (new Error().stack || '').split('\n').slice(2, 4).join(' <- ').replace(/https?:\/\/[^ )]+/g, '').trim();
      window.__urlTag.set(u, st);
    } catch {
      /* 拿不到栈就算了 */
    }
    return u;
  };
  URL.revokeObjectURL = (u) => {
    window.__urlStats.revoked++;
    return _r(u);
  };
  window.addEventListener(
    'error',
    (e) => {
      const el = e.target;
      if (el && el.tagName === 'IMG') {
        const src = el.currentSrc || el.src || '';
        window.__blobErr.push({ stillInDom: document.contains(el), tag: window.__urlTag.get(src) || '?' });
      }
    },
    true,
  );

  // ---- 预先填好 AI 配置（只进 localStorage，不入库）----
  localStorage.setItem('ss_ai_base', 'http://127.0.0.1:9/v1');
  localStorage.setItem('ss_ai_key', 'sk-stub');
  localStorage.setItem('ss_ai_model', 'gpt-image-2');
};

const pw = await loadPlaywright();
if (!pw) {
  console.error('找不到 playwright（本机或全局安装后重试）');
  process.exit(1);
}

const server = await serveDir(DIST, PORT);
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
page.on('pageerror', (e) => {
  console.log('  [pageerror] ' + e.message);
  failures.push('pageerror: ' + e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error] ' + m.text());
});
await page.addInitScript(init);

const URL_APP = `${server.url}/app.html`;
const shot = async (n = 1, gap = 120) => {
  for (let i = 0; i < n; i++) {
    await page.click('#shutter');
    await page.waitForTimeout(gap);
  }
};
const badge = () => page.$eval('#queueBadge', (e) => e.textContent);
const cells = (sel) => page.$$eval(sel, (els) => els.length);
const items = () =>
  page.$$eval('#queueList .q-item', (els) =>
    els.map((e) => ({ status: e.className.replace('q-item ', ''), text: e.innerText.replace(/\n+/g, ' | ') })),
  );
const closePanel = () => page.evaluate(() => document.querySelector('#queueMask').click());

try {
  await page.goto(URL_APP);
  await page.waitForTimeout(400);

  console.log('[0] 页面加载 + 相机 stub');
  const verText = await page.$eval('header .sub', (e) => e.textContent);
  // 按 major/minor 两个数比，不用 parseFloat：v0.10 会被 parseFloat 读成 0.1（比 v0.2 还小）
  const verMatch = verText.match(/v(\d+)\.(\d+)/) || [0, '0', '0'];
  const afterV01 = Number(verMatch[1]) > 0 || Number(verMatch[2]) >= 2;
  check('版本号已升过 v0.1（不写死具体版本）', afterV01, verText);
  await page.click('#startCam');
  await page.waitForFunction(() => document.querySelector('#video').videoWidth > 0, null, { timeout: 8000 });
  check('相机 stub 就绪（videoWidth > 0）', true, 'videoWidth=' + (await page.$eval('#video', (v) => v.videoWidth)));

  console.log('\n[1] 快门不被生图阻塞 + 队列并发上限 9');
  await page.evaluate(() => {
    window.__genDelay = 4000;
    localStorage.setItem('ss_e2e_delay', '4000');
  }); // 让生图「很慢」，观察排队
  const tClick = await page.evaluate(() => {
    const t = performance.now();
    document.querySelector('#shutter').click();
    return performance.now() - t;
  });
  check('点击快门同步返回（不 await AI）', tClick < 50, `${tClick.toFixed(1)} ms`);
  await page.waitForTimeout(250);
  await shot(9, 150); // 1 + 9 = 10 张：第 10 个任务起排队（并发上限 9）
  await page.waitForTimeout(600);
  await page.click('#btnQueue');
  await page.waitForTimeout(200);
  const snap = await items();
  const running = snap.filter((x) => x.status === 'running').length;
  const queued = snap.filter((x) => x.status === 'queued').length;
  check('胶卷已有 10 张原片', (await cells('#filmGrid .film-cell')) === 10, `实际 ${await cells('#filmGrid .film-cell')}`);
  check('队列面板列出 10 条任务', snap.length === 10, `实际 ${snap.length}`);
  check('同时生成中 = 9（并发上限）', running === 9, `running=${running}`);
  check('其余 1 条在排队（第 10 个任务起排队）', queued === 1, `queued=${queued}`);
  // 徽标按设计稿封顶到「9+」（>9 就不再显示具体数字），待处理数量的真值看队列本身
  check('徽标显示 9+（待处理 10 超过徽标封顶口径）', (await badge()) === '9+', await badge());
  check('页面侧 AI 并发峰值 = 9', (await page.evaluate(() => window.__aiPeak)) === 9, 'peak=' + (await page.evaluate(() => window.__aiPeak)));
  check(
    '排队条目显示队列位次',
    snap.some((x) => x.text.includes('第 1 位')),
    snap.filter((x) => x.status === 'queued').map((x) => x.text).join(' / '),
  );
  check('暗房显影槽占满 9 个（并发上限 9）', (await cells('#slots .sl.busy')) === 9, `实际 ${await cells('#slots .sl.busy')}`);
  check('胶卷里没有 AI 结果（AI 独立归档）', (await cells('#albumGrid .film-cell')) === 0);

  await page.evaluate(() => {
    window.__genDelay = 30;
    localStorage.setItem('ss_e2e_delay', '30');
  }); // 放快，等全部完成
  await page.waitForFunction(
    () => !document.querySelector('#queueList .q-item.running') && !document.querySelector('#queueList .q-item.queued'),
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(300);
  const after = await items();
  check('10 条任务全部完成', after.filter((x) => x.status === 'done').length === 10, after.map((x) => x.status).join(','));
  check('徽标隐藏（无待处理）', (await page.evaluate(() => document.querySelector('#queueBadge').classList.contains('show'))) === false);
  await closePanel();
  await page.click('nav.bottom button[data-v="album"]');
  await page.waitForTimeout(300);
  check('AI 相册归档 10 张', (await cells('#albumGrid .film-cell')) === 10, `实际 ${await cells('#albumGrid .film-cell')}`);
  check('胶卷仍是 10 张原片（没有被 AI 结果污染）', (await cells('#filmGrid .film-cell')) === 10, `实际 ${await cells('#filmGrid .film-cell')}`);
  check('AI 调用次数 = 10（没有重复生成）', (await page.evaluate(() => window.__aiCalls)) === 10, 'calls=' + (await page.evaluate(() => window.__aiCalls)));

  console.log('\n[2] 相册查看 + 大图');
  await page.click('#albumGrid .film-cell');
  await page.waitForTimeout(300);
  check(
    '点开大图（lightbox 可见且有图）',
    (await page.evaluate(() => document.querySelector('#lightbox').classList.contains('show'))) &&
      (await page.$eval('#lbImg', (i) => i.src.startsWith('blob:'))),
  );
  await page.click('#lbClose');

  console.log('\n[3] 队列持久化：刷新后自动续跑');
  await page.click('nav.bottom button[data-v="cam"]');
  await page.evaluate(() => {
    window.__genDelay = 8000;
    localStorage.setItem('ss_e2e_delay', '8000');
  });
  await shot(3, 200);
  await page.waitForTimeout(500);
  check('刷新前徽标 = 3', (await badge()) === '3', await badge());
  const failedUrls = [];
  page.on('requestfailed', (r) =>
    failedUrls.push(`${r.resourceType()} ${r.url().slice(0, 30)} ${(r.failure() && r.failure().errorText) || ''}`),
  );
  await page.reload();
  await page.waitForTimeout(700);
  await page.click('#startCam');
  await page.waitForFunction(() => document.querySelector('#video').videoWidth > 0, null, { timeout: 8000 });
  await page.click('#btnQueue');
  await page.waitForTimeout(200);
  const restored = await items();
  const restoredDone = restored.filter((x) => x.status === 'done').length;
  const restoredPending = restored.filter((x) => x.status === 'running' || x.status === 'queued').length;
  check(
    '刷新后从未完成的任务里恢复出 3 条（历史 10 条 done 也在列表里）',
    restoredPending === 3 && restoredDone === 10,
    `pending=${restoredPending} done=${restoredDone} 共 ${restored.length}`,
  );
  check('恢复的任务自动继续调度（3 个都在跑）', restored.filter((x) => x.status === 'running').length === 3, restored.map((x) => x.status).join(','));
  check('恢复后徽标 = 3', (await badge()) === '3', await badge());
  await page.evaluate(() => {
    window.__genDelay = 30;
    localStorage.setItem('ss_e2e_delay', '30');
  });
  await page.waitForFunction(
    () => !document.querySelector('#queueList .q-item.running') && !document.querySelector('#queueList .q-item.queued'),
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('#btnQueueToAlbum').click();
  });
  await page.waitForTimeout(300);
  check('恢复的任务全部完成并归档（相册 10 → 13）', (await cells('#albumGrid .film-cell')) === 13, `相册 ${await cells('#albumGrid .film-cell')}`);
  check('刷新没有让原片丢失（胶卷 10 → 13）', (await cells('#filmGrid .film-cell')) === 13, `实际 ${await cells('#filmGrid .film-cell')}`);

  console.log('\n[4] 失败不卡队列 + 单独重试');
  await page.click('nav.bottom button[data-v="cam"]');
  await page.evaluate(() => {
    window.__failNext();
    window.__genDelay = 30;
    localStorage.setItem('ss_e2e_delay', '30');
  });
  await shot(2, 250);
  await page.waitForTimeout(2500);
  await page.click('#btnQueue');
  await page.waitForTimeout(250);
  const failItems = await items();
  const bad = failItems.filter((x) => x.status === 'failed');
  console.log('    队列条目状态: ' + failItems.map((x) => x.status).join(','));
  check('失败的任务标成 failed 且不阻塞同批其它任务', bad.length === 1, `failed=${bad.length} done=${failItems.filter((x) => x.status === 'done').length}`);
  check('失败原因可读（显示在面板里）', !!bad[0] && /服务端 500/.test(bad[0].text), bad[0] ? bad[0].text : 'n/a');
  check('失败任务有「重试」按钮', (await page.$('#queueList [data-retry]')) !== null);
  const albumBefore = await page.evaluate(() => document.querySelectorAll('#albumGrid .film-cell').length);
  await page.click('#queueList [data-retry]');
  await page.waitForFunction(
    () =>
      !document.querySelector('#queueList .q-item.failed') &&
      !document.querySelector('#queueList .q-item.running') &&
      !document.querySelector('#queueList .q-item.queued'),
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
  await closePanel();
  await page.click('nav.bottom button[data-v="album"]');
  await page.waitForTimeout(300);
  check('重试后成功归档（相册 +1）', (await cells('#albumGrid .film-cell')) === albumBefore + 1, `${albumBefore} → ${await cells('#albumGrid .film-cell')}`);

  console.log('\n[5] objectURL 生命周期：挂载期间持有、卸载即回收，重渲染不抖动');
  const u0 = await page.evaluate(() => window.__urlStats);
  for (let i = 0; i < 12; i++) {
    await page.click('#btnQueue');
    await page.waitForTimeout(60);
    await closePanel();
    await page.waitForTimeout(60);
    await page.click('nav.bottom button[data-v="album"]');
    await page.waitForTimeout(60);
    await page.click('nav.bottom button[data-v="film"]');
    await page.waitForTimeout(60);
  }
  const u1 = await page.evaluate(() => window.__urlStats);
  const delta = u1.created - u1.revoked;
  // 活跃 URL 应当被「当前挂载着的图片元素数」兜住：多出来的就是没回收的。
  // （阈值改成这个不变量比写死 60 更严：界面同时挂载的图变多时，写死数字会误报。）
  const mounted = await page.evaluate(
    () => [...document.querySelectorAll('img')].filter((i) => (i.src || '').startsWith('blob:')).length,
  );
  check(
    '活跃 objectURL 不超过挂载中的图片数（没有随重渲染累积）',
    delta <= mounted + 5,
    `created=${u1.created} revoked=${u1.revoked} 活跃 ${delta} / 挂载图片 ${mounted}`,
  );
  // 原型用「批次换 URL」策略，所以 revoke 次数会接近 create；React 版把 URL 生命周期绑到元素上
  // （挂载期间复用同一个 URL，卸载才 revoke），因此这里改断言底层不变量：重渲染不制造 URL 抖动。
  check(
    '反复重渲染不制造 objectURL 抖动（created 增量 ≤ 10）',
    u1.created - u0.created <= 10,
    `created ${u0.created} → ${u1.created}（+${u1.created - u0.created}）`,
  );
  // 卸载即回收：删掉一张 AI 生图，它那一格的 URL 必须被 revoke，且活跃数不增长
  const urlBefore = await page.evaluate(() => ({ ...window.__urlStats }));
  const activeBefore = urlBefore.created - urlBefore.revoked;
  await page.click('nav.bottom button[data-v="album"]');
  await page.waitForTimeout(200);
  await page.click('#albumGrid .film-cell');
  await page.waitForTimeout(200);
  page.once('dialog', (d) => d.accept());
  await page.click('#lbDel');
  await page.waitForTimeout(400);
  const urlAfter = await page.evaluate(() => ({ ...window.__urlStats }));
  check('元素卸载（删除一张图）即回收它的 objectURL', urlAfter.revoked > urlBefore.revoked, `revoked ${urlBefore.revoked} → ${urlAfter.revoked}`);
  check(
    '卸载后活跃 objectURL 数量不增长',
    urlAfter.created - urlAfter.revoked <= activeBefore,
    `活跃 ${activeBefore} → ${urlAfter.created - urlAfter.revoked}`,
  );

  console.log('\n[6] 「清空全部数据」后队列与相册一起清掉');
  await page.click('#btnSettings');
  page.once('dialog', (d) => d.accept());
  await page.click('#btnWipe');
  await page.waitForTimeout(500);
  check('清空后队列为空', (await page.evaluate(() => document.querySelector('#queueList .q-item'))) === null);
  check('清空后 AI 相册为空', (await page.evaluate(() => document.querySelectorAll('#albumGrid .film-cell').length)) === 0);
  check('清空后胶卷为空', (await page.evaluate(() => document.querySelectorAll('#filmGrid .film-cell').length)) === 0);
  await page.evaluate(() => {
    document.querySelector('#settingsMask').click();
  });
  await page.click('nav.bottom button[data-v="cam"]');
  await shot(1, 200); // 清空后 Key 也没了 → 不应入队（守卫）
  await page.waitForTimeout(400);
  check(
    '未配置 AI 时拍照仍存胶卷但不入队（不制造必然失败的任务）',
    (await page.evaluate(() => document.querySelectorAll('#filmGrid .film-cell').length)) === 1 &&
      (await page.evaluate(() => document.querySelector('#queueList .q-item'))) === null,
    `胶卷=${await page.evaluate(() => document.querySelectorAll('#filmGrid .film-cell').length)}`,
  );

  const blobErr = await page.evaluate(() => window.__blobErr);
  const inDom = blobErr.filter((x) => x.stillInDom).length;
  console.log(`\n[!] 图片加载失败事件 ${blobErr.length} 次（其中元素仍在 DOM 里的 ${inDom} 次）`);
  const fByType = {};
  for (const x of failedUrls) {
    const k = x.split(' ')[0];
    fByType[k] = (fByType[k] || 0) + 1;
  }
  console.log('\n[!] requestfailed 分类: ' + JSON.stringify(fByType));
  console.log('    样例: ' + failedUrls.slice(0, 3).join(' | '));
} catch (e) {
  console.log('  [异常]', e.message);
  failures.push('脚本异常: ' + e.message);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n结论: ${failures.length === 0 ? 'PASS 全部通过' : 'FAIL ' + failures.join(' / ')}`);
process.exit(failures.length === 0 ? 0 : 1);

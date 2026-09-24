/**
 * 主题模式端到端验收（真 Chromium + 真 IndexedDB + 真 canvas 拼图；只 stub 相机与生图接口）。
 *
 * 四个场景（对应设计稿与需求清单）：
 *   ① 创建主题（词库拼装提示词）→ 合成一张 → 相册「主题作品」出现 1 张
 *   ② 统一风格 + 边拍边收 → 连拍 3 张 → 主题收 3 张、队列 3 个子任务、产出 3 张
 *   ③ 选满 9 张后第 10 张被拒（给出明确提示，不是静默失败）
 *   ④ 并发峰值 = 9、第 10 个任务排队（显影槽 9 个）
 *
 * 跑法：npm run build && node e2e/acceptance-theme-mode.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const PORT = Number(process.env.SS_THEME_PORT || 8202);

let failures = [];
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 相机 stub（canvas 流）+ AI 生图 stub（只拦 /images/edits，返回 8×8 png） */
const init = (opts = {}) => {
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

  const TINY = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=';
  window.__genDelay = Number(localStorage.getItem('ss_e2e_delay') || 200);
  window.__aiCalls = 0;
  window.__aiConcurrent = 0;
  window.__aiPeak = 0;
  const orig = window.fetch.bind(window);
  window.fetch = async (url, o) => {
    const u = String(url);
    if (u.includes('/images/edits')) {
      window.__aiCalls++;
      window.__aiConcurrent++;
      window.__aiPeak = Math.max(window.__aiPeak, window.__aiConcurrent);
      await new Promise((r) => setTimeout(r, window.__genDelay));
      window.__aiConcurrent--;
      return new Response(JSON.stringify({ data: [{ b64_json: TINY }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return orig(url, o);
  };

  localStorage.setItem('ss_ai_base', 'http://127.0.0.1:9/v1');
  localStorage.setItem('ss_ai_key', 'sk-stub');
  localStorage.setItem('ss_ai_model', 'gpt-image-2');
  // 默认关掉「拍完自动生图」：主题场景要数清楚「这张归主题还是归默认生图」
  localStorage.setItem('ss_gen_auto', opts.genAuto ? '1' : '0');
};

const pw = await loadPlaywright();
if (!pw) {
  console.error('找不到 playwright（本机或全局安装后重试）');
  process.exit(1);
}

const server = await serveDir(DIST, PORT);
const browser = await pw.chromium.launch();

/** 每个场景一个干净上下文：localStorage 清空 + 重新 stub */
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    console.log('  [pageerror] ' + e.message);
    failures.push('pageerror: ' + e.message);
  });
  await page.addInitScript(init, opts);
  await page.goto(`${server.url}/app.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(350);
  await page.click('#startCam');
  await page.waitForFunction(() => document.querySelector('#video').videoWidth > 0, null, { timeout: 8000 });
  return { ctx, page };
}

const shoot = async (page, n, gap = 120) => {
  for (let i = 0; i < n; i++) {
    await page.click('#shutter');
    await sleep(gap);
  }
};
const cells = (page, sel) => page.$$eval(sel, (els) => els.length);
const state = (page) => page.evaluate(() => ({ themes: __snapsaga.themes(), items: __snapsaga.queueItems() }));
const waitQueueIdle = (page, timeout = 20000) =>
  page.waitForFunction(
    () => !__snapsaga.queueItems().some((t) => t.status === 'running' || t.status === 'queued'),
    null,
    { timeout },
  );

try {
  /* ============ ① 创建主题（拼装提示词）→ 合成一张 → 相册 1 张 ============ */
  console.log('\n[1] 创建主题（词库拼装）→ 合成一张 → 相册出现 1 张');
  {
    const { ctx, page } = await open();
    await shoot(page, 3);
    await page.click('nav.bottom button[data-v="theme"]');
    await sleep(150);
    await page.click('#btnThemeNew');
    await sleep(200);
    await page.click('#promptIdeasToggle');

    // 词库点选拼装 + 实时预览 + 质量提示
    await page.click('#pBuild button[data-w="富士胶片"]');
    await page.click('#pBuild button[data-w="暖黄秋天"]');
    await page.click('#pBuild button[data-w="柔光"]');
    const preview = await page.$eval('#pv', (e) => e.textContent.trim());
    check('实时预览 = 点选的三个词按顺序拼起来', preview.includes('富士胶片，暖黄秋天，柔光'), preview);
    const hint = await page.$eval('#pqhint', (e) => e.textContent.trim());
    check('质量提示变为 ✓（够长）', hint.startsWith('✓'), hint);
    check('词库按钮进入选中态', (await cells(page, '#pBuild button.on')) === 3, String(await cells(page, '#pBuild button.on')));
    // 再点一次同一个词 = 取消（去重/可撤销）
    await page.click('#pBuild button[data-w="柔光"]');
    check('再点一次取消该词', (await cells(page, '#pBuild button.on')) === 2);
    await page.click('#pBuild button[data-w="柔光"]');

    // 选 3 张素材（合成一张，默认布局 = 网格拼贴）
    const pickIds = await page.$$eval('#pick .pk[data-id]', (els) => els.slice(0, 3).map((e) => e.dataset.id));
    for (const id of pickIds) await page.click(`#pick .pk[data-id="${id}"]`);
    const hintText = await page.$eval('#genHint', (e) => e.textContent.trim());
    check('选图计数 N/9 且提示产出 1 张', hintText === '已选 3/9 张 → 合成 1 张', hintText);
    check('选中的格子标了序号', (await cells(page, '#pick .pk.on .num')) === 3);

    const before = await state(page);
    check('提交前还没有主题', before.themes.length === 0);
    // 主题任务一进槽位就写 k/n（拼图很快，可能瞬间到 3/3）→ 用 MutationObserver 把槽位文案全记下来
    await page.evaluate(() => {
      window.__slotTexts = [];
      const root = document.querySelector('#slots');
      const collect = () =>
        document.querySelectorAll('#slots .sl.busy .pc').forEach((el) => {
          const t = el.textContent.trim();
          if (t && !window.__slotTexts.includes(t)) window.__slotTexts.push(t);
        });
      new MutationObserver(collect).observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
      collect();
    });
    await page.click('#genBtn');
    await sleep(250);

    const after = await state(page);
    const theme = after.themes[0];
    check('创建了 1 个主题（合成一张 / 网格拼贴 / 3 张素材）', !!theme && theme.mode === 'merge' && theme.layout === '网格拼贴' && theme.sourceIds.length === 3, JSON.stringify(theme && { mode: theme.mode, layout: theme.layout, n: theme.sourceIds.length }));
    check('提示词就是拼装结果', theme?.prompt === '富士胶片，暖黄秋天，柔光', theme?.prompt);
    const themeTasks = after.items.filter((t) => t.kind === 'theme');
    check('队列里只有 1 条主题任务（3 张素材也占 1 个槽位）', themeTasks.length === 1 && themeTasks[0].n === 3, `tasks=${themeTasks.length} n=${themeTasks[0]?.n}`);
    check('自动跳到暗房', await page.evaluate(() => document.querySelector('#view-dark').classList.contains('on')));
    const slotTexts = await page.evaluate(() => window.__slotTexts);
    check(
      '显影槽显示分张进度 k/n（不是百分比）',
      slotTexts.length > 0 && slotTexts.every((t) => /^\d+\/\d+$/.test(t)) && slotTexts.includes('3/3'),
      slotTexts.join(' → '),
    );

    await waitQueueIdle(page);
    await sleep(250);
    const st = await state(page);
    check('主题任务完成，产出 1 张（N 张 → 1 张）', st.themes[0].outputIds.length === 1, `outputs=${st.themes[0].outputIds.length}`);
    check('合成模式只调了 1 次 AI（拼图在本地做）', (await page.evaluate(() => window.__aiCalls)) === 1, 'calls=' + (await page.evaluate(() => window.__aiCalls)));

    await page.click('nav.bottom button[data-v="album"]');
    await sleep(150);
    await page.click('#albumSeg button[data-a="theme"]');
    await sleep(200);
    check('相册「主题作品」出现 1 张', (await cells(page, '#albumGrid .film-cell')) === 1, String(await cells(page, '#albumGrid .film-cell')));
    check('合成作品单独一组（合成作品 · 1 张）', (await page.$eval('#secMerge', (e) => e.textContent)).includes('1 张'));
    check('同风格组为空', (await page.$eval('#secUnify', (e) => e.textContent)).includes('0 张'));
    check('格子标了「主题」角标', (await cells(page, '#albumGrid .theme-mark')) === 1);
    await ctx.close();
  }

  /* ============ ② 统一风格 + 边拍边收 ============ */
  console.log('\n[2] 统一风格 + 边拍边收：连拍 3 张 → 主题收 3 张、队列 3 个子任务、产出 3 张');
  {
    const { ctx, page } = await open();
    await page.click('nav.bottom button[data-v="theme"]');
    await sleep(150);
    await page.click('#btnThemeNew');
    await sleep(200);
    await page.click('#promptIdeasToggle');
    await page.click('#modeBox .m[data-m="unify"]');
    await sleep(100);
    check('切到统一风格后隐藏「合成布局」', await page.evaluate(() => document.querySelector('#mergeOpt').style.display === 'none'));
    check('统一风格才出现「创建并开拍」', (await page.$('#shootBtn')) !== null);
    await page.click('#pBuild button[data-w="水彩手账"]');
    await page.click('#pBuild button[data-w="青灰低饱和"]');
    await page.click('#shootBtn'); // 不选图直接开拍
    await sleep(250);

    const bar = await page.evaluate(() => {
      const el = document.querySelector('#thbar');
      return el ? { shown: el.offsetParent !== null, name: document.querySelector('#thName').textContent, meta: document.querySelector('#thMeta').textContent } : null;
    });
    check('取景页顶部出现主题条（边拍边收）', !!bar && bar.shown, JSON.stringify(bar));
    check('主题条显示主题名与已收张数', !!bar && bar.name.includes('水彩手账') && bar.meta.includes('已收 0 张'), bar?.meta);
    check('主题条有红点脉冲（收图进行中）', (await cells(page, '#thPulse')) === 1);
    check('自动跳回取景页', await page.evaluate(() => document.querySelector('#view-cam').classList.contains('on')));

    const clickMs = await page.evaluate(() => {
      const t = performance.now();
      document.querySelector('#shutter').click();
      return performance.now() - t;
    });
    check('主题生效时快门依然同步返回（不 await AI）', clickMs < 50, `${clickMs.toFixed(1)} ms`);
    await sleep(200);
    await shoot(page, 2, 200);
    await sleep(300);

    const st = await state(page);
    const theme = st.themes[0];
    check('主题收满 3 张（每按一次快门 +1）', theme.sourceIds.length === 3, `sources=${theme.sourceIds.length}`);
    const subs = st.items.filter((t) => t.kind === 'theme');
    check('队列里 3 个统一风格子任务（每张一个 n=1 任务）', subs.length === 3 && subs.every((t) => t.n === 1 && t.mode === 'unify'), `tasks=${subs.length}`);
    check('胶卷也存下了这 3 张原片', (await cells(page, '#filmGrid .film-cell')) === 3, String(await cells(page, '#filmGrid .film-cell')));
    check('主题条计数实时更新', (await page.$eval('#thMeta', (e) => e.textContent)).includes('已收 3 张'), await page.$eval('#thMeta', (e) => e.textContent));

    // 回归：改版不能把原有能力（拍立得 / 修图）的入口弄丢
    await page.click('nav.bottom button[data-v="film"]');
    await sleep(150);
    await page.click('#filmGrid .film-cell');
    await page.click('#btnToPola');
    await sleep(200);
    check('胶卷 → 拍立得仍可用（入口没丢）', await page.evaluate(() => document.querySelector('#view-pola').classList.contains('on')));
    await page.click('nav.bottom button[data-v="film"]');
    await sleep(150);
    await page.click('#btnToEdit');
    await sleep(200);
    check('胶卷 → 修图仍可用（入口没丢）', await page.evaluate(() => document.querySelector('#view-edit').classList.contains('on')));
    await page.click('nav.bottom button[data-v="cam"]');
    await sleep(250);

    await waitQueueIdle(page);
    await sleep(300);
    const done = await state(page);
    check('统一风格产出 3 张（N 张 → N 张）', done.themes[0].outputIds.length === 3, `outputs=${done.themes[0].outputIds.length}`);
    check('AI 调用次数 = 3（逐张重绘，没有重复生成）', (await page.evaluate(() => window.__aiCalls)) === 3, 'calls=' + (await page.evaluate(() => window.__aiCalls)));

    // 结束主题 → 归档并跳暗房
    await page.click('#btnEndTheme');
    await sleep(300);
    const ended = await state(page);
    check('结束主题 → status=ended 且停止收集', ended.themes[0].status === 'ended' && ended.themes[0].collecting === false, JSON.stringify({ s: ended.themes[0].status, c: ended.themes[0].collecting }));
    check('结束主题 → 跳暗房', await page.evaluate(() => document.querySelector('#view-dark').classList.contains('on')));
    check('主题条消失', await page.evaluate(() => !document.querySelector('#thbar')));

    await page.click('nav.bottom button[data-v="album"]');
    await sleep(150);
    await page.click('#albumSeg button[data-a="theme"]');
    await sleep(200);
    check('相册「主题作品」3 张', (await cells(page, '#albumGrid .film-cell')) === 3, String(await cells(page, '#albumGrid .film-cell')));
    check('同风格组 3 张、合成作品 0 张', (await page.$eval('#secUnify', (e) => e.textContent)).includes('3 张') && (await page.$eval('#secMerge', (e) => e.textContent)).includes('0 张'));

    // 隔天接着拍：继续边拍边收追加进同一组
    await page.click('nav.bottom button[data-v="theme"]');
    await sleep(150);
    await page.click('#themeList .tcard');
    await sleep(200);
    check('主题详情有「继续边拍边收」', (await page.$('#tdResume')) !== null);
    await page.click('#tdResume');
    await sleep(250);
    check('继续边拍边收 → 回到取景并重新出现主题条', await page.evaluate(() => document.querySelector('#view-cam').classList.contains('on') && !!document.querySelector('#thbar')));
    await page.click('#shutter');
    await sleep(200);
    const resumed = await state(page);
    check('追加进同一组（素材 3 → 4）', resumed.themes[0].sourceIds.length === 4, `sources=${resumed.themes[0].sourceIds.length}`);
    await waitQueueIdle(page);
    await sleep(250);
    const resumed2 = await state(page);
    check('追加的这张也产出了（产出 3 → 4）', resumed2.themes[0].outputIds.length === 4, `outputs=${resumed2.themes[0].outputIds.length}`);
    await ctx.close();
  }

  /* ============ ③ 多图上限 9：第 10 张被拒 ============ */
  console.log('\n[3] 选满 9 张后第 10 张被拒（明确提示，不静默失败）');
  {
    const { ctx, page } = await open();
    await shoot(page, 10, 60);
    check('胶卷有 10 张（比上限多 1 张）', (await cells(page, '#filmGrid .film-cell')) === 10, String(await cells(page, '#filmGrid .film-cell')));
    await page.click('nav.bottom button[data-v="theme"]');
    await sleep(150);
    await page.click('#btnThemeNew');
    await sleep(200);
    await page.click('#promptIdeasToggle');
    check('选图区列出全部 10 张', (await cells(page, '#pick .pk[data-id]')) === 10);

    await page.click('#pickAll');
    await sleep(150);
    let picked = await page.evaluate(() => __snapsaga.store.getState().themePick.length);
    check('全选只选到 9 张（不会超上限）', picked === 9, `picked=${picked}`);
    check('计数显示 已选 9/9 张', (await page.$eval('#genHint', (e) => e.textContent)).includes('已选 9/9 张'));

    // 点那张没被选中的（最老的一张）→ 必须被拒 + 明确提示
    const tenthId = await page.$eval('#pick .pk[data-id]:not(.on)', (e) => e.dataset.id);
    await page.click(`#pick .pk[data-id="${tenthId}"]`);
    await sleep(200);
    const toast = await page.$eval('#toast', (e) => e.textContent);
    check('第 10 张被拒并给出提示', toast.includes('多图上限 9 张'), toast);
    picked = await page.evaluate(() => __snapsaga.store.getState().themePick.length);
    check('被拒后选图集合不变（仍是 9）', picked === 9, `picked=${picked}`);
    check('那张格子没有变成选中态', (await cells(page, '#pick .pk.on')) === 9, String(await cells(page, '#pick .pk.on')));

    // 取消一张后可以继续选
    const firstId = await page.$eval('#pick .pk.on', (e) => e.dataset.id);
    await page.click(`#pick .pk[data-id="${firstId}"]`);
    await sleep(120);
    await page.click(`#pick .pk[data-id="${tenthId}"]`);
    await sleep(150);
    picked = await page.evaluate(() => __snapsaga.store.getState().themePick.length);
    check('腾出名额后第 10 张可以选进来', picked === 9, `picked=${picked}`);
    check('生成按钮可用（2–9 张）', await page.evaluate(() => !document.querySelector('#genBtn').disabled));
    await ctx.close();
  }

  /* ============ ④ 并发峰值 9 / 第 10 个任务排队 ============ */
  console.log('\n[4] 并发峰值 = 9、第 10 个任务排队');
  {
    const { ctx, page } = await open({ genAuto: true });
    await page.evaluate(() => {
      window.__genDelay = 4000;
      localStorage.setItem('ss_e2e_delay', '4000');
    });
    await shoot(page, 10, 90);
    await sleep(700);
    const st = await page.evaluate(() => {
      const items = __snapsaga.queueItems();
      return {
        total: items.length,
        running: items.filter((t) => t.status === 'running').length,
        queued: items.filter((t) => t.status === 'queued').length,
        peak: window.__aiPeak,
        max: __snapsaga.queue.MAX,
      };
    });
    check('队列收到 10 条任务', st.total === 10, `total=${st.total}`);
    check('同时生成中 = 9（并发上限）', st.running === 9, `running=${st.running}`);
    check('第 10 个任务在排队', st.queued === 1, `queued=${st.queued}`);
    check('页面侧 AI 并发峰值 = 9', st.peak === 9, `peak=${st.peak}`);
    check('队列 MAX = 9', st.max === 9, String(st.max));

    await page.click('nav.bottom button[data-v="dark"]');
    await sleep(200);
    check('暗房显影槽 3×3 = 9 个', (await cells(page, '#slots .sl')) === 9, String(await cells(page, '#slots .sl')));
    check('9 个槽位都在忙', (await cells(page, '#slots .sl.busy')) === 9, String(await cells(page, '#slots .sl.busy')));
    check('暗房统计如实显示 运行 9 · 排队 1', (await page.$eval('#ds', (e) => e.textContent)).replace(/\s+/g, ' ').includes('运行 9 · 排队 1'), await page.$eval('#ds', (e) => e.textContent));
    check('任务列表标出第 1 位', (await page.$eval('#darkQueue', (e) => e.textContent)).includes('第 1 位'));
    check('暗房 tab 徽标显示 9+', (await page.$eval('#bdg', (e) => e.textContent)) === '9+', await page.$eval('#bdg', (e) => e.textContent));

    // 放快后全部完成并归档
    await page.evaluate(() => {
      window.__genDelay = 30;
      localStorage.setItem('ss_e2e_delay', '30');
    });
    await waitQueueIdle(page);
    await sleep(300);
    const done = await page.evaluate(() => ({
      done: __snapsaga.queueItems().filter((t) => t.status === 'done').length,
      album: __snapsaga.album().length,
    }));
    check('10 条任务全部完成', done.done === 10, `done=${done.done}`);
    check('10 张全部归档进相册', done.album === 10, `album=${done.album}`);
    await ctx.close();
  }
} catch (e) {
  console.log('  [异常]', e.message);
  failures.push('脚本异常: ' + e.message);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n结论: ${failures.length === 0 ? 'PASS 全部通过' : 'FAIL ' + failures.join(' / ')}`);
process.exit(failures.length === 0 ? 0 : 1);

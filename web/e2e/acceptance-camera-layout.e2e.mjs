/**
 * 取景页「干净相机界面」几何与交互验收（真 Chromium，只 stub 相机）。
 *
 * 为什么单开一组：这一组的断言是**几何**的（快门是否在屏内、取景画面占多高、页面是否需要滚动、
 * 有没有元素压在快门上），和功能链路无关；而且在两个视口下都要成立：
 *   390×844（现代手机整屏）与 390×664（真机 Safari 带工具栏后的可视高度，改版前快门落在屏外）。
 *
 * 改版前的实测（本脚本同时打印"现在"的数字，便于对照）：
 *   390×844：取景画面 304.8 px（36.1%）· 快门 y=703.8 · 取景画面里 9 层常驻 UI
 *   390×664：取景画面 300 px（45.2%）· 快门 y=699（**在 664 的屏外**）· 取景视图 scrollHeight 720 > clientHeight 544
 *
 * 跑法：npm run build && node e2e/acceptance-camera-layout.e2e.mjs
 * 截图：e2e/artifacts/camera-<视口>-<抽屉状态>.png（不入库，供人工确认画面干净、快门明显）
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const SHOTS = resolve(HERE, 'artifacts');
const PORT = Number(process.env.SS_CAMERA_PORT || 8194);

let fails = [];
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CAM_STUB = () => {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext('2d');
  let i = 0;
  setInterval(() => {
    ctx.fillStyle = `hsl(${(i++ * 7) % 360},60%,50%)`;
    ctx.fillRect(0, 0, 640, 480);
  }, 40);
  const stream = c.captureStream(10);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
};

/** 页面内几何探针：取景画面高度、滚动状态、快门与谁相交、哪些块还在取景画面里 */
const PROBE = () => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: +b.x.toFixed(1),
      y: +b.y.toFixed(1),
      w: +b.width.toFixed(1),
      h: +b.height.toFixed(1),
      right: +b.right.toFixed(1),
      bottom: +b.bottom.toFixed(1),
      display: cs.display,
      position: cs.position,
      opacity: +cs.opacity,
    };
  };
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = clipRect(el);
    return r.right > r.left && r.bottom > r.top;
  };
  /** 元素的**可见**矩形：自己的 rect 与所有裁剪祖先（overflow hidden/clip/auto/scroll）的交集。
   *  不这样做会把被 overflow:hidden 剪掉的溢出部分当成“遮住快门”（例如数码变焦放大后的 video）。 */
  function clipRect(el) {
    let r = el.getBoundingClientRect();
    let out = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    let p = el.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        out = {
          left: Math.max(out.left, pr.left),
          top: Math.max(out.top, pr.top),
          right: Math.min(out.right, pr.right),
          bottom: Math.min(out.bottom, pr.bottom),
        };
      }
      p = p.parentElement;
    }
    return out;
  }
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  const shutter = document.querySelector('#shutter');
  const sb = shutter.getBoundingClientRect();
  // 与快门矩形相交的**其它**可见元素：排除快门自己的祖先/后代（祖先天然包含它，不算遮挡），
  // 并且用“被裁剪后的可见矩形”比较（被 overflow:hidden 剪掉的部分不算遮挡）。
  const overlapping = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el === shutter || el.contains(shutter) || shutter.contains(el)) continue;
    if (!isVisible(el)) continue;
    if (hit(sb, clipRect(el))) {
      overlapping.push(
        `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`,
      );
    }
  }

  const view = document.querySelector('#view-cam');
  const wrap = document.querySelector('#camWrap');
  const dock = document.querySelector('#camDock');
  const inCam = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, exists: false };
    const r = el.getBoundingClientRect();
    return { sel, exists: true, w: +r.width.toFixed(1), h: +r.height.toFixed(1), visible: isVisible(el) };
  };

  return {
    viewport: { w: innerWidth, h: innerHeight },
    viewfinderH: +wrap.getBoundingClientRect().height.toFixed(1),
    viewfinderPct: +((wrap.getBoundingClientRect().height / innerHeight) * 100).toFixed(1),
    videoFill: (() => {
      const v = clipRect(document.querySelector('#video'));
      return { w: +(v.right - v.left).toFixed(1), h: +(v.bottom - v.top).toFixed(1) };
    })(),
    videoObjectFit: getComputedStyle(document.querySelector('#video')).objectFit,
    dockH: +dock.getBoundingClientRect().height.toFixed(1),
    shutter: { y: +sb.y.toFixed(1), bottom: +sb.bottom.toFixed(1), h: +sb.height.toFixed(1), w: +sb.width.toFixed(1) },
    overlapping,
    viewScroll: { sh: view.scrollHeight, ch: view.clientHeight },
    docScroll: { sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight },
    sheetDisplay: getComputedStyle(document.querySelector('#camSheet')).display,
    sheet: rect('#camSheet'),
    dock: rect('#camDock'),
    blocks: ['#sunBar', '.hs#skins', '.fs#fr2', '#genBar', '#camMeta', '#camSheet'].map(inCam),
    tp: rect('#tp'),
    tpText: document.querySelector('#tp').textContent,
    hudTopInsideCam: !!document.querySelector('#camWrap #camHudTop'),
    queueBtnInsideCam: !!document.querySelector('#camWrap #btnQueue'),
    settingsBtnInsideCam: !!document.querySelector('#camWrap #btnSettings'),
    headerDisplay: getComputedStyle(document.querySelector('header.app')).display,
    headerSub: document.querySelector('header .sub').textContent,
    tabs: [...document.querySelectorAll('nav.bottom button[data-v]')].map((b) => b.getAttribute('data-v')),
    camMetaText: (document.querySelector('#camMeta') || {}).textContent || '',
    photos: typeof PHOTOS !== 'undefined' ? PHOTOS.length : -1,
  };
};

const pw = await loadPlaywright();
if (!pw) {
  console.error('找不到 playwright');
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });
const server = await serveDir(DIST, PORT);
const browser = await pw.chromium.launch();

const open = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    console.log('  [pageerror]', e.message);
    fails.push('pageerror: ' + e.message);
  });
  await page.addInitScript(CAM_STUB);
  await page.goto(`${server.url}/app.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(350);
  await page.click('#startCam');
  await page.waitForFunction(() => document.querySelector('#video').videoWidth > 0, null, { timeout: 8000 });
  await sleep(150);
  return { ctx, page };
};

/** 390×844 与 390×664 两个视口：抽屉关着 + 抽屉打开各一张截图，并跑几何断言 */
async function viewportPass(w, h) {
  const tag = `${w}x${h}`;
  console.log(`\n[${tag}] 几何断言（抽屉关闭态）`);
  const { ctx, page } = await open(w, h);
  try {
    const g = await page.evaluate(PROBE);
    console.log(
      `    取景画面 ${g.viewfinderH}px（视口的 ${g.viewfinderPct}%）· 底栏 ${g.dockH}px · 快门 y=${g.shutter.y}~${g.shutter.bottom}`,
    );
    check(`[${tag}] 快门完整落在视口内（底边 ≤ 视口高）`, g.shutter.bottom <= g.viewport.h && g.shutter.y >= 0, `bottom=${g.shutter.bottom} vh=${g.viewport.h}`);
    check(`[${tag}] 快门没有被任何其它可见元素覆盖`, g.overlapping.length === 0, g.overlapping.join(' | ') || '(无)');
    check(`[${tag}] 取景画面高度 ≥ 视口 × 0.6`, g.viewfinderH >= g.viewport.h * 0.6, `${g.viewfinderH} / ${g.viewport.h} = ${(g.viewfinderPct / 100).toFixed(2)}`);
    check(
      `[${tag}] 取景画面被视频填满（object-fit:cover，可见高度 == 取景画面高度）`,
      g.videoObjectFit === 'cover' && g.videoFill.h >= g.viewfinderH - 0.5 && g.videoFill.w >= g.viewport.w - 0.5,
      `${g.videoObjectFit} ${JSON.stringify(g.videoFill)} vs ${g.viewfinderH}`,
    );
    check(`[${tag}] 取景视图不滚动（scrollHeight == clientHeight）`, g.viewScroll.sh === g.viewScroll.ch, JSON.stringify(g.viewScroll));
    check(`[${tag}] 页面不滚动（documentElement scrollHeight == clientHeight）`, g.docScroll.sh === g.docScroll.ch, JSON.stringify(g.docScroll));

    // 抽屉关闭时，这些辅助块**必须不在取景画面里**（不渲染 = 矩形为 0；抽屉本身也必须是 display:none）
    const leaked = g.blocks.filter((b) => !(b.exists && (b.w === 0 || b.h === 0)));
    check(`[${tag}] 抽屉关闭时取景画面里没有常驻辅助块（#sunBar / #skins / #fr2 / #genBar / #camMeta）`, leaked.length === 0, leaked.map((b) => `${b.sel}:${b.w}×${b.h}`).join(' | ') || '(无)');
    check(`[${tag}] 抽屉本身是 display:none`, g.sheetDisplay === 'none', g.sheetDisplay);

    // 构图提示：不再是常驻大卡 —— 绝对定位浮层 + 单行高度 + 会自动淡出
    check(`[${tag}] 构图提示是绝对定位浮层（不占构图）`, g.tp.position === 'absolute', g.tp.position);
    check(`[${tag}] 构图提示是单行（高度 ≤ 32px，改版前是两行大卡 36.7px）`, g.tp.h > 0 && g.tp.h <= 32, `${g.tp.h}px`);
    check(`[${tag}] 构图提示初始可见（opacity 1）`, g.tp.opacity === 1, String(g.tp.opacity));

    // 入口没丢：取景器右上角小圆钮 + AppHeader 隐藏但元素仍在 DOM 里
    check(`[${tag}] 取景器右上角有半透明小圆钮（含 #btnQueue / #btnSettings）`, g.hudTopInsideCam && g.queueBtnInsideCam && g.settingsBtnInsideCam, JSON.stringify({ hud: g.hudTopInsideCam, q: g.queueBtnInsideCam, s: g.settingsBtnInsideCam }));
    check(`[${tag}] 取景页 AppHeader 隐藏（display:none）`, g.headerDisplay === 'none', g.headerDisplay);
    check(`[${tag}] AppHeader 仍在 DOM 里（版本号可读）`, /v\d+\.\d+/.test(g.headerSub), g.headerSub);
    check(`[${tag}] 六个 tab 不变`, g.tabs.join(',') === 'cam,theme,film,dark,album,set', g.tabs.join(','));

    await page.screenshot({ path: resolve(SHOTS, `camera-${tag}-sheet-closed.png`) });

    // ---- 构图提示自动淡出 + 点一下再显示 ----
    console.log(`\n[${tag}] 构图提示：3–4 秒后自动淡出，点取景画面可再显示`);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#tp')).opacity) === 0, null, { timeout: 6000 });
    const faded = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#tp')).opacity));
    check(`[${tag}] 构图提示自动淡出（opacity → 0）`, faded === 0, String(faded));
    await page.mouse.click(Math.round(w / 2), Math.round(h * 0.35));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#tp')).opacity) === 1, null, { timeout: 3000 });
    const back = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#tp')).opacity));
    check(`[${tag}] 点取景画面 → 构图提示再显示`, back === 1, String(back));

    // ---- 抽屉：点 dock 的相机按钮打开 ----
    console.log(`\n[${tag}] 抽屉交互：相机按钮打开 / 遮罩关闭 / 下拉关闭 / 打开时快门仍可点`);
    await page.click('#btnCamSheet');
    await sleep(400);
    const opened = await page.evaluate(PROBE);
    check(`[${tag}] 点「相机」按钮打开抽屉`, opened.sheetDisplay !== 'none' && opened.sheet.h > 0, `${opened.sheetDisplay} ${opened.sheet.h}px`);
    check(`[${tag}] 抽屉打开时能看到场景相机 / 焦距档 / 胶片与风格`, ['.hs#skins', '.fs#fr2', '#genBar'].every((s) => opened.blocks.find((b) => b.sel === s)?.visible), JSON.stringify(opened.blocks));
    check(`[${tag}] 抽屉不盖住底栏（抽屉底边 ≤ 底栏顶边）`, opened.sheet.bottom <= opened.dock.y + 0.5, `sheet.bottom=${opened.sheet.bottom} dock.top=${opened.dock.y}`);
    check(`[${tag}] 抽屉打开时快门仍在视口内且未被覆盖`, opened.shutter.bottom <= opened.viewport.h && opened.overlapping.length === 0, `bottom=${opened.shutter.bottom} overlap=${opened.overlapping.join('|') || '无'}`);
    await page.screenshot({ path: resolve(SHOTS, `camera-${tag}-sheet-open.png`) });

    // 抽屉内容比屏幕高时自己滚，不去挤压取景画面（黄金时刻与诊断信息在抽屉底部）
    await page.evaluate(() => {
      const el = document.querySelector('#camSheet');
      el.scrollTop = el.scrollHeight;
    });
    await sleep(250);
    const deep = await page.evaluate(PROBE);
    check(
      `[${tag}] 抽屉滚到底能看到黄金时刻与 #camMeta（诊断信息）`,
      ['#sunBar', '#camMeta'].every((s) => deep.blocks.find((b) => b.sel === s)?.visible),
      JSON.stringify(deep.blocks.filter((b) => ['#sunBar', '#camMeta'].includes(b.sel))),
    );
    check(`[${tag}] 抽屉里的黄金时刻有「未设置地点」引导态`, /未设置地点/.test(await page.$eval('#sunTitle', (e) => e.textContent)), await page.$eval('#sunTitle', (e) => e.textContent));
    await page.evaluate(() => {
      document.querySelector('#camSheet').scrollTop = 0;
    });
    await sleep(150);

    // 抽屉开着也能按快门（快门行永远露在外面）
    await page.click('#shutter');
    await sleep(300);
    const afterShot = await page.evaluate(() => ({ photos: PHOTOS.length, meta: document.querySelector('#camMeta').textContent }));
    check(`[${tag}] 抽屉打开时快门照常可点（拍下 1 张）`, afterShot.photos === 1, String(afterShot.photos));
    check(`[${tag}] #camMeta 仍在 DOM 且语义不变（分辨率 + 本次取景方式）`, /相机 \d+×\d+/.test(afterShot.meta) && /(静止图像|仅能抓帧|抓帧)/.test(afterShot.meta), afterShot.meta);

    // 抽屉里的控件可用：焦距档 / 场景相机 / 胶片与风格
    await page.click('#camSheet .fb[data-mm="50"]');
    await sleep(250);
    const zoomed = await page.evaluate(() => ({
      on: document.querySelector('#camSheet .fb.on').dataset.mm,
      transform: getComputedStyle(document.querySelector('#video')).transform,
      info: document.querySelector('#camHudInfo').textContent,
    }));
    check(`[${tag}] 抽屉里能切焦距档（50mm → 预览缩放 + 左下角小字跟着变）`, zoomed.on === '50' && zoomed.transform !== 'none' && zoomed.info.includes('50mm'), JSON.stringify(zoomed));
    await page.click('#camSheet .sk[data-i="4"]');
    await sleep(150);
    check(`[${tag}] 抽屉里能切场景相机`, (await page.evaluate(() => document.querySelector('#camSheet .sk.on').dataset.i)) === '4');
    check(`[${tag}] 抽屉里有胶片与风格 chips（#genBar / #genStyles）`, (await page.$$eval('#camSheet #genStyles .gen-chip', (e) => e.length)) > 0);

    // 点遮罩关闭
    await page.evaluate(() => document.querySelector('#camSheetMask').click());
    await sleep(400);
    check(`[${tag}] 点遮罩关闭抽屉`, (await page.evaluate(() => getComputedStyle(document.querySelector('#camSheet')).display)) === 'none');

    // 下拉手势关闭
    await page.click('#btnCamSheet');
    await sleep(400);
    const grab = await page.$('#camSheet .grab');
    const gb = await grab.boundingBox();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + 220, { steps: 10 });
    await page.mouse.up();
    await sleep(450);
    check(`[${tag}] 下拉手势关闭抽屉`, (await page.evaluate(() => getComputedStyle(document.querySelector('#camSheet')).display)) === 'none');

    // 再点相机按钮：开关都走同一个入口
    await page.click('#btnCamSheet');
    await sleep(350);
    await page.click('#btnCamSheet');
    await sleep(350);
    check(`[${tag}] 再点「相机」按钮关闭抽屉`, (await page.evaluate(() => getComputedStyle(document.querySelector('#camSheet')).display)) === 'none');

    // 左下角小字也能打开抽屉
    await page.click('#camHudInfo');
    await sleep(350);
    check(`[${tag}] 点左下角 ISO/焦距小字也能打开抽屉`, (await page.evaluate(() => getComputedStyle(document.querySelector('#camSheet')).display)) !== 'none');
    await page.evaluate(() => __snapsaga.closeCameraSheet());
    await sleep(200);
  } finally {
    await ctx.close();
  }
}

try {
  await viewportPass(390, 844);
  await viewportPass(390, 664);

  console.log('\n[全局] 调试桥的抽屉开关（e2e / guard 需要先开抽屉才能点里面的元素）');
  {
    const { ctx, page } = await open(390, 844);
    const r = await page.evaluate(() => {
      const before = __snapsaga.cameraSheetOpen();
      __snapsaga.openCameraSheet();
      const mid = __snapsaga.cameraSheetOpen();
      __snapsaga.closeCameraSheet();
      return { before, mid, after: __snapsaga.cameraSheetOpen() };
    });
    check('调试桥 openCameraSheet / closeCameraSheet / cameraSheetOpen 可用', r.before === false && r.mid === true && r.after === false, JSON.stringify(r));
    await ctx.close();
  }
} catch (e) {
  console.log('  [异常]', e.message);
  fails.push('脚本异常: ' + e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n截图: ${SHOTS}`);
console.log(`\n结论: ${fails.length ? 'FAIL ' + fails.join(' / ') : 'PASS 全部通过'}`);
process.exit(fails.length ? 1 : 0);

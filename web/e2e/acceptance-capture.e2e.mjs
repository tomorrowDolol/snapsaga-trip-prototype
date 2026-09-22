/**
 * 拍照三环境 + 能力约束验收（真 Chromium + 真 canvas 流，只 stub 相机与 ImageCapture）。
 * 来源：snapsaga_queue_check/check_capture.cjs —— 15 项断言逐条保留、未放松，只换成仓库内实现，
 * 并对准 React 构建产物（web/dist）。
 *
 * 三种环境都要验：支持 ImageCapture → 用静止图像；takePhoto 抛错 → 回落抓帧；没有 ImageCapture → 抓帧。
 * 另外必须证明快门仍然不被阻塞（takePhoto 故意拖 300ms，点击仍须立刻返回）。
 * 跑法：npm run build && node e2e/acceptance-capture.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const PORT = Number(process.env.SS_CAPTURE_PORT || 8196);
const STILL_BYTES = 12345; // 静止图像返回的可识别大小

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
  (function loop() {
    ctx.fillStyle = `hsl(${(i++ * 7) % 360},60%,50%)`;
    ctx.fillRect(0, 0, 640, 480);
    requestAnimationFrame(loop);
  })();
  const stream = c.captureStream(30);
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => stream;
  window.__usableStream = stream;
};

const pw = await loadPlaywright();
if (!pw) {
  console.error('找不到 playwright');
  process.exit(1);
}
const server = await serveDir(DIST, PORT);
const browser = await pw.chromium.launch();

async function open({ withImageCapture, takePhotoFails, camStub }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.addInitScript(camStub || CAM_STUB);
  await page.addInitScript(
    ({ withImageCapture, takePhotoFails, STILL_BYTES }) => {
      if (!withImageCapture) {
        delete window.ImageCapture;
        return;
      }
      window.ImageCapture = class {
        constructor(track) {
          this.track = track;
        }
        async takePhoto() {
          await new Promise((r) => setTimeout(r, 300)); // 故意慢：用来验证快门不被阻塞
          if (takePhotoFails) throw new Error('stub: takePhoto 不支持该流');
          return new Blob([new Uint8Array(STILL_BYTES)], { type: 'image/jpeg' });
        }
      };
    },
    { withImageCapture, takePhotoFails, STILL_BYTES },
  );
  await page.goto(`${server.url}/index.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(400);
  await page.click('#startCam');
  await sleep(600);
  return { ctx, page };
}

const shoot = async (page) => {
  const t0 = Date.now();
  await page.click('#shutter');
  const clickMs = Date.now() - t0;
  for (let i = 0; i < 60; i++) {
    await sleep(50);
    if (await page.evaluate(() => PHOTOS.length > 0)) break;
  }
  return clickMs;
};

try {
  console.log('\n[1] 支持 ImageCapture → 必须走「静止图像」');
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: false });
    const clickMs = await shoot(page);
    const r = await page.evaluate(() => ({ shot: PHOTOS[0].shot, size: PHOTOS[0].blob.size, meta: ($('#camMeta') || {}).textContent }));
    check('照片来自 takePhoto（大小 = 静止图像字节数）', r.size === STILL_BYTES, `${r.size} 字节`);
    check('入库记录标记 shot=still', r.shot === 'still', String(r.shot));
    check('取景信息条显示「静止图像」', /静止图像/.test(r.meta || ''), r.meta);
    check('相机分辨率信息有显示', /相机 \d+×\d+/.test(r.meta || ''), r.meta);
    check('takePhoto 慢 300ms 时，快门点击仍立即返回', clickMs < 150, `${clickMs}ms`);
    await ctx.close();
  }

  console.log('\n[2] takePhoto 抛错 → 必须回落抓帧，且不改坏功能');
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: true });
    await shoot(page);
    const r = await page.evaluate(() => ({ shot: PHOTOS[0].shot, size: PHOTOS[0].blob.size, still: cam.still, meta: ($('#camMeta') || {}).textContent }));
    check('回落到抓帧（shot=frame）', r.shot === 'frame', String(r.shot));
    check('抓帧大小等于预览分辨率（640×480）而不是静止图', r.size !== STILL_BYTES && r.size > 0, `${r.size} 字节`);
    check('失败后不再重试 ImageCapture（cam.still 置 false）', r.still === false, String(r.still));
    check('信息条如实标为「仅能抓帧」', /仅能抓帧/.test(r.meta || ''), r.meta);
    await ctx.close();
  }

  console.log('\n[3] 浏览器没有 ImageCapture（如旧 iOS）→ 抓帧路径照常可用');
  {
    const { ctx, page } = await open({ withImageCapture: false, takePhotoFails: false });
    await shoot(page);
    const r = await page.evaluate(() => ({ shot: PHOTOS[0].shot, size: PHOTOS[0].blob.size, meta: ($('#camMeta') || {}).textContent }));
    check('抓帧成功产出照片', r.shot === 'frame' && r.size > 0, `${r.shot} / ${r.size} 字节`);
    await shoot(page);
    check('连续第二张也正常', (await page.evaluate(() => PHOTOS.length)) === 2, String(await page.evaluate(() => PHOTOS.length)));
    check('信息条标为「仅能抓帧」', /仅能抓帧/.test(r.meta || ''), r.meta);
    await ctx.close();
  }

  console.log('\n[4] 拍照仍然不阻塞队列（回归：快门后 AI 照常排队）');
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: false });
    // 配置一个必然失败的 AI（地址不可达），但队列必须照常接收任务
    await page.evaluate(() => {
      localStorage.setItem('ss_ai_base', 'http://127.0.0.1:9/v1');
      localStorage.setItem('ss_ai_key', 'sk-x');
      localStorage.setItem('ss_gen_auto', '1');
    });
    await page.reload();
    await sleep(400);
    await page.click('#startCam');
    await sleep(500);
    for (let i = 0; i < 3; i++) {
      await page.click('#shutter');
      await sleep(400);
    }
    await sleep(500);
    const r = await page.evaluate(() => ({ photos: PHOTOS.length, items: GenQueue.items.length }));
    check('连拍 3 张都进了胶卷', r.photos === 3, String(r.photos));
    check('生图队列收到 3 条任务（拍照确实不阻塞队列）', r.items === 3, String(r.items));
    await ctx.close();
  }

  console.log('\n[5] 只向设备支持的能力下约束（stub track 仅报告 zoom/torch，无 focusMode）');
  {
    const TRACK_STUB = () => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx2 = c.getContext('2d');
      let i = 0;
      (function loop() {
        ctx2.fillStyle = `hsl(${(i++ * 5) % 360},50%,50%)`;
        ctx2.fillRect(0, 0, 640, 480);
        requestAnimationFrame(loop);
      })();
      const real = c.captureStream(30);
      window.__constraints = [];
      const fakeTrack = {
        kind: 'video',
        getSettings: () => ({ width: 2560, height: 1440 }),
        // 关键：有 width/height/zoom/torch，故意没有 focusMode（iPhone 的真实形状）
        getCapabilities: () => ({ width: { max: 3840 }, height: { max: 2160 }, zoom: { min: 1, max: 10 }, torch: true }),
        applyConstraints: async (c2) => {
          window.__constraints.push(JSON.stringify(c2));
        },
        stop: () => real.getVideoTracks().forEach((t) => t.stop()),
      };
      real.getVideoTracks = () => [fakeTrack];
      navigator.mediaDevices = navigator.mediaDevices || {};
      navigator.mediaDevices.getUserMedia = async () => real;
    };
    const { ctx, page } = await open({ withImageCapture: false, takePhotoFails: false, camStub: TRACK_STUB });
    const cons = await page.evaluate(() => window.__constraints);
    const joined = cons.join(' | ');
    check('下发了受支持的宽高约束', /width/.test(joined), joined || '(无)');
    check('没有向不支持的能力硬下约束（尤其 focusMode）', !/focusMode/.test(joined), joined || '(无)');
    check('分辨率按 getSettings 如实显示', /2560×1440/.test(await page.$eval('#camMeta', (e) => e.textContent)), await page.$eval('#camMeta', (e) => e.textContent));
    await ctx.close();
  }
} catch (e) {
  console.log('  [异常]', e.message);
  fails.push('脚本异常: ' + e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n结论: ${fails.length ? 'FAIL ' + fails.join(' / ') : 'PASS 全部通过'}`);
process.exit(fails.length ? 1 : 0);

/**
 * 拍照三环境 + 能力约束验收（真 Chromium + 真 canvas 流，只 stub 相机与 ImageCapture）。
 * 来源：snapsaga_queue_check/check_capture.cjs —— 断言逐条保留、未放松，只换成仓库内实现，
 * 并对准 React 构建产物（web/dist）。
 *
 * 三种环境都要验：支持 ImageCapture → 用静止图像；takePhoto 抛错 → 回落抓帧；没有 ImageCapture → 抓帧。
 * 另外必须证明快门仍然不被阻塞（takePhoto 故意拖 300ms，点击仍须立刻返回）。
 *
 * v0.10 新增两组（[6][7]）：
 *   [6] **降级不再一次性** —— 单次失败只回落本次（下一张还会重试），stub 修好后立刻恢复真拍照；
 *       取景页左下角的取图方式标记跟着变（真拍照 = 金，抓帧 = 橙警示）。
 *   [7] **连续失败 3 次才降级** + 降级时 toast 告知一次 + 抽屉里的相机诊断区 + 「重新检测」当场自证。
 * 并把这些路径的**实测耗时**打成一张表（快门同步返回 / 照片落库完成），供人工对照。
 *
 * 跑法：npm run build && node e2e/acceptance-capture.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const SHOTS = resolve(HERE, 'artifacts');
const PORT = Number(process.env.SS_CAPTURE_PORT || 8196);
const STILL_BYTES = 12345; // 静止图像返回的可识别大小
const TAKE_PHOTO_MS = 300; // stub 故意拖延：用来验证快门不被阻塞，也用来量延迟

let fails = [];
/** 实测耗时表（真实数字，写进 artifacts 并打印出来） */
const timing = {};
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
    ({ withImageCapture, takePhotoFails, STILL_BYTES, TAKE_PHOTO_MS }) => {
      if (!withImageCapture) {
        delete window.ImageCapture;
        return;
      }
      // 可切换的 stub：__takePhotoMode 改成 'ok' 就“相机又能真拍照了”（模拟改过系统设置 / 换了环境）
      window.__takePhotoMode = takePhotoFails ? 'fail' : 'ok';
      window.__takePhotoCalls = 0;
      window.ImageCapture = class {
        constructor(track) {
          this.track = track;
        }
        async takePhoto() {
          window.__takePhotoCalls++;
          await new Promise((r) => setTimeout(r, TAKE_PHOTO_MS)); // 故意慢：用来验证快门不被阻塞
          if (window.__takePhotoMode === 'fail') throw new Error('stub: takePhoto 不支持该流');
          return new Blob([new Uint8Array(STILL_BYTES)], { type: 'image/jpeg' });
        }
      };
    },
    { withImageCapture, takePhotoFails, STILL_BYTES, TAKE_PHOTO_MS },
  );
  await page.goto(`${server.url}/app.html`);
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

/**
 * 在页面内量延迟（比在 node 侧量准：不含 CDP 往返）：
 *   clickMs = 快门点击处理同步返回的耗时（快门绝不能等 takePhoto / 网络）；
 *   shotMs = 从点击到照片真的落进 store（含 takePhoto 或抓帧 + 写 IndexedDB）的耗时。
 */
const shootTimed = (page) =>
  page.evaluate(async () => {
    const before = PHOTOS.length;
    const t0 = performance.now();
    document.querySelector('#shutter').click();
    const clickMs = performance.now() - t0;
    for (let i = 0; i < 400 && PHOTOS.length === before; i++) await new Promise((r) => setTimeout(r, 5));
    return { clickMs, shotMs: performance.now() - t0, photos: PHOTOS.length };
  });

/** 取景页左下角的取图方式标记（文案 / kind / 颜色）+ 抽屉诊断区一次读齐 */
const probeCaptureUi = (page) =>
  page.evaluate(() => {
    const markEl = document.querySelector('#camHudInfoShot');
    const txt = (sel) => (document.querySelector(sel) || {}).textContent || '';
    const diagEl = document.querySelector('#camDiag');
    const r = diagEl ? diagEl.getBoundingClientRect() : null;
    return {
      mark: (markEl?.textContent || '').trim(),
      markKind: markEl?.dataset.kind || '',
      markCls: markEl?.className || '',
      markColor: markEl ? getComputedStyle(markEl).color : '',
      still: cam.still,
      failures: cam.stillFailures,
      lastShot: cam.lastShot,
      calls: window.__takePhotoCalls,
      meta: txt('#camMeta'),
      toast: txt('#toast'),
      toastShow: document.querySelector('#toast').classList.contains('show'),
      diagVisible: !!r && getComputedStyle(diagEl).display !== 'none' && r.width > 0 && r.height > 0,
      diagIC: txt('#diagIC'),
      diagLast: txt('#diagLastStill'),
      diagRes: txt('#diagRes'),
      diagMode: txt('#diagShotMark'),
      diagFail: txt('#diagFail'),
      redetect: !!document.querySelector('#btnRedetect'),
    };
  });

try {
  console.log('\n[1] 支持 ImageCapture → 必须走「静止图像」');
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: false });
    const t = await shootTimed(page);
    const r = await page.evaluate(() => ({ shot: PHOTOS[0].shot, size: PHOTOS[0].blob.size, meta: ($('#camMeta') || {}).textContent, mark: $('#camHudInfoShot').textContent, kind: $('#camHudInfoShot').dataset.kind }));
    check('照片来自 takePhoto（大小 = 静止图像字节数）', r.size === STILL_BYTES, `${r.size} 字节`);
    check('入库记录标记 shot=still', r.shot === 'still', String(r.shot));
    check('取景信息条显示「静止图像」', /静止图像/.test(r.meta || ''), r.meta);
    check('相机分辨率信息有显示', /相机 \d+×\d+/.test(r.meta || ''), r.meta);
    check('取景页左下角标记显示「真拍照」（金色正常色）', r.mark === '真拍照' && r.kind === 'still', `${r.mark}/${r.kind}`);
    check('takePhoto 慢 300ms 时，快门点击仍立即返回', t.clickMs < 150, `${t.clickMs.toFixed(1)}ms`);
    console.log(`    实测：快门同步返回 ${t.clickMs.toFixed(1)} ms · 照片落库 ${t.shotMs.toFixed(0)} ms（stub takePhoto 故意 sleep ${TAKE_PHOTO_MS}ms）`);
    timing.stillOk = { clickMs: +t.clickMs.toFixed(1), shotMs: +t.shotMs.toFixed(0) };
    await ctx.close();
  }

  console.log('\n[2] takePhoto 抛错 → 本次回落抓帧，但**不永久降级**（下一张还会重试）');
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: true });
    const t = await shootTimed(page);
    const r = await probeCaptureUi(page);
    const stored = await page.evaluate(() => ({ shot: PHOTOS[0].shot, size: PHOTOS[0].blob.size }));
    check('回落到抓帧（shot=frame）', stored.shot === 'frame', String(stored.shot));
    check('抓帧大小等于预览分辨率（640×480）而不是静止图', stored.size !== STILL_BYTES && stored.size > 0, `${stored.size} 字节`);
    check('单次失败只回落**本次**：still 仍为 true（可重试）且连续失败计数 1/3', r.still === true && r.failures === 1, `still=${r.still} failures=${r.failures}`);
    check('这张确实又试了一次 takePhoto（没有直接跳过）', r.calls === 1, `${r.calls} 次`);
    check('信息条如实标出「本次：抓帧」（能力仍标为支持静止图像）', /本次：抓帧/.test(r.meta) && /支持静止图像/.test(r.meta), r.meta);
    check('取景页左下角标记显示「抓帧」且带警示色（warn）', r.mark === '抓帧' && r.markKind === 'frame' && /warn/.test(r.markCls), `${r.mark} ${r.markCls}`);
    console.log(`    实测：快门同步返回 ${t.clickMs.toFixed(1)} ms · 抓帧落库 ${t.shotMs.toFixed(0)} ms（失败后直接抓帧，不等满 300ms）`);
    timing.failFallback = { clickMs: +t.clickMs.toFixed(1), shotMs: +t.shotMs.toFixed(0) };
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

  console.log('\n[6] 降级不再一次性：单次失败后仍会重试，成功后立刻恢复「真拍照」');
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: true });
    const t1 = await shootTimed(page);
    const first = await probeCaptureUi(page);
    check(
      '第 1 张失败 → 抓帧，但仍是「可重试」状态（still=true / 计数 1/3）',
      first.lastShot === 'frame' && first.still === true && first.failures === 1 && first.calls === 1,
      JSON.stringify({ lastShot: first.lastShot, still: first.still, failures: first.failures, calls: first.calls }),
    );
    check('抓帧时左下角标记是「抓帧」且颜色是警示色', first.mark === '抓帧' && first.markKind === 'frame' && /warn/.test(first.markCls), `${first.mark} ${first.markCls}`);
    await page.screenshot({ path: resolve(SHOTS, 'capture-viewfinder-frame-mark.png') });

    // 把 stub 改成“相机又能真拍照了”（等价于用户改过系统设置 / 从独立模式重新打开）
    await page.evaluate(() => {
      window.__takePhotoMode = 'ok';
    });
    const t2 = await shootTimed(page);
    const second = await probeCaptureUi(page);
    const stored = await page.evaluate(() => ({ shot: PHOTOS[0].shot, size: PHOTOS[0].blob.size }));
    check('第 2 张重新尝试 takePhoto 并成功（kind=still，不再永久锁死为抓帧）', stored.shot === 'still' && stored.size === STILL_BYTES && second.calls === 2, JSON.stringify({ ...stored, calls: second.calls }));
    check('连续失败计数在成功一次后归零、still 保持 true', second.failures === 0 && second.still === true, `failures=${second.failures} still=${second.still}`);
    check('标记回到「真拍照」，颜色由警示色变回正常色', second.mark === '真拍照' && !/warn/.test(second.markCls) && second.markColor !== first.markColor, `${first.markColor} → ${second.markColor}`);
    check('信息条也跟着变回「本次：静止图像」', /本次：静止图像/.test(second.meta), second.meta);
    console.log(`    实测：失败回落 快门同步 ${t1.clickMs.toFixed(1)} ms / 落库 ${t1.shotMs.toFixed(0)} ms`);
    console.log(`          成功真拍照 快门同步 ${t2.clickMs.toFixed(1)} ms / 落库 ${t2.shotMs.toFixed(0)} ms`);
    timing.retryRecovered = { clickMs: +t2.clickMs.toFixed(1), shotMs: +t2.shotMs.toFixed(0) };
    await ctx.close();
  }

  console.log('\n[7] 连续失败 3 次才降级（toast 只告知一次）+ 抽屉诊断区 + 「重新检测」');
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: true });
    await shootTimed(page);
    await shootTimed(page);
    const mid = await probeCaptureUi(page);
    check('连续失败 2 次：仍在阈值之下，照样可重试（still=true / 2/3）', mid.still === true && mid.failures === 2, `still=${mid.still} failures=${mid.failures}`);

    const t3 = await shootTimed(page);
    const down = await probeCaptureUi(page);
    check('连续失败 3 次才降级为「仅抓帧」（still=false / 3/3）', down.still === false && down.failures === 3, `still=${down.still} failures=${down.failures}`);
    check('降级那一刻用 toast 明确告知一次（并指路「重新检测」）', down.toastShow && /抓帧/.test(down.toast) && /重新检测/.test(down.toast), down.toast);
    check('#camMeta 从「支持静止图像」改成「仅能抓帧」', /仅能抓帧/.test(down.meta), down.meta);
    check('降级后左下角标记仍是「抓帧」（警示色）', down.mark === '抓帧' && /warn/.test(down.markCls), `${down.mark} ${down.markCls}`);
    console.log(`    实测：第 3 次失败 → 降级（标记 true→false，文案「真拍照」→「抓帧」）；快门同步 ${t3.clickMs.toFixed(1)} ms / 落库 ${t3.shotMs.toFixed(0)} ms`);
    timing.thirdFailureDowngrade = { clickMs: +t3.clickMs.toFixed(1), shotMs: +t3.shotMs.toFixed(0) };

    const t4 = await shootTimed(page);
    const after = await probeCaptureUi(page);
    check('降级后不再每张白等一次失败（takePhoto 调用次数不增）', after.calls === 3, `${after.calls} 次`);
    check('降级提示只弹一次（第 4 张不再重复告知）', !/已切换为抓帧/.test(after.toast), after.toast);
    console.log(`    实测：降级后第 4 张只抓帧 快门同步 ${t4.clickMs.toFixed(1)} ms / 落库 ${t4.shotMs.toFixed(0)} ms（不再白等 ${TAKE_PHOTO_MS}ms 的失败）`);
    timing.afterDowngrade = { clickMs: +t4.clickMs.toFixed(1), shotMs: +t4.shotMs.toFixed(0) };

    // 抽屉里的「相机诊断」区：用户在真机（含 iPhone 独立模式）上自证用
    await page.click('#btnCamSheet');
    await sleep(400);
    await page.evaluate(() => {
      const el = document.querySelector('#camSheet');
      el.scrollTop = el.scrollHeight;
    });
    await sleep(250);
    const diag = await probeCaptureUi(page);
    check('抽屉里能看到「相机诊断」区（可见、不折叠）', diag.diagVisible, String(diag.diagVisible));
    check('诊断区：ImageCapture 存在于 window 且 takePhoto 失败', /存在/.test(diag.diagIC) && /失败/.test(diag.diagIC), diag.diagIC);
    check('诊断区：最近一次 takePhoto 的结果含失败原因与耗时 ms', /失败/.test(diag.diagLast) && /ms/.test(diag.diagLast), diag.diagLast);
    check('诊断区：实际分辨率（track.getSettings()）', /相机 640×480/.test(diag.diagRes), diag.diagRes);
    check('诊断区：当前取图方式 = 抓帧，连续失败 3/3', /抓帧/.test(diag.diagMode) && /^3\/3$/.test(diag.diagFail.trim()), `${diag.diagMode} · ${diag.diagFail.trim()}`);
    check('诊断区有「重新检测」按钮', diag.redetect);
    await page.screenshot({ path: resolve(SHOTS, 'capture-camdiag-downgraded.png') });

    // 「重新检测」：stub 修好后点一下，当场再试一次 takePhoto → 恢复真拍照
    await page.evaluate(() => {
      window.__takePhotoMode = 'ok';
    });
    await page.click('#btnRedetect');
    await sleep(700);
    const recovered = await probeCaptureUi(page);
    check('点「重新检测」后当场试一次 takePhoto 并成功 → 恢复「真拍照」', recovered.still === true && recovered.failures === 0 && recovered.diagMode === '真拍照', `still=${recovered.still} failures=${recovered.failures} mode=${recovered.diagMode}`);
    check('重新检测结果（成功 / 字节数 / 耗时 ms）显示在诊断区', /成功/.test(recovered.diagLast) && new RegExp(`${STILL_BYTES} 字节`).test(recovered.diagLast) && /ms/.test(recovered.diagLast), recovered.diagLast);
    check('恢复后信息条不再说「仅能抓帧」', !/仅能抓帧/.test(recovered.meta), recovered.meta);
    await page.screenshot({ path: resolve(SHOTS, 'capture-camdiag-redetected.png') });
    await ctx.close();
  }

  // 取景页标记的截图（关闭抽屉、真拍照态）
  {
    const { ctx, page } = await open({ withImageCapture: true, takePhotoFails: false });
    await shootTimed(page);
    await page.screenshot({ path: resolve(SHOTS, 'capture-viewfinder-still-mark.png') });
    await ctx.close();
  }

  console.log('\n[实测数字] 真 Chromium + ImageCapture stub（takePhoto 故意 sleep 300ms）');
  for (const [k, v] of Object.entries(timing)) {
    console.log(`  ${k.padEnd(24)} 快门同步返回 ${String(v.clickMs).padStart(5)} ms · 照片落库 ${String(v.shotMs).padStart(5)} ms`);
  }
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, 'capture-timing.json'), JSON.stringify(timing, null, 2) + '\n');
  console.log(`  截图 / 数字已写入 ${SHOTS}`);
} catch (e) {
  console.log('  [异常]', e.message);
  fails.push('脚本异常: ' + e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n结论: ${fails.length ? 'FAIL ' + fails.join(' / ') : 'PASS 全部通过'}`);
process.exit(fails.length ? 1 : 0);

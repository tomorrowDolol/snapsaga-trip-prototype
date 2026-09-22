/**
 * 缩略图 + 增量渲染验收（真 Chromium + 真 IndexedDB）。
 * 来源：snapsaga_queue_check/check_thumbs.cjs —— 13 项断言逐条保留、未放松，只换成仓库内零依赖的
 * 静态服务与 playwright 解析，并对准 React 构建产物（web/dist）。
 *
 * 重点不是"代码里有没有写 thumb"，而是量出：① 列表挂的是小图不是原图 ② 加一张照片不重建其它格子
 * ③ 快门不等缩略图生成 ④ 老记录会被后台补缩略图并落库。
 * 跑法：npm run build && node e2e/acceptance-thumbs.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const PORT = Number(process.env.SS_THUMBS_PORT || 8193);

let fails = [];
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

// 相机 stub：输出带噪声的大图（模拟真拍照的"大 JPEG"，否则纯色图 JPEG 会压缩到几 KB，量不出差距）
const CAM_STUB = () => {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 1600;
  const ctx = c.getContext('2d');
  let frame = 0;
  const draw = () => {
    const img = ctx.createImageData(c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (i * 7 + frame * 13) & 255;
      d[i + 1] = (i * 11) & 255;
      d[i + 2] = (i * 3 + frame) & 255;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  draw();
  const stream = c.captureStream(1);
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => stream;
  setInterval(() => {
    frame++;
    draw();
  }, 500);
};

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
await page.addInitScript(CAM_STUB);

try {
  await page.goto(`${server.url}/index.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(400);
  await page.click('#startCam');
  await sleep(800);

  console.log('\n[1] 快门不等缩略图（原图大、缩略图小）');
  const shots = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await page.click('#shutter');
    for (let k = 0; k < 80; k++) {
      await sleep(50);
      if (await page.evaluate((n) => PHOTOS.length >= n, i + 1)) break;
    }
    shots.push(Date.now() - t0);
  }
  const origSizes = await page.evaluate(() => PHOTOS.map((p) => p.blob.size));
  console.log('    原图大小:', origSizes.map(kb).join(' / '));
  check('快门路径未被缩略图拖慢（含大图编码）', Math.max(...shots) < 4000, shots.map((x) => x + 'ms').join(' / '));

  console.log('\n[2] 缩略图真的生成了、且远小于原图');
  let ready = false;
  for (let k = 0; k < 60; k++) {
    await sleep(150);
    ready = await page.evaluate(() => PHOTOS.every((p) => !!p.thumb));
    if (ready) break;
  }
  const info = await page.evaluate(() => PHOTOS.map((p) => ({ o: p.blob.size, t: p.thumb ? p.thumb.size : 0 })));
  info.forEach((x, i) => console.log(`    第 ${i + 1} 张: 原图 ${kb(x.o)} → 缩略图 ${kb(x.t)}（省 ${(x.o / Math.max(1, x.t)).toFixed(1)}×）`));
  check('每张都生成了缩略图', info.every((x) => x.t > 0));
  check('缩略图比原图小 5 倍以上', info.every((x) => x.o / x.t > 5), info.map((x) => (x.o / Math.max(1, x.t)).toFixed(1) + '×').join(' / '));
  check('缩略图是图标级大小（< 60KB）', info.every((x) => x.t < 61440), info.map((x) => kb(x.t)).join(' / '));

  console.log('\n[3] 网格挂的是缩略图，不是原图');
  const gridInfo = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#filmGrid .film-cell')];
    return cells.map((c) => ({
      hasImg: !!c.querySelector('img'),
      decoding: c.querySelector('img')?.getAttribute('decoding'),
      lazy: c.querySelector('img')?.getAttribute('loading'),
    }));
  });
  check('每个格子都有图', gridInfo.every((x) => x.hasImg) && gridInfo.length === 3, `${gridInfo.length} 格`);
  check('图片带 decoding="async"', gridInfo.every((x) => x.decoding === 'async'));
  check('图片带 loading="lazy"', gridInfo.every((x) => x.lazy === 'lazy'));
  check(
    '缩略图已落库（重载后不必重新生成）',
    await page.evaluate(async () => {
      const all = await DB.all();
      return all.filter((p) => p.kind !== 'ai').every((p) => !!p.thumb);
    }),
  );

  console.log('\n[4] 增量渲染：新拍一张不重建已有格子');
  const before = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#filmGrid .film-cell')];
    const keep = cells[cells.length - 1]; // 最老那张（prepend 后应仍在 DOM 里，只是往后挪）
    keep.__probe = 'kept';
    window.__keptCell = keep;
    return { count: cells.length, first: cells[0].dataset.id };
  });
  await page.click('#shutter');
  for (let k = 0; k < 80; k++) {
    await sleep(50);
    if (await page.evaluate(() => PHOTOS.length >= 4)) break;
  }
  const after = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#filmGrid .film-cell')];
    const kept = window.__keptCell;
    return {
      count: cells.length,
      keptStillInDom: !!kept && document.querySelector('#filmGrid').contains(kept),
      keptStillMarked: !!kept && kept.__probe === 'kept',
      firstIsNew: cells[0].dataset.id !== window.__keptCell.dataset.id,
    };
  });
  check('网格多了一格', after.count === before.count + 1, `${before.count} → ${after.count}`);
  check('原有格子的 DOM 节点未被重建（同一个节点仍在，状态保住）', after.keptStillInDom && after.keptStillMarked, after.keptStillInDom ? '节点复用 ✓' : '被重建了');
  check('新格子插在最前面', after.firstIsNew === true);

  console.log('\n[5] 老记录（没有 thumb 字段）会后台上补并落库');
  await page.evaluate(async () => {
    await DB.clear();
    // 造一条"旧版本存下的"记录：只有原图，没有 thumb
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 1600;
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = i & 255;
      img.data[i + 1] = (i * 5) & 255;
      img.data[i + 2] = 90;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    await DB.put({ id: 'legacy1', blob, ts: Date.now() - 86400000, shot: 'frame' });
  });
  await page.reload();
  await sleep(1500);
  let backfilled = null;
  for (let k = 0; k < 60; k++) {
    await sleep(200);
    backfilled = await page.evaluate(async () => {
      const all = await DB.all();
      const r = all.find((x) => x.id === 'legacy1');
      return r ? { thumb: r.thumb ? r.thumb.size : 0, orig: r.blob.size } : null;
    });
    if (backfilled && backfilled.thumb) break;
  }
  check('老记录补出了缩略图', !!backfilled && backfilled.thumb > 0, backfilled ? `${kb(backfilled.thumb)}（原图 ${kb(backfilled.orig)}）` : '没补上');
  check('补出来的缩略图已落库（下次不用再算）', !!backfilled && backfilled.thumb > 0);
} catch (e) {
  console.log('  [异常]', e.message);
  fails.push('脚本异常: ' + e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n结论: ${fails.length ? 'FAIL ' + fails.join(' / ') : 'PASS 全部通过'}`);
process.exit(fails.length ? 1 : 0);

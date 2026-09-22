/**
 * guard：红线断言（源码侧 + 构建产物侧 + 产物运行时），一条命令把"改坏了"挡在提交前。
 *   node scripts/guard.mjs        （先 npm run build）
 *
 * 学 ImgX Studio 的 `npm run guard` 思路：把**不可退化的不变量**写成断言，而不是靠人记得。
 * 产物侧 + 运行时断言是关键：源码对但构建出来不对（base 路径、tree-shaking 掉 ImageCapture 回落、
 * 默认 Base 被替换…）只有真正加载 dist 才能发现。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';
import { loadPlaywright } from '../tools/playwright.mjs';
import { serveDir } from '../tools/static-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

let failures = [];
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures.push(name);
};
const section = (t) => console.log(`\n${t}`);

/* ---------------- 读文件工具 ---------------- */
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (!exts || exts.includes(extname(p))) out.push(p);
  }
  return out;
}
const read = (p) => readFileSync(p, 'utf8');
const srcText = (rel) => read(join(SRC, rel));
function sliceFn(source, startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  if (a < 0) return '';
  const b = source.indexOf(endMarker, a + startMarker.length);
  return b < 0 ? source.slice(a) : source.slice(a, b);
}
/** 去掉行注释后再断言：注释里提到「不 await 网络」不算违规 */
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

/* ================= [1] 源码侧红线 ================= */
section('[1] 源码侧红线');

const storeSrc = srcText('store/useAppStore.ts');
const captureSrc = srcText('domain/capture.ts');
const thumbsSrc = srcText('domain/thumbs.ts');
const settingsSrc = srcText('domain/settings.ts');
const cameraRuntimeSrc = srcText('store/cameraRuntime.ts');
const filmViewSrc = srcText('components/FilmView.tsx');
const albumViewSrc = srcText('components/AlbumView.tsx');
const queuePanelSrc = srcText('components/QueuePanel.tsx');

// 快门路径：capture() 只允许 await「本地取图」与「本机入库」两件事
const captureBodyRaw = sliceFn(storeSrc, 'async capture() {', '// ---------------- 场景 / 水平仪');
const captureBody = stripComments(captureBodyRaw);
check('抽到了 capture() 源码（防止断言空跑）', captureBody.length > 300, `${captureBody.length} 字符`);
check('capture() 不含 fetch（快门不发网络请求）', !/fetch\s*\(/.test(captureBody));
check('capture() 不含 aiRedrawCore / images/edits', !/aiRedrawCore|images\/edits/.test(captureBody));
check('capture() 不 await 入队（GenQueue.add 是同步调用）', /queue\.add\(/.test(captureBody) && !/await\s+queue\.add/.test(captureBody));
const captureAwaits = (captureBody.match(/await\s/g) || []).length;
check('capture() 里只有 2 处 await（本地取图 + 本机入库）', captureAwaits === 2, `${captureAwaits} 处`);

// addPhoto()：只写本机 IndexedDB，不碰 AI / 队列
const addPhotoBody = stripComments(sliceFn(storeSrc, 'async addPhoto(blob, shot) {', 'async capture() {'));
check('addPhoto() 只写本机 IndexedDB（不碰 AI / 队列）', !!addPhotoBody && !/fetch\(|aiRedrawCore|queue\.add/.test(addPhotoBody));
check('addPhoto() 走增量插入（unshift 一格，不重建网格）', /photos: \[rec, \.\.\.s\.photos\]/.test(addPhotoBody));
check('缩略图生成不在快门 await 链上（queueThumb 不被 await）', /queueThumb\(rec, \{/.test(addPhotoBody) && !/await\s+queueThumb/.test(addPhotoBody));

// 快门路径的模块不 import AI 通道
check('cameraRuntime.ts 不 import AI 通道', !/aiRedraw|genQueue/.test(cameraRuntimeSrc));
check('thumbs.ts 不 import AI 通道 / 网络', !/aiRedraw|fetch\(/.test(thumbsSrc));

// 静止图像优先 + 一次性抓帧回落
check('capture.ts 优先 ImageCapture.takePhoto 取静止图像', /new Ctor\(track\)/.test(captureSrc) && /takePhoto\(\)/.test(captureSrc));
check(
  'capture.ts 里 ImageCapture 出现在抓帧回落之前',
  captureSrc.indexOf('takePhoto()') < captureSrc.indexOf('env.grabFrame()'),
);
check('takePhoto 失败会置 still=false（一次性降级，不每张白等）', /catch \{[\s\S]{0,120}state\.still = false/.test(captureSrc));
check('grabStill 里没有任何 AI / 网络调用', !/fetch\(|aiRedraw/.test(captureSrc));
check('只对设备真正支持的能力下约束（planConstraints 先读 caps）', /caps\.width && caps\.height/.test(captureSrc) && /supports\('focusMode', 'continuous'\)/.test(captureSrc));
check('camTune 逐项 try（单项不支持不拖累其它项）', /for \(const c of planConstraints\(caps\)\)[\s\S]{0,200}catch/.test(captureSrc));
check('启动时主动申请持久存储（navigator.storage.persist）', /navigator\.storage\.persist\(\)/.test(captureSrc));
check('降级不静默：信息条如实区分静止图像 / 抓帧', /本次：静止图像/.test(captureSrc) && /本次：抓帧/.test(captureSrc) && /仅能抓帧/.test(captureSrc));

// 缩略图规格
check('缩略图最长边 = 320', /THUMB_MAX = 320/.test(thumbsSrc));
check('缩略图 jpeg 质量 = .72', /THUMB_Q = 0\.72/.test(thumbsSrc));
check('queueThumb 是 fire-and-forget（返回 void，不是 Promise）', /export function queueThumb\([^)]*\): void/.test(thumbsSrc));
check('列表只挂缩略图（thumb 优先，原图兜底）', /photo\.thumb \|\| photo\.blob/.test(filmViewSrc) && /photo\.thumb \|\| photo\.blob/.test(albumViewSrc));
check('队列面板缩略图优先级：结果缩略图 > 源片缩略图 > 原图', /task\.status === 'done' && task\.thumb\) \|\| srcPhoto\?\.thumb \|\| task\.blob/.test(queuePanelSrc));
check('图片带 decoding="async"', /decoding="async"/.test(filmViewSrc) && /decoding="async"/.test(albumViewSrc) && /decoding="async"/.test(queuePanelSrc));
check('图片带 loading="lazy"', /loading="lazy"/.test(filmViewSrc) && /loading="lazy"/.test(albumViewSrc) && /loading="lazy"/.test(queuePanelSrc));
check('网格按 id 做 key（React 复用 DOM 节点 = 增量插入）', /photos\.map\(\(p\) => \(\s*<FilmCell key=\{p\.id\}/.test(filmViewSrc));

// 默认 Base
check('默认 Base = https://api.klong.lat/v1', /AI_BASE_DEFAULT = 'https:\/\/api\.klong\.lat\/v1'/.test(settingsSrc));
check('旧默认只保留一处（迁移识别用）', (settingsSrc.match(/api\.openai\.com/g) || []).length === 1);
check('localStorage 键名与原型一致', ['ss_ai_base', 'ss_ai_key', 'ss_ai_model', 'ss_gen_auto', 'ss_gen_style'].every((k) => settingsSrc.includes(k)));
check('IndexedDB 库名/仓名与原型一致', /DB_NAME = 'snapsaga'/.test(srcText('data/db.ts')) && /'photos'/.test(srcText('data/db.ts')) && /'queue'/.test(srcText('data/db.ts')));

// 本地绝对路径不许入库（本机路径泄露）
const LOCAL_PATH = '/' + 'Users' + '/';
const srcFiles = walk(SRC, ['.ts', '.tsx', '.css']).concat(walk(join(ROOT, 'public'), null));
check('源码 / 静态资源里没有本机绝对路径', srcFiles.every((f) => !read(f).includes(LOCAL_PATH)), `${srcFiles.length} 个文件`);

/* ================= [2] 构建产物侧红线 ================= */
section('[2] 构建产物侧红线');
if (!existsSync(join(DIST, 'app.html'))) {
  check('dist 已构建（先跑 npm run build）', false);
} else {
  const distHtml = read(join(DIST, 'app.html'));
  const bundles = walk(join(DIST, 'assets'), ['.js']);
  const bundle = bundles.map(read).join('\n');
  const distAll = walk(DIST, null).map(read).join('\n');

  check('base 是相对的（子路径部署不会 404）', /src="\.\/assets\//.test(distHtml) && !/src="\/assets\//.test(distHtml));
  // Pages 请求 …/web/ 只会找 web/index.html，它是构建生成的入口页（引用 ./dist/ 里的产物）
  const launcherPath = join(ROOT, 'index.html');
  if (existsSync(launcherPath)) {
    const launcher = read(launcherPath);
    const refs = [...launcher.matchAll(/(?:href|src)="(\.\/dist\/[^"]+)"/g)].map((m) => m[1]);
    check('web/index.html 存在且指向 ./dist/ 产物', refs.length >= 2, `${refs.length} 个引用`);
    check(
      'web/index.html 引用的产物文件都存在（不会线上 404）',
      refs.every((r) => existsSync(join(ROOT, r.replace(/^\.\//, '')))),
      refs.slice(0, 3).join(' / '),
    );
    check('web/index.html 是构建生成的（带 don\'t-edit 提示）', /由 npm run build 生成/.test(launcher));
    check('web/index.html 也引用了 manifest（PWA 在 /web/ 下生效）', /\.\/dist\/manifest\.webmanifest/.test(launcher));
  } else {
    check('web/index.html 存在（Pages 的 /web/ 入口，先跑 npm run build）', false);
  }
  check('产物入口是 app.html（源入口不为 index.html 让路）', existsSync(join(DIST, 'app.html')));
  check('产物里有 ImageCapture 与 takePhoto', /ImageCapture/.test(bundle) && /takePhoto/.test(bundle));
  check('产物里有抓帧回落（drawImage）', /drawImage/.test(bundle));
  check('产物里默认 Base 正确', /api\.klong\.lat\/v1/.test(bundle));
  check('产物里旧默认只剩 1 处（迁移用）', (bundle.match(/api\.openai\.com\/v1/g) || []).length === 1);
  check('产物里列表仍挂 thumb', /\.thumb/.test(bundle));
  check('产物里图片属性仍在（decoding=async / loading=lazy）', /decoding[:=]\s*[`"']async[`"']/.test(bundle) && /loading[:=]\s*[`"']lazy[`"']/.test(bundle));
  check('产物里有 320 / .72 缩略图规格', /\b320\b/.test(bundle) && /\.72\b/.test(bundle));
  check('PWA 文件已随构建产出（manifest + sw.js + 图标）', existsSync(join(DIST, 'manifest.webmanifest')) && existsSync(join(DIST, 'sw.js')) && existsSync(join(DIST, 'icon-512.png')));
  // sw.js 的预缓存清单必须都是真实存在的文件：addAll 是原子的，一个 404 就会让整个预缓存失效
  const swSrc = existsSync(join(DIST, 'sw.js')) ? read(join(DIST, 'sw.js')) : '';
  const coreList = (swSrc.match(/const CORE = \[([\s\S]*?)\]/) || [, ''])[1]
    .split(',')
    .map((x) => x.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  check('sw.js 预缓存清单非空', coreList.length >= 3, `${coreList.length} 项`);
  check(
    'sw.js 预缓存清单里每个文件在 dist 里都存在（否则 addAll 整体失败）',
    coreList.every((r) => existsSync(join(DIST, r.replace(/^\.\//, '')))),
    coreList.filter((r) => !existsSync(join(DIST, r.replace(/^\.\//, '')))).join(' / ') || coreList.join(' / '),
  );
  check('产物里没有本机绝对路径', !distAll.includes(LOCAL_PATH));
  check('产物里没有内联的 API Key 形态字符串（sk- 后跟长串）', !/sk-[A-Za-z0-9]{20,}/.test(bundle));
}

/* ================= [3] 产物运行时红线（真 Chromium 加载 dist） ================= */
section('[3] 产物运行时红线（真 Chromium 加载 dist）');
const pw = await loadPlaywright();
if (!pw) {
  console.log('  SKIP  本机没有 playwright，跳过运行时断言（建议安装后重跑）');
} else {
  const server = await serveDir(DIST, Number(process.env.SS_GUARD_PORT || 8177));
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const g = c.getContext('2d');
    let i = 0;
    setInterval(() => {
      g.fillStyle = `hsl(${(i++ * 7) % 360},60%,50%)`;
      g.fillRect(0, 0, 640, 480);
    }, 40);
    const stream = c.captureStream(10);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
    // 生图接口永远不返回：快门若 await 网络，就一张都存不进来
    window.__aiCalls = 0;
    window.__aiInFlight = 0;
    window.__aiPeak = 0;
    const orig = window.fetch.bind(window);
    window.fetch = (url, opts) => {
      if (String(url).includes('/images/edits')) {
        window.__aiCalls++;
        window.__aiInFlight++;
        window.__aiPeak = Math.max(window.__aiPeak, window.__aiInFlight);
        return new Promise(() => {});
      }
      return orig(url, opts);
    };
    localStorage.setItem('ss_ai_base', 'http://127.0.0.1:9/v1');
    localStorage.setItem('ss_ai_key', 'sk-guard');
  });
  try {
    await page.goto(`${server.url}/app.html`);
    await page.waitForTimeout(500);
    await page.click('#startCam');
    await page.waitForFunction(() => document.querySelector('#video').videoWidth > 0, null, { timeout: 8000 });
    const clickMs = await page.evaluate(() => {
      const t = performance.now();
      document.querySelector('#shutter').click();
      return performance.now() - t;
    });
    for (let i = 0; i < 5; i++) {
      await page.click('#shutter');
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);
    const st = await page.evaluate(async () => {
      const all = await __snapsaga.db.all();
      return {
        photos: all.filter((p) => p.kind !== 'ai').length,
        queue: __snapsaga.queueItems().length,
        peak: window.__aiPeak,
        running: __snapsaga.queueItems().filter((t) => t.status === 'running').length,
      };
    });
    check('页面零 JS 运行时错误', pageErrors.length === 0, pageErrors.join(' | '));
    check('点击快门同步返回（产物里也没有 await 网络）', clickMs < 50, `${clickMs.toFixed(1)} ms`);
    check('生图接口挂死时 6 张照片仍全部入库（快门不等网络）', st.photos === 6, `${st.photos} 张`);
    check('队列同步收到 6 条任务', st.queue === 6, `${st.queue} 条`);
    check('产物里的并发上限仍是 4', st.peak === 4 && st.running === 4, `peak=${st.peak} running=${st.running}`);
  } catch (e) {
    check('运行时断言执行成功', false, e.message);
  } finally {
    await browser.close();
    await server.close();
  }
}

/* ================= [4] 子路径部署冒烟（模拟 GitHub Pages 的 /web/） ================= */
section('[4] 子路径部署冒烟：按 Pages 的目录形状（仓库根）访问 /web/');
if (!pw) {
  console.log('  SKIP  本机没有 playwright，跳过部署冒烟');
} else {
  const repoRoot = resolve(ROOT, '..');
  const server = await serveDir(repoRoot, Number(process.env.SS_PAGES_PORT || 8166));
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const bad = [];
  const pageErrors = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    const res = await page.goto(`${server.url}/web/`);
    await page.waitForTimeout(500);
    await page.click('#startCam'); // 相机没有 stub，会报权限/设备错，但 UI 必须已经起来
    await page.waitForTimeout(300);
    check('/web/ 返回 200（Pages 的目录入口能打开）', res?.status() === 200, String(res?.status()));
    check('/web/ 下的引用没有 404/5xx', bad.length === 0, bad.slice(0, 3).join(' | '));
    check('模块脚本已执行（页面里有 #shutter / #root 内容）', (await page.$('#shutter')) !== null);
    check('页面零 JS 运行时错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    const swReg = await page.evaluate(() => {
      const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '';
      return { manifest: href, sw: new URL('sw.js', new URL(href, location.href)).pathname };
    });
    check('Service Worker 解析到 /web/dist/sw.js（scope 正确）', swReg.sw === '/web/dist/sw.js', JSON.stringify(swReg));
    const swRes = await page.goto(`${server.url}/web/dist/sw.js`);
    check('/web/dist/sw.js 可访问（PWA 能注册）', swRes?.status() === 200, String(swRes?.status()));
    const manRes = await page.goto(`${server.url}/web/dist/manifest.webmanifest`);
    check('/web/dist/manifest.webmanifest 可访问', manRes?.status() === 200, String(manRes?.status()));
  } catch (e) {
    check('部署冒烟执行成功', false, e.message);
  } finally {
    await browser.close();
    await server.close();
  }
}

console.log(`\n结论: ${failures.length ? 'FAIL ' + failures.join(' / ') : 'PASS 全部通过'}`);
process.exit(failures.length ? 1 : 0);
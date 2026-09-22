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
const queueSrc = srcText('domain/genQueue.ts');
const themesSrc = srcText('domain/themes.ts');
const promptSrc = srcText('domain/promptBuilder.ts');
const collageSrc = srcText('domain/collage.ts');
const queueRuntimeSrc = srcText('store/queueRuntime.ts');
const themeViewSrc = srcText('components/ThemeView.tsx');
const themeCreateSrc = srcText('components/ThemeCreateSheet.tsx');
const darkroomSrc = srcText('components/DarkroomView.tsx');
const cameraViewSrc = srcText('components/CameraView.tsx');
const cameraSheetSrc = srcText('components/CameraSheet.tsx');
const appHeaderSrc = srcText('components/AppHeader.tsx');
const stylesSrc = srcText('styles.css');
const bridgeSrc = srcText('debug/bridge.ts');

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

/* ---------- 取景页「干净相机界面」红线（v0.9） ----------
   取景画面必须占满、快门必须永远在屏内且不被遮挡；辅助 UI 只能在抽屉里。
   这组断言是几何不变量的**源码侧**部分，几何本身由 e2e/acceptance-camera-layout 在两个视口下量。 */
const SHEET_BLOCKS = ['id="skins"', 'id="fr2"', 'id="genBar"', 'id="sunBar"', 'id="camMeta"'];
check(
  '辅助 UI 全部收在 CameraSheet 抽屉里（场景相机/焦距/胶片与风格/黄金时刻/诊断信息）',
  SHEET_BLOCKS.every((s) => cameraSheetSrc.includes(s)),
  SHEET_BLOCKS.filter((s) => !cameraSheetSrc.includes(s)).join(' / ') || '5/5',
);
check(
  '这些辅助块没留在取景画面里（CameraView 不再渲染它们）',
  SHEET_BLOCKS.every((s) => !cameraViewSrc.includes(s)),
  SHEET_BLOCKS.filter((s) => cameraViewSrc.includes(s)).join(' / ') || '(无)',
);
check(
  '抽屉挂在取景画面里（在 #camWrap 之后、底栏 #camDock 之前 → 永远盖不到快门）',
  cameraViewSrc.indexOf('id="camWrap"') < cameraViewSrc.indexOf('<CameraSheet') &&
    cameraViewSrc.indexOf('<CameraSheet') < cameraViewSrc.indexOf('id="camDock"'),
);
check('#shutter 在固定底栏 dock 里（id 与行为不变）', cameraViewSrc.indexOf('id="camDock"') < cameraViewSrc.indexOf('id="shutter"'));
check('#shutter 在源码里只有一个定义（不会出现重复 id 抢点击）', (cameraViewSrc.match(/id="shutter"/g) || []).length === 1);
check('dock 里有打开抽屉的「相机」按钮', /id="btnCamSheet"/.test(cameraViewSrc));
check('取景页不滚动（#view-cam overflow:hidden）', /#view-cam\{overflow:hidden\}/.test(stylesSrc));
check('取景画面不设最小高度（短屏也不把底栏挤出屏幕）', /#camWrap\{[^}]*min-height:0/.test(stylesSrc));
check('取景页隐藏 AppHeader', /header\.app\.cam-hidden\{display:none\}/.test(stylesSrc) && /cam-hidden/.test(appHeaderSrc));
check('取景器右上角小圆钮提供队列 / 设置入口（入口不能丢）', /id="btnQueue"/.test(cameraViewSrc) && /id="btnSettings"/.test(cameraViewSrc));
check('队列 / 设置入口在取景页只有一份实例（AppHeader 在取景页不渲染它们）', /inCam \? null/.test(appHeaderSrc) && /cam-hidden/.test(appHeaderSrc));
check(
  '构图提示是单行 + 3–4 秒自动淡出（不再是常驻大卡）',
  /white-space:nowrap/.test(stylesSrc) && /setTimeout\(\(\) => setHintOn\(false\), 3\d{3}\)/.test(cameraViewSrc),
);
check('相机抽屉是取景画面内的绝对定位层（不会盖住底栏）', /#camSheet\{[^}]*position:absolute/.test(stylesSrc));
check('抽屉支持下拉关闭（把手上有指针手势）', /onPointerDown/.test(cameraSheetSrc) && /setPointerCapture/.test(cameraSheetSrc));
check('调试桥暴露相机抽屉开关（e2e 需要先开抽屉再点里面的元素）', /openCameraSheet/.test(bridgeSrc) && /closeCameraSheet/.test(bridgeSrc));

// 缩略图规格
check('缩略图最长边 = 320', /THUMB_MAX = 320/.test(thumbsSrc));
check('缩略图 jpeg 质量 = .72', /THUMB_Q = 0\.72/.test(thumbsSrc));
check('queueThumb 是 fire-and-forget（返回 void，不是 Promise）', /export function queueThumb\([^)]*\): void/.test(thumbsSrc));
check('列表只挂缩略图（thumb 优先，原图兜底）', /photo\.thumb \|\| photo\.blob/.test(filmViewSrc) && /photo\.thumb \|\| photo\.blob/.test(albumViewSrc));
check('队列面板缩略图优先级：结果缩略图 > 源片缩略图 > 原图', /task\.status === 'done' && task\.thumb\) \|\| srcPhoto\?\.thumb \|\| task\.blob/.test(queuePanelSrc));
check('图片带 decoding="async"', /decoding="async"/.test(filmViewSrc) && /decoding="async"/.test(albumViewSrc) && /decoding="async"/.test(queuePanelSrc));
check('图片带 loading="lazy"', /loading="lazy"/.test(filmViewSrc) && /loading="lazy"/.test(albumViewSrc) && /loading="lazy"/.test(queuePanelSrc));
check('网格按 id 做 key（React 复用 DOM 节点 = 增量插入）', /<FilmCell key=\{p\.id\}/.test(filmViewSrc));

// 默认 Base
check('默认 Base = https://api.klong.lat/v1', /AI_BASE_DEFAULT = 'https:\/\/api\.klong\.lat\/v1'/.test(settingsSrc));
check('旧默认只保留一处（迁移识别用）', (settingsSrc.match(/api\.openai\.com/g) || []).length === 1);
check('localStorage 键名与原型一致', ['ss_ai_base', 'ss_ai_key', 'ss_ai_model', 'ss_gen_auto', 'ss_gen_style'].every((k) => settingsSrc.includes(k)));
check('IndexedDB 库名/仓名与原型一致', /DB_NAME = 'snapsaga'/.test(srcText('data/db.ts')) && /'photos'/.test(srcText('data/db.ts')) && /'queue'/.test(srcText('data/db.ts')));
// 主题记录另开一个库：根原型把 snapsaga 钉在 v2，升到 v3 会让它直接 VersionError 打不开
check('主题库是独立的（不把 snapsaga 升版本，根原型仍能读数据）', /THEMES_DB_NAME = 'snapsaga_themes'/.test(srcText('data/themesDb.ts')) && /DB_VERSION = 2/.test(srcText('data/db.ts')));

/* ---------- 主题模式红线（v0.8） ---------- */
check('并发上限常量 = 9（QUEUE_MAX）', /export const QUEUE_MAX = 9/.test(queueSrc));
check('队列默认用 QUEUE_MAX（不是写死的 4）', /this\.MAX = deps\.MAX \?\? QUEUE_MAX/.test(queueSrc));
check('运行时单例把 MAX 接成 QUEUE_MAX', /MAX: QUEUE_MAX/.test(queueRuntimeSrc));
check('多图上限常量 = 9（THEME_MAX_SOURCES）', /export const THEME_MAX_SOURCES = COLLAGE_MAX_SOURCES/.test(themesSrc) && /COLLAGE_MAX_SOURCES = 9/.test(collageSrc));
check('选图入口超过上限必须拒绝并给原因', /if \(pick\.length >= max\) return \{ pick: \[\.\.\.pick\], accepted: false, reason: PICK_REJECT_MESSAGE \}/.test(themesSrc));
check('边拍边收入口超过上限必须拒绝并给原因', /if \(t\.sourceIds\.length >= THEME_MAX_SOURCES\) return \{ theme: t, accepted: false, reason: COLLECT_REJECT_MESSAGE \}/.test(themesSrc));
check('第 10 张的提示文案里带「9 张」', /多图上限 \$\{THEME_MAX_SOURCES\} 张/.test(themesSrc));
// 主题任务：一个任务只 active++ 一次（内部多张由 runTheme 通道自己循环）
const addThemeBody = stripComments(sliceFn(queueSrc, 'addTheme(input: ThemeTaskInput): string {', '/** 队列里属于某个主题的任务'));
check('addTheme() 抽到了源码（防止断言空跑）', addThemeBody.length > 300, `${addThemeBody.length} 字符`);
check('addTheme() 只 push 一条任务（内部 2–9 张也只占 1 个槽位）', /this\.items\.push\(task\)/.test(addThemeBody) && !/for \s*\(/.test(addThemeBody));
check('addTheme() 里带 n/k 分张进度字段（不是百分比）', /n: sources\.length/.test(addThemeBody) && /k: 0/.test(addThemeBody));
const runBody = stripComments(sliceFn(queueSrc, 'run(task: QueueTask): void {', 'retry(id: string): boolean {'));
check('主题任务走 runTheme 通道（逐张产出 / 进度回调）', /task\.kind === 'theme'/.test(runBody) && /runTheme\(task, \{/.test(runBody));
check('主题任务的 active++ 只发生一次（循环在 runTheme 里，不在调度器里）', (runBody.match(/this\.active\+\+/g) || []).length === 1);
check('主题任务逐张归档（archiveOutput 每个产出调一次）', /archiveOutput\(task, index, blob\)/.test(runBody));
check('合成一张：本地拼图 → 单图润色（MULTI_IMAGE_EDITS_SUPPORTED 降级路径）', /composeCollage\(/.test(queueRuntimeSrc) && /MULTI_IMAGE_EDITS_SUPPORTED = false/.test(collageSrc));
check('统一风格：逐张重绘、逐张归档（N 张 → N 张）', /for \(let i = 0; i < n; i\+\+\)/.test(queueRuntimeSrc) && /await h\.onOutput\(i, out\)/.test(queueRuntimeSrc));
check('提示词词库共 32 个词（5 组）', (promptSrc.match(/PROMPT_GROUPS: PromptGroup\[\] = \[/) !== null) && /PROMPT_WORD_COUNT = PROMPT_GROUPS/.test(promptSrc));
check('主题任务占 1 槽位的说明写进了界面（暗房）', /一个主题任务算/.test(darkroomSrc));
check('相册有「主题作品」分组', /主题作品/.test(albumViewSrc) && /themeAlbumSplit/.test(srcText('store/useAppStore.ts')));
check('没有付费 / Pro 横幅（设计稿已删，不许加回来）', !/升级 ?Pro|Pro ?版|订阅会员|付费解锁|解锁全部/.test([storeSrc, themeViewSrc, themeCreateSrc, albumViewSrc, darkroomSrc, srcText('components/SettingsDrawer.tsx')].join('\n')));
check('边拍边收在快门路径上是**同步**收图（不增加 await）', /if \(get\(\)\.collectIntoActiveTheme\(rec\)\) return;/.test(captureBody));

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
  check('产物里有主题任务的阶段文案（拼合中 / 统一风格中）', /拼合中/.test(bundle) && /统一风格中/.test(bundle));
  check('产物里有拼图降级路径与上限文案（可读错误 + 第 10 张提示）', /没有可合成的照片/.test(bundle) && /多图上限/.test(bundle));
  check('产物里有场景插画（内联 SVG 插画模块被打进包）', /ss-art-/.test(bundle));
  check('产物里有相机抽屉（#camSheet / #btnCamSheet / 上滑动画）', /camSheet/.test(bundle) && /camSheetUp/.test(distAll) && /btnCamSheet/.test(bundle));
  check('产物里取景页隐藏 AppHeader 的规则在（cam-hidden）', /cam-hidden/.test(distAll));
  check('产物里取景页不滚动的规则在（#view-cam overflow:hidden）', /#view-cam\{overflow:hidden\}/.test(distAll));
  check('产物里没有付费 / Pro 横幅文案', !/升级 ?Pro|Pro ?版|订阅会员|付费解锁/.test(bundle));
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
    for (let i = 0; i < 4; i++) {
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
    check('生图接口挂死时 10 张照片仍全部入库（快门不等网络）', st.photos === 10, `${st.photos} 张`);
    check('队列同步收到 10 条任务', st.queue === 10, `${st.queue} 条`);
    check('产物里的并发上限 = 9（第 10 个起排队）', st.peak === 9 && st.running === 9, `peak=${st.peak} running=${st.running}`);

    // ---- 主题模式红线（真产物 + 真 store + 真队列）----
    const themeSt = await page.evaluate(() => {
      const s = __snapsaga;
      const ids = s.photos().map((p) => p.id);
      s.openThemeCreate(false);
      ids.forEach((id) => s.toggleThemePick(id));
      const pickedAfterTen = s.store.getState().themePick.length;
      const limit = s.limits.maxSources;
      // 一个主题任务：9 张素材，看它占几个槽位
      const before = s.queueItems().filter((t) => t.status === 'running').length;
      const sources = s
        .photos()
        .slice(0, 9)
        .map((p) => ({ id: p.id, blob: p.blob }));
      s.addThemeTask({
        themeId: 'guard-theme',
        themeName: '守卫主题',
        prompt: '守卫用主题提示词',
        mode: 'unify',
        layout: '网格拼贴',
        strength: 0.62,
        sources,
      });
      const items = s.queueItems();
      const themeTask = items.find((t) => t.themeId === 'guard-theme');
      return {
        limit,
        queueMax: s.limits.queueMax,
        pickedAfterTen,
        photos: s.photos().length,
        before,
        runningAfter: items.filter((t) => t.status === 'running').length,
        queuedTheme: themeTask ? themeTask.status : null,
        active: s.queue.active,
        themeTask: themeTask ? { kind: themeTask.kind, n: themeTask.n, k: themeTask.k, sources: (themeTask.sources ?? []).length } : null,
      };
    });
    check('多图上限 = 9：10 张照片里点满只有 9 张被选中（第 10 张被拒）', themeSt.limit === 9 && themeSt.pickedAfterTen === 9, `limit=${themeSt.limit} picked=${themeSt.pickedAfterTen} photos=${themeSt.photos}`);
    check('并发上限 = 9（__snapsaga.limits.queueMax）', themeSt.queueMax === 9, String(themeSt.queueMax));
    check('主题任务 9 张素材仍然只 push 一条任务（kind=theme / n=9 / sources=9）', themeSt.themeTask?.kind === 'theme' && themeSt.themeTask.sources === 9 && themeSt.themeTask.n === 9, JSON.stringify(themeSt.themeTask));
    check('队列满时主题任务乖乖排队（不挤掉别人、不越限）', themeSt.runningAfter === 9 && themeSt.queuedTheme === 'queued', `running=${themeSt.runningAfter} theme=${themeSt.queuedTheme}`);
    check('队列满时 active 不被多算（仍是 9，不是 9+9）', themeSt.active === 9, `before=${themeSt.before} active=${themeSt.active}`);

    // 空队列里放一个 9 张的主题任务：只应该占 1 个槽位（active=1，不是 9）
    const slotSt = await page.evaluate(() => {
      const s = __snapsaga;
      s.queue.reset(); // 清掉前面挂死的 10 个任务，只留下面这一个
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
      s.addThemeTask({
        themeId: 'guard-slot',
        themeName: '槽位验证',
        prompt: '槽位验证提示词',
        mode: 'unify',
        strength: 0.62,
        sources: Array.from({ length: 9 }, (_, i) => ({ id: 'x' + i, blob })),
      });
      const items = s.queueItems();
      return {
        total: items.length,
        running: items.filter((t) => t.status === 'running').length,
        active: s.queue.active,
        max: s.queue.MAX,
        n: items[0]?.n,
      };
    });
    check('9 张素材的主题任务只占 1 个槽位（running=1 / active=1，不是 9）', slotSt.total === 1 && slotSt.running === 1 && slotSt.active === 1 && slotSt.n === 9, JSON.stringify(slotSt));
    check('运行时 MAX = 9', slotSt.max === 9, String(slotSt.max));
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
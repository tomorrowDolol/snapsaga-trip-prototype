// 生图队列验证脚本（无依赖，node tools/check_gen_queue.mjs 直接跑）
// 从 index.html 抽出真实的 GenQueue 源码，放到 stub 环境里验证：
//   [1] 调度：并发峰值 = 4、严格 FIFO、失败隔离 + 重试、完成即归档
//   [2] 持久化：入队即落库；模拟「页面刷新」后未完成任务自动续跑、已完成不重复入队
//   [3] 快门路径静态检查：capture()/addPhoto() 里没有任何等 AI 的 await
//   [4] objectURL 回收：队列面板重渲染时 revoke 缩略图
// 调度部分与用户提供的 snapsaga_queue_check/check_queue.mjs 断言一致（未放松），另加了持久化与静态检查。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = process.argv[2] || resolve(HERE, '..', 'index.html');
const html = readFileSync(INDEX, 'utf8');
console.log(`待检文件: ${INDEX}`);

/* ---------- 抽取真实源码 ---------- */
const start = html.indexOf('const GenQueue={');
if (start < 0) { console.error('FAIL: 源码里找不到 `const GenQueue={`'); process.exit(1); }
const endMarker = html.indexOf('async function archiveResult');
if (endMarker < 0) { console.error('FAIL: 找不到 `async function archiveResult` 边界'); process.exit(1); }
const SRC = html.slice(start, endMarker).trim();
console.log(`已抽取 GenQueue 源码 ${SRC.length} 字符\n`);

/* ---------- stub 环境 ---------- */
const el = () => ({ style: {}, textContent: '', classList: { toggle() {}, add() {}, remove() {} }, innerHTML: '', appendChild() {} });
const $ = () => el();
const toast = () => {};
const fmtTime = () => '00:00';
const STYLES = [{ k: 's1', n: '风格1' }];
const document = { createElement: () => el() };
const renderQueuePanel = () => {};
const URL = { createObjectURL: () => 'blob:x' };
const humanAiErr = (e) => 'stub: ' + (e && e.message);

let failures = [];
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures.push(name);
};

// 每个实例 = 一次「页面会话」：独立的 GenQueue、独立的 DB stub、独立的生成函数
function makeInstance({ persist = true, gate = false, delayMs = 5 } = {}) {
  const st = { store: [], archived: [], started: [], active: 0, peak: 0, gates: 0 };
  const DB = persist ? {
    db: {},
    async putTasks(list) { st.store = list.map((x) => ({ ...x })); },   // 模拟 IndexedDB 落库
    async tasks() { return st.store.slice().reverse(); }               // IndexedDB 不保证顺序
  } : undefined;
  const aiRedrawCore = (blob) => {
    st.started.push(blob.id); st.active++; st.peak = Math.max(st.peak, st.active);
    if (gate) { st.gates++; return new Promise(() => {}); }            // 永远不返回：模拟「生图中被刷新」
    return new Promise((res) => setTimeout(() => { st.active--; res({ id: 'out-' + blob.id }); }, delayMs));
  };
  const archiveResult = (t) => { st.archived.push(t.id); };
  const factory = new Function('DB', '$', 'toast', 'fmtTime', 'STYLES', 'document', 'renderQueuePanel', 'URL', 'archiveResult', 'aiRedrawCore', 'humanAiErr',
    SRC + '\n; return { GenQueue };');
  const { GenQueue } = factory(DB, $, toast, fmtTime, STYLES, document, renderQueuePanel, URL, archiveResult, aiRedrawCore, humanAiErr);
  return { GenQueue, st, DB };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitAll = async (inst, timeoutMs = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!inst.GenQueue.items.some((x) => x.status === 'running' || x.status === 'queued')) return true;
    await sleep(2);
  }
  return false;
};

/* ================= [1] 调度：并发 4 / FIFO / 失败隔离 / 归档 ================= */
console.log('[1] 调度：10 笔入队、并发上限、FIFO、失败重试、归档');
{
  const A = makeInstance({ persist: false });
  const Q = A.GenQueue;
  for (let i = 0; i < 10; i++) Q.add({ id: 'p' + i, blob: { id: 'b' + i }, ts: Date.now() }, STYLES[0], 0.5);
  check('入队后 10 笔都在队列里', Q.items.length === 10, `实际 ${Q.items.length}`);
  check('立即进入运行的不超过 MAX=4', Q.running().length <= Q.MAX, `running=${Q.running().length}`);
  check('其余处于排队', Q.queued().length >= 5, `queued=${Q.queued().length}`);
  check('全部跑完', await waitAll(A));
  check('并发峰值 ≤ 4', A.st.peak <= 4, `峰值 ${A.st.peak}`);
  check('并发峰值 = 4（确认并行执行）', A.st.peak === 4, `峰值 ${A.st.peak}`);
  check('每笔只开始一次', new Set(A.st.started).size === A.st.started.length, `${A.st.started.length} 次开始`);
  check('10 笔全部完成', Q.items.filter((x) => x.status === 'done').length === 10);
  check('10 笔全部归档进 AI 相册', A.st.archived.length === 10, `归档 ${A.st.archived.length}`);

  // FIFO
  const B = makeInstance({ persist: false });
  for (let i = 0; i < 8; i++) B.GenQueue.add({ id: 'q' + i, blob: { id: 'q' + i }, ts: Date.now() }, STYLES[0], 0.5);
  check('FIFO 全部跑完', await waitAll(B));
  check('开始顺序 = 入队顺序（FIFO）', JSON.stringify(B.st.started) === JSON.stringify(['q0','q1','q2','q3','q4','q5','q6','q7']),
    `实际 ${B.st.started.join(',')}`);

  // 失败隔离 + 重试：这一轮单独建实例，让 r2 的生成必失败
  const failSet = new Set(['r2']);
  const F = (() => {
    const st = { store: [], archived: [], started: [], active: 0, peak: 0 };
    const aiRedrawCore = (blob) => {
      st.started.push(blob.id); st.active++; st.peak = Math.max(st.peak, st.active);
      return new Promise((res, rej) => setTimeout(() => { st.active--; failSet.has(blob.id) ? rej(new Error('stub 生成失败')) : res({ id: 'out-' + blob.id }); }, 5));
    };
    const archiveResult = (t) => { st.archived.push(t.id); };
    const factory = new Function('DB', '$', 'toast', 'fmtTime', 'STYLES', 'document', 'renderQueuePanel', 'URL', 'archiveResult', 'aiRedrawCore', 'humanAiErr',
      SRC + '\n; return { GenQueue };');
    const { GenQueue } = factory(undefined, $, toast, fmtTime, STYLES, document, renderQueuePanel, URL, archiveResult, aiRedrawCore, humanAiErr);
    return { GenQueue, st };
  })();
  for (let i = 0; i < 6; i++) F.GenQueue.add({ id: 'r' + i, blob: { id: 'r' + i }, ts: Date.now() }, STYLES[0], 0.5);
  check('失败不卡队列：全部跑完', await waitAll(F));
  const failed = F.GenQueue.items.find((x) => x.blob.id === 'r2');
  check('r2 标记 failed 且带可读错误', !!failed && failed.status === 'failed' && !!failed.error, failed ? `${failed.status} / ${failed.error}` : '未找到 r2');
  check('其余 5 笔仍成功', F.GenQueue.items.filter((x) => x.status === 'done').length === 5);
  check('成功 5 笔已归档', F.st.archived.length === 5, `归档 ${F.st.archived.length}`);
  failSet.clear();
  F.GenQueue.retry(failed.id);
  check('重试后跑完', await waitAll(F));
  check('重试后该笔 done 且归档', F.GenQueue.items.find((x) => x.blob.id === 'r2').status === 'done' && F.st.archived.length === 6,
    `归档 ${F.st.archived.length}`);
  check('并发上限仍是 4（整轮峰值）', F.st.peak <= 4, `峰值 ${F.st.peak}`);
}

/* ================= [2] 持久化：刷新恢复 ================= */
console.log('\n[2] 持久化：入队落库 → 模拟刷新 → 未完成续跑 / 已完成不重复入队');
{
  // 会话 1：6 笔入队，生成永不返回（模拟「正在生成时刷新页面」）
  const A = makeInstance({ persist: true, gate: true });
  for (let i = 0; i < 6; i++) {
    A.GenQueue.add({ id: 'p' + i, blob: { id: 'z' + i }, ts: Date.now() }, STYLES[0], 0.5);
    await sleep(2);                       // 让 ts 递增，便于验证恢复后的顺序
  }
  await sleep(5);
  check('会话1：4 个在跑 + 2 个排队', A.GenQueue.running().length === 4 && A.GenQueue.queued().length === 2,
    `running=${A.GenQueue.running().length} queued=${A.GenQueue.queued().length}`);
  const snap1 = A.st.store.map((x) => ({ ...x }));
  check('入队即落库（IndexedDB 里有 6 条快照）', snap1.length === 6, `落库 ${snap1.length} 条`);
  check('落库快照带状态（4 running / 2 queued）',
    snap1.filter((x) => x.status === 'running').length === 4 && snap1.filter((x) => x.status === 'queued').length === 2);
  check('落库快照带源图 blob（刷新后仍能生图）', snap1.every((x) => x.blob && x.blob.id));

  // 会话 2：模拟刷新后从 IndexedDB 恢复
  const B = makeInstance({ persist: true });
  const counts = B.GenQueue.restore(snap1);
  check('恢复后：6 笔都回到未完成态（被打断的 running + 排队共 6）', counts.run + counts.queued === 6 && counts.failed === 0,
    `run=${counts.run} queued=${counts.queued} failed=${counts.failed}`);
  check('恢复即自动补位到 4 个并行（其中包含原 running）', B.GenQueue.running().length === 4 && counts.queued === 2,
    `running=${B.GenQueue.running().length} queued=${counts.queued}`);
  check('原 running 的 4 笔也被重新启动（没有丢任务）',
    ['z0','z1','z2','z3'].every((id) => B.st.started.includes(id)), `started=${B.st.started.join(',')}`);
  check('恢复后全部跑完', await waitAll(B));
  check('恢复的 6 笔全部归档（没有丢任务）', B.st.archived.length === 6, `归档 ${B.st.archived.length}`);
  check('恢复后仍严格 FIFO（按入队时间续跑）',
    JSON.stringify(B.st.started) === JSON.stringify(['z0','z1','z2','z3','z4','z5']), `实际 ${B.st.started.join(',')}`);
  check('恢复后并发峰值 ≤ 4', B.st.peak <= 4, `峰值 ${B.st.peak}`);

  // 会话 3：拿到「全部已完成」的快照再刷新一次 → 不应该重复入队/重复归档
  const snap2 = B.st.store.map((x) => ({ ...x }));
  const C = makeInstance({ persist: true });
  const counts3 = C.GenQueue.restore(snap2);
  check('已完成的快照恢复后不入队', counts3.queued === 0 && counts3.run === 0, `queued=${counts3.queued} run=${counts3.run}`);
  await sleep(20);
  check('已完成的快照不重复归档', C.st.archived.length === 0 && C.st.started.length === 0,
    `归档 ${C.st.archived.length} / 开始 ${C.st.started.length}`);
  check('已完成的历史仍保留在列表里（可看状态）', C.GenQueue.items.filter((x) => x.status === 'done').length === 6);
}

/* ================= [3] 快门路径静态检查 ================= */
console.log('\n[3] 快门路径静态检查：capture()/addPhoto() 里没有等 AI 的 await');
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('找不到 ' + header);
  let depth = 0;
  for (let p = src.indexOf('{', i); p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') { depth--; if (depth === 0) return src.slice(i, p + 1); }
  }
  throw new Error('花括号不匹配: ' + header);
}
{
  const capture = extractFn(html, 'async function capture(){');
  const addPhoto = extractFn(html, 'async function addPhoto(blob, shot){');
  const grabStill = extractFn(html, 'async function grabStill(){');
  const awaits = [...capture.matchAll(/await\s+[^\n;]*/g)].map((m) => m[0].trim());
  console.log('  capture() 里的 await 语句：\n' + awaits.map((a) => '    · ' + a).join('\n'));
  // 快门只能 await 「本地取图」与「本机入库」两类操作；不得出现 AI / 网络等待
  check('capture() 只 await 本地取图（grabStill）与本机入库（addPhoto）',
    awaits.every((a) => /^await grabStill\(\)/.test(a) || /^await addPhoto\(/.test(a)), `${awaits.length} 处 await`);
  check('capture() 不含 fetch / aiRedrawCore / await GenQueue',
    !/fetch\(|aiRedrawCore|await\s+GenQueue/.test(capture));
  check('capture() 以同步方式入队（GenQueue.add 未被 await）',
    /GenQueue\.add\(rec/.test(capture) && !/await\s+GenQueue\.add/.test(capture));
  // 真拍照：优先 ImageCapture.takePhoto，失败/不支持回落抓帧；两条路都不碰 AI
  check('grabStill() 优先用 ImageCapture.takePhoto 取静止图像',
    /new ImageCapture\(t\)/.test(grabStill) && /await ic\.takePhoto\(\)/.test(grabStill));
  check('grabStill() 有抓帧回落（takePhoto 失败/不支持时 drawImage）',
    /drawImage\(v,0,0\)/.test(grabStill) && /kind:'frame'/.test(grabStill));
  check('grabStill() 里没有任何 AI / 网络调用',
    !/fetch\(|aiRedrawCore|GenQueue/.test(grabStill));
  check('grabStill() 只对设备真正支持的能力下约束',
    /getCapabilities/.test(grabStill) || /getCapabilities/.test(html));
  check('camTune() 按 getCapabilities 逐项判断，不硬下 focusMode',
    /getCapabilities/.test(html) && /supports\('focusMode'/.test(html));
  check('启动时主动申请持久存储（persist）',
    /navigator\.storage\.persist\(\)/.test(html) && /ensurePersist\(\);/.test(html));
  // 缩略图：列表必须挂小图；生成必须 fire-and-forget（不得进快门 await 链）
  check('列表渲染用缩略图（p.thumb 优先）', /p\.thumb\|\|p\.blob/.test(html));
  check('缩略图生成不在快门 await 链上（queueThumb 不被 await）',
    /queueThumb\(rec,/.test(html) && !/await\s+queueThumb\(/.test(html));
  check('图片带 decoding="async"（不阻塞渲染）', /decoding="async"/.test(html));
  check('新照片走增量插入（prepend），不重建整格网',
    /grid\.prepend\(filmCellFor\(rec\)\)/.test(html));
  check('两条取图路都只产出 Blob（kind 标记 still/frame）',
    /kind:'still'/.test(grabStill) && /kind:'frame'/.test(grabStill));
  check('addPhoto() 只写本机 IndexedDB，不碰 AI', !/fetch\(|aiRedrawCore|GenQueue/.test(addPhoto));

  const pump = extractFn(SRC, 'pump(){');
  check('pump() 同步补位（内部无 await，不是串行等待）', !/await/.test(pump));
  const run = extractFn(SRC, 'run(task){');
  check('run() 同步启动、异步收尾（不把 Promise 交给调用方）', /\(async\(\)=>\{/.test(run) && !/\breturn\s+\(async/.test(run));
}

/* ================= [4] objectURL 回收 ================= */
console.log('\n[4] objectURL 生命周期');
{
  const rqp = extractFn(html, 'function renderQueuePanel(){');
  check('队列面板缩略图有 revoke（重渲染不泄漏）', /URL\.revokeObjectURL/.test(rqp) && /queueThumbs/.test(rqp));
  check('队列源码本身不直接造 objectURL（URL 生命周期集中在一处）', !/createObjectURL/.test(SRC));
  const revokes = (html.match(/URL\.revokeObjectURL/g) || []).length;
  check('全文件 revoke 覆盖胶卷 / 队列 / AI 相册 / 大图', revokes >= 4, `revokeObjectURL 出现 ${revokes} 次`);
}

console.log(`\n结论: ${failures.length === 0 ? 'PASS 全部通过' : 'FAIL ' + failures.join(' / ')}`);
process.exit(failures.length === 0 ? 0 : 1);

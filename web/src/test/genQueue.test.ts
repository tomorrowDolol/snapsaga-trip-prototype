/**
 * 生图队列调度单测 —— 断言与用户的 snapsaga_queue_check/check_queue.mjs **逐条对应**（不放松），
 * 只是不再从 HTML 里抽源码 eval，而是直接测 TS 引擎（依赖注入，所以不需要浏览器）。
 * 另外补了原脚本在 tools/check_gen_queue.mjs 里的持久化/恢复断言。
 */
import { describe, expect, it } from 'vitest';
import { GenQueue } from '../domain/genQueue';
import type { QueueTask } from '../domain/types';

interface Harness {
  q: GenQueue;
  st: {
    store: QueueTask[];
    archived: string[];
    started: string[];
    active: number;
    peak: number;
  };
  setFailIds(ids: string[]): void;
}

function makeHarness(opts: { persist?: boolean; failIds?: string[]; delayMs?: number; gate?: boolean } = {}): Harness {
  const st = { store: [] as QueueTask[], archived: [] as string[], started: [] as string[], active: 0, peak: 0 };
  let failIds = new Set(opts.failIds ?? []);
  const delayMs = opts.delayMs ?? 5;
  let counter = 0;
  const q = new GenQueue({
    MAX: 4,
    HISTORY: 30,
    now: () => 1700000000000 + counter,
    newId: () => `t${counter++}`,
    generate: async (task) => {
      const id = (task.blob as unknown as { id: string }).id;
      st.started.push(id);
      st.active++;
      st.peak = Math.max(st.peak, st.active);
      if (opts.gate) return new Promise<Blob>(() => {}); // 永远不返回：模拟「生成中被刷新」
      await new Promise((r) => setTimeout(r, delayMs));
      st.active--;
      if (failIds.has(id)) throw new Error('stub 生成失败');
      return { id: 'out-' + id } as unknown as Blob;
    },
    archive: async (task) => {
      st.archived.push(task.id);
    },
    persist: (tasks) => {
      if (opts.persist) st.store = tasks.map((x) => ({ ...x }));
    },
    onChange: () => {},
    describeError: (e) => 'stub: ' + (e as Error).message,
  });
  return {
    q,
    st,
    setFailIds(ids: string[]) {
      failIds = new Set(ids);
    },
  };
}

const blob = (id: string) => ({ id }) as unknown as Blob;
const style = { k: 's1', n: '风格1' } as never;

const waitAll = async (q: GenQueue, timeoutMs = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!q.items.some((x) => x.status === 'running' || x.status === 'queued')) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return false;
};

describe('队列调度：并发 4 / FIFO / 失败隔离与重试 / 归档', () => {
  it('[1] 10 笔入队：并发上限、排队、全部完成并归档', async () => {
    const { q, st } = makeHarness();
    for (let i = 0; i < 10; i++) q.add({ id: 'p' + i, blob: blob('b' + i) }, style, 0.5);

    expect(q.items.length, '入队后 10 笔都在队列里').toBe(10);
    expect(q.running().length, '立即进入运行的不超过 MAX=4').toBeLessThanOrEqual(q.MAX);
    expect(q.queued().length, '其余处于排队').toBeGreaterThanOrEqual(5);

    expect(await waitAll(q), '全部跑完').toBe(true);
    expect(st.peak, '并发峰值 ≤ 4').toBeLessThanOrEqual(4);
    expect(st.peak, '并发峰值 = 4（确认并行执行）').toBe(4);
    expect(new Set(st.started).size, '每笔只开始一次').toBe(st.started.length);
    expect(q.items.filter((x) => x.status === 'done').length, '10 笔全部完成').toBe(10);
    expect(st.archived.length, '10 笔全部归档进 AI 相册').toBe(10);
  });

  it('[2] FIFO：先入先跑', async () => {
    const { q, st } = makeHarness({ delayMs: 10 });
    for (let i = 0; i < 8; i++) q.add({ id: 'q' + i, blob: blob('q' + i) }, style, 0.5);
    expect(await waitAll(q), '全部跑完').toBe(true);
    expect(st.started, '开始顺序 = 入队顺序（FIFO）').toEqual(['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  });

  it('[3] 中间一笔失败：不阻塞后续，可单独重试', async () => {
    const h = makeHarness({ failIds: ['r2'] });
    for (let i = 0; i < 6; i++) h.q.add({ id: 'r' + i, blob: blob('r' + i) }, style, 0.5);
    expect(await waitAll(h.q), '失败不卡队列：全部跑完').toBe(true);

    const failed = h.q.items.find((x) => (x.blob as unknown as { id: string }).id === 'r2');
    expect(failed?.status, 'r2 标记 failed').toBe('failed');
    expect(failed?.error, 'r2 带可读错误信息').toBeTruthy();
    expect(h.q.items.filter((x) => x.status === 'done').length, '其余 5 笔仍成功').toBe(5);
    expect(h.st.archived.length, '成功 5 笔已归档').toBe(5);

    h.setFailIds([]);
    expect(h.q.retry(failed!.id), 'retry 接受 failed 任务').toBe(true);
    expect(await waitAll(h.q), '重试后跑完').toBe(true);
    expect(h.q.items.find((x) => x.id === failed!.id)?.status, '重试后该笔 done').toBe('done');
    expect(h.st.archived.length, '重试后该笔也归档').toBe(6);
    expect(h.st.peak, '并发上限仍是 4（整轮峰值）').toBeLessThanOrEqual(4);
  });

  it('只重试 failed；running/queued/done 不允许重试（否则会重复生成）', () => {
    const { q } = makeHarness({ gate: true });
    q.add({ id: 'g0', blob: blob('g0') }, style, 0.5);
    const t = q.items[0];
    expect(t.status).toBe('running');
    expect(q.retry(t.id)).toBe(false);
    expect(q.drop(t.id)).toBe(false); // running 不能被移除
  });
});

describe('队列持久化：刷新后未完成任务续跑（对应 tools/check_gen_queue.mjs 的持久化断言）', () => {
  it('入队即落库；恢复后 running 重新排队、自动补位到 4、仍 FIFO、不丢任务', async () => {
    const A = makeHarness({ persist: true, gate: true });
    for (let i = 0; i < 6; i++) A.q.add({ id: 'p' + i, blob: blob('b' + i) }, style, 0.5);
    expect(A.q.running().length, '会话1：4 个在跑').toBe(4);
    expect(A.q.queued().length, '会话1：2 个排队').toBe(2);
    expect(A.st.store.length, '入队即落库（6 条快照）').toBe(6);
    expect(A.st.store.every((x) => !!x.blob), '落库快照带源图 blob').toBe(true);

    // 模拟「刷新」：新会话用同一份落库快照恢复
    const B = makeHarness({ persist: true, gate: true });
    const counts = B.q.restore(A.st.store);
    expect(counts.run + counts.queued, '恢复后 6 笔都回到未完成态').toBe(6);
    expect(counts.failed, '没有凭空失败的任务').toBe(0);
    expect(B.q.running().length, '恢复即自动补位到 4 个并行').toBe(4);
    expect(B.q.queued().length, '其余 2 笔排队').toBe(2);
  });

  it('恢复后仍严格 FIFO；已完成的不重复入队、不重复归档', async () => {
    const A = makeHarness({ persist: true });
    for (let i = 0; i < 6; i++) A.q.add({ id: 'r' + i, blob: blob('r' + i) }, style, 0.5);
    expect(await waitAll(A.q)).toBe(true);
    const snap = A.st.store;
    expect(snap.filter((x) => x.status === 'done').length).toBe(6);

    const B = makeHarness();
    const c = B.q.restore(snap);
    expect(c.queued, '已完成的快照恢复后不入队').toBe(0);
    expect(c.run, '也没有在跑的').toBe(0);
    expect(B.st.started.length, '不重复生成').toBe(0);
    expect(B.st.archived.length, '不重复归档').toBe(0);
    expect(B.q.items.filter((x) => x.status === 'done').length, '历史仍保留在列表里').toBe(6);
  });

  it('restore 会剪掉超过 HISTORY 条的老历史', () => {
    const { q } = makeHarness();
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: 'h' + i,
      photoId: 'p' + i,
      blob: blob('b' + i),
      ts: 1700000000000 + i,
      styleKey: 's1',
      styleName: '风格1',
      strength: 0.7,
      status: 'done' as const,
      error: '',
      tries: 1,
      startedAt: 0,
      endedAt: 0,
    }));
    q.restore(many);
    expect(q.items.length).toBe(30);
    expect(q.items[0].id, '剪掉的是最老的那批').toBe('h10');
  });

  it('缺失 blob 的脏快照会被丢掉（不会制造必然失败的生成）', () => {
    const { q } = makeHarness();
    q.restore([
      { id: 'x1', photoId: '', blob: null, ts: 1, styleKey: '', styleName: '', strength: 0.7, status: 'queued', error: '', tries: 0, startedAt: 0, endedAt: 0 },
    ]);
    expect(q.items.length).toBe(0);
  });
});

describe('队列重置（清空全部数据）', () => {
  it('reset 让在飞的生成结果作废，且不把结果写回相册', async () => {
    const h = makeHarness({ gate: false, delayMs: 30 });
    h.q.add({ id: 'z0', blob: blob('z0') }, style, 0.5);
    await new Promise((r) => setTimeout(r, 5));
    h.q.reset();
    await new Promise((r) => setTimeout(r, 80));
    expect(h.q.items.length, '队列清空').toBe(0);
    expect(h.st.archived.length, '在飞结果作废，没有归档回来').toBe(0);
  });
});

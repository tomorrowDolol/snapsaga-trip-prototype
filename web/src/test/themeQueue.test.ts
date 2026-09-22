/**
 * 主题任务在队列里的行为（纯调度，注入 stub，不需要浏览器）：
 *   ① 并发上限 = 9（QUEUE_MAX），第 10 个任务起排队
 *   ② **一个主题任务只占 1 个槽位**（内部 2–9 张），不会因为张数多就吃掉多个槽位
 *   ③ 统一风格 N 张 → N 张，逐张产出并逐张归档（每张好了就亮）
 *   ④ 合成一张 N 张 → 1 张
 *   ⑤ 进度用 k/n（分张，不是百分比）
 *   ⑥ 主题任务失败可重试、不阻塞其它任务；刷新恢复后仍是一个任务
 */
import { describe, expect, it } from 'vitest';
import { GenQueue, QUEUE_MAX, type ThemeRunHooks, type ThemeTaskInput } from '../domain/genQueue';
import type { QueueTask } from '../domain/types';

interface Harness {
  q: GenQueue;
  st: {
    store: QueueTask[];
    outputs: string[];
    progress: string[];
    themeRuns: number;
    active: number;
    peak: number;
  };
  failNextTheme(): void;
}

const blob = (id: string) => ({ id }) as unknown as Blob;

function makeHarness(opts: { max?: number; delayMs?: number; gate?: boolean } = {}): Harness {
  const st = {
    store: [] as QueueTask[],
    outputs: [] as string[],
    progress: [] as string[],
    themeRuns: 0,
    active: 0,
    peak: 0,
  };
  let counter = 0;
  let failTheme = false;
  const delayMs = opts.delayMs ?? 5;
  const q = new GenQueue({
    MAX: opts.max ?? QUEUE_MAX,
    HISTORY: 30,
    now: () => 1700000000000 + counter,
    newId: () => `t${counter++}`,
    generate: async (task) => {
      st.active++;
      st.peak = Math.max(st.peak, st.active);
      if (opts.gate) return new Promise<Blob>(() => {});
      await new Promise((r) => setTimeout(r, delayMs));
      st.active--;
      return blob('out-' + task.id);
    },
    runTheme: async (task, h: ThemeRunHooks) => {
      st.themeRuns++;
      st.active++;
      st.peak = Math.max(st.peak, st.active);
      if (opts.gate) return new Promise<void>(() => {});
      const n = task.n ?? 0;
      if (task.mode === 'merge') {
        h.onProgress(0, n, '拼合中');
        await new Promise((r) => setTimeout(r, delayMs));
        if (failTheme) {
          failTheme = false;
          st.active--;
          throw new Error('stub: 主题任务失败');
        }
        h.onProgress(n, n, 'AI 润色中');
        await h.onOutput(0, blob('merge-' + task.id));
      } else {
        for (let i = 0; i < n; i++) {
          await new Promise((r) => setTimeout(r, delayMs));
          if (failTheme) {
            failTheme = false;
            st.active--;
            throw new Error('stub: 主题任务失败');
          }
          await h.onOutput(i, blob(`unify-${task.id}-${i}`));
          h.onProgress(i + 1, n, '统一风格中');
        }
      }
      st.active--;
    },
    archive: async (task) => {
      st.outputs.push('photo:' + task.id);
    },
    archiveOutput: async (task, index, out) => {
      st.outputs.push(`${task.themeId}#${index}:${(out as unknown as { id: string }).id}`);
    },
    persist: (tasks) => {
      st.store = tasks.map((x) => ({ ...x }));
    },
    onChange: () => {},
    describeError: (e) => 'stub: ' + (e as Error).message,
  });
  // 进度回调在 runTheme 里由引擎包装，这里把它记下来
  const origAddTheme = q.addTheme.bind(q);
  q.addTheme = (input: ThemeTaskInput) => {
    const id = origAddTheme(input);
    return id;
  };
  return {
    q,
    st,
    failNextTheme() {
      failTheme = true;
    },
  };
}

const themeInput = (over: Partial<ThemeTaskInput> = {}): ThemeTaskInput => ({
  themeId: 'th1',
  themeName: '富士胶片旅拍',
  prompt: '富士胶片旅拍，暖黄秋天，柔光',
  mode: 'unify',
  layout: '网格拼贴',
  strength: 0.62,
  sources: [
    { id: 'p1', blob: blob('b1') },
    { id: 'p2', blob: blob('b2') },
    { id: 'p3', blob: blob('b3') },
  ],
  ...over,
});

const waitAll = async (q: GenQueue, timeoutMs = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!q.items.some((x) => x.status === 'running' || x.status === 'queued')) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return false;
};

describe('并发上限 = 9', () => {
  it('QUEUE_MAX = 9（默认值就是它）', () => {
    expect(QUEUE_MAX).toBe(9);
    const h = makeHarness();
    expect(h.q.MAX).toBe(9);
  });

  it('12 个单张任务：9 个在跑、3 个排队；峰值 = 9', async () => {
    const h = makeHarness({ delayMs: 20 });
    for (let i = 0; i < 12; i++) h.q.add({ id: 'p' + i, blob: blob('b' + i) }, null, 0.7);
    expect(h.q.running().length, '同时在跑 = 9').toBe(9);
    expect(h.q.queued().length, '第 10 个起排队').toBe(3);
    expect(await waitAll(h.q)).toBe(true);
    expect(h.st.peak, '并发峰值 = 9').toBe(9);
    expect(h.st.outputs.length).toBe(12);
  });

  it('第 10 个主题任务排队（主题任务也吃同一个上限）', async () => {
    const h = makeHarness({ delayMs: 30 });
    for (let i = 0; i < 10; i++) {
      h.q.addTheme(themeInput({ themeId: 'th' + i, mode: 'merge', sources: [{ id: 'p' + i, blob: blob('b' + i) }] }));
    }
    expect(h.q.running().length).toBe(9);
    expect(h.q.queued().length).toBe(1);
    expect(h.q.items[9].status, '第 10 个排在队尾').toBe('queued');
    expect(await waitAll(h.q)).toBe(true);
    expect(h.st.peak).toBe(9);
  });
});

describe('一个主题任务只占 1 个槽位', () => {
  it('一个 9 张的统一风格任务：只有 1 个 running、active = 1，但产出 9 张', async () => {
    const h = makeHarness();
    const sources = Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, blob: blob('b' + i) }));
    h.q.addTheme(themeInput({ sources }));
    expect(h.q.items.length, '队列里只有 1 条任务').toBe(1);
    expect(h.q.running().length, '只占 1 个槽位').toBe(1);
    expect(h.q.active, 'active 计数 = 1（不是 9）').toBe(1);
    expect(await waitAll(h.q)).toBe(true);
    expect(h.st.themeRuns, '主题通道只被调用 1 次').toBe(1);
    expect(h.st.outputs.length, '统一风格 N 张 → N 张产出').toBe(9);
    expect(h.st.peak, '峰值仍是 1，没有因为张数多而并发上升').toBe(1);
    expect(h.q.items[0].status).toBe('done');
    expect(h.q.items[0].n).toBe(9);
    expect(h.q.items[0].k, '跑完 k = n').toBe(9);
  });

  it('9 个主题任务 + 每个 3 张：9 个在跑、active = 9（不是 27）', async () => {
    const h = makeHarness({ delayMs: 20, gate: true });
    for (let i = 0; i < 9; i++) {
      h.q.addTheme(themeInput({ themeId: 'th' + i, sources: [1, 2, 3].map((k) => ({ id: `p${i}-${k}`, blob: blob('b') })) }));
    }
    expect(h.q.running().length).toBe(9);
    expect(h.q.active, '一个主题任务只加 1').toBe(9);
    expect(h.st.peak, '峰值 = 9').toBe(9);
    expect(h.st.store.length, '落库 9 条任务（每条带自己的 sources）').toBe(9);
    expect(h.st.store.every((t) => (t.sources ?? []).length === 3), '快照带上了多图入参').toBe(true);
  });

  it('主题任务与单张任务共用同一条队列与上限', async () => {
    const h = makeHarness({ delayMs: 20, gate: true });
    for (let i = 0; i < 6; i++) h.q.add({ id: 'p' + i, blob: blob('b' + i) }, null, 0.7);
    for (let i = 0; i < 5; i++) h.q.addTheme(themeInput({ themeId: 'th' + i, sources: [{ id: 's' + i, blob: blob('s') }] }));
    expect(h.q.items.length).toBe(11);
    expect(h.q.running().length).toBe(9);
    expect(h.q.queued().length).toBe(2);
    expect(h.q.counts().run + h.q.counts().queued).toBe(11);
  });
});

describe('统一风格 N 张 → N 张（逐张产出、逐张归档）', () => {
  it('每张产出都单独归档，且顺序 = 素材顺序', async () => {
    const h = makeHarness();
    h.q.addTheme(themeInput());
    expect(await waitAll(h.q)).toBe(true);
    expect(h.st.outputs).toEqual(['th1#0:unify-t0-0', 'th1#1:unify-t0-1', 'th1#2:unify-t0-2']);
  });

  it('逐张归档：第一张产出时任务还没结束（每张好了就亮）', async () => {
    const h = makeHarness({ delayMs: 40 });
    h.q.addTheme(themeInput());
    // 等第一张产出
    const t0 = Date.now();
    while (Date.now() - t0 < 3000 && h.st.outputs.length === 0) await new Promise((r) => setTimeout(r, 5));
    expect(h.st.outputs.length, '已经有一张产出了').toBeGreaterThanOrEqual(1);
    expect(h.q.items[0].status, '但整组还没跑完').toBe('running');
    expect(h.q.items[0].k, 'k 已经往前走').toBeGreaterThanOrEqual(1);
    expect(await waitAll(h.q)).toBe(true);
    expect(h.st.outputs.length).toBe(3);
  });

  it('合成一张：N 张 → 1 张（只归档 1 条，且是 index 0）', async () => {
    const h = makeHarness();
    h.q.addTheme(themeInput({ mode: 'merge', layout: '故事板' }));
    expect(await waitAll(h.q)).toBe(true);
    expect(h.st.outputs).toEqual(['th1#0:merge-t0']);
    expect(h.q.items[0].k).toBe(3);
    expect(h.q.items[0].n).toBe(3);
    expect(h.q.items[0].layout).toBe('故事板');
  });

  it('进度是 k/n（分张），不是百分比', async () => {
    const h = makeHarness({ delayMs: 10 });
    h.q.addTheme(themeInput());
    const seen: string[] = [];
    const orig = h.q.persist.bind(h.q);
    h.q.persist = () => {
      const t = h.q.items[0];
      if (t && t.status === 'running') seen.push(`${t.k}/${t.n}`);
      orig();
    };
    expect(await waitAll(h.q)).toBe(true);
    expect(seen.length, '运行期间有进度快照').toBeGreaterThan(0);
    expect(seen.every((s) => /^\d+\/3$/.test(s)), `进度都是 k/n：${seen.join(',')}`).toBe(true);
    expect(seen.some((s) => s === '1/3') && seen.some((s) => s === '2/3')).toBe(true);
  });
});

describe('主题任务失败：可重试、不阻塞其它任务', () => {
  it('失败标 failed 且带可读错误；重试后跑完并补齐产出', async () => {
    const h = makeHarness();
    h.q.addTheme(themeInput({ sources: [{ id: 'p1', blob: blob('b1') }] }));
    h.failNextTheme();
    h.q.add({ id: 'p9', blob: blob('b9') }, null, 0.7);
    expect(await waitAll(h.q)).toBe(true);
    const themeTask = h.q.items.find((t) => t.kind === 'theme')!;
    const photoTask = h.q.items.find((t) => t.kind !== 'theme')!;
    expect(themeTask.status).toBe('failed');
    expect(themeTask.error).toContain('主题任务失败');
    expect(photoTask.status, '失败的主题任务没有拖住单张任务').toBe('done');
    expect(h.q.retry(themeTask.id)).toBe(true);
    expect(await waitAll(h.q)).toBe(true);
    expect(h.q.items.find((t) => t.id === themeTask.id)?.status).toBe('done');
    expect(h.st.outputs.filter((o) => o.startsWith('th1#'))).toEqual(['th1#0:unify-' + themeTask.id + '-0']);
  });

  it('主题任务不允许在 running 时被移除或重试（避免重复生成）', () => {
    const h = makeHarness({ gate: true });
    h.q.addTheme(themeInput());
    const t = h.q.items[0];
    expect(t.status).toBe('running');
    expect(h.q.retry(t.id)).toBe(false);
    expect(h.q.drop(t.id)).toBe(false);
  });
});

describe('主题任务的持久化与恢复', () => {
  it('刷新恢复：running 的主题任务重新排队，sources 还在，仍只占 1 个槽位', async () => {
    const A = makeHarness({ gate: true });
    A.q.addTheme(themeInput());
    expect(A.st.store.length).toBe(1);
    expect(A.st.store[0].sources?.length).toBe(3);

    const B = makeHarness();
    const counts = B.q.restore(A.st.store);
    expect(counts.run + counts.queued).toBe(1);
    expect(B.q.running().length).toBe(1);
    expect(B.q.items[0].kind).toBe('theme');
    expect(B.q.items[0].sources?.length).toBe(3);
    expect(B.q.items[0].k, '恢复后 k 归零重跑（已归档的产出不会消失）').toBe(0);
    expect(await waitAll(B.q)).toBe(true);
    expect(B.st.outputs.length).toBe(3);
  });

  it('快照丢了 sources 的主题任务会降级成单张任务，不制造必然失败', async () => {
    const h = makeHarness();
    h.q.restore([
      {
        id: 'broken',
        photoId: 'p1',
        blob: blob('b1'),
        ts: 1,
        styleKey: '',
        styleName: '主题',
        strength: 0.6,
        status: 'queued',
        error: '',
        tries: 0,
        startedAt: 0,
        endedAt: 0,
        kind: 'theme',
        themeId: 'th1',
      },
    ]);
    expect(h.q.items[0].kind).toBe('photo');
    expect(await waitAll(h.q)).toBe(true);
    expect(h.q.items[0].status).toBe('done');
  });

  it('老快照（没有 kind/sources 字段）照旧能恢复成单张任务', () => {
    const h = makeHarness();
    h.q.restore([
      {
        id: 'legacy',
        photoId: 'p1',
        blob: blob('b1'),
        ts: 1,
        styleKey: 'summer',
        styleName: '夏日动画风',
        strength: 0.7,
        status: 'done',
        error: '',
        tries: 1,
        startedAt: 0,
        endedAt: 0,
      },
    ]);
    expect(h.q.items.length).toBe(1);
    expect(h.q.items[0].kind).toBe('photo');
    expect(h.q.counts().done).toBe(1);
  });
});

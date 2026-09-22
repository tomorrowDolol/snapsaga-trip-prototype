/**
 * 生图队列：拍照不等待。
 *   规则：同时最多 MAX=4 个在跑，第 5 个起排队（先入先跑），一有任务结束立即补位；
 *        成功 → archive 归档进 AI 相册；失败 → 标 failed 带可读错误，可单独重试，不阻塞队列；
 *        队列状态持久化，刷新后未完成任务恢复继续（被刷新打断的 running 重新排队）。
 *
 * 纯调度逻辑：AI 调用 / 归档 / 落库 / 通知界面全部由 deps 注入，所以能在 jsdom（甚至纯 node）
 * 里跑完整的调度断言 —— 见 src/test/genQueue.test.ts（18 项，与用户的 check_queue.mjs 同断言）。
 */
import type { QueueTask } from './types';
import type { EditStyle } from './presets';
import { GEN_STRENGTH } from './presets';

export interface QueuePhotoRef {
  id?: string;
  blob?: Blob | null;
}

export interface GenQueueDeps {
  MAX?: number;
  HISTORY?: number;
  /** 真生图（aiRedrawCore）；测试里注入 stub */
  generate(task: QueueTask): Promise<Blob>;
  /** 成功归档（写库 + 进 AI 相册） */
  archive(task: QueueTask, out: Blob): Promise<void>;
  /** 落库快照（IndexedDB queue 仓） */
  persist(tasks: QueueTask[]): void;
  /** 状态变化通知界面 */
  onChange(): void;
  describeError(e: unknown): string;
  now?(): number;
  newId?(): string;
}

export interface QueueCounts {
  run: number;
  queued: number;
  failed: number;
  done: number;
}

export class GenQueue {
  readonly MAX: number;
  readonly HISTORY: number;
  items: QueueTask[] = [];
  active = 0;
  /** 「清空全部数据」时 +1，让在飞的生成结果作废（避免清空后又被写回一张） */
  epoch = 0;

  constructor(private deps: GenQueueDeps) {
    this.MAX = deps.MAX ?? 4;
    this.HISTORY = deps.HISTORY ?? 30;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /** 入队：同步返回，绝不 await 生图 */
  add(photo: QueuePhotoRef | null | undefined, style: EditStyle | null | undefined, strength?: number | null): string {
    const task: QueueTask = {
      id: this.deps.newId ? this.deps.newId() : 'g' + this.now().toString(36) + Math.random().toString(36).slice(2, 6),
      photoId: (photo && photo.id) || '',
      blob: (photo && photo.blob) || null,
      ts: this.now(),
      styleKey: (style && style.k) || '',
      styleName: (style && style.n) || '',
      strength: strength == null ? GEN_STRENGTH : strength,
      status: 'queued',
      error: '',
      tries: 0,
      startedAt: 0,
      endedAt: 0,
    };
    this.items.push(task);
    this.persist();
    this.pump();
    this.ui();
    return task.id;
  }

  queued(): QueueTask[] {
    return this.items.filter((t) => t.status === 'queued');
  }
  running(): QueueTask[] {
    return this.items.filter((t) => t.status === 'running');
  }
  failed(): QueueTask[] {
    return this.items.filter((t) => t.status === 'failed');
  }
  counts(): QueueCounts {
    return {
      run: this.running().length,
      queued: this.queued().length,
      failed: this.failed().length,
      done: this.items.filter((t) => t.status === 'done').length,
    };
  }

  /** 补位：只要 active<MAX 就按入队顺序（items 顺序 = FIFO）再启一个。同步 while，内部无 await */
  pump(): void {
    while (this.active < this.MAX) {
      const next = this.items.find((t) => t.status === 'queued');
      if (!next) break;
      this.run(next);
    }
  }

  /** 启动一个任务：同步标 running、active++，把生图丢进 async IIFE 后立即返回（不把 Promise 交给 pump） */
  run(task: QueueTask): void {
    if (task.status !== 'queued') return;
    const ep = this.epoch;
    task.status = 'running';
    task.startedAt = this.now();
    task.error = '';
    task.tries++;
    this.active++;
    this.persist();
    this.ui();
    void (async () => {
      let out: Blob | null = null;
      let err: unknown = null;
      try {
        out = await this.deps.generate(task);
      } catch (e) {
        err = e;
      }
      if (!err && ep === this.epoch && out) {
        try {
          await this.deps.archive(task, out);
        } catch (e) {
          err = e;
        }
      }
      this.active = Math.max(0, this.active - 1);
      if (ep !== this.epoch) {
        this.ui(); // 中途被「清空数据」，本次结果作废
        return;
      }
      task.endedAt = this.now();
      task.status = err ? 'failed' : 'done';
      task.error = err ? this.deps.describeError(err) : '';
      this.persist();
      this.pump(); // 成功/失败都补位，队列不会卡住
      this.ui();
    })();
  }

  retry(id: string): boolean {
    const t = this.items.find((x) => x.id === id);
    if (!t || t.status !== 'failed') return false;
    t.status = 'queued';
    t.error = '';
    this.persist();
    this.pump();
    this.ui();
    return true;
  }

  drop(id: string): boolean {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0 || this.items[i].status === 'running') return false;
    this.items.splice(i, 1);
    this.persist();
    this.ui();
    return true;
  }

  clearFinished(): void {
    this.items = this.items.filter((t) => t.status === 'queued' || t.status === 'running');
    this.persist();
    this.ui();
  }

  snapshot(): QueueTask[] {
    return this.items.map((t) => ({
      id: t.id,
      photoId: t.photoId,
      blob: t.blob,
      ts: t.ts,
      styleKey: t.styleKey,
      styleName: t.styleName,
      strength: t.strength,
      status: t.status,
      error: t.error,
      tries: t.tries,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      thumb: t.thumb,
    }));
  }

  persist(): void {
    try {
      this.deps.persist(this.snapshot());
    } catch {
      /* stub / DB 未就绪时安静跳过 */
    }
  }

  /** 页面加载恢复：running（被刷新打断）重新排队，done 不再入队，failed 保留等手动重试；过老历史剪掉 */
  restore(tasks: unknown): QueueCounts {
    const list = (Array.isArray(tasks) ? (tasks as QueueTask[]).slice() : []).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    this.items = list
      .map((t) => ({
        id: t.id,
        photoId: t.photoId || '',
        blob: t.blob || null,
        ts: t.ts || this.now(),
        styleKey: t.styleKey || '',
        styleName: t.styleName || '',
        strength: t.strength == null ? GEN_STRENGTH : t.strength,
        status: t.status === 'running' ? ('queued' as const) : t.status || ('queued' as const),
        error: t.error || '',
        tries: t.tries || 0,
        startedAt: t.startedAt || 0,
        endedAt: t.endedAt || 0,
        thumb: t.thumb,
      }))
      .filter((t) => !!t.blob);
    const term = this.items.filter((t) => t.status === 'done' || t.status === 'failed');
    if (term.length > this.HISTORY) {
      const drop = new Set(term.slice(0, term.length - this.HISTORY).map((t) => t.id));
      this.items = this.items.filter((t) => !drop.has(t.id));
    }
    this.active = 0;
    this.persist();
    this.pump();
    this.ui();
    return this.counts();
  }

  reset(): void {
    this.epoch++;
    this.items = [];
    this.active = 0;
    this.persist();
    this.ui();
  }

  private ui(): void {
    this.deps.onChange();
  }
}

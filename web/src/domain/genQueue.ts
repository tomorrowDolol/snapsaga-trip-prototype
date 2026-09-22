/**
 * 生图队列：拍照不等待。
 *   规则：同时最多 MAX 个在跑，超出部分排队（先入先跑），一有任务结束立即补位；
 *        成功 → archive 归档进 AI 相册；失败 → 标 failed 带可读错误，可单独重试，不阻塞队列；
 *        队列状态持久化，刷新后未完成任务恢复继续（被刷新打断的 running 重新排队）。
 *
 * v0.8 两条新规则（guard 有断言）：
 *   ① **并发上限 = 9**（QUEUE_MAX）；第 10 个任务起排队。
 *   ② **一个主题任务只占 1 个槽位**（kind='theme'，内部含 2–9 张）：主题任务走 runTheme 通道，
 *      内部逐张产出并回调进度（k/n），但 `active` 只 +1 —— 不会因为「一个主题 9 张」就吃掉 9 个槽位。
 *
 * 纯调度逻辑：AI 调用 / 归档 / 落库 / 通知界面全部由 deps 注入，所以能在 jsdom（甚至纯 node）
 * 里跑完整的调度断言 —— 见 src/test/genQueue.test.ts 与 src/test/themeQueue.test.ts。
 */
import type { QueueSource, QueueTask } from './types';
import type { EditStyle } from './presets';
import { GEN_STRENGTH } from './presets';

/** 全局并发上限：单张重绘与主题任务共用同一条队列、同一个上限 */
export const QUEUE_MAX = 9;

export interface QueuePhotoRef {
  id?: string;
  blob?: Blob | null;
}

/** 主题任务跑起来后的回调：进度（k/n，不是百分比）与逐张产出 */
export interface ThemeRunHooks {
  /** k = 已处理张数，n = 总张数 */
  onProgress(k: number, n: number, stage?: string): void;
  /** 第 index 张产出好了（调用方负责归档；引擎只管在 epoch 变化后作废） */
  onOutput(index: number, blob: Blob): void | Promise<void>;
}

export interface ThemeTaskInput {
  themeId: string;
  themeName: string;
  prompt: string;
  mode: 'merge' | 'unify';
  layout?: QueueTask['layout'];
  strength: number;
  sources: QueueSource[];
  /** 边拍边收的子任务：对应的原片 id（可选，用于界面回溯） */
  pid?: string;
}

export interface GenQueueDeps {
  MAX?: number;
  HISTORY?: number;
  /** 真生图（aiRedrawCore）；测试里注入 stub */
  generate(task: QueueTask): Promise<Blob>;
  /** 成功归档（写库 + 进 AI 相册） */
  archive(task: QueueTask, out: Blob): Promise<void>;
  /** 主题任务通道：内部逐张产出，通过 hooks 回报进度与产出（不注入则主题任务直接失败） */
  runTheme?(task: QueueTask, hooks: ThemeRunHooks): Promise<void>;
  /** 主题任务每张产出的归档（逐张进相册，每张好了就亮） */
  archiveOutput?(task: QueueTask, index: number, out: Blob): Promise<void>;
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
    this.MAX = deps.MAX ?? QUEUE_MAX;
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

  /**
   * 主题任务入队：**一个主题任务只占 1 个槽位**（内部 2–9 张）。
   * 与 add() 一样是同步返回，绝不 await 生图。
   */
  addTheme(input: ThemeTaskInput): string {
    const sources = input.sources.slice();
    const task: QueueTask = {
      id: this.deps.newId ? this.deps.newId() : 'th' + this.now().toString(36) + Math.random().toString(36).slice(2, 6),
      photoId: input.pid || sources[0]?.id || '',
      blob: sources[0]?.blob ?? null,
      ts: this.now(),
      styleKey: 'theme:' + input.themeId,
      styleName: input.themeName,
      strength: input.strength,
      status: 'queued',
      error: '',
      tries: 0,
      startedAt: 0,
      endedAt: 0,
      kind: 'theme',
      themeId: input.themeId,
      themeName: input.themeName,
      mode: input.mode,
      layout: input.layout,
      prompt: input.prompt,
      sources,
      n: sources.length,
      k: 0,
      pid: input.pid,
      stage: input.mode === 'merge' ? '拼合中' : '统一风格中',
    };
    this.items.push(task);
    this.persist();
    this.pump();
    this.ui();
    return task.id;
  }

  /** 队列里属于某个主题的任务（含跑完的） */
  themeTasks(themeId: string): QueueTask[] {
    return this.items.filter((t) => t.kind === 'theme' && t.themeId === themeId);
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
        if (task.kind === 'theme') {
          // 主题任务：一个槽位内部跑 2–9 张，逐张回调进度与产出
          const runTheme = this.deps.runTheme;
          if (!runTheme) throw new Error('主题任务通道未接入');
          const archiveOutput = this.deps.archiveOutput;
          await runTheme(task, {
            onProgress: (k, n, stage) => {
              if (ep !== this.epoch) return;
              task.k = k;
              task.n = n;
              if (stage) task.stage = stage;
              this.persist();
              this.ui();
            },
            onOutput: async (index, blob) => {
              if (ep !== this.epoch) return;
              if (archiveOutput) await archiveOutput(task, index, blob);
            },
          });
        } else {
          out = await this.deps.generate(task);
        }
      } catch (e) {
        err = e;
      }
      if (!err && ep === this.epoch && out && task.kind !== 'theme') {
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
      if (!err && task.kind === 'theme') task.k = task.n ?? task.k ?? 0;
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
      kind: t.kind,
      themeId: t.themeId,
      themeName: t.themeName,
      mode: t.mode,
      layout: t.layout,
      prompt: t.prompt,
      sources: t.sources,
      n: t.n,
      k: t.k,
      pid: t.pid,
      stage: t.stage,
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
      .map((t) => {
        const sources = Array.isArray(t.sources) ? t.sources.filter((s) => !!s && !!s.blob) : [];
        // 主题任务必须有入参；快照丢了 sources 就降级成单张任务（用首个 blob），不制造必然失败的任务
        const isTheme = t.kind === 'theme' && sources.length > 0;
        return {
          id: t.id,
          photoId: t.photoId || '',
          blob: t.blob || sources[0]?.blob || null,
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
          kind: isTheme ? ('theme' as const) : ('photo' as const),
          themeId: t.themeId,
          themeName: t.themeName,
          mode: t.mode,
          layout: t.layout,
          prompt: t.prompt,
          sources: isTheme ? sources : undefined,
          n: isTheme ? (t.n ?? sources.length) : undefined,
          k: isTheme ? 0 : undefined, // 被打断的主题任务从头跑（k 归零，但已归档的产出不会消失）
          pid: t.pid,
          stage: t.stage,
        };
      })
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

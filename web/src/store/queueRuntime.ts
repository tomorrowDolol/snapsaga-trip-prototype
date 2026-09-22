/**
 * 生图队列单例：把纯调度引擎（domain/genQueue）接到真实的 AI 通道 / IndexedDB / 界面上。
 * 用 hooks 注入避免与 store 形成循环 import。
 *
 * 两条通道：
 *   - 单张（kind='photo'）：aiRedrawCore 直接重绘（原有行为）
 *   - 主题（kind='theme'）：**一个任务占 1 个槽位**，内部逐张产出
 *       · 合成一张（merge）：客户端先按布局拼成一张大图 → 再送 aiRedrawCore 润色
 *       · 统一风格（unify）：N 张各自重绘，同一主题同一提示词同一强度，**每张好了立刻归档**
 */
import { GenQueue, QUEUE_MAX } from '../domain/genQueue';
import { aiRedrawCore, humanAiErr } from '../domain/aiRedraw';
import { styleByKey } from '../domain/presets';
import { themeStyle } from '../domain/themes';
import { composeCollage, type CollageLayout } from '../domain/collage';
import { db } from '../data/db';
import type { QueueTask, ThemeRec } from '../domain/types';

export interface QueueHooks {
  /** 单张任务归档（原有通道） */
  archive(task: QueueTask, out: Blob): Promise<void>;
  /** 主题任务每张产出的归档（逐张进相册，每张好了就亮） */
  archiveOutput(task: QueueTask, index: number, out: Blob): Promise<void>;
  onChange(): void;
}

let hooks: QueueHooks | null = null;
export function installQueueHooks(h: QueueHooks): void {
  hooks = h;
}

/** 主题任务里「AI 通道要的那个 style」——直接把主题提示词伪装成 EditStyle，复用单图通道 */
function styleOf(task: QueueTask) {
  const t: Pick<ThemeRec, 'id' | 'name' | 'prompt'> = {
    id: task.themeId || task.id,
    name: task.themeName || task.styleName || '主题',
    prompt: task.prompt || '',
  };
  return themeStyle(t);
}

export const queue = new GenQueue({
  MAX: QUEUE_MAX, // 并发上限 9（guard 断言）
  HISTORY: 30,
  generate: (task) => {
    if (!task.blob) throw new Error('任务缺少源图');
    return aiRedrawCore(task.blob, styleByKey(task.styleKey), task.strength);
  },
  async runTheme(task, h) {
    const sources = (task.sources ?? []).filter((s) => !!s.blob);
    if (!sources.length) throw new Error('主题任务缺少源图');
    const st = styleOf(task);
    const n = sources.length;
    if (task.mode === 'merge') {
      // 合成一张：N 张 → 1 张。本地按布局拼成一张大图（客户端拼图），再交给 AI 润色。
      h.onProgress(0, n, '拼合中');
      const collage = await composeCollage(
        sources.map((s) => s.blob as Blob),
        { layout: (task.layout ?? '网格拼贴') as CollageLayout, title: task.themeName || '主题', sub: `${task.layout ?? '网格拼贴'} · ${n} 张合成` },
      );
      h.onProgress(n, n, 'AI 润色中');
      const out = await aiRedrawCore(collage, st, task.strength);
      await h.onOutput(0, out);
      return;
    }
    // 统一风格：N 张 → N 张，逐张重绘、逐张归档（每张好了就亮）
    for (let i = 0; i < n; i++) {
      const out = await aiRedrawCore(sources[i].blob as Blob, st, task.strength);
      await h.onOutput(i, out);
      h.onProgress(i + 1, n, '统一风格中');
    }
  },
  archive: (task, out) => {
    if (!hooks) throw new Error('队列未接上归档通道');
    return hooks.archive(task, out);
  },
  archiveOutput: (task, index, out) => {
    if (!hooks) throw new Error('队列未接上主题归档通道');
    return hooks.archiveOutput(task, index, out);
  },
  persist: (tasks) => {
    void db.putTasks(tasks);
  },
  onChange: () => hooks?.onChange(),
  describeError: humanAiErr,
});

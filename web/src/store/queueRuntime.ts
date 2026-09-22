/**
 * 生图队列单例：把纯调度引擎（domain/genQueue）接到真实的 AI 通道 / IndexedDB / 界面上。
 * 用 hooks 注入避免与 store 形成循环 import。
 */
import { GenQueue } from '../domain/genQueue';
import { aiRedrawCore, humanAiErr } from '../domain/aiRedraw';
import { styleByKey } from '../domain/presets';
import { db } from '../data/db';
import type { QueueTask } from '../domain/types';

export interface QueueHooks {
  archive(task: QueueTask, out: Blob): Promise<void>;
  onChange(): void;
}

let hooks: QueueHooks | null = null;
export function installQueueHooks(h: QueueHooks): void {
  hooks = h;
}

export const queue = new GenQueue({
  MAX: 4,
  HISTORY: 30,
  generate: (task) => {
    if (!task.blob) throw new Error('任务缺少源图');
    return aiRedrawCore(task.blob, styleByKey(task.styleKey), task.strength);
  },
  archive: (task, out) => {
    if (!hooks) throw new Error('队列未接上归档通道');
    return hooks.archive(task, out);
  },
  persist: (tasks) => {
    void db.putTasks(tasks);
  },
  onChange: () => hooks?.onChange(),
  describeError: humanAiErr,
});

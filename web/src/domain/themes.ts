/**
 * 主题模式的数据模型与状态机（纯逻辑，可单测；不依赖 React / DOM / 队列实现）。
 *
 * 三条不可退化的约束（guard 与单测都盯着）：
 *   1. **多图上限 = 9**：所有入口（选图 / 全选 / 边拍边收累积 / 合成入参）都走这里的
 *      `togglePick` 与 `addSource`，第 10 张一律被拒并给出明确原因，绝不静默失败。
 *   2. **主题任务只占 1 个队列槽位**：主题的产出方式是 `mode` 决定的（合成一张 / 统一风格），
 *      但任务永远是「一个主题任务」，内部含 2–9 张（见 domain/genQueue 的 addTheme）。
 *   3. **统一风格 N 张 → N 张**、**合成一张 N 张 → 1 张**：产出条数由 `expectedOutputs` 决定，
 *      界面与测试都用它，不许在别处再算一套。
 */
import type { CollageLayout } from './collage';
import { COLLAGE_MAX_SOURCES, COLLAGE_MIN_SOURCES } from './collage';
import type { EditStyle } from './presets';
import type { QueueSource, QueueTask, ThemeMode, ThemeRec, ThemeStatus } from './types';

/** 素材下限 / 上限（上下限在 UI 与状态机里共用同一处定义） */
export const THEME_MIN_SOURCES = COLLAGE_MIN_SOURCES; // 2
export const THEME_MAX_SOURCES = COLLAGE_MAX_SOURCES; // 9

/** 第 10 张被拒时的提示文案（选图入口与边拍边收入口共用，保证说法一致） */
export const PICK_REJECT_MESSAGE = `多图上限 ${THEME_MAX_SOURCES} 张，先取消一张再选`;
export const COLLECT_REJECT_MESSAGE = `这个主题已收满 ${THEME_MAX_SOURCES} 张，结束它再开新主题`;

export const THEME_STATUS_LABEL: Record<ThemeStatus, string> = {
  idle: '未开始',
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  ended: '已结束',
};

export const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  merge: '合成一张',
  unify: '统一风格',
};

export interface NewThemeInput {
  id: string;
  prompt: string;
  words?: string[];
  mode: ThemeMode;
  layout: CollageLayout;
  strength: number;
  sourceIds?: string[];
  now?: number;
}

/** 建一个新主题：状态 idle（未提交）；素材截断到上限 */
export function newTheme(input: NewThemeInput): ThemeRec {
  const now = input.now ?? Date.now();
  const name = (input.prompt || '').trim().slice(0, 10) || '未命名主题';
  return {
    id: input.id,
    name,
    prompt: (input.prompt || '').trim() || '未命名主题',
    words: [...(input.words ?? [])],
    mode: input.mode,
    layout: input.layout,
    strength: input.strength,
    sourceIds: clampIds(input.sourceIds ?? []),
    outputIds: [],
    status: 'idle',
    collecting: false,
    ts: now,
    updatedAt: now,
  };
}

export function clampIds(ids: readonly string[]): string[] {
  return ids.slice(0, THEME_MAX_SOURCES);
}

/* ---------------- 选图上限 ---------------- */

export interface PickResult {
  pick: string[];
  accepted: boolean;
  /** 被拒原因（accepted=true 时为空串），可直接 toast */
  reason: string;
}

/** 选图：再点一次取消；超过上限**拒绝并给出原因**（不静默丢弃） */
export function togglePick(pick: readonly string[], id: string, max: number = THEME_MAX_SOURCES): PickResult {
  if (pick.includes(id)) return { pick: pick.filter((x) => x !== id), accepted: true, reason: '' };
  if (pick.length >= max) return { pick: [...pick], accepted: false, reason: PICK_REJECT_MESSAGE };
  return { pick: [...pick, id], accepted: true, reason: '' };
}

/** 全选：已满则清空，否则选中最近 9 张 */
export function pickAllIds(allIds: readonly string[], currentCount: number, max: number = THEME_MAX_SOURCES): string[] {
  if (currentCount >= Math.min(max, allIds.length)) return [];
  return allIds.slice(-max);
}

/** 生成按钮是否可用：2–9 张 */
export function canGenerate(n: number): boolean {
  return n >= THEME_MIN_SOURCES && n <= THEME_MAX_SOURCES;
}

/** 选图区底部的计数/引导文案（与设计稿 renderPick 的 genHint 一致） */
export function pickHint(mode: ThemeMode, n: number): string {
  if (mode === 'unify' && n === 0) return '也可以直接「创建并开拍」——按快门就自动收进主题';
  if (!n) return `选 ${THEME_MIN_SOURCES}–${THEME_MAX_SOURCES} 张`;
  return `已选 ${n}/${THEME_MAX_SOURCES} 张${mode === 'merge' ? ' → 合成 1 张' : ` → 产出 ${n} 张`}`;
}

/* ---------------- 产出条数 ---------------- */

/** 合成一张 → 1；统一风格 → N */
export function expectedOutputs(mode: ThemeMode, n: number): number {
  if (!canGenerate(n)) return 0;
  return mode === 'merge' ? 1 : Math.min(n, THEME_MAX_SOURCES);
}

/* ---------------- 状态机 ---------------- */

export type ThemeEvent =
  | 'submit' // 提交生成 → 入队
  | 'start' // 队列开始跑
  | 'finish' // 跑完
  | 'fail' // 失败（回到排队，等重试）
  | 'regen' // 再来一版 → 重新入队
  | 'collect-start' // 开始边拍边收（继续边拍边收）
  | 'collect-shot' // 收进一张
  | 'collect-end'; // 结束主题 → 归档

/**
 * 状态迁移（唯一实现；界面只发事件，不直接改 status）：
 *   idle --submit--> queued --start--> running --finish--> done
 *   queued/running --fail--> queued（等重试）
 *   done/ended --collect-start--> collecting（status 保持 done/ended 之外的语义：collecting=true）
 *   collecting --collect-end--> ended
 * 任何不合法的迁移都原样返回（幂等、不会把状态搞乱）。
 */
export function applyThemeEvent(t: ThemeRec, ev: ThemeEvent, now: number = Date.now()): ThemeRec {
  const at = { ...t, updatedAt: now };
  switch (ev) {
    case 'submit':
      return { ...at, status: 'queued', collecting: false };
    case 'start':
      return t.status === 'queued' ? { ...at, status: 'running' } : t;
    case 'finish':
      return t.status === 'running' ? { ...at, status: 'done' } : t;
    case 'fail':
      return t.status === 'running' ? { ...at, status: 'queued' } : t;
    case 'regen':
      return { ...at, status: 'queued' };
    case 'collect-start':
      return { ...at, collecting: true, status: t.status === 'running' ? 'running' : 'done' };
    case 'collect-shot':
      return t.collecting ? at : t;
    case 'collect-end':
      return t.collecting ? { ...at, collecting: false, status: 'ended' } : t;
    default:
      return t;
  }
}

/* ---------------- 边拍边收 ---------------- */

export interface AddSourceResult {
  theme: ThemeRec;
  accepted: boolean;
  reason: string;
}

/** 边拍边收：把刚拍的一张追加进主题（同样受 9 张上限约束） */
export function addSource(t: ThemeRec, photoId: string, now: number = Date.now()): AddSourceResult {
  if (t.sourceIds.includes(photoId)) return { theme: t, accepted: false, reason: '这张已经在主题里了' };
  if (t.sourceIds.length >= THEME_MAX_SOURCES) return { theme: t, accepted: false, reason: COLLECT_REJECT_MESSAGE };
  return {
    theme: { ...t, sourceIds: [...t.sourceIds, photoId], updatedAt: now },
    accepted: true,
    reason: '',
  };
}

/** 边拍边收：一次快门 → 一个「单张统一风格」子任务（n=1，仍只占 1 个槽位） */
export function collectSubTaskSources(photoId: string, blob: Blob | null): QueueSource[] {
  return [{ id: photoId, blob }];
}

/* ---------------- 主题 → AI 通道 ---------------- */

/**
 * 主题提示词伪装成一个 EditStyle，直接喂给现有的单图通道 `aiRedrawCore`：
 * 这样主题模式不用新开一条 AI 通道（队列、并发、失败重试、错误文案全部复用）。
 */
export function themeStyle(t: Pick<ThemeRec, 'id' | 'name' | 'prompt'>): EditStyle {
  return { k: 'theme:' + t.id, n: t.name, prompt: t.prompt, css: 'none', overlay: 'transparent' };
}

/** 主题的产出进度：k = 已产出张数，n = 目标张数（界面显示 k/n） */
export function themeProgress(t: ThemeRec): { k: number; n: number } {
  return { k: t.outputIds.length, n: expectedOutputs(t.mode, t.sourceIds.length) };
}

/** 主题列表页顶部的三个统计 */
export function summarize(themes: readonly ThemeRec[]): { all: number; merge: number; unify: number } {
  return {
    all: themes.length,
    merge: themes.filter((t) => t.mode === 'merge').length,
    unify: themes.filter((t) => t.mode === 'unify').length,
  };
}

/** 主题卡片的产出分组：合成成品 / 同风格组（相册「主题作品」也按这个分） */
export function splitThemeOutputs(outputs: readonly { merge?: boolean }[]): {
  merges: number[];
  unify: number[];
} {
  const merges: number[] = [];
  const unify: number[] = [];
  outputs.forEach((o, i) => (o.merge ? merges : unify).push(i));
  return { merges, unify };
}

/** 按 id 找主题 */
export function themeById(themes: readonly ThemeRec[], id: string | null | undefined): ThemeRec | null {
  if (!id) return null;
  return themes.find((t) => t.id === id) ?? null;
}

/** 主题的「再来一版」：清空产出引用（旧产出留在相册里，不会消失），重新排队 */
export function resetForRegen(t: ThemeRec, now: number = Date.now()): ThemeRec {
  return applyThemeEvent({ ...t, outputIds: [] }, 'regen', now);
}

/**
 * 主题状态跟随队列（界面不自己瞎猜）：
 *   - 正在边拍边收（collecting）时以收集为准；
 *   - 已结束（ended）的归档主题不再被队列拽回去；
 *   - 否则：有 running → running，有 queued → queued，全 done → done。
 * 返回**同一引用**表示无需变更（调用方据此避免无意义的重渲染）。
 */
export function syncThemeStatus(t: ThemeRec, tasks: readonly QueueTask[], now: number = Date.now()): ThemeRec {
  if (t.collecting || t.status === 'ended') return t;
  const mine = tasks.filter((x) => x.kind === 'theme' && x.themeId === t.id);
  if (!mine.length) return t;
  const next: ThemeStatus = mine.some((x) => x.status === 'running')
    ? 'running'
    : mine.some((x) => x.status === 'queued')
      ? 'queued'
      : mine.every((x) => x.status === 'done')
        ? 'done'
        : 'queued';
  return next === t.status ? t : { ...t, status: next, updatedAt: now };
}

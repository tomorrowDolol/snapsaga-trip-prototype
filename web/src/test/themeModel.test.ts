/**
 * 主题模式的数据模型单测：上限 9 的两条入口 / 状态机 / 产出条数 / 边拍边收 / 队列状态跟随。
 *
 * 两条「上限 9」是硬约束（guard 也会断言）：
 *   ① 选图入口（togglePick）第 10 张被拒并给出原因
 *   ② 边拍边收累积（addSource）第 10 张被拒并给出原因
 */
import { describe, expect, it } from 'vitest';
import type { QueueTask, ThemeRec } from '../domain/types';
import {
  COLLECT_REJECT_MESSAGE,
  PICK_REJECT_MESSAGE,
  THEME_MAX_SOURCES,
  THEME_MIN_SOURCES,
  addSource,
  applyThemeEvent,
  canGenerate,
  clampIds,
  collectSubTaskSources,
  expectedOutputs,
  newTheme,
  pickAllIds,
  pickHint,
  resetForRegen,
  splitThemeOutputs,
  summarize,
  syncThemeStatus,
  themeById,
  themeProgress,
  themeStyle,
  togglePick,
} from '../domain/themes';

const base = (over: Partial<Parameters<typeof newTheme>[0]> = {}): ThemeRec =>
  newTheme({
    id: 'th1',
    prompt: '富士胶片旅拍，暖黄秋天，柔光',
    words: ['富士胶片', '柔光'],
    mode: 'merge',
    layout: '网格拼贴',
    strength: 0.62,
    now: 1700000000000,
    ...over,
  });

describe('新建主题', () => {
  it('名称取提示词前 10 字；状态 idle；产出为空', () => {
    const t = base();
    expect(t.name).toBe('富士胶片旅拍，暖黄秋');
    expect(t.status).toBe('idle');
    expect(t.collecting).toBe(false);
    expect(t.outputIds).toEqual([]);
    expect(t.mode).toBe('merge');
    expect(t.layout).toBe('网格拼贴');
    expect(t.strength).toBe(0.62);
    expect(t.ts).toBe(1700000000000);
  });

  it('空提示词 → 名称与提示词都回落「未命名主题」', () => {
    const t = base({ prompt: '   ' });
    expect(t.name).toBe('未命名主题');
    expect(t.prompt).toBe('未命名主题');
  });

  it('新建时素材就被截断到 9 张', () => {
    const t = base({ sourceIds: Array.from({ length: 12 }, (_, i) => 'p' + i) });
    expect(t.sourceIds.length).toBe(THEME_MAX_SOURCES);
    expect(clampIds(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('上限 9 · 入口一：选图（togglePick）', () => {
  it('选到 9 张为止；第 10 张被拒且给出原因', () => {
    let pick: string[] = [];
    for (let i = 0; i < THEME_MAX_SOURCES; i++) {
      const r = togglePick(pick, 'p' + i);
      expect(r.accepted, `第 ${i + 1} 张应当被接受`).toBe(true);
      pick = r.pick;
    }
    expect(pick.length).toBe(9);

    const tenth = togglePick(pick, 'p10');
    expect(tenth.accepted, '第 10 张必须被拒（不能静默丢弃）').toBe(false);
    expect(tenth.pick, '被拒时选图集合不变').toEqual(pick);
    expect(tenth.reason).toBe(PICK_REJECT_MESSAGE);
    expect(tenth.reason).toContain('9');
  });

  it('再点已选中的一张 = 取消（腾出名额后可以继续选）', () => {
    const nine = Array.from({ length: 9 }, (_, i) => 'p' + i);
    const off = togglePick(nine, 'p3');
    expect(off.accepted).toBe(true);
    expect(off.pick.length).toBe(8);
    const again = togglePick(off.pick, 'p10');
    expect(again.accepted).toBe(true);
    expect(again.pick.length).toBe(9);
  });

  it('全选：未满时取最近 9 张；已满时清空', () => {
    const ids = Array.from({ length: 12 }, (_, i) => 'p' + i);
    const all = pickAllIds(ids, 0);
    expect(all.length).toBe(9);
    expect(all[8], '取的是最新那张').toBe('p11');
    expect(pickAllIds(ids, 9), '已满 → 清空').toEqual([]);
  });
});

describe('上限 9 · 入口二：边拍边收累积（addSource）', () => {
  it('逐张收进主题；第 10 张被拒并给出原因', () => {
    let t = applyThemeEvent(base({ mode: 'unify' }), 'collect-start');
    for (let i = 0; i < THEME_MAX_SOURCES; i++) {
      const r = addSource(t, 'p' + i, 1700000001000 + i);
      expect(r.accepted, `第 ${i + 1} 张应当收进主题`).toBe(true);
      t = r.theme;
    }
    expect(t.sourceIds.length).toBe(9);

    const tenth = addSource(t, 'p10');
    expect(tenth.accepted, '第 10 张必须被拒').toBe(false);
    expect(tenth.theme.sourceIds.length, '被拒后素材数不变').toBe(9);
    expect(tenth.reason).toBe(COLLECT_REJECT_MESSAGE);
    expect(tenth.reason).toContain('9');
  });

  it('同一张不会重复收进同一个主题', () => {
    const t = applyThemeEvent(base({ mode: 'unify' }), 'collect-start');
    const a = addSource(t, 'p1');
    const b = addSource(a.theme, 'p1');
    expect(b.accepted).toBe(false);
    expect(b.theme.sourceIds).toEqual(['p1']);
  });

  it('边拍边收的每张 = 一个 n=1 的子任务入参（只占 1 个槽位）', () => {
    const src = collectSubTaskSources('p9', null);
    expect(src).toEqual([{ id: 'p9', blob: null }]);
  });
});

describe('生成门槛与产出条数', () => {
  it('2–9 张才能生成（少于 2 张或超过 9 张都不行）', () => {
    expect(canGenerate(0)).toBe(false);
    expect(canGenerate(1)).toBe(false);
    expect(canGenerate(THEME_MIN_SOURCES)).toBe(true);
    expect(canGenerate(9)).toBe(true);
    expect(canGenerate(10)).toBe(false);
  });

  it('合成一张 N → 1；统一风格 N → N', () => {
    expect(expectedOutputs('merge', 2)).toBe(1);
    expect(expectedOutputs('merge', 9)).toBe(1);
    expect(expectedOutputs('unify', 2)).toBe(2);
    expect(expectedOutputs('unify', 9)).toBe(9);
    expect(expectedOutputs('unify', 1), '不合法张数没有产出').toBe(0);
  });

  it('选图提示文案：合成说 1 张、统一说 N 张、统一风格 0 张时给开拍引导', () => {
    expect(pickHint('merge', 3)).toBe('已选 3/9 张 → 合成 1 张');
    expect(pickHint('unify', 3)).toBe('已选 3/9 张 → 产出 3 张');
    expect(pickHint('merge', 0)).toBe('选 2–9 张');
    expect(pickHint('unify', 0)).toContain('创建并开拍');
  });
});

describe('状态机：排队 → 运行 → 完成 / 结束', () => {
  it('正常路径 idle → queued → running → done', () => {
    let t = base();
    t = applyThemeEvent(t, 'submit', 1700000000001);
    expect(t.status).toBe('queued');
    t = applyThemeEvent(t, 'start', 1700000000002);
    expect(t.status).toBe('running');
    t = applyThemeEvent(t, 'finish', 1700000000003);
    expect(t.status).toBe('done');
    expect(t.updatedAt).toBe(1700000000003);
  });

  it('失败回到 queued（等重试），不会停在 running', () => {
    let t = applyThemeEvent(applyThemeEvent(base(), 'submit'), 'start');
    t = applyThemeEvent(t, 'fail');
    expect(t.status).toBe('queued');
  });

  it('边拍边收：collect-start → collecting；collect-end → ended', () => {
    let t = applyThemeEvent(base({ mode: 'unify' }), 'submit');
    t = applyThemeEvent(t, 'start');
    t = applyThemeEvent(t, 'finish');
    t = applyThemeEvent(t, 'collect-start');
    expect(t.collecting).toBe(true);
    expect(t.status).toBe('done');
    t = applyThemeEvent(t, 'collect-end');
    expect(t.collecting).toBe(false);
    expect(t.status, '结束主题 = 归档成 ended').toBe('ended');
  });

  it('不合法的迁移原样返回（幂等，不会把状态搞乱）', () => {
    const idle = base();
    expect(applyThemeEvent(idle, 'start').status, '没排队不能开始').toBe('idle');
    expect(applyThemeEvent(idle, 'finish').status, '没开始不能完成').toBe('idle');
    expect(applyThemeEvent(idle, 'collect-shot'), '没在收集时收图不生效').toBe(idle);
    expect(applyThemeEvent(idle, 'collect-end').status).toBe('idle');
  });

  it('再来一版：清空产出引用并重新排队（旧产出留在相册里）', () => {
    const t = { ...base(), status: 'done' as const, outputIds: ['ai1', 'ai2'] };
    const next = resetForRegen(t, 1700000009999);
    expect(next.status).toBe('queued');
    expect(next.outputIds).toEqual([]);
    expect(t.outputIds, '不改原对象').toEqual(['ai1', 'ai2']);
  });

  it('状态跟随队列：running > queued > done，已结束的不被拽回去', () => {
    const t = { ...base(), status: 'running' as const };
    const task = (status: QueueTask['status']): QueueTask => ({
      id: 'q1',
      photoId: 'p1',
      blob: null,
      ts: 1,
      styleKey: '',
      styleName: '',
      strength: 0.6,
      status,
      error: '',
      tries: 1,
      startedAt: 0,
      endedAt: 0,
      kind: 'theme',
      themeId: 'th1',
    });
    expect(syncThemeStatus(t, [task('running')]), '状态没变时返回同一引用（不制造无意义重渲染）').toBe(t);
    expect(syncThemeStatus(t, [task('queued')]).status, 'running → queued（失败回队）').toBe('queued');
    expect(syncThemeStatus(t, [task('done')]).status, 'running → done').toBe('done');
    expect(syncThemeStatus(t, [task('running'), task('done')]).status, '有在跑的就算 running').toBe('running');
    expect(syncThemeStatus(t, []), '没有本主题的任务就不动').toBe(t);
    const ended = { ...t, status: 'ended' as const };
    expect(syncThemeStatus(ended, [task('running')]), '已结束的归档主题不跟随').toBe(ended);
    const collecting = { ...t, collecting: true };
    expect(syncThemeStatus(collecting, [task('done')]), '边拍边收中不跟随').toBe(collecting);
  });
});

describe('主题 → AI 通道 / 进度 / 统计', () => {
  it('主题提示词伪装成 EditStyle（复用同一条单图通道）', () => {
    const st = themeStyle({ id: 'th1', name: '秋日', prompt: '暖黄秋天' });
    expect(st.k).toBe('theme:th1');
    expect(st.n).toBe('秋日');
    expect(st.prompt).toBe('暖黄秋天');
  });

  it('进度 k/n：统一风格 k 随产出增长，n 恒为素材数；合成为 1', () => {
    const unify = { ...base({ mode: 'unify', sourceIds: ['a', 'b', 'c'] }), outputIds: ['o1'] };
    expect(themeProgress(unify)).toEqual({ k: 1, n: 3 });
    const merge = { ...base({ mode: 'merge', sourceIds: ['a', 'b', 'c'] }), outputIds: ['o1'] };
    expect(themeProgress(merge)).toEqual({ k: 1, n: 1 });
  });

  it('统计与产出分组', () => {
    const themes = [base({ id: 'a', mode: 'merge' }), base({ id: 'b', mode: 'unify' })];
    expect(summarize(themes)).toEqual({ all: 2, merge: 1, unify: 1 });
    expect(splitThemeOutputs([{ merge: true }, {}, { merge: true }])).toEqual({ merges: [0, 2], unify: [1] });
  });

  it('按 id 找主题（找不到给 null，不抛）', () => {
    const themes = [base({ id: 'a' }), base({ id: 'b' })];
    expect(themeById(themes, 'b')?.id).toBe('b');
    expect(themeById(themes, 'zzz')).toBeNull();
    expect(themeById(themes, null)).toBeNull();
  });
});

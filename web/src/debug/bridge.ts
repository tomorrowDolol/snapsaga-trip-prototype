/**
 * 调试 / 验证桥（dev & test 用，生产也保留：零依赖、只读，便于线上排查）。
 *
 * 为什么要有它：根目录原型的验收脚本（snapsaga_queue_check/*.cjs、ss_e2e.cjs）是**验收红线**，
 * 它们通过页面全局读内部状态。这个桥把同一批全局名重新暴露在新应用上，于是那些脚本可以
 * **几乎原样**跑在 React 构建产物上（断言不放松）。等价的新脚本见 web/e2e/。
 *
 * v0.8 起额外暴露主题模式的状态与动作（guard 的「并发 9 / 多图 9 / 主题任务占 1 槽位」要在
 * 真产物上断言，直接走 store + queue 最不容易写歪）。
 */
import { db } from '../data/db';
import { themesDb } from '../data/themesDb';
import { cam } from '../store/cameraRuntime';
import { queue } from '../store/queueRuntime';
import { aiCreds } from '../domain/settings';
import { aiRedrawCore } from '../domain/aiRedraw';
import { activeTheme, useAppStore } from '../store/useAppStore';
import { QUEUE_MAX, type ThemeTaskInput } from '../domain/genQueue';
import { THEME_MAX_SOURCES } from '../domain/themes';
import { buildPrompt } from '../domain/promptBuilder';
import type { CollageLayout } from '../domain/collage';
import type { ThemeMode } from '../domain/types';
import type { CamState } from '../domain/capture';
import type { PhotoRec, QueueTask, ThemeRec } from '../domain/types';

export interface SnapsagaDebug {
  store: typeof useAppStore;
  db: typeof db;
  themesDb: typeof themesDb;
  queue: typeof queue;
  cam: CamState;
  photos(): PhotoRec[];
  album(): PhotoRec[];
  queueItems(): QueueTask[];
  themes(): ThemeRec[];
  activeTheme(): ThemeRec | null;
  aiCreds(): ReturnType<typeof aiCreds>;
  aiRedrawCore: typeof aiRedrawCore;
  capture(): Promise<void>;
  openSettings(): void;
  // ---- 主题模式（供 guard / e2e 驱动）----
  limits: { queueMax: number; maxSources: number };
  addThemeTask(input: ThemeTaskInput): string;
  openThemeCreate(withPick?: boolean): void;
  setThemePrompt(v: string): void;
  toggleThemeWord(w: string): void;
  setThemeMode(m: ThemeMode): void;
  setThemeLayout(l: CollageLayout): void;
  setThemeStrength(v: number): void;
  toggleThemePick(id: string): void;
  themePickAll(): void;
  themePrompt(): string;
  createTheme(shoot?: boolean): void;
  endActiveTheme(): void;
}

declare global {
  interface Window {
    __snapsaga?: SnapsagaDebug;
    /** 以下为兼容旧验收脚本的全局名（只读） */
    PHOTOS?: PhotoRec[];
    AI_ALBUM?: PhotoRec[];
    cam?: CamState;
    DB?: typeof db;
    GenQueue?: { readonly items: QueueTask[]; readonly MAX: number; counts(): unknown };
    aiCreds?: typeof aiCreds;
    aiRedrawCore?: typeof aiRedrawCore;
    openSettings?: () => void;
    $?: (sel: string) => Element | null;
  }
}

export function installDebugBridge(): void {
  const w = window;
  const store = useAppStore;

  const debug: SnapsagaDebug = {
    store,
    db,
    themesDb,
    queue,
    cam,
    photos: () => store.getState().photos,
    album: () => store.getState().album,
    queueItems: () => store.getState().queueItems,
    themes: () => store.getState().themes,
    activeTheme: () => activeTheme(store.getState()),
    aiCreds,
    aiRedrawCore,
    capture: () => store.getState().capture(),
    openSettings: () => store.getState().openSettings(),
    limits: { queueMax: QUEUE_MAX, maxSources: THEME_MAX_SOURCES },
    addThemeTask: (input) => queue.addTheme(input),
    openThemeCreate: (withPick) => store.getState().openThemeCreate(withPick),
    setThemePrompt: (v) => store.getState().setThemePrompt(v),
    toggleThemeWord: (word) => store.getState().toggleThemeWord(word),
    setThemeMode: (m) => store.getState().setThemeMode(m),
    setThemeLayout: (l) => store.getState().setThemeLayout(l),
    setThemeStrength: (v) => store.getState().setThemeStrength(v),
    toggleThemePick: (id) => store.getState().toggleThemePick(id),
    themePickAll: () => store.getState().themePickAll(),
    themePrompt: () => {
      const s = store.getState();
      return buildPrompt(s.themePromptDraft, s.themeWords);
    },
    createTheme: (shoot) => store.getState().createTheme(shoot),
    endActiveTheme: () => store.getState().endActiveTheme(),
  };
  w.__snapsaga = debug;

  const def = (name: keyof Window, get: () => unknown) => {
    Object.defineProperty(w, name, { get, configurable: true });
  };
  def('PHOTOS', () => store.getState().photos);
  def('AI_ALBUM', () => store.getState().album);
  def('cam', () => cam);
  def('DB', () => db);
  def('GenQueue', () => ({
    get items() {
      return store.getState().queueItems;
    },
    MAX: queue.MAX,
    counts: () => queue.counts(),
  }));
  def('aiCreds', () => aiCreds);
  def('aiRedrawCore', () => aiRedrawCore);
  def('openSettings', () => () => store.getState().openSettings());
  def('$', () => (sel: string) => document.querySelector(sel));
}

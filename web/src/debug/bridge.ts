/**
 * 调试 / 验证桥（dev & test 用，生产也保留：零依赖、只读，便于线上排查）。
 *
 * 为什么要有它：根目录原型的验收脚本（snapsaga_queue_check/*.cjs、ss_e2e.cjs）是**验收红线**，
 * 它们通过页面全局读内部状态。这个桥把同一批全局名重新暴露在新应用上，于是那些脚本可以
 * **几乎原样**跑在 React 构建产物上（断言不放松）。等价的新脚本见 web/e2e/。
 */
import { db } from '../data/db';
import { cam } from '../store/cameraRuntime';
import { queue } from '../store/queueRuntime';
import { aiCreds } from '../domain/settings';
import { aiRedrawCore } from '../domain/aiRedraw';
import { useAppStore } from '../store/useAppStore';
import type { CamState } from '../domain/capture';
import type { PhotoRec, QueueTask } from '../domain/types';

export interface SnapsagaDebug {
  store: typeof useAppStore;
  db: typeof db;
  queue: typeof queue;
  cam: CamState;
  photos(): PhotoRec[];
  album(): PhotoRec[];
  queueItems(): QueueTask[];
  aiCreds(): ReturnType<typeof aiCreds>;
  aiRedrawCore: typeof aiRedrawCore;
  capture(): Promise<void>;
  openSettings(): void;
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
    queue,
    cam,
    photos: () => store.getState().photos,
    album: () => store.getState().album,
    queueItems: () => store.getState().queueItems,
    aiCreds,
    aiRedrawCore,
    capture: () => store.getState().capture(),
    openSettings: () => store.getState().openSettings(),
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

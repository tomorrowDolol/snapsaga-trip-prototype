/**
 * 主题记录的持久化。
 *
 * ⚠️ 为什么**不**放进 `snapsaga` 库：根目录单文件原型把那个库钉在 `indexedDB.open('snapsaga', 2)`，
 * 而浏览器里一个库一旦升到更高版本，再用**更低版本**打开会直接抛 `VersionError` —— 也就是说
 * 只要我们把 `snapsaga` 升到 v3 加一个 `themes` 仓，冻结的根原型（v0.6）就再也读不到用户数据了。
 * 两个入口「同源同库、互相读得懂」是铁律，所以主题另开一个独立库：
 *
 *   snapsaga         v2  photos / queue      ← 与根原型共用（不许动版本号）
 *   snapsaga_themes  v1  themes             ← v0.8 新增，只有 web/ 用
 *
 * 主题里**不存 blob**（只存 photoId 引用），所以这个库很小；照片本体仍全在 `snapsaga` 里。
 */
import type { ThemeRec } from '../domain/types';

export const THEMES_DB_NAME = 'snapsaga_themes';
export const THEMES_DB_VERSION = 1;
export const THEMES_STORE = 'themes';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function txDone(t: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export class ThemesDb {
  private db: IDBDatabase | null = null;

  get ready(): boolean {
    return !!this.db;
  }

  open(): Promise<void> {
    if (this.db) return Promise.resolve();
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    return new Promise((res, rej) => {
      const r = indexedDB.open(THEMES_DB_NAME, THEMES_DB_VERSION);
      r.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(THEMES_STORE)) db.createObjectStore(THEMES_STORE, { keyPath: 'id' });
      };
      r.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        res();
      };
      r.onerror = () => rej(r.error);
    });
  }

  async all(): Promise<ThemeRec[]> {
    if (!this.db) return [];
    const all = await req<ThemeRec[]>(this.db.transaction(THEMES_STORE).objectStore(THEMES_STORE).getAll());
    return all.sort((a, b) => b.ts - a.ts);
  }

  put(rec: ThemeRec): Promise<void> {
    if (!this.db) return Promise.resolve();
    const t = this.db.transaction(THEMES_STORE, 'readwrite');
    t.objectStore(THEMES_STORE).put(rec);
    return txDone(t);
  }

  /** 整表快照写（主题数量小，简单可靠；与队列仓同一套做法） */
  putAll(list: readonly ThemeRec[]): Promise<void> {
    if (!this.db) return Promise.resolve();
    const t = this.db.transaction(THEMES_STORE, 'readwrite');
    const os = t.objectStore(THEMES_STORE);
    os.clear();
    for (const x of list) os.put(x);
    return txDone(t);
  }

  clear(): Promise<void> {
    if (!this.db) return Promise.resolve();
    const t = this.db.transaction(THEMES_STORE, 'readwrite');
    t.objectStore(THEMES_STORE).clear();
    return txDone(t);
  }
}

export const themesDb = new ThemesDb();

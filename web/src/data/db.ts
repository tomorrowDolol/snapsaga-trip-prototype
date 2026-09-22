/**
 * IndexedDB 数据层。
 *
 * ⚠️ 库名 `snapsaga`、对象仓 `photos`(keyPath id) 与 `queue`(keyPath id)、以及照片记录字段
 * 全部与根目录单文件原型保持一致 —— 用户现有数据必须能被新应用直接读到（反之亦然）。
 * 表结构如需变更，只能**新增版本 + 兼容迁移**，绝不允许清库。
 */
import type { PhotoRec, QueueSnapshot } from '../domain/types';

export const DB_NAME = 'snapsaga';
export const DB_VERSION = 2;

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

export class SnapsagaDb {
  private db: IDBDatabase | null = null;

  get ready(): boolean {
    return !!this.db;
  }

  open(): Promise<void> {
    if (this.db) return Promise.resolve();
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        // 只在缺的时候建，绝不重建/清空已有仓
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
      };
      r.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        res();
      };
      r.onerror = () => rej(r.error);
    });
  }

  put(rec: PhotoRec): Promise<void> {
    if (!this.db) return Promise.reject(new Error('DB 未打开'));
    const t = this.db.transaction('photos', 'readwrite');
    t.objectStore('photos').put(rec);
    return txDone(t);
  }

  async all(): Promise<PhotoRec[]> {
    if (!this.db) return [];
    const all = await req<PhotoRec[]>(this.db.transaction('photos').objectStore('photos').getAll());
    return all.sort((a, b) => b.ts - a.ts);
  }

  del(id: string): Promise<void> {
    if (!this.db) return Promise.resolve();
    const t = this.db.transaction('photos', 'readwrite');
    t.objectStore('photos').delete(id);
    return txDone(t);
  }

  clear(): Promise<void> {
    if (!this.db) return Promise.resolve();
    const t = this.db.transaction('photos', 'readwrite');
    t.objectStore('photos').clear();
    return txDone(t);
  }

  /** 生图队列：整表快照读写（任务量小，简单可靠；与原型同一形状） */
  putTasks(list: QueueSnapshot[]): Promise<void> {
    if (!this.db) return Promise.resolve();
    const t = this.db.transaction('queue', 'readwrite');
    const os = t.objectStore('queue');
    os.clear();
    for (const x of list) os.put(x);
    return txDone(t);
  }

  async tasks(): Promise<QueueSnapshot[]> {
    if (!this.db) return [];
    const all = await req<QueueSnapshot[]>(this.db.transaction('queue').objectStore('queue').getAll());
    return all.sort((a, b) => a.ts - b.ts);
  }
}

export const db = new SnapsagaDb();

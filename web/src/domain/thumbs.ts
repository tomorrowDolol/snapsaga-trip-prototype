/**
 * 缩略图（v0.6 的核心性能取舍，必须保留）。
 *
 * 列表只挂小图：真拍照原图 3MB 级（解码后约 49MB/张），直接塞网格会拖死滚动。
 * 策略：先入库原图 → 后台补缩略图 → 补好后只换这一格的图，**快门路径绝不等它**。
 */
import type { PhotoRec } from './types';

export const THUMB_MAX = 320; // 最长边
export const THUMB_Q = 0.72; // jpeg 质量

export interface ThumbTarget {
  width: number;
  height: number;
  scale: number;
}

/** 纯函数：等比缩到最长边 ≤ max，最小 1px（尺寸断言在 src/test/thumbs.test.ts） */
export function thumbTargetSize(w: number, h: number, max: number = THUMB_MAX): ThumbTarget {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

export interface BitmapLike {
  width: number;
  height: number;
  close?: () => void;
}

export interface ThumbCanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): { drawImage(src: unknown, dx: number, dy: number, dw: number, dh: number): void } | null;
  toBlob(cb: (b: Blob | null) => void, type?: string, quality?: number): void;
}

export interface ThumbDeps {
  decode(blob: Blob): Promise<BitmapLike>;
  createCanvas(): ThumbCanvasLike;
}

export const browserThumbDeps: ThumbDeps = {
  decode: (blob) => createImageBitmap(blob), // 解码交给浏览器，不占主线程
  createCanvas: () => document.createElement('canvas'),
};

/**
 * 生成缩略图。不支持 / 失败一律返回 null（渲染回落用原图），绝不抛。
 * 依赖可注入，方便 jsdom 单测断言「画布尺寸 = 320 最长边」「编码质量 = .72」。
 */
export async function makeThumb(blob: Blob | null | undefined, deps: ThumbDeps = browserThumbDeps): Promise<Blob | null> {
  try {
    if (!blob) return null;
    const bmp = await deps.decode(blob);
    const { width, height } = thumbTargetSize(bmp.width, bmp.height);
    const c = deps.createCanvas();
    c.width = width;
    c.height = height;
    c.getContext('2d')?.drawImage(bmp, 0, 0, width, height);
    if (bmp.close) bmp.close();
    return await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', THUMB_Q));
  } catch {
    return null;
  }
}

export interface QueueThumbHooks {
  makeThumb?: (blob: Blob) => Promise<Blob | null>;
  put(rec: PhotoRec): Promise<unknown>;
  onReady?(rec: PhotoRec): void;
}

/**
 * 后台补缩略图：**fire-and-forget**，返回值是 void —— 调用方（快门路径）不允许 await 它。
 * 补好后落库（下次不必重算）并回调让界面就地换图。
 */
export function queueThumb(rec: PhotoRec | null | undefined, hooks: QueueThumbHooks): void {
  if (!rec || rec.thumb) return;
  const gen = hooks.makeThumb ?? makeThumb;
  void gen(rec.blob).then(async (t) => {
    if (!t) return;
    rec.thumb = t;
    try {
      await hooks.put(rec);
    } catch {
      /* 落库失败不影响本次显示 */
    }
    hooks.onReady?.(rec);
  });
}

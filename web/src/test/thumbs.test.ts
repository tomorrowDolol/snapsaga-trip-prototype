/**
 * 缩略图单测：尺寸数学 + 真实调用路径（注入假 decode / 假 canvas，所以 jsdom 里也能断言
 * 「画布尺寸 = 最长边 320」「编码类型 = image/jpeg」「质量 = .72」「失败返回 null」）。
 * 「真图 ≥5 倍缩减」这种必须量真实 JPEG 的断言在 e2e（web/e2e/acceptance-thumbs.e2e.mjs）。
 */
import { describe, expect, it, vi } from 'vitest';
import { makeThumb, queueThumb, thumbTargetSize, THUMB_MAX, THUMB_Q, type ThumbCanvasLike, type ThumbDeps } from '../domain/thumbs';
import type { PhotoRec } from '../domain/types';

describe('thumbTargetSize：最长边 320、保持比例、不放大', () => {
  it('竖图 1200×1600 → 240×320', () => {
    expect(thumbTargetSize(1200, 1600)).toEqual({ width: 240, height: 320, scale: 0.2 });
  });
  it('横图 4000×3000 → 320×240（最长边命中上限）', () => {
    expect(thumbTargetSize(4000, 3000)).toEqual({ width: 320, height: 240, scale: 0.08 });
  });
  it('正方形 1080×1080 → 320×320', () => {
    const t = thumbTargetSize(1080, 1080);
    expect([t.width, t.height]).toEqual([320, 320]);
  });
  it('本来就小的图不放大（300×200 原样返回）', () => {
    expect(thumbTargetSize(300, 200)).toEqual({ width: 300, height: 200, scale: 1 });
  });
  it('极端比例也不会出现 0 像素', () => {
    expect(thumbTargetSize(4000, 1)).toEqual({ width: 320, height: 1, scale: 0.08 });
  });
  it('常量就是 v0.6 定下的 320 / .72', () => {
    expect(THUMB_MAX).toBe(320);
    expect(THUMB_Q).toBe(0.72);
  });
});

interface Recorded {
  width: number;
  height: number;
  drawn: [number, number, number, number] | null;
  type: string | undefined;
  quality: number | undefined;
}

function fakeDeps(opts: { w: number; h: number; fail?: boolean; blob?: Blob }): { deps: ThumbDeps; rec: Recorded } {
  const rec: Recorded = { width: 0, height: 0, drawn: null, type: undefined, quality: undefined };
  const deps: ThumbDeps = {
    async decode() {
      if (opts.fail) throw new Error('decode 失败');
      return { width: opts.w, height: opts.h };
    },
    createCanvas(): ThumbCanvasLike {
      const c: ThumbCanvasLike = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (_src, dx, dy, dw, dh) => {
            rec.drawn = [dx, dy, dw, dh];
          },
        }),
        toBlob: (cb, type, quality) => {
          rec.width = c.width;
          rec.height = c.height;
          rec.type = type;
          rec.quality = quality;
          cb(opts.blob ?? new Blob([new Uint8Array(30 * 1024)], { type: 'image/jpeg' }));
        },
      };
      return c;
    },
  };
  return { deps, rec };
}

describe('makeThumb：画布尺寸与编码参数', () => {
  it('按 320 最长边建画布，并以 image/jpeg .72 编码', async () => {
    const { deps, rec } = fakeDeps({ w: 1200, h: 1600 });
    const out = await makeThumb(new Blob([new Uint8Array(1024)]), deps);
    expect(rec.width, '画布宽').toBe(240);
    expect(rec.height, '画布高').toBe(320);
    expect(rec.drawn, 'drawImage 的目标尺寸一致').toEqual([0, 0, 240, 320]);
    expect(rec.type).toBe('image/jpeg');
    expect(rec.quality).toBe(THUMB_Q);
    expect(out?.type).toBe('image/jpeg');
    expect(out?.size).toBeLessThan(64 * 1024);
  });

  it('解码失败返回 null（渲染回落用原图），不抛异常', async () => {
    const { deps } = fakeDeps({ w: 10, h: 10, fail: true });
    await expect(makeThumb(new Blob(['x']), deps)).resolves.toBeNull();
  });

  it('blob 为空返回 null', async () => {
    const { deps } = fakeDeps({ w: 10, h: 10 });
    await expect(makeThumb(null, deps)).resolves.toBeNull();
  });

  it('toBlob 给回 null 也返回 null', async () => {
    const deps: ThumbDeps = {
      decode: async () => ({ width: 100, height: 100 }),
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} }),
        toBlob: (cb) => cb(null),
      }),
    };
    await expect(makeThumb(new Blob(['x']), deps)).resolves.toBeNull();
  });
});

describe('queueThumb：fire-and-forget（快门路径不允许 await 它）', () => {
  const rec = () => ({ id: 'p1', blob: new Blob(['x']), ts: 1 }) as PhotoRec;

  it('返回 undefined（同步返回，不是 Promise）', () => {
    const r = rec();
    const out = queueThumb(r, { put: async () => {}, makeThumb: async () => new Blob(['t']) });
    expect(out).toBeUndefined();
  });

  it('补好后落库并回调（让界面就地换图）', async () => {
    const r = rec();
    const put = vi.fn(async () => {});
    const onReady = vi.fn();
    const thumb = new Blob(['thumb']);
    queueThumb(r, { put, onReady, makeThumb: async () => thumb });
    await new Promise((res) => setTimeout(res, 0));
    expect(r.thumb).toBe(thumb);
    expect(put).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('已经有 thumb 的（老记录回填过）不重复计算', async () => {
    const r = rec();
    r.thumb = new Blob(['old']);
    const make = vi.fn(async () => new Blob(['new']));
    queueThumb(r, { put: async () => {}, makeThumb: make });
    await new Promise((res) => setTimeout(res, 0));
    expect(make).not.toHaveBeenCalled();
  });

  it('生成失败时安静跳过（不落库、不回调）', async () => {
    const r = rec();
    const put = vi.fn(async () => {});
    queueThumb(r, { put, makeThumb: async () => null });
    await new Promise((res) => setTimeout(res, 0));
    expect(put).not.toHaveBeenCalled();
    expect(r.thumb).toBeUndefined();
  });
});

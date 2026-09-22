/**
 * 「合成一张」客户端拼图的单测。
 *
 * 全部用**注入的假 deps**（记录 drawImage / fillText / strokeRect 调用），不需要真 canvas：
 * 这样既能断言几何，也能断言「谁画了什么」，且与浏览器无关。
 */
import { describe, expect, it } from 'vitest';
import {
  COLLAGE_H,
  COLLAGE_LAYOUTS,
  COLLAGE_MAX_SOURCES,
  COLLAGE_MIN_SOURCES,
  COLLAGE_W,
  MULTI_IMAGE_EDITS_SUPPORTED,
  canCompose,
  clampSources,
  collageLayout,
  composeCollage,
  sourceCountLabel,
  type CollageCanvas,
  type CollageCtx,
  type CollageDeps,
  type CollageLayout,
} from '../domain/collage';

interface Draw {
  src: unknown;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** 假 canvas / 假 ctx：只记录调用，不做真实绘制 */
function fakeDeps(sizes: Array<{ width: number; height: number }> = [{ width: 4000, height: 3000 }]) {
  const draws: Draw[] = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const strokes: Array<[number, number, number, number]> = [];
  const fills: Array<[number, number, number, number]> = [];
  const gradients: string[][] = [];
  const encoded: Array<{ type?: string; quality?: number }> = [];
  const closed: number[] = [];
  let decoded = 0;

  const ctx: CollageCtx = {
    drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) {
      draws.push({ src, sx, sy, sw, sh, dx, dy, dw, dh });
    },
    fillRect(x, y, w, h) {
      fills.push([x, y, w, h]);
    },
    strokeRect(x, y, w, h) {
      strokes.push([x, y, w, h]);
    },
    fillText(text, x, y) {
      texts.push({ text, x, y });
    },
    save() {},
    restore() {},
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set textBaseline(_v: string) {},
    set globalAlpha(_v: number) {},
    createLinearGradient(x0, y0, x1, y1) {
      const stops: string[] = [`${x0},${y0},${x1},${y1}`];
      gradients.push(stops);
      return { addColorStop: (o, c) => void stops.push(`${o}:${c}`) };
    },
  };

  const canvas: CollageCanvas = {
    width: 0,
    height: 0,
    getContext: (t) => (t === '2d' ? ctx : null),
    toBlob: (cb, type, quality) => {
      encoded.push({ type, quality });
      cb(new Blob(['png'], { type: type ?? 'image/png' }));
    },
  };

  const deps: CollageDeps = {
    decode: () => {
      const s = sizes[Math.min(decoded, sizes.length - 1)];
      const i = decoded++;
      return Promise.resolve({ width: s.width, height: s.height, close: () => void closed.push(i) });
    },
    createCanvas: () => canvas,
  };

  return { deps, canvas, draws, texts, strokes, fills, gradients, encoded, closed, decodedCount: () => decoded };
}

describe('常量：上限/尺寸/布局顺序与设计稿一致', () => {
  it('布局顺序 = 网格拼贴 → 无缝融合 → 故事板', () => {
    expect(COLLAGE_LAYOUTS).toEqual(['网格拼贴', '无缝融合', '故事板']);
  });

  it('画布 1024×1152，张数上限 2–9', () => {
    expect([COLLAGE_W, COLLAGE_H]).toEqual([1024, 1152]);
    expect([COLLAGE_MIN_SOURCES, COLLAGE_MAX_SOURCES]).toEqual([2, 9]);
  });

  it('多图入参尚未支持 → 走「客户端拼一张 + 单图润色」降级路径', () => {
    expect(MULTI_IMAGE_EDITS_SUPPORTED).toBe(false);
  });
});

describe('collageLayout：纯几何', () => {
  it('默认输出尺寸 = 1024×1152，tiles 长度 = 张数', () => {
    for (const n of [2, 3, 4, 5, 6, 9]) {
      const p = collageLayout(n, '网格拼贴');
      expect([p.w, p.h]).toEqual([COLLAGE_W, COLLAGE_H]);
      expect(p.tiles.length, `n=${n}`).toBe(n);
      expect(p.tiles.map((t) => t.index)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it('超过 9 张被 clamp 到 9；0/1 张 clamp 到 1', () => {
    expect(collageLayout(10, '网格拼贴').tiles.length).toBe(9);
    expect(collageLayout(12, '故事板').tiles.length).toBe(9);
    expect(collageLayout(9.9, '无缝融合').tiles.length).toBe(9);
    expect(collageLayout(0, '网格拼贴').tiles.length).toBe(1);
    expect(collageLayout(-3, '网格拼贴').tiles.length).toBe(1);
  });

  it('cols：网格拼贴/无缝融合 n<=4 → 2，n>4 → 3；故事板恒 3；rows = ceil(n/cols)', () => {
    for (const layout of ['网格拼贴', '无缝融合'] as CollageLayout[]) {
      expect(collageLayout(2, layout).cols, `${layout} n=2`).toBe(2);
      expect(collageLayout(4, layout).cols, `${layout} n=4`).toBe(2);
      expect(collageLayout(5, layout).cols, `${layout} n=5`).toBe(3);
      expect(collageLayout(9, layout).cols, `${layout} n=9`).toBe(3);
    }
    for (const n of [2, 3, 4, 5, 6, 9]) {
      const p = collageLayout(n, '故事板');
      expect(p.cols, `故事板 n=${n}`).toBe(3);
      expect(p.rows).toBe(Math.ceil(n / 3));
    }
    expect(collageLayout(5, '网格拼贴').rows).toBe(2);
    expect(collageLayout(9, '网格拼贴').rows).toBe(3);
  });

  it('所有格子都在画布内，且不越进底部字幕条', () => {
    for (const layout of COLLAGE_LAYOUTS) {
      for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
        const p = collageLayout(n, layout);
        for (const t of p.tiles) {
          expect(t.x, `${layout} n=${n} tile${t.index} x`).toBeGreaterThanOrEqual(0);
          expect(t.y).toBeGreaterThanOrEqual(0);
          expect(t.w).toBeGreaterThan(0);
          expect(t.h).toBeGreaterThan(0);
          expect(t.x + t.w).toBeLessThanOrEqual(p.w);
          expect(t.y + t.h).toBeLessThanOrEqual(p.h);
          expect(t.y + t.h).toBeLessThanOrEqual(p.caption.y);
        }
      }
    }
  });

  it('网格拼贴的格子互不重叠', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const { tiles } = collageLayout(n, '网格拼贴');
      for (let a = 0; a < tiles.length; a++) {
        for (let b = a + 1; b < tiles.length; b++) {
          const A = tiles[a];
          const B = tiles[b];
          const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
          expect(overlap, `n=${n} tile${a} 与 tile${b} 重叠`).toBe(false);
        }
      }
    }
  });

  it('gap：网格拼贴 >0、故事板 >0、无缝融合 =0（无缝融合的格子正好铺满网格区）', () => {
    expect(collageLayout(6, '网格拼贴').gap).toBeGreaterThan(0);
    expect(collageLayout(6, '故事板').gap).toBeGreaterThan(0);
    expect(collageLayout(6, '无缝融合').gap).toBe(0);

    // 无缝融合 n=6 → 3 列 2 行，格子应严丝合缝：第 0 格宽 = 1024/3 的取整
    const p = collageLayout(6, '无缝融合');
    expect(p.tiles[0].x).toBe(0);
    expect(p.tiles[1].x).toBe(p.tiles[0].x + p.tiles[0].w);
    expect(p.tiles[3].y).toBe(p.tiles[0].y + p.tiles[0].h);
  });

  it('字幕条贴在画布底部、与画布同宽，focus 是 0..1 的相对裁剪中心', () => {
    for (const layout of COLLAGE_LAYOUTS) {
      const p = collageLayout(4, layout);
      expect(p.caption.x).toBe(0);
      expect(p.caption.w).toBe(p.w);
      expect(p.caption.y + p.caption.h).toBe(p.h);
      expect(p.caption.h).toBeGreaterThan(0);
      expect(p.focus.x).toBeGreaterThanOrEqual(0);
      expect(p.focus.x).toBeLessThanOrEqual(1);
      expect(p.focus.y).toBeGreaterThanOrEqual(0);
      expect(p.focus.y).toBeLessThanOrEqual(1);
    }
  });

  it('三种布局的 plan 互不相同（同样 6 张）', () => {
    const jsons = COLLAGE_LAYOUTS.map((l) => JSON.stringify(collageLayout(6, l)));
    expect(new Set(jsons).size).toBe(3);
  });

  it('是纯函数：同样入参两次调用结果一致，且不改动调用方传的对象', () => {
    const opts = { n: 5, layout: '故事板' as CollageLayout };
    const a = collageLayout(opts.n, opts.layout);
    const b = collageLayout(opts.n, opts.layout);
    expect(a).toEqual(b);
    expect(opts).toEqual({ n: 5, layout: '故事板' });
    a.tiles[0].x = 999;
    expect(collageLayout(5, '故事板').tiles[0].x).not.toBe(999);
  });

  it('自定义画布尺寸按比例缩放（字幕条比例不变）', () => {
    const p = collageLayout(4, '网格拼贴', 512, 576);
    expect([p.w, p.h]).toEqual([512, 576]);
    expect(p.caption.y).toBe(576 - Math.round(576 * (74 / 430)));
    for (const t of p.tiles) expect(t.x + t.w).toBeLessThanOrEqual(512);
  });
});

describe('clampSources / canCompose / sourceCountLabel', () => {
  it('clampSources 截到 9 且不改动原数组', () => {
    const list = Array.from({ length: 10 }, (_, i) => i);
    const out = clampSources(list);
    expect(out.length).toBe(9);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(list.length, '原数组不被改动').toBe(10);
    expect(out).not.toBe(list);
  });

  it('clampSources 支持自定义上限，且不足上限时原样返回', () => {
    expect(clampSources([1, 2, 3], 2)).toEqual([1, 2]);
    expect(clampSources([1, 2, 3], 9)).toEqual([1, 2, 3]);
    expect(clampSources([1, 2, 3], 0)).toEqual([]);
  });

  it('canCompose 只认 2..9 的整数', () => {
    expect(canCompose(1)).toBe(false);
    expect(canCompose(2)).toBe(true);
    expect(canCompose(9)).toBe(true);
    expect(canCompose(10)).toBe(false);
    expect(canCompose(0)).toBe(false);
    expect(canCompose(2.5)).toBe(false);
  });

  it('sourceCountLabel 形如 3/9，超上限按上限显示', () => {
    expect(sourceCountLabel(3)).toBe('3/9');
    expect(sourceCountLabel(9)).toBe('9/9');
    expect(sourceCountLabel(12)).toBe('9/9');
  });
});

describe('composeCollage：绘制 + 编码', () => {
  const three = [new Blob(['a']), new Blob(['b']), new Blob(['c'])];
  const opts = { layout: '网格拼贴' as CollageLayout, title: '富士胶片旅拍', sub: '网格拼贴 · 3 张合成 · 25.09.22' };

  it('3 张 → 恰好 3 次 drawImage，画布 1024×1152，编码 image/png', async () => {
    const f = fakeDeps();
    const out = await composeCollage(three, opts, f.deps);
    expect(f.draws.length).toBe(3);
    expect(f.canvas.width).toBe(COLLAGE_W);
    expect(f.canvas.height).toBe(COLLAGE_H);
    expect(f.encoded).toEqual([{ type: 'image/png', quality: undefined }]);
    expect(out).toBeInstanceOf(Blob);
    expect(out.type).toBe('image/png');
    expect(f.closed, '每张解码出来的图都按顺序 close').toEqual([0, 1, 2]);
  });

  it('每格按 object-fit: cover 裁剪，且画进 plan 给出的格子', async () => {
    const f = fakeDeps([{ width: 4000, height: 3000 }]);
    await composeCollage(three, opts, f.deps);
    const plan = collageLayout(3, '网格拼贴');
    f.draws.forEach((d, i) => {
      const t = plan.tiles[i];
      expect([d.dx, d.dy, d.dw, d.dh]).toEqual([t.x, t.y, t.w, t.h]);
      // 源图 4:3 → 目标格更高更窄：按高度铺满，宽度被裁
      expect(d.sh).toBeCloseTo(3000, 5);
      expect(d.sw).toBeLessThan(4000);
      expect(d.sx).toBeCloseTo((4000 - d.sw) / 2, 5);
      expect(d.sy).toBeCloseTo((3000 - d.sh) / 2, 5);
      expect(d.sw / d.sh).toBeCloseTo(t.w / t.h, 5);
    });
  });

  it('字幕条收到 title 与 sub', async () => {
    const f = fakeDeps();
    await composeCollage(three, opts, f.deps);
    const printed = f.texts.map((t) => t.text);
    expect(printed).toContain('富士胶片旅拍');
    expect(printed).toContain('网格拼贴 · 3 张合成 · 25.09.22');
  });

  it('网格拼贴：每格一次描边 + 帧号 1..n', async () => {
    const f = fakeDeps();
    await composeCollage(three, opts, f.deps);
    expect(f.strokes.length).toBe(3);
    expect(f.texts.filter((t) => /^\d+$/.test(t.text)).map((t) => t.text)).toEqual(['1', '2', '3']);
  });

  it('故事板：同样 3 列分镜，有描边 + 帧号 + 字幕条', async () => {
    const f = fakeDeps();
    await composeCollage(three, { ...opts, layout: '故事板' }, f.deps);
    expect(f.draws.length).toBe(3);
    expect(f.strokes.length).toBe(3);
    expect(f.texts.map((t) => t.text)).toContain('富士胶片旅拍');
    const plan = collageLayout(3, '故事板');
    f.draws.forEach((d, i) => expect(d.dx).toBe(plan.tiles[i].x));
  });

  it('无缝融合：不留缝、不描边、不画帧号，改叠暖色 + 一条贯穿的柔化渐变', async () => {
    const f = fakeDeps();
    await composeCollage(three, { ...opts, layout: '无缝融合' }, f.deps);
    expect(f.draws.length).toBe(3);
    expect(f.strokes.length, '无缝融合不描边').toBe(0);
    expect(f.texts.filter((t) => /^\d+$/.test(t.text)), '无缝融合不画帧号').toEqual([]);
    expect(f.gradients.length, '叠了一条贯穿的渐变').toBe(1);
    expect(f.gradients[0].length, '渐变有多个色标').toBeGreaterThan(2);
    const plan = collageLayout(3, '无缝融合');
    expect(f.draws[1].dx).toBe(plan.tiles[0].x + plan.tiles[0].w);
  });

  it('超过 9 张只拼前 9 张', async () => {
    const f = fakeDeps();
    const many = Array.from({ length: 12 }, (_, i) => new Blob([`p${i}`]));
    await composeCollage(many, opts, f.deps);
    expect(f.draws.length).toBe(9);
    expect(f.decodedCount()).toBe(9);
  });

  it('1 张也能拼（几何 = 单格），空数组抛可读错误', async () => {
    const f = fakeDeps();
    const one = await composeCollage([new Blob(['a'])], opts, f.deps);
    expect(one.type).toBe('image/png');
    expect(f.draws.length).toBe(1);

    const g = fakeDeps();
    await expect(composeCollage([], opts, g.deps)).rejects.toThrow('没有可合成的照片');
    expect(g.draws.length).toBe(0);
  });

  it('拿不到 2d 上下文时抛可读错误（不静默出一张空图）', async () => {
    const f = fakeDeps();
    const broken: CollageDeps = { ...f.deps, createCanvas: () => ({ ...f.canvas, getContext: () => null }) };
    await expect(composeCollage(three, opts, broken)).rejects.toThrow(/画布上下文/);
  });

  it('编码失败（toBlob 给 null）也抛错', async () => {
    const f = fakeDeps();
    const broken: CollageDeps = { ...f.deps, createCanvas: () => ({ ...f.canvas, toBlob: (cb) => cb(null) }) };
    await expect(composeCollage(three, opts, broken)).rejects.toThrow('画布导出 PNG 失败');
  });
});

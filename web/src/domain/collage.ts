/**
 * 主题模式「合成一张」的客户端拼图：N 张照片（2–9）→ 1 张大图（纯几何 + canvas 绘制，无 React）。
 *
 * ## 为什么是「客户端拼一张 + 单图润色」
 * 我们走的是 OpenAI 兼容的 `POST {base}/images/edits`（见 `domain/aiRedraw.ts`）。按 OpenAI 的
 * 契约，那个接口的 multipart 里只有**一个** `image` 字段——它只吃单图。把 N 张图塞进同一个字段
 * 是无效请求（服务端只会看第一张，或被直接拒掉）。所以要「合成一张」就得先在本地把 N 张拼起来：
 *   ① 本模块：按布局把 N 张源图拼成 1024×1152 的 PNG，几何完全确定、可单测、可本地预览；
 *   ② 之后把这张大图当成 `/images/edits` 的唯一入参送 AI 润色，得到最终成品（重绘通道见 aiRedraw）。
 * 好处：不依赖任何服务端的多图能力，出图尺寸/排布由客户端说了算，失败点少（只有绘制与编码）。
 *
 * ## `MULTI_IMAGE_EDITS_SUPPORTED` 打开（网关已支持多图入参）后应该怎么改
 *   - 语义：该常量描述「服务端的 `/images/edits` 是否接受多个 image 字段」，false = 走本模块的
 *     「客户端拼一张 + 单图润色」降级路径。
 *   - 一旦网关（p0-plan 决策 D1 的正式版网关 / 自建服务）支持多图：把常量改成 true，
 *     调用方（主题队列的 merge 任务）就**不要**再走 `composeCollage`，而是把 N 张源图各自
 *     `sourceToPngBlob`（压到 ≤1024 长边）后逐个 append 进 FormData（`image[]` 或重复 `image`），
 *     一次请求交给模型做真正的多图融合——模型自己决定怎么排，不再需要本地几何。
 *   - 本模块不改职责：它永远只是「把 N 张拼成 1 张」的离线工具，跟网络无关。
 *
 * 布局观感对齐设计真源 `design.html#collage()`（390×430 卡片）：同样的 cols 规则（网格拼贴
 * n<=4 → 2 列、否则 3 列；故事板恒 3 列）、同样的底部字幕条、同样的每格帧号；只是画布放大到
 * 1024×1152（AI 通道要更大更清晰的源图），并按比例换算描边/字号/字幕条高度。
 */

export type CollageLayout = '网格拼贴' | '无缝融合' | '故事板';

/** 顺序同设计稿「合成布局」的三个按钮 */
export const COLLAGE_LAYOUTS: CollageLayout[] = ['网格拼贴', '无缝融合', '故事板'];

/** 多图上限（硬约束，与原型 PICK_MAX / genBtn 的 2–9 一致） */
export const COLLAGE_MAX_SOURCES = 9;
export const COLLAGE_MIN_SOURCES = 2;

/** 出图尺寸：AI 通道（/images/edits）要求 png，且希望源图够大够清晰 */
export const COLLAGE_W = 1024;
export const COLLAGE_H = 1152;

/** 设计稿卡片 430 高、字幕条 74 高 → 按比例换算到 1152 高时约 198 */
const CAPTION_RATIO = 74 / 430;
/** 格子之间留的缝（= 描边/取景的内缩），无缝融合为 0 */
const GRID_GAP = 8;
const STORY_GAP = 12;

export interface CollageTile {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CollagePlan {
  layout: CollageLayout;
  cols: number;
  rows: number;
  w: number;
  h: number;
  /** 长度 = min(n, 9) */
  tiles: CollageTile[];
  /** 底部字幕条（主题名 + 布局 + 张数 + 日期），故事板必画，其它布局也画（与设计稿一致） */
  caption: { x: number; y: number; w: number; h: number };
  /** 格子之间是否留缝（网格拼贴 true / 无缝融合 false / 故事板 true）——用像素宽度表达 */
  gap: number;
  /** 每个格子在画布内的相对裁剪中心（0..1），用于把源图按 object-fit: cover 铺满格子 */
  focus: { x: number; y: number };
}

/** n 归一化到 [1, 9] 的整数（0/负数/NaN → 1，>9 → 9） */
function clampCount(n: number): number {
  const i = Math.floor(Number.isFinite(n) ? n : 0);
  if (!(i > 1)) return 1;
  return i > COLLAGE_MAX_SOURCES ? COLLAGE_MAX_SOURCES : i;
}

/**
 * 纯函数：给定张数与布局，算出画布/格子/字幕条几何。n 会被 clamp 到 [1, 9]。
 * 不碰 canvas、不碰网络、无副作用——同样的入参永远得到同样的 plan。
 */
export function collageLayout(
  n: number,
  layout: CollageLayout,
  w: number = COLLAGE_W,
  h: number = COLLAGE_H,
): CollagePlan {
  const count = clampCount(n);
  const story = layout === '故事板';
  const seamless = layout === '无缝融合';
  const cols = story ? 3 : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const gap = seamless ? 0 : story ? STORY_GAP : GRID_GAP;

  const captionH = Math.round(h * CAPTION_RATIO);
  const gridH = h - captionH;

  const tiles: CollageTile[] = [];
  const half = Math.floor(gap / 2);
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // 先算未留缝的格子边界，再向内缩 gap/2 —— 保证格子永远落在画布内、且互不重叠
    const x0 = Math.round((c * w) / cols);
    const x1 = Math.round(((c + 1) * w) / cols);
    const y0 = Math.round((r * gridH) / rows);
    const y1 = Math.round(((r + 1) * gridH) / rows);
    tiles.push({
      index: i,
      x: x0 + half,
      y: y0 + half,
      w: Math.max(1, x1 - x0 - gap),
      h: Math.max(1, y1 - y0 - gap),
    });
  }

  return {
    layout,
    cols,
    rows,
    w,
    h,
    tiles,
    caption: { x: 0, y: h - captionH, w, h: captionH },
    gap,
    // 分镜的取景略偏上：分镜框偏扁，主体（人）往上留才不会顶到框底
    focus: story ? { x: 0.5, y: 0.45 } : { x: 0.5, y: 0.5 },
  };
}

/** 只保留前 max 张（默认 COLLAGE_MAX_SOURCES）；不修改入参 */
export function clampSources<T>(list: readonly T[], max: number = COLLAGE_MAX_SOURCES): T[] {
  const cap = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  return list.slice(0, cap);
}

/** 能不能「合成一张」：2..9 的整数 */
export function canCompose(n: number): boolean {
  return Number.isInteger(n) && n >= COLLAGE_MIN_SOURCES && n <= COLLAGE_MAX_SOURCES;
}

/** 张数标签，例如 '3/9'（超过上限按上限显示，不会出现 '10/9'） */
export function sourceCountLabel(n: number): string {
  const k = Number.isFinite(n) ? Math.max(0, Math.min(COLLAGE_MAX_SOURCES, Math.floor(n))) : 0;
  return `${k}/${COLLAGE_MAX_SOURCES}`;
}

/** 画布依赖（可注入，便于 jsdom 单测；缺省用浏览器实现） */
export interface CollageCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CollageCtx | null;
  toBlob(cb: (b: Blob | null) => void, type?: string, quality?: number): void;
}

export interface CollageCtx {
  drawImage(src: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  save(): void;
  restore(): void;
  set fillStyle(v: string);
  set strokeStyle(v: string);
  set lineWidth(v: number);
  set font(v: string);
  set textBaseline(v: string);
  set globalAlpha(v: number);
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
}

export interface CollageDeps {
  decode(blob: Blob): Promise<{ width: number; height: number; close?: () => void }>;
  createCanvas(): CollageCanvas;
}

/** 浏览器实现：<img> 解码 + <canvas>。只在真正调用时碰 DOM，模块加载时不碰。 */
export const browserCollageDeps: CollageDeps = {
  decode(blob: Blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        res(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error('照片解码失败'));
      };
      img.src = url;
    });
  },
  createCanvas() {
    return document.createElement('canvas') as unknown as CollageCanvas;
  },
};

/** 把一张源图按 object-fit: cover 铺满格子：算出源图上的裁剪矩形（sx/sy/sw/sh） */
function coverRect(
  iw: number,
  ih: number,
  tw: number,
  th: number,
  focus: { x: number; y: number },
): { sx: number; sy: number; sw: number; sh: number } {
  const s = Math.max(tw / iw, th / ih);
  const sw = tw / s;
  const sh = th / s;
  return { sx: (iw - sw) * focus.x, sy: (ih - sh) * focus.y, sw, sh };
}

/**
 * 把 N 张图按布局拼成 1 张 PNG。失败抛可读错误。
 * 只做「绘制 + 编码」，不做业务判断（是否该拼、顺序、上限由调用方用 canCompose/clampSources 决定）。
 */
export async function composeCollage(
  sources: readonly Blob[],
  opts: { layout: CollageLayout; title: string; sub: string },
  deps: CollageDeps = browserCollageDeps,
): Promise<Blob> {
  const list = clampSources(sources);
  if (list.length === 0) throw new Error('没有可合成的照片');

  const plan = collageLayout(list.length, opts.layout);
  const canvas = deps.createCanvas();
  canvas.width = COLLAGE_W;
  canvas.height = COLLAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('拿不到画布上下文（2d），无法合成');

  const gridH = plan.caption.y;

  // 底色：与设计稿一致的深色底（图没铺满时露出的也是它）
  ctx.fillStyle = '#0b0f10';
  ctx.fillRect(0, 0, COLLAGE_W, COLLAGE_H);

  for (const tile of plan.tiles) {
    const src = await deps.decode(list[tile.index]);
    const iw = src.width;
    const ih = src.height;
    if (!iw || !ih) throw new Error('照片解码失败：拿不到尺寸');
    const { sx, sy, sw, sh } = coverRect(iw, ih, tile.w, tile.h, plan.focus);
    ctx.drawImage(src, sx, sy, sw, sh, tile.x, tile.y, tile.w, tile.h);
    src.close?.();

    if (plan.gap > 0) {
      // 网格拼贴 / 故事板：细描边 + 右下角帧号（帧号 = 选片顺序，方便回头对素材）
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(tile.x + 5, tile.y + 5, Math.max(1, tile.w - 10), Math.max(1, tile.h - 10));
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff';
      ctx.font = '600 26px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(tile.index + 1), tile.x + 18, tile.y + tile.h - 18);
      ctx.restore();
    }
  }

  if (plan.layout === '无缝融合') {
    // 无缝融合：不留缝、不描边、不画帧号，改成「暖色 + 一条贯穿的柔化渐变」把接缝揉开
    ctx.fillStyle = 'rgba(233,180,76,.10)';
    ctx.fillRect(0, 0, COLLAGE_W, gridH);
    const grad = ctx.createLinearGradient(0, 0, COLLAGE_W, gridH);
    grad.addColorStop(0, 'rgba(255,238,208,.12)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(24,18,10,.14)');
    // CollageCtx.fillStyle 的签名按约定只声明 string（真实 canvas 也接受渐变对象），这里显式收窄
    ctx.fillStyle = grad as unknown as string;
    ctx.fillRect(0, 0, COLLAGE_W, gridH);
  }

  // 底部字幕条：主题名 + 布局/张数/日期（四种布局都画，与设计稿一致）
  const cap = plan.caption;
  ctx.fillStyle = 'rgba(6,8,9,.62)';
  ctx.fillRect(cap.x, cap.y, cap.w, cap.h);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = '700 40px "PingFang SC", "Helvetica Neue", system-ui, sans-serif';
  ctx.fillText(opts.title, cap.x + 42, cap.y + Math.round(cap.h * 0.4));
  ctx.fillStyle = '#E9B44C';
  ctx.font = '500 29px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText(opts.sub, cap.x + 42, cap.y + Math.round(cap.h * 0.7));

  return new Promise<Blob>((res, rej) => {
    canvas.toBlob((b) => {
      if (b) res(b);
      else rej(new Error('画布导出 PNG 失败'));
    }, 'image/png');
  });
}

/** 网关是否已支持多图入参（/images/edits 的多张 image 字段）。false = 走「客户端拼一张 + 单图润色」的降级路径。 */
export const MULTI_IMAGE_EDITS_SUPPORTED = false;

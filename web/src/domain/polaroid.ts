/**
 * 拍立得工坊：白框 + 颗粒 + 日期戳 + 一句手写注记。
 * 与根目录原型的合成参数逐项一致（画布 1000 宽、pad/底边按画幅区分、颗粒 overlay 0.10、暗角 0.14）。
 */
import { FILMS } from './presets';
import { blobToImage, fmtDate } from './media';
import type { PhotoRec } from './types';

export interface PolaroidLayout {
  width: number;
  height: number;
  pad: number;
  bottom: number;
  /** 注记区高度（组件用它设 #polaCap 的 style.height） */
  capHeight: number;
}

export function polaroidLayout(filmKey: string): PolaroidLayout {
  const film = FILMS[filmKey] ?? FILMS['600'];
  const width = 1000;
  const pad = film.wide ? 70 : 96;
  const bottom = film.wide ? 190 : 230;
  const iw = width - pad * 2;
  const ih = film.wide ? Math.round(iw * 0.85) : Math.round(iw * 1.02);
  const height = ih + bottom + pad - 24;
  return { width, height, pad, bottom, capHeight: bottom - 40 };
}

let _noise: CanvasPattern | null = null;
function noisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (_noise) return _noise;
  const n = document.createElement('canvas');
  n.width = n.height = 128;
  const nc = n.getContext('2d');
  if (!nc) return null;
  const im = nc.createImageData(128, 128);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  nc.putImageData(im, 0, 0);
  _noise = ctx.createPattern(n, 'repeat');
  return _noise;
}

/** 手写注记折行绘制（按字符量宽，简单可靠） */
export function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!text) return;
  ctx.save();
  ctx.font = '46px "Kaiti SC","STKaiti","Marker Felt",cursive';
  ctx.fillStyle = '#5a4a38';
  ctx.textAlign = 'center';
  const chars = [...text];
  let line = '';
  const lines: string[] = [];
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > w - 40) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  lines.push(line);
  const lh = 58;
  const y0 = y + (h - lines.length * lh) / 2 + 40;
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y0 + i * lh));
  ctx.restore();
}

export interface RenderPolaroidArgs {
  canvas: HTMLCanvasElement;
  photo: PhotoRec;
  filmKey: string;
  note: string;
}

/** 合成一张拍立得（纯 canvas，不碰网络） */
export async function renderPolaroid({ canvas, photo, filmKey, note }: RenderPolaroidArgs): Promise<PolaroidLayout> {
  const film = FILMS[filmKey] ?? FILMS['600'];
  const { width: W, height: H, pad, bottom } = polaroidLayout(filmKey);
  const iw = W - pad * 2;
  const ih = film.wide ? Math.round(iw * 0.85) : Math.round(iw * 1.02);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return polaroidLayout(filmKey);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  // 照片 cover 裁剪
  const img = await blobToImage(photo.blob);
  const s = Math.max(iw / img.width, ih / img.height);
  const sw = iw / s;
  const sh = ih / s;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.save();
  ctx.filter = `contrast(${film.contrast}) saturate(1.05)`;
  ctx.drawImage(img, sx, sy, sw, sh, pad, pad, iw, ih);
  ctx.restore();
  // 偏色叠层
  ctx.fillStyle = film.tint;
  ctx.fillRect(pad, pad, iw, ih);
  // 颗粒
  const noise = noisePattern(ctx);
  if (noise) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = noise;
    ctx.fillRect(pad, pad, iw, ih);
    ctx.restore();
  }
  // 边缘轻微暗角
  const vg = ctx.createRadialGradient(W / 2, pad + ih / 2, iw * 0.45, W / 2, pad + ih / 2, iw * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,25,10,.14)');
  ctx.fillStyle = vg;
  ctx.fillRect(pad, pad, iw, ih);
  // 日期戳
  ctx.font = '500 34px "Bradley Hand","Marker Felt",cursive';
  ctx.fillStyle = 'rgba(255,138,61,.92)';
  const ds = fmtDate(new Date(photo.ts));
  ctx.fillText(ds, pad + iw - ctx.measureText(ds).width - 14, pad + ih - 16);
  // 注记
  drawCaption(ctx, note, pad, ih + pad + 14, W - pad * 2, bottom - 46);
  return polaroidLayout(filmKey);
}

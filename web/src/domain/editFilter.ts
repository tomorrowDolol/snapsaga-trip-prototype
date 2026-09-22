/** 本地滤镜（离线可用）：原图 + 滤镜层按强度混合 */
import { blobToImage } from './media';
import type { EditStyle } from './presets';

export const EDIT_MAX_EDGE = 1100;

export async function renderLocalFilter(photoBlob: Blob, st: EditStyle, strength: number): Promise<HTMLCanvasElement> {
  const img = await blobToImage(photoBlob);
  const sc = Math.min(1, EDIT_MAX_EDGE / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * sc);
  c.height = Math.round(img.height * sc);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  // 滤镜层（强度混合）
  const fc = document.createElement('canvas');
  fc.width = c.width;
  fc.height = c.height;
  const fx = fc.getContext('2d');
  if (fx) {
    fx.filter = st.css;
    fx.drawImage(img, 0, 0, c.width, c.height);
    fx.filter = 'none';
    fx.fillStyle = st.overlay;
    fx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = strength;
    ctx.drawImage(fc, 0, 0);
    ctx.globalAlpha = 1;
  }
  return c;
}

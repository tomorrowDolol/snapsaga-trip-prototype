/**
 * AI 重绘的唯一通道：只负责「发请求 → 拿回图像 Blob」，无任何 UI。
 * 修图页与后台生图队列共用它（便于以后换成网关，见 p0-plan D1）。
 *
 * ⚠️ 这个模块**绝不能被快门路径 import**（guard 会断言）；快门只允许 await 本地取图与入库。
 */
import { blobToImage } from './media';
import { aiCreds, type AiCreds } from './settings';
import { styleByKey, type EditStyle } from './presets';

export const AI_MAX_EDGE = 1024;

export function aiRedrawUrl(base: string): string {
  return base + '/images/edits';
}

/** 送原图（不叠加本地滤镜），prompt 带 strength 语义 */
export function buildRedrawPrompt(st: EditStyle, strength: number): string {
  return `${st.prompt} Redraw strength: ${Math.round(strength * 100)}%.`;
}

export async function sourceToPngBlob(srcBlob: Blob): Promise<Blob> {
  const img = await blobToImage(srcBlob);
  const c = document.createElement('canvas');
  const sc = Math.min(1, AI_MAX_EDGE / Math.max(img.width, img.height));
  c.width = Math.round(img.width * sc);
  c.height = Math.round(img.height * sc);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  const png = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!png) throw new Error('无法编码源图');
  return png;
}

export function buildEditFormData(pngBlob: Blob, st: EditStyle, strength: number, model: string): FormData {
  const fd = new FormData();
  fd.append('image', pngBlob, 'photo.png');
  fd.append('prompt', buildRedrawPrompt(st, strength));
  fd.append('model', model);
  fd.append('n', '1');
  fd.append('size', '1024x1024');
  return fd;
}

export function humanAiErr(e: unknown): string {
  const msg = '' + ((e as Error)?.message || e || '');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return '网络不通，或该服务不允许浏览器直连（CORS）';
  return msg || '未知错误';
}

export async function aiRedrawCore(
  srcBlob: Blob,
  style: EditStyle | null | undefined,
  strength: number | null | undefined,
  creds: AiCreds = aiCreds(),
): Promise<Blob> {
  const { base, key, model } = creds;
  if (!base || !key) throw new Error('未配置 AI：先在设置里填 API Key（Base 已有默认值，本地滤镜不受影响）');
  const st = style ?? styleByKey(null);
  const sp = strength == null ? 0.7 : strength;
  const pngBlob = await sourceToPngBlob(srcBlob);
  const resp = await fetch(aiRedrawUrl(base), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: buildEditFormData(pngBlob, st, sp, model),
  });
  if (!resp.ok) {
    let m = resp.status + ' ' + resp.statusText;
    try {
      const j = (await resp.json()) as { error?: { message?: string } };
      if (j.error && j.error.message) m = j.error.message;
    } catch {
      /* 非 JSON 错误体，用状态码 */
    }
    throw new Error(m);
  }
  const j = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const d = (j.data && j.data[0]) || {};
  if (d.b64_json) return await (await fetch('data:image/png;base64,' + d.b64_json)).blob();
  if (d.url) return await (await fetch(d.url)).blob();
  throw new Error('响应里没有图像数据');
}

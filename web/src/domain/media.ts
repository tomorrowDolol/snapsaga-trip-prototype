/** 图像与分享的小工具（与根目录原型行为一致） */

export function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `'${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob);
    const i = new Image();
    i.onload = () => {
      URL.revokeObjectURL(u);
      res(i);
    };
    i.onerror = (e) => {
      URL.revokeObjectURL(u);
      rej(e);
    };
    i.src = u;
  });
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/jpeg', q = 0.92): Promise<Blob> {
  return new Promise((res, rej) => {
    c.toBlob((b) => (b ? res(b) : rej(new Error('canvas 编码失败'))), type, q);
  });
}

export type SaveOutcome = 'shared' | 'downloaded';

/** 能走系统分享面板就走（iOS 上等于「存到相册」），否则下载 */
export async function saveOrShare(blob: Blob, filename: string, title: string): Promise<SaveOutcome> {
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch {
      /* 用户取消或分享失败 → 走下载 */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return 'downloaded';
}

/**
 * 相机取图：**优先走设备的「静止图像」管线（ImageCapture.takePhoto），失败/不支持时一次性回落抓帧**。
 *
 * 两条铁律：
 * 1. 只对设备真正支持的能力下约束 —— 先读 getCapabilities()，不支持却硬下会白白报错，
 *    还会掩盖真实原因（iPhone 报 torch/zoom/focusDistance，但**没有 focusMode**）。
 * 2. 降级不静默：回落一次就把 still 置 false（本次会话不再重试），并在取景信息条如实显示
 *    实际分辨率 + 本次是「静止图像」还是「抓帧」。
 *
 * 本模块不碰 AI、不碰网络、不碰队列；只产出 Blob。
 */

export interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
export type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

export interface VideoTrackLike {
  getCapabilities?(): object;
  getSettings?(): { width?: number; height?: number };
  applyConstraints?(constraints: unknown): Promise<void>;
}

export interface CamState {
  facing: 'environment' | 'user';
  /** 本次会话是否还能走静止图像管线（takePhoto 失败一次后永久置 false） */
  still: boolean;
  /** 「相机 2560×1440」 */
  res: string;
  /** 最近一张是怎么来的 */
  lastShot: '' | 'still' | 'frame';
}

export function createCamState(): CamState {
  return {
    facing: 'environment',
    // 运行时能力探测，不按 UA 判断（iOS 26.6 Safari 实测支持，旧版本未必）
    still: typeof window !== 'undefined' && 'ImageCapture' in window,
    res: '',
    lastShot: '',
  };
}

/** 纯函数：根据能力清单算出该下发哪些约束（单元测试直接断言它） */
export function planConstraints(caps: Record<string, unknown>): Record<string, unknown>[] {
  const supports = (k: string, mode: string): boolean => {
    const v = caps[k];
    return Array.isArray(v) ? v.includes(mode) : !!v;
  };
  const want: Record<string, unknown>[] = [];
  if (caps.width && caps.height) want.push({ width: { ideal: 3840 }, height: { ideal: 2160 } });
  if (supports('focusMode', 'continuous')) want.push({ focusMode: 'continuous' });
  if (supports('whiteBalanceMode', 'continuous')) want.push({ whiteBalanceMode: 'continuous' });
  return want;
}

export interface CamTuneResult {
  caps: Record<string, unknown>;
  /** 真正下发成功的约束项 key（诊断用） */
  applied: string[];
  res: string;
}

/** 逐项 try：任一项不被支持不能拖累其它项；实际分辨率按 getSettings 如实回报 */
export async function camTune(track: VideoTrackLike | null | undefined, state?: CamState): Promise<CamTuneResult> {
  const out: CamTuneResult = { caps: {}, applied: [], res: '' };
  if (!track) return out;
  let caps: Record<string, unknown> = {};
  try {
    caps = track.getCapabilities ? (track.getCapabilities() as Record<string, unknown>) : {};
  } catch {
    caps = {};
  }
  for (const c of planConstraints(caps)) {
    try {
      await track.applyConstraints?.({ advanced: [c] });
      out.applied.push(...Object.keys(c));
    } catch {
      /* 单项不支持：静默跳过，不影响其它项 */
    }
  }
  try {
    const s = track.getSettings?.() || {};
    if (s.width && s.height) out.res = `相机 ${s.width}×${s.height}`;
  } catch {
    /* getSettings 不可用就算了，信息条少一行不影响功能 */
  }
  out.caps = caps;
  if (state) {
    state.res = out.res;
  }
  return out;
}

export interface CamMetaParts {
  res: string;
  /** 「支持静止图像」/「仅能抓帧」 */
  stillLabel: string;
  /** 「本次：静止图像」/「本次：抓帧」；还没拍过则为 null */
  shotLabel: string | null;
}

export function camMetaParts(state: Pick<CamState, 'res' | 'still' | 'lastShot'>): CamMetaParts | null {
  if (!state.res) return null;
  const shot = state.lastShot === 'still' ? '本次：静止图像' : state.lastShot === 'frame' ? '本次：抓帧' : null;
  return { res: state.res, stillLabel: state.still ? '支持静止图像' : '仅能抓帧', shotLabel: shot };
}

export interface GrabEnv {
  /** 注入点：jsdom 单测里放 stub；浏览器里就是 window.ImageCapture */
  ImageCaptureCtor?: ImageCaptureCtor | undefined;
  /** 抓帧回落：从实时预览 drawImage 出一帧（浏览器实现见 grabFrameFromVideo） */
  grabFrame(): Promise<Blob>;
}

export interface StillShot {
  blob: Blob;
  kind: 'still' | 'frame';
}

/**
 * 快门取图。**只返回 {blob, kind}，不碰 AI、不碰队列、不碰网络。**
 * 失败回落是「一次性降级」：takePhoto 抛错即把 still 置 false，本次会话不再重试。
 */
export async function grabStill(
  env: GrabEnv,
  track: MediaStreamTrack | null | undefined,
  state: CamState,
): Promise<StillShot> {
  const Ctor = env.ImageCaptureCtor;
  if (state.still && Ctor && track) {
    try {
      const ic = new Ctor(track);
      const blob = await ic.takePhoto();
      if (blob && blob.size > 0) return { blob, kind: 'still' };
    } catch {
      state.still = false; // 该设备/该流不支持，本次及后续直接用抓帧
    }
  }
  return { blob: await env.grabFrame(), kind: 'frame' };
}

/** 浏览器实现：从实时预览抓一帧（回落路径） */
export async function grabFrameFromVideo(video: HTMLVideoElement): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d')?.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('抓帧失败：canvas 无法编码');
  return blob;
}

export function browserGrabEnv(): GrabEnv {
  return {
    ImageCaptureCtor: (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture,
    grabFrame: () => grabFrameFromVideo(document.querySelector<HTMLVideoElement>('#video')!),
  };
}

/** 能申请持久存储就申请（照片都在 IndexedDB，不能等系统回收了才发现）；失败静默 */
export async function ensurePersist(): Promise<void> {
  try {
    if (!(navigator.storage && navigator.storage.persist)) return;
    const already = await navigator.storage.persisted();
    const ok = already || (await navigator.storage.persist());
    console.info('[SnapSaga] 持久存储:', already ? '已是' : ok ? '已授权' : '未授权');
  } catch {
    /* 静默 */
  }
}

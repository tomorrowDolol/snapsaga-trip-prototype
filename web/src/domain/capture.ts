/**
 * 相机取图：**优先走设备的「静止图像」管线（ImageCapture.takePhoto），失败/不支持时回落抓帧**。
 *
 * 三条铁律：
 * 1. 只对设备真正支持的能力下约束 —— 先读 getCapabilities()，不支持却硬下会白白报错，
 *    还会掩盖真实原因（iPhone 报 torch/zoom/focusDistance，但**没有 focusMode**）。
 * 2. 降级不静默、也不锁死：**每张都先试 takePhoto**；单次失败只回落**本次**，连续失败
 *    `STILL_FAIL_LIMIT` 次才标记「仅抓帧」，成功一次就把计数归零。达到阈值那一刻由调用方
 *    （`capture()`）用 toast 告知一次，用户还能在相机抽屉里「重新检测」当场再试。
 *    （v0.10 之前是「失败一次就永久关掉 still」，用户无从察觉画质掉了 —— 这是被修掉的缺陷。）
 * 3. 取图方式必须可见：取景页左下角小字标「真拍照 / 抓帧」，抽屉里的相机诊断区给出
 *    ImageCapture 存在性、最近一次 takePhoto 的结果与耗时、实际分辨率、连续失败计数。
 *
 * 本模块不碰 AI、不碰网络、不碰队列；只产出 Blob。
 */

/** 连续失败到这个次数才判定「仅抓帧」（可配置：单次失败只回落本次） */
export const STILL_FAIL_LIMIT = 3;

export interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
export type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

export interface VideoTrackLike {
  getCapabilities?(): object;
  getSettings?(): { width?: number; height?: number };
  applyConstraints?(constraints: unknown): Promise<void>;
}

/** 最近一次 takePhoto 的诊断（相机抽屉里如实展示） */
export interface StillDiag {
  /** idle = 还没试过；ok = 成功；fail = 失败 */
  status: 'idle' | 'ok' | 'fail';
  /** 失败原因（成功 / 未试为空串） */
  error: string;
  /** 这次 takePhoto 耗时 ms（未试为 0） */
  ms: number;
  /** 成功时拿到的字节数（失败 / 未试为 0） */
  bytes: number;
  /** 累计尝试次数（含重新检测；用来判断「到底试过几次」） */
  attempts: number;
}

export function emptyStillDiag(): StillDiag {
  return { status: 'idle', error: '', ms: 0, bytes: 0, attempts: 0 };
}

export interface CamState {
  facing: 'environment' | 'user';
  /** 本次会话是否还能走静止图像管线（连续失败到阈值才置 false，成功后恢复 true） */
  still: boolean;
  /** 连续失败计数：成功一次归零 */
  stillFailures: number;
  /** 连续失败到几次才降级（默认 STILL_FAIL_LIMIT） */
  stillFailLimit: number;
  /** 最近一次 takePhoto 的结果（诊断区读它） */
  lastStill: StillDiag;
  /** 「相机 2560×1440」 */
  res: string;
  /** 最近一张是怎么来的 */
  lastShot: '' | 'still' | 'frame';
}

/** 浏览器里就是 window.ImageCapture；没有则返回 undefined（旧 iOS 等） */
export function imageCaptureCtor(): ImageCaptureCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
}

/** ImageCapture 这个类在不在 window 上（运行时能力探测，不按 UA 判断） */
export function hasImageCapture(): boolean {
  return typeof imageCaptureCtor() === 'function';
}

export function createCamState(): CamState {
  return {
    facing: 'environment',
    still: hasImageCapture(),
    stillFailures: 0,
    stillFailLimit: STILL_FAIL_LIMIT,
    lastStill: emptyStillDiag(),
    res: '',
    lastShot: '',
  };
}

/**
 * 换流（打开相机 / 翻转镜头）时调用：这是**另一条 track**，上一轮的失败计数不该跟着它。
 * 降级状态回到「按能力探测」并清空诊断，免得一次失败被永久继承。
 */
export function resetStillForNewStream(state: CamState): void {
  state.still = hasImageCapture();
  state.stillFailures = 0;
  state.lastStill = emptyStillDiag();
  state.lastShot = '';
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

/** 取景页左下角那行小字里的取图方式标记（纯函数，单测直接断言） */
export interface ShotMark {
  kind: 'still' | 'frame';
  /** 「真拍照」/「抓帧」 */
  label: string;
  /** true = 用警示色（抓帧是画质降级，必须一眼看得出来） */
  warn: boolean;
}

/**
 * 标记说明的是「这张照片是怎么来的」：拍过就按最近一张算，还没拍过就按当前能力算。
 * 单次失败回落抓帧时，下一张成功又会回到「真拍照」——这正是用户要看得见的信息。
 * （「重新检测」成功会把 lastShot 清空，于是标记也回到「真拍照」：见 redetectStill。）
 */
export function shotMark(state: Pick<CamState, 'still' | 'lastShot'>): ShotMark {
  const frame = state.lastShot === 'frame' || (state.lastShot !== 'still' && !state.still);
  return frame ? { kind: 'frame', label: '抓帧', warn: true } : { kind: 'still', label: '真拍照', warn: false };
}

/** 相机抽屉「相机诊断」区的文案（纯函数，单测直接断言） */
export interface CamDiagParts {
  /** ImageCapture 在不在 window 上、以及是否已被验证可用 */
  imageCapture: string;
  /** 最近一次 takePhoto 的结果 */
  lastStill: string;
  /** 实际分辨率（track.getSettings()） */
  res: string;
  /** 当前取图方式 */
  mode: string;
  /** 连续失败计数 */
  failures: string;
  warn: boolean;
}

export function camDiagParts(
  state: Pick<CamState, 'res' | 'still' | 'lastShot' | 'lastStill' | 'stillFailures' | 'stillFailLimit'>,
  present: boolean,
): CamDiagParts {
  const mark = shotMark(state);
  const d = state.lastStill;
  const imageCapture = !present
    ? '不存在（浏览器未提供）'
    : d.status === 'ok'
      ? '存在 · takePhoto 可用'
      : d.status === 'fail'
        ? '存在 · takePhoto 失败'
        : '存在 · 未验证';
  const lastStill =
    d.status === 'ok'
      ? `成功 · ${d.bytes} 字节 · ${d.ms} ms`
      : d.status === 'fail'
        ? `失败：${d.error} · ${d.ms} ms`
        : '未尝试';
  return {
    imageCapture,
    lastStill,
    res: state.res || '未知（先打开相机）',
    mode: mark.label,
    failures: `${state.stillFailures}/${state.stillFailLimit}`,
    warn: mark.warn,
  };
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
  /** 这张导致了「永久降级为仅抓帧」（连续失败刚到阈值）—— 调用方据此 toast 告知**一次** */
  downgraded: boolean;
}

const nowMs = (): number => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** 记一次失败：单次只累计；到阈值才置 still=false（并回报"这一次触发降级"） */
function noteStillFailure(state: CamState, error: string, ms: number): boolean {
  state.stillFailures += 1;
  state.lastStill = { status: 'fail', error, ms, bytes: 0, attempts: state.lastStill.attempts };
  if (state.stillFailures >= state.stillFailLimit) {
    state.still = false;
    return true;
  }
  return false;
}

/** 试一次 takePhoto 并把结果写进诊断与失败计数；不抓帧、不产照片 */
async function attemptStill(
  Ctor: ImageCaptureCtor,
  track: MediaStreamTrack,
  state: CamState,
): Promise<{ blob: Blob | null; downgraded: boolean }> {
  const attempts = state.lastStill.attempts + 1;
  const t0 = nowMs();
  try {
    state.lastStill = { ...state.lastStill, attempts };
    const blob = await new Ctor(track).takePhoto();
    const ms = Math.round(nowMs() - t0);
    if (blob && blob.size > 0) {
      state.still = true;
      state.stillFailures = 0; // 成功一次就把连续失败计数归零
      state.lastStill = { status: 'ok', error: '', ms, bytes: blob.size, attempts };
      return { blob, downgraded: false };
    }
    const downgraded = noteStillFailure(state, 'takePhoto 返回空图', ms);
    return { blob: null, downgraded };
  } catch (e) {
    const ms = Math.round(nowMs() - t0);
    const reason = e instanceof Error && e.message ? e.message : String(e);
    const downgraded = noteStillFailure(state, reason || '未知原因', ms);
    return { blob: null, downgraded };
  }
}

/**
 * 快门取图。**只返回 {blob, kind, downgraded}，不碰 AI、不碰队列、不碰网络。**
 *
 * 「每张都先试 takePhoto」是硬要求：单次失败只回落本次（下一张还会试），连续失败到
 * `stillFailLimit` 次才标记「仅抓帧」不再白等一次失败。`kind` 是**这张实际用的方式**。
 */
export async function grabStill(
  env: GrabEnv,
  track: MediaStreamTrack | null | undefined,
  state: CamState,
): Promise<StillShot> {
  const Ctor = env.ImageCaptureCtor;
  if (state.still && Ctor && track) {
    const { blob, downgraded } = await attemptStill(Ctor, track, state);
    if (blob) return { blob, kind: 'still', downgraded: false };
    return { blob: await env.grabFrame(), kind: 'frame', downgraded };
  }
  // 没试（浏览器没有 ImageCapture / 没有视频轨 / 已判定仅抓帧）：诊断保留上一次结果，不写成新的失败
  return { blob: await env.grabFrame(), kind: 'frame', downgraded: false };
}

/**
 * 「重新检测」：重置降级状态并**立刻再试一次 takePhoto**（不抓帧、不产照片），把结果写进诊断。
 * 用户在 iPhone 独立模式 / 改过系统设置后可以当场自证「真拍照到底行不行」。
 *
 * 成功时把 `lastShot` 清空：上一张确实是抓帧（历史看胶卷里的 `shot` 字段），但用户刚显式要求
 * 「从现在起按新状态算」，取景页标记应当回到「真拍照」而不是一直卡在上一张的抓帧上。
 */
export async function redetectStill(
  env: Pick<GrabEnv, 'ImageCaptureCtor'>,
  track: MediaStreamTrack | null | undefined,
  state: CamState,
): Promise<StillDiag> {
  const Ctor = env.ImageCaptureCtor;
  state.stillFailures = 0; // 先重置降级状态
  if (!Ctor) {
    state.still = false;
    state.lastStill = {
      status: 'fail',
      error: '浏览器没有 ImageCapture',
      ms: 0,
      bytes: 0,
      attempts: state.lastStill.attempts,
    };
    return state.lastStill;
  }
  state.still = true;
  if (!track) {
    state.lastStill = { ...state.lastStill, status: 'fail', error: '相机未打开（没有视频轨）', ms: 0, bytes: 0 };
    return state.lastStill;
  }
  await attemptStill(Ctor, track, state);
  if (state.lastStill.status === 'ok') state.lastShot = '';
  return state.lastStill;
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
    ImageCaptureCtor: imageCaptureCtor(),
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

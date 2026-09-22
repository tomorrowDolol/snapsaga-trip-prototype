/**
 * 相机取图单测 —— 与 snapsaga_queue_check/check_capture.cjs 的断言对应：
 * ① 支持 ImageCapture → 必须走「静止图像」；② takePhoto 抛错 → 一次性回落抓帧（不再重试）；
 * ③ 没有 ImageCapture → 抓帧照常可用；④ 只对设备支持的能力下约束（不硬下 focusMode）。
 * 真机/真流路径在 e2e 里跑（web/e2e/acceptance-capture.e2e.mjs）。
 */
import { describe, expect, it, vi } from 'vitest';
import { camMetaParts, camTune, grabStill, planConstraints, type CamState, type GrabEnv, type ImageCaptureCtor } from '../domain/capture';

const state = (over: Partial<CamState> = {}): CamState => ({ facing: 'environment', still: true, res: '', lastShot: '', ...over });

describe('planConstraints：只对设备真的支持的能力下约束', () => {
  it('iPhone 的真实形状（有 zoom/torch/focusDistance，没有 focusMode）→ 只下宽高', () => {
    const caps = { width: { max: 3840 }, height: { max: 2160 }, zoom: { min: 1, max: 10 }, torch: true, focusDistance: {} };
    const want = planConstraints(caps);
    expect(want).toEqual([{ width: { ideal: 3840 }, height: { ideal: 2160 } }]);
    expect(JSON.stringify(want)).not.toContain('focusMode');
  });

  it('支持 focusMode:[continuous] / whiteBalanceMode:[continuous] 时才下发', () => {
    const caps = {
      width: { max: 3840 },
      height: { max: 2160 },
      focusMode: ['none', 'continuous'],
      whiteBalanceMode: ['continuous'],
    };
    const keys = planConstraints(caps).map((c) => Object.keys(c)[0]);
    expect(keys).toEqual(['width', 'focusMode', 'whiteBalanceMode']);
  });

  it('什么都不支持 → 一条约束都不下（不是硬下再吞错）', () => {
    expect(planConstraints({})).toEqual([]);
  });

  it('只有 width 没有 height → 也不下（半套约束没意义）', () => {
    expect(planConstraints({ width: { max: 100 } })).toEqual([]);
  });
});

describe('camTune：逐项 try，读实际分辨率', () => {
  it('下发受支持的约束，并按 getSettings 回报实际分辨率', async () => {
    const applied: string[] = [];
    const track = {
      getCapabilities: () => ({ width: { max: 3840 }, height: { max: 2160 }, zoom: { min: 1, max: 10 } }),
      getSettings: () => ({ width: 2560, height: 1440 }),
      applyConstraints: async (c: unknown) => {
        applied.push(JSON.stringify(c));
      },
    };
    const st = state();
    const out = await camTune(track, st);
    expect(out.res).toBe('相机 2560×1440');
    expect(st.res).toBe('相机 2560×1440');
    expect(applied.join(' ')).toContain('width');
    expect(applied.join(' ')).not.toContain('focusMode');
  });

  it('某项不被支持（applyConstraints 抛错）不影响其它项', async () => {
    const calls: string[] = [];
    const track = {
      getCapabilities: () => ({ width: { max: 1 }, height: { max: 1 }, focusMode: ['continuous'] }),
      getSettings: () => ({ width: 640, height: 480 }),
      applyConstraints: async (c: unknown) => {
        calls.push(JSON.stringify(c));
        if (JSON.stringify(c).includes('width')) throw new Error('不支持');
      },
    };
    const out = await camTune(track);
    expect(calls.length, '两项都尝试了').toBe(2);
    expect(out.res, '宽高失败不影响读分辨率').toBe('相机 640×480');
    expect(out.applied, '只记下真正成功的项').toContain('focusMode');
  });

  it('没有 track 时安静返回（相机还没开）', async () => {
    const out = await camTune(null);
    expect(out.res).toBe('');
    expect(out.applied).toEqual([]);
  });
});

function makeEnv(opts: { takePhoto?: () => Promise<Blob>; withCtor?: boolean; frameSize?: number }): {
  env: GrabEnv;
  constructed: () => number;
} {
  let n = 0;
  const frameSize = opts.frameSize ?? 777;
  const env: GrabEnv = {
    ImageCaptureCtor: opts.withCtor === false
      ? undefined
      : (class {
          constructor() {
            n++;
          }
          takePhoto(): Promise<Blob> {
            return opts.takePhoto ? opts.takePhoto() : Promise.resolve(new Blob([new Uint8Array(12345)], { type: 'image/jpeg' }));
          }
        } as unknown as ImageCaptureCtor),
    grabFrame: async () => new Blob([new Uint8Array(frameSize)], { type: 'image/jpeg' }),
  };
  return { env, constructed: () => n };
}

const track = {} as MediaStreamTrack;

describe('grabStill：静止图像优先 + 一次性回落抓帧', () => {
  it('支持 ImageCapture → 存下的就是 takePhoto 的字节数，kind=still', async () => {
    const { env } = makeEnv({});
    const st = state();
    const out = await grabStill(env, track, st);
    expect(out.kind).toBe('still');
    expect(out.blob.size).toBe(12345);
    expect(st.still, 'still 能力保持').toBe(true);
  });

  it('takePhoto 抛错 → 回落抓帧，并把 still 置 false（本次会话不再重试）', async () => {
    const { env, constructed } = makeEnv({
      takePhoto: () => Promise.reject(new Error('stub: 不支持该流')),
    });
    const st = state();
    const first = await grabStill(env, track, st);
    expect(first.kind).toBe('frame');
    expect(first.blob.size).toBe(777);
    expect(st.still).toBe(false);
    expect(constructed(), '只构造了一次 ImageCapture').toBe(1);

    const second = await grabStill(env, track, st);
    expect(second.kind).toBe('frame');
    expect(constructed(), '第二次不再尝试 ImageCapture（不白等一次失败）').toBe(1);
  });

  it('takePhoto 返回空 blob → 回落抓帧，但 still 保持 true（下次还会试）', async () => {
    const { env } = makeEnv({ takePhoto: () => Promise.resolve(new Blob([])) });
    const st = state();
    const out = await grabStill(env, track, st);
    expect(out.kind).toBe('frame');
    expect(st.still).toBe(true);
  });

  it('浏览器没有 ImageCapture（如旧 iOS）→ 抓帧路径照常可用，可连拍', async () => {
    const { env, constructed } = makeEnv({ withCtor: false });
    const st = state({ still: false });
    const a = await grabStill(env, track, st);
    const b = await grabStill(env, track, st);
    expect([a.kind, b.kind]).toEqual(['frame', 'frame']);
    expect(a.blob.size).toBeGreaterThan(0);
    expect(constructed()).toBe(0);
  });

  it('没有视频轨时不硬上 ImageCapture', async () => {
    const { env, constructed } = makeEnv({});
    const out = await grabStill(env, null, state());
    expect(out.kind).toBe('frame');
    expect(constructed()).toBe(0);
  });

  it('两条路都只产出 Blob（不碰 AI / 队列 / 网络）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('不该被调用')));
    const { env } = makeEnv({});
    const out = await grabStill(env, track, state());
    expect(out.blob).toBeInstanceOf(Blob);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('camMetaParts：降级不静默', () => {
  it('还没拍过：只报分辨率与能力', () => {
    expect(camMetaParts({ res: '相机 2560×1440', still: true, lastShot: '' })).toEqual({
      res: '相机 2560×1440',
      stillLabel: '支持静止图像',
      shotLabel: null,
    });
  });
  it('拍过：如实标出本次是静止图像还是抓帧', () => {
    expect(camMetaParts({ res: '相机 640×480', still: true, lastShot: 'still' })?.shotLabel).toBe('本次：静止图像');
    expect(camMetaParts({ res: '相机 640×480', still: false, lastShot: 'frame' })?.shotLabel).toBe('本次：抓帧');
    expect(camMetaParts({ res: '相机 640×480', still: false, lastShot: 'frame' })?.stillLabel).toBe('仅能抓帧');
  });
  it('没有分辨率信息就不显示信息条', () => {
    expect(camMetaParts({ res: '', still: true, lastShot: '' })).toBeNull();
  });
});

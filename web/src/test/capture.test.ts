/**
 * 相机取图单测 —— 与 snapsaga_queue_check/check_capture.cjs 的断言对应：
 * ① 支持 ImageCapture → 必须走「静止图像」；② takePhoto 抛错 → **本次**回落抓帧，下一张还会重试；
 * ③ 连续失败 STILL_FAIL_LIMIT 次才标记「仅抓帧」；④ 没有 ImageCapture → 抓帧照常可用；
 * ⑤ 只对设备支持的能力下约束（不硬下 focusMode）；⑥ 取图方式标记与诊断数据如实可读。
 * 真机/真流路径在 e2e 里跑（web/e2e/acceptance-capture.e2e.mjs）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  camDiagParts,
  camMetaParts,
  camTune,
  createCamState,
  grabStill,
  planConstraints,
  redetectStill,
  resetStillForNewStream,
  shotMark,
  STILL_FAIL_LIMIT,
  type CamState,
  type GrabEnv,
  type ImageCaptureCtor,
} from '../domain/capture';

const state = (over: Partial<CamState> = {}): CamState => ({
  facing: 'environment',
  still: true,
  stillFailures: 0,
  stillFailLimit: STILL_FAIL_LIMIT,
  lastStill: { status: 'idle', error: '', ms: 0, bytes: 0, attempts: 0 },
  res: '',
  lastShot: '',
  ...over,
});

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

/** 可切换的 takePhoto stub：前 N 次失败，之后成功（用来演示「单次失败仍可重试」） */
function makeFlakyEnv(failures: number, stillBytes = 12345, frameSize = 777): { env: GrabEnv; calls: () => number } {
  let calls = 0;
  const env: GrabEnv = {
    ImageCaptureCtor: (class {
      takePhoto(): Promise<Blob> {
        calls++;
        if (calls <= failures) return Promise.reject(new Error(`stub: 第 ${calls} 次失败`));
        return Promise.resolve(new Blob([new Uint8Array(stillBytes)], { type: 'image/jpeg' }));
      }
    } as unknown as ImageCaptureCtor),
    grabFrame: async () => new Blob([new Uint8Array(frameSize)], { type: 'image/jpeg' }),
  };
  return { env, calls: () => calls };
}

const track = {} as MediaStreamTrack;

describe('grabStill：静止图像优先 + 降到阈值的抓帧回落', () => {
  it('支持 ImageCapture → 存下的就是 takePhoto 的字节数，kind=still', async () => {
    const { env } = makeEnv({});
    const st = state();
    const out = await grabStill(env, track, st);
    expect(out.kind).toBe('still');
    expect(out.blob.size).toBe(12345);
    expect(out.downgraded, '正常成功不算降级').toBe(false);
    expect(st.still, 'still 能力保持').toBe(true);
  });

  it('takePhoto 抛错 → 本次回落抓帧，但**不永久关闭** still（下一张还会重试）', async () => {
    const { env } = makeFlakyEnv(1);
    const st = state();
    const first = await grabStill(env, track, st);
    expect(first.kind).toBe('frame');
    expect(first.blob.size).toBe(777);
    expect(st.still, '单次失败不降级').toBe(true);
    expect(st.stillFailures).toBe(1);
    expect(first.downgraded, '单次失败不报降级').toBe(false);

    const second = await grabStill(env, track, st);
    expect(second.kind, '第二张又试了一次 takePhoto，并且成功了').toBe('still');
    expect(st.stillFailures, '成功一次把连续失败计数归零').toBe(0);
    expect(st.still).toBe(true);
  });

  it('连续失败到阈值（3 次）才标记仅抓帧：第 4 张不再白等一次失败', async () => {
    const { env, calls } = makeFlakyEnv(Number.POSITIVE_INFINITY);
    const st = state();
    const shots = [await grabStill(env, track, st), await grabStill(env, track, st)];
    expect(shots.map((s) => s.kind)).toEqual(['frame', 'frame']);
    expect(st.stillFailures).toBe(2);
    expect(st.still, '还没到阈值：仍可重试').toBe(true);
    expect(shots.every((s) => !s.downgraded)).toBe(true);

    const third = await grabStill(env, track, st);
    expect(third.kind).toBe('frame');
    expect(st.still, '到阈值才降级').toBe(false);
    expect(st.stillFailures).toBe(STILL_FAIL_LIMIT);
    expect(third.downgraded, '降级只在这一张上标记一次（调用方据此 toast 一次）').toBe(true);

    expect(calls()).toBe(3);
    const fourth = await grabStill(env, track, st);
    expect(fourth.kind).toBe('frame');
    expect(fourth.downgraded).toBe(false);
    expect(calls(), '降级后不再每张白等一次失败').toBe(3);
  });

  it('阈值是可配置常量（不是写死的 3）', () => {
    expect(STILL_FAIL_LIMIT).toBe(3);
    const st = state({ stillFailLimit: 2 });
    expect(st.stillFailLimit).toBe(2);
  });

  it('takePhoto 返回空 blob → 回落抓帧，但 still 保持 true（下次还会试）', async () => {
    const { env } = makeEnv({ takePhoto: () => Promise.resolve(new Blob([])) });
    const st = state();
    const out = await grabStill(env, track, st);
    expect(out.kind).toBe('frame');
    expect(st.still).toBe(true);
    expect(st.lastStill.status).toBe('fail');
    expect(st.lastStill.error).toContain('空图');
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

describe('诊断：最近一次 takePhoto 的结果 / 耗时 / 分辨率都可读', () => {
  it('成功：记下字节数和耗时（ms），计数归零', async () => {
    const { env } = makeFlakyEnv(0);
    const st = state({ stillFailures: 2 });
    await grabStill(env, track, st);
    expect(st.lastStill.status).toBe('ok');
    expect(st.lastStill.bytes).toBe(12345);
    expect(st.lastStill.ms).toBeGreaterThanOrEqual(0);
    expect(st.lastStill.attempts).toBe(1);
    expect(st.stillFailures).toBe(0);
  });

  it('失败：记下原因与耗时，attempts 累加', async () => {
    const { env } = makeFlakyEnv(Number.POSITIVE_INFINITY);
    const st = state();
    await grabStill(env, track, st);
    await grabStill(env, track, st);
    expect(st.lastStill.status).toBe('fail');
    expect(st.lastStill.error).toContain('第 2 次失败');
    expect(st.lastStill.bytes).toBe(0);
    expect(st.lastStill.attempts).toBe(2);
  });

  it('camDiagParts：字段与文案（等宽数字那几行）', () => {
    const okDiag = camDiagParts(
      state({
        res: '相机 2560×1440',
        lastShot: 'still',
        lastStill: { status: 'ok', error: '', ms: 42, bytes: 3120000, attempts: 1 },
      }),
      true,
    );
    expect(okDiag.imageCapture).toBe('存在 · takePhoto 可用');
    expect(okDiag.lastStill).toBe('成功 · 3120000 字节 · 42 ms');
    expect(okDiag.res).toBe('相机 2560×1440');
    expect(okDiag.mode).toBe('真拍照');
    expect(okDiag.failures).toBe('0/3');
    expect(okDiag.warn).toBe(false);

    const failDiag = camDiagParts(
      state({
        still: false,
        stillFailures: 3,
        lastShot: 'frame',
        res: '相机 640×480',
        lastStill: { status: 'fail', error: 'NotSupportedError', ms: 12, bytes: 0, attempts: 3 },
      }),
      true,
    );
    expect(failDiag.imageCapture).toBe('存在 · takePhoto 失败');
    expect(failDiag.lastStill).toBe('失败：NotSupportedError · 12 ms');
    expect(failDiag.mode).toBe('抓帧');
    expect(failDiag.failures).toBe('3/3');
    expect(failDiag.warn).toBe(true);

    const noneDiag = camDiagParts(state({ res: '' }), false);
    expect(noneDiag.imageCapture).toBe('不存在（浏览器未提供）');
    expect(noneDiag.lastStill).toBe('未尝试');
    expect(noneDiag.res).toBe('未知（先打开相机）');
  });
});

describe('shotMark：取景页左下角的取图方式标记（真拍照 / 抓帧）', () => {
  it('拍过就按最近一张：静止图像 = 真拍照（金），抓帧 = 抓帧（警示）', () => {
    expect(shotMark(state({ lastShot: 'still' }))).toEqual({ kind: 'still', label: '真拍照', warn: false });
    expect(shotMark(state({ lastShot: 'frame' }))).toEqual({ kind: 'frame', label: '抓帧', warn: true });
  });

  it('单次失败回落时标记为抓帧，但能力没关（still=true）——下一张成功又会回到真拍照', () => {
    const st = state({ lastShot: 'frame', still: true, stillFailures: 1 });
    expect(shotMark(st).warn).toBe(true);
    st.lastShot = 'still';
    st.stillFailures = 0;
    expect(shotMark(st)).toEqual({ kind: 'still', label: '真拍照', warn: false });
  });

  it('还没拍过：按当前能力预告（可走静止图像 = 真拍照；已降级 / 没有 ImageCapture = 抓帧）', () => {
    expect(shotMark(state({ lastShot: '', still: true })).label).toBe('真拍照');
    expect(shotMark(state({ lastShot: '', still: false })).label).toBe('抓帧');
    expect(shotMark(state({ lastShot: '', still: false })).warn).toBe(true);
  });
});

describe('redetectStill / resetStillForNewStream：降级不许被永久锁死', () => {
  it('「重新检测」重置降级状态并当场再试一次 takePhoto（成功 → 恢复真拍照）', async () => {
    const { env, calls } = makeFlakyEnv(1); // 第 1 次失败，之后成功
    const st = state({ still: false, stillFailures: 3, lastShot: 'frame' });
    const diag = await redetectStill({ ImageCaptureCtor: env.ImageCaptureCtor }, track, st);
    expect(calls()).toBe(1);
    expect(diag.status).toBe('fail');
    expect(st.still, '重置后失败一次不直接降级（还差阈值）').toBe(true);
    expect(st.stillFailures).toBe(1);

    const again = await redetectStill({ ImageCaptureCtor: env.ImageCaptureCtor }, track, st);
    expect(again.status).toBe('ok');
    expect(again.bytes).toBe(12345);
    expect(st.still).toBe(true);
    expect(st.stillFailures).toBe(0);
    expect(st.lastShot, '重新检测成功 → 取景页标记从上一张的抓帧回到真拍照').toBe('');
    expect(shotMark(st).label).toBe('真拍照');
  });

  it('浏览器没有 ImageCapture：重新检测如实报「没有 ImageCapture」', async () => {
    const st = state({ still: true });
    const diag = await redetectStill({ ImageCaptureCtor: undefined }, track, st);
    expect(diag.status).toBe('fail');
    expect(diag.error).toContain('没有 ImageCapture');
    expect(st.still).toBe(false);
  });

  it('相机没开（没有视频轨）时不假装失败：明确报「相机未打开」', async () => {
    const { env, calls } = makeFlakyEnv(0);
    const st = state();
    const diag = await redetectStill({ ImageCaptureCtor: env.ImageCaptureCtor }, null, st);
    expect(diag.error).toContain('相机未打开');
    expect(calls()).toBe(0);
  });

  it('换流（打开相机 / 翻转镜头）重置失败计数，一次失败不被永久继承', () => {
    const st = state({ still: false, stillFailures: 3, lastShot: 'frame', res: '相机 640×480' });
    resetStillForNewStream(st);
    expect(st.stillFailures).toBe(0);
    expect(st.lastShot).toBe('');
    expect(st.lastStill.status).toBe('idle');
    expect(st.still, 'jsdom 里没有 ImageCapture → 探测为 false；有则恢复 true').toBe(false);
  });

  it('createCamState 按运行时能力探测初始化（不按 UA 判断）', () => {
    const st = createCamState();
    expect(st.stillFailLimit).toBe(STILL_FAIL_LIMIT);
    expect(st.stillFailures).toBe(0);
    expect(st.lastStill).toEqual({ status: 'idle', error: '', ms: 0, bytes: 0, attempts: 0 });
    expect(typeof st.still).toBe('boolean');
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
    expect(
      camMetaParts({ res: '相机 640×480', still: true, lastShot: 'frame' })?.stillLabel,
      '单次失败回落：能力仍报「支持静止图像」，只是本次抓帧',
    ).toBe('支持静止图像');
  });
  it('没有分辨率信息就不显示信息条', () => {
    expect(camMetaParts({ res: '', still: true, lastShot: '' })).toBeNull();
  });
});

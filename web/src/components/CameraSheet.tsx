import { useRef, useState } from 'react';
import { camDiagParts, camMetaParts } from '../domain/capture';
import { SCENES } from '../domain/scenes';
import { STYLES } from '../domain/presets';
import { aiCreds } from '../domain/settings';
import { sceneArtSvg, sceneSkinSvg } from '../domain/sceneArt';
import { useAppStore } from '../store/useAppStore';

/**
 * 取景页的**相机抽屉**：所有辅助 UI 都收在这里，取景画面里只留轻量浮层。
 *
 * 为什么是抽屉而不是常驻块：390×844 的实测里，取景画面曾被 9 层常驻 UI 压到只剩 305 px 高，
 * 390×664 时快门直接落到屏幕外（要滚动才找得到）。现在取景画面占满 dock 以上全部空间，
 * 场景相机 / 焦距 / 胶片与风格 / 黄金时刻 / 曝光补偿 / 诊断信息全在这里，默认收起。
 *
 * 交互：点 dock 的「相机」按钮打开 → 上滑把手（或标题行）下拉关闭 / 点遮罩关闭 / 再点相机按钮关闭。
 * 抽屉**只覆盖取景画面**（它挂在 #camWrap 里），所以快门行永远露在外面、任何时刻都能按。
 *
 * 硬约束（e2e / guard 守着，不许动）：`#camMeta` 必须仍在 DOM 里且文本语义不变（分辨率 + 静止图像/抓帧）。
 *
 * v0.10 新增「相机诊断」区 `#camDiag`（在 `#camMeta` 之上）：ImageCapture 是否可用、最近一次 takePhoto
 * 的结果与耗时、实际分辨率、当前取图方式与连续失败计数，外加「重新检测」——用户在 iPhone 独立模式
 * （添加到主屏）里也能当场自证「真拍照到底行不行」。
 */

/** 焦距档（设计稿 FO）：13 / 26 / 35 / 50 —— 只影响取景预览的数码缩放，不影响出片分辨率 */
export const FOCALS: Array<{ mm: number; s: string; zoom: number }> = [
  { mm: 13, s: '.5x', zoom: 0.5 },
  { mm: 26, s: '1x', zoom: 1 },
  { mm: 35, s: '1.5x', zoom: 1.35 },
  { mm: 50, s: '2x', zoom: 1.9 },
];

export type FlashMode = 'auto' | 'on' | 'off';

interface Props {
  focal: number;
  setFocal: (mm: number) => void;
  ev: number;
  cycleEv: () => void;
  flashMode: FlashMode;
  cycleFlash: () => void;
  /** 当前场景的曝光三元组（ISO · 光圈 · 快门），在抽屉里当读数展示 */
  exposure: string;
}

export function CameraSheet({ focal, setFocal, ev, cycleEv, flashMode, cycleFlash, exposure }: Props) {
  const open = useAppStore((st) => st.camSheetOpen);
  const close = useAppStore((st) => st.closeCamSheet);
  const sceneIdx = useAppStore((st) => st.sceneIdx);
  const setScene = useAppStore((st) => st.setScene);
  const genAuto = useAppStore((st) => st.genAuto);
  const genStyleKey = useAppStore((st) => st.genStyleKey);
  const toggleGenAuto = useAppStore((st) => st.toggleGenAuto);
  const setGenStyle = useAppStore((st) => st.setGenStyle);
  const sunTitle = useAppStore((st) => st.sunTitle);
  const sunDetail = useAppStore((st) => st.sunDetail);
  const openSettings = useAppStore((st) => st.openSettings);
  const levelOn = useAppStore((st) => st.levelOn);
  const toggleLevel = useAppStore((st) => st.toggleLevel);
  // 诊断信息只依赖这三个切片：不要订阅整个 store，否则每次拍照 / 队列变化都会重渲染抽屉
  const camRes = useAppStore((st) => st.camRes);
  const camStill = useAppStore((st) => st.camStill);
  const camLastShot = useAppStore((st) => st.camLastShot);
  const camStillFailures = useAppStore((st) => st.camStillFailures);
  const camStillFailLimit = useAppStore((st) => st.camStillFailLimit);
  const camDiag = useAppStore((st) => st.camDiag);
  const imageCapturePresent = useAppStore((st) => st.imageCapturePresent);
  const redetectCam = useAppStore((st) => st.redetectCam);
  const meta = camMetaParts({ res: camRes, still: camStill, lastShot: camLastShot });
  const diag = camDiagParts(
    { res: camRes, still: camStill, lastShot: camLastShot, lastStill: camDiag, stillFailures: camStillFailures, stillFailLimit: camStillFailLimit },
    imageCapturePresent,
  );
  const ai = aiCreds();
  const aiReady = !!(ai.base && ai.key);

  // ---- 下拉关闭：拖动把手/标题行，松手时按位移与速度决定关闭还是弹回 ----
  const sheetRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ y: number; t: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onDown = (e: React.PointerEvent) => {
    startRef.current = { y: e.clientY, t: Date.now() };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    setDragY(Math.max(0, e.clientY - startRef.current.y));
  };
  const onUp = (e: React.PointerEvent) => {
    const st = startRef.current;
    startRef.current = null;
    setDragging(false);
    setDragY(0);
    if (!st) return;
    const dy = Math.max(0, e.clientY - st.y);
    const h = sheetRef.current?.offsetHeight || 1;
    const v = dy / Math.max(1, Date.now() - st.t); // px/ms
    if (dy > h * 0.22 || v > 0.55) close();
  };

  const goSettings = () => {
    close();
    openSettings();
  };

  return (
    <>
      <div id="camSheetMask" className={open ? 'show' : ''} onClick={close} />
      <div
        id="camSheet"
        ref={sheetRef}
        className={open ? 'show' : ''}
        style={{ transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : undefined }}
      >
        <div className="camsheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="grab" />
          <div className="camsheet-title">
            相机控制
            <span className="mo">下拉收起</span>
          </div>
        </div>

        <div className="camsheet-body">
          {/* 场景相机（设计稿 .hs：8 台，内联 SVG 插画 + 机身造型） */}
          <div className="h2 scene-head">场景</div>
          {/* 取景器里的构图提示是单行且会自动淡出（不占构图），完整文案放在这里随时可查 */}
          <div className="scene-hint-full" id="hintFull">
            <b>{SCENES[sceneIdx].lead}</b>
            {SCENES[sceneIdx].rest}
          </div>
          <div className="hs" id="skins">
            {SCENES.map((sc, i) => (
              <button key={sc.k} className={`sk${i === sceneIdx ? ' on' : ''}`} data-i={i} onClick={() => setScene(i)}>
                <div className="bd2">
                  <div className="art" dangerouslySetInnerHTML={{ __html: sceneArtSvg(i) }} />
                  <div className="skin" dangerouslySetInnerHTML={{ __html: sceneSkinSvg(SKIN[i], ACCENT[i]) }} />
                </div>
                <div className="nm">
                  <span>{sc.n}</span>
                </div>
              </button>
            ))}
          </div>

          {/* 焦距档（设计稿 .fs） */}
          <div className="fs" id="fr2">
            {FOCALS.map((f) => (
              <button
                key={f.mm}
                className={`fb${f.mm === focal ? ' on' : ''}`}
                data-mm={f.mm}
                onClick={() => setFocal(f.mm)}
              >
                {f.mm}
                <small>{f.s}</small>
              </button>
            ))}
          </div>

          {/* 曝光补偿 / 闪光 / 定时 / 水平仪（原取景 HUD 那一排，挪进抽屉） */}
          <div className="hd" id="hudRow">
            <span className="vb" id="vtr">
              {exposure}
            </span>
            <button className="c" id="btnEv" title="曝光补偿" onClick={cycleEv}>
              曝光 {ev > 0 ? '+' + ev : ev}
            </button>
            <button className="c" id="btnFlash" title="闪光灯" onClick={cycleFlash}>
              闪光 {flashMode === 'auto' ? '自动' : flashMode === 'on' ? '开' : '关'}
            </button>
            <button className="c" id="btnTimer" title="定时" onClick={() => useAppStore.getState().showToast('3 秒定时（原型只做提示）')}>
              定时
            </button>
            <button className={`c${levelOn ? ' on' : ''}`} id="btnLevel" title="水平仪" onClick={() => void toggleLevel()}>
              水平仪
            </button>
          </div>

          {/* 拍完自动生图 + 胶片与风格 chips */}
          <div id="genBar">
            <button id="genToggle" className={genAuto && aiReady ? 'on' : ''} onClick={toggleGenAuto}>
              {!genAuto ? '拍后不生成' : aiReady ? '拍后自动生成' : '未配置 AI'}
            </button>
            <div id="genStyles" className={genAuto ? '' : 'off'}>
              {STYLES.map((st) => (
                <button
                  key={st.k}
                  className={`gen-chip${st.k === genStyleKey ? ' on' : ''}`}
                  data-k={st.k}
                  onClick={() => setGenStyle(st.k)}
                >
                  {st.n}
                </button>
              ))}
            </div>
          </div>

          {/* 黄金时刻：日出/日落/窗口/倒计时，以及「未设置地点」的引导态 */}
          <div id="sunBar">
            <div className="grow">
              <div className="t1" id="sunTitle">
                {sunTitle}
              </div>
              <div className="t2" id="sunDetail">
                {sunDetail}
              </div>
            </div>
            <button className="pl" id="sunSetup" onClick={goSettings}>
              去设置
            </button>
          </div>

          {/* 相机诊断：真机（尤其 iPhone 添加到主屏后的独立模式）自证「这次到底是不是真拍照」。
              用等宽数字；「重新检测」重置降级状态并当场再试一次 takePhoto。 */}
          <div id="camDiag">
            <div className="dghead">
              相机诊断 <span className="hint">取图方式 · 真机自证</span>
            </div>
            <div className="dgrow">
              <span className="k">ImageCapture</span>
              <span className="v mo" id="diagIC">
                {diag.imageCapture}
              </span>
            </div>
            <div className="dgrow">
              <span className="k">最近一次真拍照</span>
              <span className="v mo" id="diagLastStill">
                {diag.lastStill}
              </span>
            </div>
            <div className="dgrow">
              <span className="k">实际分辨率</span>
              <span className="v mo" id="diagRes">
                {diag.res}
              </span>
            </div>
            <div className="dgrow">
              <span className="k">取图方式</span>
              <span className={`v mo${diag.warn ? ' warn' : ' gold'}`} id="diagShotMark" data-kind={diag.warn ? 'frame' : 'still'}>
                {diag.mode}
              </span>
            </div>
            <div className="dgrow">
              <span className="k">连续失败</span>
              <span className="v mo" id="diagFail">
                {diag.failures}
              </span>
            </div>
            <button className="mini ghost" id="btnRedetect" onClick={() => void redetectCam()}>
              重新检测
            </button>
            <div className="dgnote">
              连续失败 {camStillFailLimit} 次才会标记「仅抓帧」；改过系统设置或从主屏独立模式打开后，点「重新检测」当场再试一次。
            </div>
          </div>

          {/* 诊断信息：分辨率 + 本次取景方式（静止图像 / 抓帧）。不进构图，放抽屉里。 */}
          <div id="camMeta" style={{ display: meta ? 'block' : 'none' }}>
            {meta && (
              <>
                {meta.res} · {meta.stillLabel}
                {meta.shotLabel ? (
                  <>
                    {' · '}
                    <b>{meta.shotLabel}</b>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** 场景卡上的机身造型与强调色（设计稿 SC 的 sk / ac 字段，逐值移植） */
const SKIN = [0, 1, 2, 3, 0, 1, 2, 3];
const ACCENT = ['#6FD3C7', '#7FD1E8', '#9BE38F', '#E9B44C', '#9C7BFF', '#8FD8FF', '#FFB3A7', '#FFD08A'];

import { useEffect, useState } from 'react';
import { shotMark } from '../domain/capture';
import { SCENES } from '../domain/scenes';
import { sceneArtSvg } from '../domain/sceneArt';
import type { PhotoRec, ThemeRec } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { activeTheme, useAppStore } from '../store/useAppStore';
import { CameraSheet, FOCALS, type FlashMode } from './CameraSheet';
import { gridSVG } from './gridSvg';

const GRID_CYCLE = ['thirds', 'spiral', 'off'] as const;
const GRID_LABEL: Record<string, string> = { thirds: '三分', spiral: '螺旋', off: '关' };

/** 取景页顶部主题条：主题生效（边拍边收）时才出现。压缩成一行紧凑条（名称 + 已收张数 + 结束）。 */
function ThemeBar({ theme }: { theme: ThemeRec }) {
  const endActiveTheme = useAppStore((s) => s.endActiveTheme);
  return (
    <div className="thbar" id="thbar">
      <span className="ic">✨</span>
      <span className="t1" id="thName">
        主题：{theme.name}
      </span>
      <span className="t2" id="thMeta">
        边拍边收 · 已收 {theme.sourceIds.length} 张
      </span>
      <span className="pulse" id="thPulse" />
      <button className="pl g" id="btnEndTheme" onClick={endActiveTheme}>
        结束
      </button>
    </div>
  );
}

/** 底部 dock 里的一格：刚拍的实时出现，点开看大图 */
function RecentCell({ photo }: { photo: PhotoRec }) {
  const url = useObjectUrl(photo.thumb || photo.blob);
  const openLightbox = useAppStore((s) => s.openLightbox);
  return (
    <div className="df" data-id={photo.id} onClick={() => openLightbox(photo.id)}>
      <img src={url || undefined} alt="" decoding="async" loading="lazy" />
      <span className="n3 mo">{photo.id.slice(-3)}</span>
    </div>
  );
}

/**
 * 取景（拍照）页 —— 干净、简洁的相机界面。
 *
 * 结构（自下而上）：固定底栏 dock（最近拍摄 + [相机][快门][翻转]）+ 取景画面（占满 dock 以上全部高度）。
 * 取景画面里只有轻量浮层：35mm 框 / AF 框 / 网格 / 水平仪 / 直方图 / 太阳弧 / 曝光刻度 / 单行构图提示。
 * 其余辅助 UI（场景相机、焦距、胶片与风格、黄金时刻、曝光补偿、诊断信息）全部收进 `CameraSheet` 抽屉。
 *
 * 硬约束：`#shutter` 的 id 与行为不变，任何视口、任何时刻都完整可见且不被任何元素覆盖。
 */
export function CameraView() {
  const s = useAppStore((st) => st);
  const theme = useAppStore((st) => activeTheme(st));
  const counts = useAppStore((st) => st.queueCounts);
  const scene = SCENES[s.sceneIdx];
  const levelOk = s.levelDeviation !== null && s.levelDeviation <= 2;
  const [focal, setFocal] = useState(35);
  const [ev, setEv] = useState(0);
  const [flashMode, setFlashMode] = useState<FlashMode>('auto');
  const [hintOn, setHintOn] = useState(true);
  const [hintNonce, setHintNonce] = useState(0);
  const zoom = FOCALS.find((f) => f.mm === focal)?.zoom ?? 1;
  const pending = counts.run + counts.queued;
  // 取图方式标记：这张到底走的是「真拍照」（ImageCapture.takePhoto）还是「抓帧」（画质降级的兜底）
  const mark = shotMark({ still: s.camStill, lastShot: s.camLastShot });

  // 构图提示：单行、3.5 s 后自动淡出；点一下取景画面可再显示（不再常驻大卡占构图）
  useEffect(() => {
    setHintOn(true);
    const t = setTimeout(() => setHintOn(false), 3500);
    return () => clearTimeout(t);
  }, [s.sceneIdx, hintNonce]);
  const showHint = () => setHintNonce((n) => n + 1);

  const cycleGrid = () => {
    const i = GRID_CYCLE.indexOf(s.gridMode as (typeof GRID_CYCLE)[number]);
    const next = GRID_CYCLE[(i + 1) % GRID_CYCLE.length];
    s.setGridMode(next);
    s.showToast('构图网格：' + GRID_LABEL[next]);
  };
  const cycleFlash = () => {
    const order: FlashMode[] = ['auto', 'on', 'off'];
    const next = order[(order.indexOf(flashMode) + 1) % order.length];
    setFlashMode(next);
    s.showToast(
      '闪光灯：' + (next === 'auto' ? '自动' : next === 'on' ? '开' : '关') + '（原型只做提示，真机由系统相机决定）',
      2600,
    );
  };

  return (
    <>
      {/* ============ 取景画面（占满 dock 以上全部空间） ============ */}
      <div id="camWrap" onClick={showHint}>
        <video
          id="video"
          autoPlay
          playsInline
          muted
          style={{ display: s.camReady ? 'block' : 'none', transform: `scale(${zoom})` }}
        />
        <div id="camPlaceholder" style={{ display: s.camReady ? 'none' : 'flex' }}>
          {/* 相机没起来时用场景插画当取景底（设计稿的 8 张内联 SVG，同一套画法） */}
          <div className="ph-art" dangerouslySetInnerHTML={{ __html: sceneArtSvg(s.sceneIdx) }} />
          <div className="ph-body">
            <div className="cam-mark" aria-hidden="true" />
            <p>记录此刻。照片只保存在本机。</p>
            <button id="startCam" onClick={() => void s.startCamera()}>开始拍摄</button>
          </div>
        </div>

        {/* 35mm 取景框（设计稿 .fr） */}
        <div className="fr" style={{ display: s.camReady ? 'block' : 'none' }}>
          <i style={{ left: -2, top: -2, borderRight: 0, borderBottom: 0 }} />
          <i style={{ right: -2, top: -2, borderLeft: 0, borderBottom: 0 }} />
          <i style={{ left: -2, bottom: -2, borderRight: 0, borderTop: 0 }} />
          <i style={{ right: -2, bottom: -2, borderLeft: 0, borderTop: 0 }} />
        </div>

        {/* AF 框（轻量浮层，纯提示） */}
        <div className="af" id="afBox" style={{ display: s.camReady ? 'block' : 'none' }}>
          <i />
        </div>

        {/* 场景信息（左上角一行小字） */}
        <div className="vtop">
          <span className="vb gold" id="vtl">
            {scene.n}
          </span>
        </div>

        <div
          id="gridLayer"
          style={{ display: s.camReady && s.gridMode !== 'off' ? 'block' : 'none' }}
          dangerouslySetInnerHTML={{ __html: gridSVG(s.gridMode) }}
        />

        {/* 水平仪 */}
        <div className="lv" id="lv" style={{ opacity: s.levelOn ? 1 : 0 }}>
          <div className="r2" />
          <div className="b2" id="lvb" style={{ transform: `rotate(${s.levelDeviation ?? 0}deg)` }} />
          <div className="tx" id="lvt">
            {s.levelDeviation === null ? '水平仪未开启' : levelOk ? '水平 ✓' : `水平 · ${s.levelDeviation}°`}
          </div>
        </div>

        {/* 构图提示：单行、自动淡出、点取景画面再显示 */}
        <div className="tp" id="tp" style={{ opacity: hintOn ? 1 : 0, visibility: s.camReady ? 'visible' : 'hidden' }}>
          <b>{scene.lead}</b>
          {scene.rest}
        </div>

        {/* 右上角半透明小圆钮：网格 / 水平仪 / 队列 / 设置（AppHeader 在取景页隐藏，入口不丢） */}
        <div id="camHudTop">
          <button className="hbtn" id="btnGrid" title="构图网格" onClick={cycleGrid}>
            ▦
          </button>
          <button
            className={`hbtn${s.levelOn ? ' on' : ''}`}
            id="btnLevelHud"
            title="水平仪"
            onClick={() => void s.toggleLevel()}
          >
            ≡
          </button>
          {/* 取景页隐藏了 AppHeader，所以 #btnQueue / #btnSettings 的**唯一实例**就在这里
              （非取景页时才由 AppHeader 提供，避免重复 id） */}
          {s.view === 'cam' ? (
            <button className="hbtn" id="btnQueue" title="生图队列" onClick={s.openQueue}>
              ✨
              <span id="queueBadge" className={`badge${pending > 0 ? ' show' : ''}${counts.run > 0 ? ' hot' : ''}`}>
                {pending > 9 ? '9+' : String(pending)}
              </span>
            </button>
          ) : null}
          {s.view === 'cam' ? (
            <button className="hbtn" id="btnSettings" title="设置" onClick={s.openSettings}>
              ⚙︎
            </button>
          ) : null}
        </div>

        {/* 左下角一行小字：ISO + 焦距 + **取图方式**（点开抽屉）。取图方式直接决定画质，
            必须拍照时就看得见：真拍照 = 金，抓帧 = 橙色警示。 */}
        <button id="camHudInfo" title="相机参数 · 取图方式" onClick={s.toggleCamSheet}>
          <span className="mo">{focal}mm</span>
          <span className={`mo shot${mark.warn ? ' warn' : ''}`} id="camHudInfoShot" data-kind={mark.kind}>
            {mark.label}
          </span>
          <em>▴</em>
        </button>

        <div id="levelHud" style={{ display: s.levelOn ? 'flex' : 'none' }}>
          <span id="levelDot" className={levelOk ? 'ok' : ''} />
          <span id="levelText">
            {s.levelDeviation === null ? '水平仪未开启' : levelOk ? '水平 ✓' : `倾斜 ${s.levelDeviation}°`}
          </span>
        </div>

        <div id="flash" style={{ opacity: s.flash ? 0.9 : 0 }} />

        {/* 主题生效中：取景器顶部一行紧凑条 */}
        {theme ? <ThemeBar theme={theme} /> : null}

        {/* 相机抽屉（辅助 UI 全在这里，默认收起；只盖住取景画面，不挡快门） */}
        <CameraSheet
          focal={focal}
          setFocal={setFocal}
          ev={ev}
          cycleEv={() => setEv(ev >= 2 ? -2 : ev + 1)}
          flashMode={flashMode}
          cycleFlash={cycleFlash}
          exposure={`ISO ${ISO[s.sceneIdx]} · f/1.8 · ${SHUTTER[s.sceneIdx]}`}
        />
      </div>

      {/* ============ 固定底栏（不滚动、始终可见） ============ */}
      <div id="camDock">
        <div className="dstrip" id="recent">
          {s.photos.slice(0, 6).map((p) => (
            <RecentCell key={p.id} photo={p} />
          ))}
          {s.photos.length ? (
            <div className="df add" id="recentAdd" onClick={() => s.openThemeCreate(true)} title="用这些照片建主题">
              ＋
            </div>
          ) : (
            <div className="sub strip-hint">拍下的照片会出现在这里</div>
          )}
        </div>

        <div id="shutterRow">
          <button className="side-btn" id="btnCamSheet" onClick={s.toggleCamSheet}>
            <span className="ic">⌄</span>控制
          </button>
          <button id="shutter" title="拍照" onClick={() => void s.capture()} />
          <button className="side-btn" id="btnSwitch" onClick={() => void s.switchCamera()}>
            <span className="ic">↻</span>翻转
          </button>
        </div>
      </div>
    </>
  );
}

const ISO = [400, 200, 400, 400, 800, 200, 200, 200];
const SHUTTER = ['1/125', '1/250', '1/500', '1/60', '1/15', '1/400', '1/200', '1/80'];

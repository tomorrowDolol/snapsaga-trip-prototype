import { useState } from 'react';
import { SCENES } from '../domain/scenes';
import { STYLES } from '../domain/presets';
import { aiCreds } from '../domain/settings';
import { sceneArtSvg, sceneSkinSvg } from '../domain/sceneArt';
import type { PhotoRec, ThemeRec } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { activeTheme, camMeta, useAppStore } from '../store/useAppStore';
import { gridSVG } from './gridSvg';

/** 焦距档（设计稿 FO）：13 / 26 / 35 / 50 —— 只影响取景预览的数码缩放，不影响出片分辨率 */
const FOCALS: Array<{ mm: number; s: string; zoom: number }> = [
  { mm: 13, s: '.5x', zoom: 0.5 },
  { mm: 26, s: '1x', zoom: 1 },
  { mm: 35, s: '1.5x', zoom: 1.35 },
  { mm: 50, s: '2x', zoom: 1.9 },
];

const GRID_CYCLE = ['thirds', 'spiral', 'off'] as const;
const GRID_LABEL: Record<string, string> = { thirds: '三分', spiral: '螺旋', off: '关' };

/** 取景页顶部主题条：主题生效（边拍边收）时才出现（设计稿 .thbar） */
function ThemeBar({ theme }: { theme: ThemeRec }) {
  const endActiveTheme = useAppStore((s) => s.endActiveTheme);
  return (
    <div className="thbar" id="thbar">
      <div className="ic">✨</div>
      <div className="grow">
        <div className="t1" id="thName">
          主题：{theme.name}
        </div>
        <div className="t2" id="thMeta">
          边拍边收 · 已收 {theme.sourceIds.length} 张 · 每张自动统一风格
        </div>
      </div>
      <span className="pulse" id="thPulse" />
      <button className="pl g" id="btnEndTheme" onClick={endActiveTheme}>
        结束
      </button>
    </div>
  );
}

/** 底部胶片条里的一格：刚拍的实时出现，点开看大图 */
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

export function CameraView() {  const s = useAppStore((st) => st);
  const theme = useAppStore((st) => activeTheme(st));
  const meta = camMeta(s);
  const scene = SCENES[s.sceneIdx];
  const levelOk = s.levelDeviation !== null && s.levelDeviation <= 2;
  const ai = aiCreds();
  const aiReady = !!(ai.base && ai.key);
  const [focal, setFocal] = useState(35);
  const [ev, setEv] = useState(0);
  const [flashMode, setFlashMode] = useState<'auto' | 'on' | 'off'>('auto');
  const zoom = FOCALS.find((f) => f.mm === focal)?.zoom ?? 1;

  const cycleGrid = () => {
    const i = GRID_CYCLE.indexOf(s.gridMode as (typeof GRID_CYCLE)[number]);
    const next = GRID_CYCLE[(i + 1) % GRID_CYCLE.length];
    s.setGridMode(next);
    s.showToast('构图网格：' + GRID_LABEL[next]);
  };
  const cycleFlash = () => {
    const order = ['auto', 'on', 'off'] as const;
    const next = order[(order.indexOf(flashMode) + 1) % order.length];
    setFlashMode(next);
    s.showToast(
      '闪光灯：' + (next === 'auto' ? '自动' : next === 'on' ? '开' : '关') + '（原型只做提示，真机由系统相机决定）',
      2600,
    );
  };

  return (
    <>
      {theme ? <ThemeBar theme={theme} /> : null}
      <div id="camWrap">
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
            <div className="big">📷</div>
            <p>
              构图网格、水平仪、黄金时刻提醒——出游时帮你「拍对」。
              <br />
              全部在本机运行，照片不上传。
            </p>
            <button id="startCam" onClick={() => void s.startCamera()}>
              打开相机
            </button>
          </div>
        </div>

        {/* 35mm 取景框（设计稿 .fr） */}
        <div className="fr" style={{ display: s.camReady ? 'block' : 'none' }}>
          <i style={{ left: -2, top: -2, borderRight: 0, borderBottom: 0 }} />
          <i style={{ right: -2, top: -2, borderLeft: 0, borderBottom: 0 }} />
          <i style={{ left: -2, bottom: -2, borderRight: 0, borderTop: 0 }} />
          <i style={{ right: -2, bottom: -2, borderLeft: 0, borderTop: 0 }} />
        </div>

        {/* 顶部信息条：场景 · ISO | ISO · 光圈 · 快门 */}
        <div className="vtop">
          <span className="vb gold" id="vtl">
            {scene.n} · {EN[s.sceneIdx]} {ISO[s.sceneIdx]}
          </span>
          <span className="vb" id="vtr">
            ISO {ISO[s.sceneIdx]} · f/1.8 · {SHUTTER[s.sceneIdx]}
          </span>
        </div>

        <div
          id="gridLayer"
          style={{ display: s.camReady && s.gridMode !== 'off' ? 'block' : 'none' }}
          dangerouslySetInnerHTML={{ __html: gridSVG(s.gridMode) }}
        />

        {/* 直方图（由场景派生，纯展示） */}
        <div className="hist" id="hist" style={{ display: s.camReady ? 'flex' : 'none' }}>
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ height: `${18 + Math.round(Math.abs(Math.sin(i * 0.9 + s.sceneIdx)) * 72)}%` }} />
          ))}
        </div>

        {/* 太阳轨迹（黄金时刻） */}
        <svg className="sarc" viewBox="0 0 92 46" style={{ display: s.camReady ? 'block' : 'none' }}>
          <path d="M4 42 Q46 -8 88 42" stroke="rgba(233,180,76,.45)" strokeWidth={1.2} fill="none" strokeDasharray="3 3" />
          <circle cx="66" cy="14" r="4.5" fill="#FFD98A" />
          <text x="52" y="9" fill="#E9B44C" fontSize={7} fontFamily="monospace">
            黄金时刻
          </text>
        </svg>

        {/* 水平仪 */}
        <div className="lv" id="lv" style={{ opacity: s.levelOn ? 1 : 0 }}>
          <div className="r2" />
          <div className="b2" id="lvb" style={{ transform: `rotate(${s.levelDeviation ?? 0}deg)` }} />
          <div className="tx" id="lvt">
            {s.levelDeviation === null ? '水平仪未开启' : levelOk ? '水平 ✓' : `水平 · ${s.levelDeviation}°`}
          </div>
        </div>

        <div className="tp" id="tp">
          <b>{scene.lead}</b>
          {scene.rest}
        </div>

        {/* 曝光刻度 */}
        <div className="evr" id="evr" style={{ display: s.camReady ? 'flex' : 'none' }}>
          <b />
          <b />
          <em id="evVal">{ev > 0 ? '+' + ev : ev}</em>
          <b />
          <b />
        </div>

        <div className="hd" id="hudRow">
          <button className="c r" id="btnGrid" title="构图网格" onClick={cycleGrid}>
            ▦
          </button>
          <button className={`c r${s.levelOn ? ' on' : ''}`} id="btnLevelHud" title="水平仪" onClick={() => void s.toggleLevel()}>
            ≡
          </button>
          <button className="c" id="btnEv" title="曝光补偿" onClick={() => setEv(ev >= 2 ? -2 : ev + 1)}>
            ⚡ {ev > 0 ? '+' + ev : ev}
          </button>
          <button className="c r" id="btnFlash" title="闪光灯" onClick={cycleFlash}>
            ☀
          </button>
          <button className="c r" id="btnTimer" title="定时" onClick={() => s.showToast('3 秒定时（原型只做提示）')}>
            ⏱
          </button>
        </div>

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
        <div id="levelHud" style={{ display: s.levelOn ? 'flex' : 'none' }}>
          <span id="levelDot" className={levelOk ? 'ok' : ''} />
          <span id="levelText">
            {s.levelDeviation === null ? '水平仪未开启' : levelOk ? '水平 ✓' : `倾斜 ${s.levelDeviation}°`}
          </span>
        </div>
        <div id="sunBar">
          <span className="ico">🌅</span>
          <div>
            <div className="t1" id="sunTitle">
              {s.sunTitle}
            </div>
            <div className="t2" id="sunDetail">
              {s.sunDetail}
            </div>
          </div>
        </div>
        <div id="flash" style={{ opacity: s.flash ? 0.9 : 0 }} />
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

      {/* 场景相机（设计稿 .hs：8 台，内联 SVG 插画 + 机身造型） */}
      <div className="h2 pd scene-head">
        场景相机 <span className="hint">8 台 · 横滑</span>
      </div>
      <div className="hs" id="skins">
        {SCENES.map((sc, i) => (
          <button
            key={sc.k}
            className={`sk${i === s.sceneIdx ? ' on' : ''}`}
            data-i={i}
            onClick={() => s.setScene(i)}
          >
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

      <div id="genBar">
        <button id="genToggle" className={s.genAuto && aiReady ? 'on' : ''} onClick={() => s.toggleGenAuto()}>
          {!s.genAuto ? '✨ 拍完不生图' : aiReady ? '✨ 拍完自动生图' : '✨ 未配置 AI'}
        </button>
        <div id="genStyles" className={s.genAuto ? '' : 'off'}>
          {STYLES.map((st) => (
            <button
              key={st.k}
              className={`gen-chip${st.k === s.genStyleKey ? ' on' : ''}`}
              data-k={st.k}
              onClick={() => s.setGenStyle(st.k)}
            >
              {st.n}
            </button>
          ))}
        </div>
      </div>

      {/* 底部胶片条：刚拍的实时出现在这里（设计稿 .dock #recent） */}
      <div className="dstrip" id="recent">
        {s.photos.slice(0, 6).map((p) => (
          <RecentCell key={p.id} photo={p} />
        ))}
        <div className="df add" id="recentAdd" onClick={() => s.openThemeCreate(true)} title="用这些照片建主题">
          ＋
        </div>
        {!s.photos.length ? <div className="sub strip-hint">拍下的照片会实时出现在这里</div> : null}
      </div>

      <div id="shutterRow">
        <button className="side-btn" id="btnLevel" onClick={() => void s.toggleLevel()}>
          <span className="ic">🧭</span>水平仪
        </button>
        <button id="shutter" title="拍照" onClick={() => void s.capture()} />
        <button className="side-btn" id="btnSwitch" onClick={() => void s.switchCamera()}>
          <span className="ic">🔄</span>翻转
        </button>
      </div>
    </>
  );
}

/** 场景卡上的机身造型与强调色（设计稿 SC 的 sk / ac 字段，逐值移植） */
const SKIN = [0, 1, 2, 3, 0, 1, 2, 3];const ACCENT = ['#6FD3C7', '#7FD1E8', '#9BE38F', '#E9B44C', '#9C7BFF', '#8FD8FF', '#FFB3A7', '#FFD08A'];
const ISO = [400, 200, 400, 400, 800, 200, 200, 200];
const SHUTTER = ['1/125', '1/250', '1/500', '1/60', '1/15', '1/400', '1/200', '1/80'];
/** 场景英文名（设计稿 SC 的 en 字段） */
const EN = ['Everyday', 'Lake', 'Alpine', 'Street', 'Night', 'Coast', 'Portrait', 'Feast'];

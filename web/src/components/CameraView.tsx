import { SCENES } from '../domain/scenes';
import { STYLES } from '../domain/presets';
import { aiCreds } from '../domain/settings';
import { camMeta, useAppStore } from '../store/useAppStore';
import { gridSVG } from './gridSvg';

export function CameraView() {
  const s = useAppStore((st) => st);
  const meta = camMeta(s);
  const scene = SCENES[s.sceneIdx];
  const levelOk = s.levelDeviation !== null && s.levelDeviation <= 2;
  const ai = aiCreds();
  const aiReady = !!(ai.base && ai.key);

  return (
    <>
      <div id="camWrap">
        <video id="video" autoPlay playsInline muted style={{ display: s.camReady ? 'block' : 'none' }} />
        <div id="camPlaceholder" style={{ display: s.camReady ? 'none' : 'flex' }}>
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
        <div
          id="gridLayer"
          style={{ display: s.camReady ? 'block' : 'none' }}
          dangerouslySetInnerHTML={{ __html: gridSVG(s.gridMode) }}
        />
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
      <div id="sceneBar">
        {SCENES.map((sc, i) => (
          <button
            key={sc.k}
            className={`scene-chip${i === s.sceneIdx ? ' on' : ''}`}
            data-i={i}
            onClick={() => s.setScene(i)}
          >
            {sc.n}
          </button>
        ))}
      </div>
      <div id="sceneTip">
        <b>{scene.lead}</b>
        {scene.rest}
      </div>
      <div id="genBar">
        <button
          id="genToggle"
          className={s.genAuto && aiReady ? 'on' : ''}
          onClick={() => s.toggleGenAuto()}
        >
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

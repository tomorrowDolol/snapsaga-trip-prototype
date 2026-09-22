import { useEffect, useRef, useState } from 'react';
import { FILMS } from '../domain/presets';
import { renderPolaroid } from '../domain/polaroid';
import { currentPolaPhoto, useAppStore } from '../store/useAppStore';

export function PolaroidView() {
  const s = useAppStore((st) => st);
  const photo = currentPolaPhoto(s);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const [developing, setDeveloping] = useState(true);

  // 换照片 / 换胶片 / 点「换显影」→ 重放 2.6s 显影动画（与原型一致的时长）
  useEffect(() => {
    setDeveloping(true);
    const t = setTimeout(() => setDeveloping(false), 2600);
    return () => clearTimeout(t);
  }, [photo?.id, s.polaFilm, s.polaNonce]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    if (!photo) {
      if (capRef.current) capRef.current.textContent = '先去「胶卷」选一张照片';
      return;
    }
    let alive = true;
    void renderPolaroid({ canvas: c, photo, filmKey: s.polaFilm, note: s.polaNote }).then((layout) => {
      if (!alive || !capRef.current) return;
      capRef.current.textContent = s.polaNote.trim() || ' ';
      capRef.current.style.height = layout.capHeight + 'px';
    });
    return () => {
      alive = false;
    };
  }, [photo, s.polaFilm, s.polaNote]);

  return (
    <>
      <div className="page-head">
        <h2>🤍 拍立得工坊</h2>
        <p>白框 + 颗粒 + 日期戳 + 一句手写注记，10 秒显影出片。</p>
      </div>
      <div id="polaStage">
        <div id="polaBox" className={developing ? 'polaroid-developing' : 'polaroid-developed'}>
          <div id="polaImgWrap">
            <canvas id="polaCanvas" ref={canvasRef} />
          </div>
          <div id="polaCap" ref={capRef}>
            …
          </div>
        </div>
      </div>
      <div className="pola-bar">
        <div className="row">
          <label>胶片</label>
          <div className="seg" id="filmSeg">
            {Object.entries(FILMS).map(([k, f]) => (
              <button key={k} data-f={k} className={k === s.polaFilm ? 'on' : ''} onClick={() => s.setPolaFilm(k)}>
                {f.label}
              </button>
            ))}
          </div>
          <button className="dice" id="btnNoteDice" title="换一句" onClick={() => s.rollNote()}>
            🎲
          </button>
        </div>
        <div className="row">
          <label>注记</label>
          <input
            id="polaNote"
            placeholder="写一句，或点骰子来一句"
            value={s.polaNote}
            onChange={(e) => s.setPolaNote(e.target.value)}
          />
        </div>
        <div className="pola-actions">
          <button className="btn" id="btnPolaRedo" onClick={() => s.redevelop()}>
            换显影
          </button>
          <button className="btn primary" id="btnPolaSave" onClick={() => void s.savePolaroid()}>
            保存 / 分享
          </button>
        </div>
      </div>
    </>
  );
}

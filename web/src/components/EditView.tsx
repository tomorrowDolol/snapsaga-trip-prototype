import { useEffect, useRef } from 'react';
import { STYLES, styleByKey } from '../domain/presets';
import { renderLocalFilter } from '../domain/editFilter';
import { blobToImage } from '../domain/media';
import { currentEditPhoto, useAppStore } from '../store/useAppStore';

export function EditView() {
  const s = useAppStore((st) => st);
  const photo = currentEditPhoto(s);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 本地滤镜离线即用；AI 重绘结果优先显示
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !photo) return;
    let alive = true;
    void (async () => {
      if (s.editResult) {
        const img = await blobToImage(s.editResult);
        if (!alive) return;
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')?.drawImage(img, 0, 0);
        return;
      }
      const tmp = await renderLocalFilter(photo.blob, styleByKey(s.editStyleKey), s.editStrength);
      if (!alive) return;
      c.width = tmp.width;
      c.height = tmp.height;
      c.getContext('2d')?.drawImage(tmp, 0, 0);
    })();
    return () => {
      alive = false;
    };
  }, [photo, s.editStyleKey, s.editStrength, s.editResult]);

  return (
    <>
      <div className="page-head">
        <h2>修图</h2>
        <p>选择一种风格</p>
      </div>
      <div id="editStage">
        <div className="empty" id="editEmpty" style={{ display: photo ? 'none' : 'flex' }}>
          <div className="big">＋</div>先选择一张照片
        </div>
        {photo && <canvas id="editCanvas" ref={canvasRef} />}
      </div>
      <div id="aiBusy" className={s.editBusy ? 'show' : ''}>
        <div className="filmstrip-loader">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div id="aiBusyText" style={{ fontSize: 13, color: 'var(--soft)' }}>
          处理中…
        </div>
      </div>
      <div className="edit-bar">
        <div id="styleRow">
          {STYLES.map((st) => (
            <button
              key={st.k}
              className={`style-chip${st.k === s.editStyleKey ? ' on' : ''}`}
              data-k={st.k}
              onClick={() => s.setEditStyle(st.k)}
            >
              {st.n}
            </button>
          ))}
        </div>
        <div className="slider-row">
          <label>强度</label>
          <input
            type="range"
            id="editStrength"
            min={0}
            max={100}
            value={Math.round(s.editStrength * 100)}
            onChange={(e) => s.setEditStrength(Number(e.target.value) / 100)}
          />
          <span id="strengthVal" style={{ fontSize: 12, color: 'var(--soft)', width: 34 }}>
            {Math.round(s.editStrength * 100)}%
          </span>
        </div>
        <div className="edit-actions">
          <button className="btn" id="btnEditSave" onClick={() => void s.saveEditResult()}>
            保存
          </button>
          <button className="btn teal" id="btnEditAI" onClick={() => void s.runAiRedraw()}>
            AI 重绘
          </button>
        </div>
      </div>
    </>
  );
}

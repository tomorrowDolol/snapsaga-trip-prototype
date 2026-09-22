import { useState } from 'react';
import { fmtDate, fmtTime } from '../domain/media';
import { filmCanisterSvg } from '../domain/sceneArt';
import type { PhotoRec } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useAppStore } from '../store/useAppStore';

/** 胶片库（设计稿 FI，逐值移植） */
const FILMS = [
  { k: 'business400', n: 'Business 400', iso: 400, d: '暖调 · 适合街拍与阴天，绿色还原稳', ac: '#2E7D4F' },
  { k: 'tokyo500', n: 'Tokyo 500-II', iso: 500, d: '高饱和蓝 · 夜景霓虹最出片', ac: '#1E63B0' },
  { k: 'ek80', n: 'EK 80', iso: 80, d: '低感细腻 · 日光人像，肤色干净', ac: '#E0A32E' },
  { k: 'epoch400', n: 'fimoEpoch 400', iso: 400, d: '暗调高对比 · 戏剧化，适合山野', ac: '#C9A227' },
];

function FilmCell({ photo, index }: { photo: PhotoRec; index: number }) {
  const selected = useAppStore((s) => s.selected.includes(photo.id));
  const toggleSelect = useAppStore((s) => s.toggleSelect);
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  // 列表只挂缩略图（thumb 优先，老记录还没补上时先用原图兜底）
  const url = useObjectUrl(photo.thumb || photo.blob);
  return (
    <div
      className={`film-cell fm${selected ? ' sel' : ''}`}
      data-id={photo.id}
      onClick={() => toggleSelect(photo.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (confirm('删除这张照片？')) void deletePhoto(photo.id);
      }}
    >
      <div className="no">
        <span className="mo">#{String(index + 1).padStart(2, '0')}A</span>
        <span className="mo">{fmtDate(new Date(photo.ts)).slice(1)}</span>
      </div>
      <div className="im">
        <img src={url || undefined} alt="" decoding="async" loading="lazy" />
        <span className="tg mo">
          {fmtTime(new Date(photo.ts))} · {photo.shot === 'still' ? '静止' : '抓帧'}
        </span>
        {photo.kind === 'ai' ? <span className="ai">AI</span> : null}
      </div>
      <span className="sel-mark">✓</span>
    </div>
  );
}

export function FilmView() {
  const photos = useAppStore((s) => s.photos);
  const album = useAppStore((s) => s.album);
  const selected = useAppStore((s) => s.selected);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const toPolaroid = useAppStore((s) => s.toPolaroid);
  const toEdit = useAppStore((s) => s.toEdit);
  const openThemeCreate = useAppStore((s) => s.openThemeCreate);
  const openLightbox = useAppStore((s) => s.openLightbox);
  const showToast = useAppStore((s) => s.showToast);
  const [filmKey, setFilmKey] = useFilmState();
  const [mode, setMode] = useFilmMode();
  const film = FILMS.find((f) => f.k === filmKey) ?? FILMS[0];
  const list = mode === 'ai' ? album : photos;

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1 className="h1">胶卷</h1>
          <p className="sub" id="fsub">
            36 张 · 已拍 {photos.length}
          </p>
        </div>
        <button className="pl" onClick={() => showToast('导入手机相册 / 视频（原型未接）')}>
          导入
        </button>
      </div>

      <div className="sg" id="fsg">
        <button className={mode === 'cur' ? 'on' : ''} data-m="cur" onClick={() => setMode('cur')}>
          当前胶卷
        </button>
        <button className={mode === 'ai' ? 'on' : ''} data-m="ai" onClick={() => setMode('ai')}>
          AI 归档
        </button>
      </div>

      <div className="pd film-head">
        <div className="canister" dangerouslySetInnerHTML={{ __html: filmCanisterSvg({ name: film.n, iso: film.iso, accent: film.ac }) }} />
        <div className="grow">
          <div className="t5" id="fn">
            {film.n}
          </div>
          <div className="sub sm" id="fd">
            {film.d}
          </div>
          <div className="chips">
            <span className="pl mo" id="fiso">
              ISO {film.iso}
            </span>
            <span className="pl">日光型</span>
            <span className="pl g">已启用</span>
          </div>
        </div>
      </div>

      {/* 胶片条：打孔 + 帧号 + 日期（设计稿 .stp） */}
      <div className="stp">
        <div className="rw" id={mode === 'cur' ? 'filmGrid' : 'filmAiGrid'}>
          {list.length ? (
            list.map((p, i) => <FilmCell key={p.id} photo={p} index={i} />)
          ) : (
            <div className="sub strip-empty">
              {mode === 'cur'
                ? '还没拍。回到「取景」按快门，照片会立刻出现在这里。'
                : '还没有 AI 归档。生图完成后会自动出现在这里。'}
            </div>
          )}
        </div>
      </div>

      <div className="pd row-actions">
        <button className="bt" id="btnFilmToTheme" onClick={() => openThemeCreate(true)}>
          ✨ 用这些照片建主题
        </button>
        <button className="bt g" id="btnToPola" onClick={() => (selected.length ? toPolaroid(selected[0]) : showToast('先在胶卷里点选照片'))}>
          🤍 做拍立得
        </button>
      </div>
      <div className="pd row-actions">
        <button className="btn" id="btnClearSel" onClick={clearSelection}>
          取消选择
        </button>
        <button className="btn teal" id="btnToEdit" onClick={() => (selected.length ? toEdit(selected[0]) : showToast('先在胶卷里点选照片'))}>
          🎨 去修图
        </button>
        <button className="btn" id="btnFilmAlbum" onClick={() => openLightbox(selected[0] ?? list[0]?.id ?? '')}>
          看大图
        </button>
      </div>

      <div className="pd">
        <div className="h2">胶片库</div>
        <div className="hs film-lib" id="films">
          {FILMS.map((f) => (
            <button key={f.k} className={`sk${f.k === filmKey ? ' on' : ''}`} data-f={f.k} onClick={() => setFilmKey(f.k)}>
              <div
                className="canister sm"
                dangerouslySetInnerHTML={{ __html: filmCanisterSvg({ name: f.n, iso: f.iso, accent: f.ac }) }}
              />
              <div className="nm">
                <span>{f.n}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <p className="pd sub foot-note">
        选中的照片可以送去做拍立得 / 修图，或直接建成主题（多图上限 9 张）。全部存在本机 IndexedDB。
      </p>
    </>
  );
}

/* 胶片 / 分组是纯界面状态，放组件外的小 hook 里，避免塞进全局 store */
function useFilmState() {
  return useState<string>('business400');
}
function useFilmMode() {
  return useState<'cur' | 'ai'>('cur');
}

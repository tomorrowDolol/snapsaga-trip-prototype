import { fmtTime } from '../domain/media';
import type { PhotoRec } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useAppStore } from '../store/useAppStore';

function FilmCell({ photo }: { photo: PhotoRec }) {
  const selected = useAppStore((s) => s.selected.includes(photo.id));
  const toggleSelect = useAppStore((s) => s.toggleSelect);
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  // 列表只挂缩略图（thumb 优先，老记录还没补上时先用原图兜底）
  const url = useObjectUrl(photo.thumb || photo.blob);
  return (
    <div
      className={`film-cell${selected ? ' sel' : ''}`}
      data-id={photo.id}
      onClick={() => toggleSelect(photo.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (confirm('删除这张照片？')) void deletePhoto(photo.id);
      }}
    >
      <img src={url || undefined} alt="" decoding="async" loading="lazy" />
      <span className="ts">{fmtTime(new Date(photo.ts))}</span>
      <span className="sel-mark">✓</span>
    </div>
  );
}

export function FilmView() {
  const photos = useAppStore((s) => s.photos);
  const selected = useAppStore((s) => s.selected);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const toPolaroid = useAppStore((s) => s.toPolaroid);
  const toEdit = useAppStore((s) => s.toEdit);
  const showToast = useAppStore((s) => s.showToast);

  return (
    <>
      <div className="page-head">
        <h2>🎞 胶卷</h2>
        <p>点选照片（可多选）送去拍立得或修图；长按可删除。全部存在本机。</p>
      </div>
      <div id="filmGrid">
        {photos.map((p) => (
          <FilmCell key={p.id} photo={p} />
        ))}
      </div>
      <div id="emptyFilm" className="empty" style={{ display: photos.length ? 'none' : 'flex' }}>
        <div className="big">🎞</div>还没有照片
        <br />
        去「取景」拍第一张吧
      </div>
      <div id="filmActions">
        <button className="btn" id="btnClearSel" onClick={clearSelection}>
          取消选择
        </button>
        <button
          className="btn primary"
          id="btnToPola"
          onClick={() => (selected.length ? toPolaroid(selected[0]) : showToast('先在胶卷里点选照片'))}
        >
          🤍 做拍立得
        </button>
        <button
          className="btn teal"
          id="btnToEdit"
          onClick={() => (selected.length ? toEdit(selected[0]) : showToast('先在胶卷里点选照片'))}
        >
          🎨 去修图
        </button>
      </div>
    </>
  );
}

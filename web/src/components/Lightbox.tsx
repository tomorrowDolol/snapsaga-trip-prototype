import { useObjectUrl } from '../hooks/useObjectUrl';
import { lightboxPhoto, useAppStore } from '../store/useAppStore';

export function Lightbox() {
  const s = useAppStore((st) => st);
  const photo = lightboxPhoto(s);
  const url = useObjectUrl(photo?.blob);
  return (
    <div id="lightbox" className={photo ? 'show' : ''} onClick={(e) => e.target === e.currentTarget && s.closeLightbox()}>
      <img id="lbImg" src={url || undefined} alt="" />
      <div id="lbMeta">{photo ? `${photo.styleName || 'AI 生图'} · ${new Date(photo.ts).toLocaleString()}` : ''}</div>
      <div className="lb-actions">
        <button
          className="btn"
          id="lbToPola"
          onClick={() => {
            if (!photo) return;
            const id = photo.id;
            s.closeLightbox();
            s.toPolaroid(id);
          }}
        >
          🤍 做拍立得
        </button>
        <button className="btn primary" id="lbSave" onClick={() => void s.saveAlbumPhoto()}>
          保存 / 分享
        </button>
        <button
          className="btn danger"
          id="lbDel"
          onClick={() => {
            if (!photo) return;
            const id = photo.id;
            if (confirm('删除这张 AI 生图？')) {
              s.closeLightbox();
              void s.deleteAlbumPhoto(id);
            }
          }}
        >
          删除
        </button>
      </div>
      <button id="lbClose" onClick={s.closeLightbox}>
        ✕ 关闭
      </button>
    </div>
  );
}

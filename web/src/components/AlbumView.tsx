import { fmtTime } from '../domain/media';
import type { PhotoRec } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useAppStore } from '../store/useAppStore';

function AlbumCell({ photo }: { photo: PhotoRec }) {
  const openLightbox = useAppStore((s) => s.openLightbox);
  const url = useObjectUrl(photo.thumb || photo.blob);
  return (
    <div className="film-cell" data-id={photo.id} onClick={() => openLightbox(photo.id)}>
      <img src={url || undefined} alt="" decoding="async" loading="lazy" />
      <span className="ts">
        {photo.styleName || 'AI'} {fmtTime(new Date(photo.ts))}
      </span>
      <span className="src-mark">✨</span>
    </div>
  );
}

export function AlbumView() {
  const album = useAppStore((s) => s.album);
  return (
    <>
      <div className="page-head">
        <h2>✨ AI 相册</h2>
        <p>后台生图完成的作品自动归档到这里，与原片「胶卷」分开。点开可看大图 / 保存 / 删除。</p>
      </div>
      <div id="albumGrid">
        {album.map((p) => (
          <AlbumCell key={p.id} photo={p} />
        ))}
      </div>
      <div id="emptyAlbum" className="empty" style={{ display: album.length ? 'none' : 'flex' }}>
        <div className="big">✨</div>还没有 AI 生图
        <br />
        去「取景」拍一张，生图会在后台排队
      </div>
    </>
  );
}

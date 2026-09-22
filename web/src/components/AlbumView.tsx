import { fmtTime } from '../domain/media';
import type { PhotoRec } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { albumPhotos, themeAlbumSplit, useAppStore, type AlbumGroup } from '../store/useAppStore';

function AlbumCell({ photo }: { photo: PhotoRec }) {
  const openLightbox = useAppStore((s) => s.openLightbox);
  const url = useObjectUrl(photo.thumb || photo.blob);
  return (
    <div className="film-cell" data-id={photo.id} onClick={() => openLightbox(photo.id)}>
      <img src={url || undefined} alt="" decoding="async" loading="lazy" />
      <span className="ts">
        {photo.merge ? '合成' : photo.theme ? photo.themeName || '主题' : photo.styleName || 'AI'} {fmtTime(new Date(photo.ts))}
      </span>
      {photo.theme ? <span className="theme-mark">主题</span> : <span className="src-mark">✨</span>}
    </div>
  );
}

const GROUPS: Array<{ k: AlbumGroup; label: string }> = [
  { k: 'raw', label: '原始胶卷' },
  { k: 'ai', label: 'AI 归档' },
  { k: 'theme', label: '主题作品' },
];

/** 相册：原始 / AI 归档 / 主题作品（主题作品里合成作品与同风格组分开看） */
export function AlbumView() {
  const photos = useAppStore((s) => s.photos);
  const album = useAppStore((s) => s.album);
  const group = useAppStore((s) => s.albumGroup);
  const setAlbumGroup = useAppStore((s) => s.setAlbumGroup);
  const list = albumPhotos({ photos, album, albumGroup: group });
  const split = themeAlbumSplit(album);
  const themeCount = album.filter((p) => !!p.theme).length;

  return (
    <>
      <div className="page-head">
        <h1 className="h1">相册</h1>
        <p className="sub" id="asub">
          原始 {photos.length} · AI 归档 {album.length} · 主题作品 {themeCount}
        </p>
      </div>

      <div className="sg" id="albumSeg">
        {GROUPS.map((g) => (
          <button key={g.k} className={group === g.k ? 'on' : ''} data-a={g.k} onClick={() => setAlbumGroup(g.k)}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="gc" id="albumGrid">
        {group === 'theme' ? (
          <>
            <div className="gsec" id="secMerge">
              合成作品 · {split.merges.length} 张（N 张 → 1 张）
            </div>
            {split.merges.length ? (
              split.merges.map((p) => <AlbumCell key={p.id} photo={p} />)
            ) : (
              <div className="gsec empty-sub">还没有合成作品</div>
            )}
            <div className="gsec" id="secUnify">
              同风格组 · {split.unify.length} 张（N 张 → N 张）
            </div>
            {split.unify.length ? (
              split.unify.map((p) => <AlbumCell key={p.id} photo={p} />)
            ) : (
              <div className="gsec empty-sub">还没有同风格作品</div>
            )}
          </>
        ) : list.length ? (
          list.map((p) => <AlbumCell key={p.id} photo={p} />)
        ) : (
          <div className="sub gc-empty">
            {group === 'raw' ? '还没有照片。去「取景」拍第一张。' : '还没有 AI 生图。拍一张就会在后台排队。'}
          </div>
        )}
      </div>
    </>
  );
}

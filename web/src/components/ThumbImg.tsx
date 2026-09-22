import type { PhotoRec } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';

/** 产出缩略图：优先缩略图（列表不挂 3MB 原图），老记录回落原图 */
export function ThumbImg({ photo, className }: { photo: PhotoRec; className?: string }) {
  const url = useObjectUrl(photo.thumb || photo.blob);
  return <img className={className} src={url || undefined} alt="" decoding="async" loading="lazy" />;
}

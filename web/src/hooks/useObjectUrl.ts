import { useEffect, useState } from 'react';

/**
 * blob → objectURL，卸载或换 blob 时回收。
 * 生命周期集中在这个 hook 里（原型是手工维护「当前批次 URL 数组」），
 * 避免长列表反复重渲染时 objectURL 无限增长。
 */
export function useObjectUrl(blob: Blob | null | undefined): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

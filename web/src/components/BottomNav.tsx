import { useAppStore, type View } from '../store/useAppStore';

/** 底部六个 tab（设计稿：取景 · 主题 · 胶卷 · 暗房 · 相册 · 设置）。
 *  图标是设计稿里的内联 SVG path，逐字移植；data-v 与视图 id 对应，旧验收脚本仍能按 data-v 点。 */
const TABS: Array<{ v: View | 'set'; label: string; paths: string[] }> = [
  {
    v: 'cam',
    label: '取景',
    paths: ['M3 7h18v12a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19z', 'M12 16.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M8 7l1.4-2h5.2L16 7'],
  },
  {
    v: 'theme',
    label: '主题',
    paths: ['M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z', 'M18.5 15.5l.9 2.2 2.1.8-2.1.8-.9 2.2-.9-2.2-2.1-.8 2.1-.8z'],
  },
  {
    v: 'film',
    label: '胶卷',
    paths: ['M3 5h18v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M7 5v14M17 5v14M10 9h4M10 12h4M10 15h4'],
  },
  {
    v: 'dark',
    label: '暗房',
    paths: ['M9 3h6l1 3h3v15H5V6h3z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  },
  {
    v: 'album',
    label: '相册',
    paths: ['M3 4h18v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 15l4.5-4.5 3.5 3.5 3-3L21 16', 'M8.5 10.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z'],
  },
  {
    v: 'set',
    label: '设置',
    paths: ['M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12', 'M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M10 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  },
];

export function BottomNav() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const openSettings = useAppStore((s) => s.openSettings);
  const counts = useAppStore((s) => s.queueCounts);
  const pending = counts.run + counts.queued;

  return (
    <nav className="bottom" id="tb">
      {TABS.map((t) => {
        const on = t.v === 'set' ? false : view === t.v;
        return (
          <button
            key={t.v}
            data-v={t.v}
            className={`tab${on ? ' on' : ''}`}
            onClick={() => (t.v === 'set' ? openSettings() : setView(t.v))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {t.paths.map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
            <span>{t.label}</span>
            {t.v === 'dark' ? (
              <i className={`bdg${pending ? ' show' : ''}`} id="bdg">
                {pending > 9 ? '9+' : String(pending)}
              </i>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

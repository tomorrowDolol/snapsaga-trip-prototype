import { useAppStore, type View } from '../store/useAppStore';

const TABS: Array<{ v: View; ic: string; label: string }> = [
  { v: 'cam', ic: '📷', label: '取景' },
  { v: 'film', ic: '🎞', label: '胶卷' },
  { v: 'pola', ic: '🤍', label: '拍立得' },
  { v: 'edit', ic: '🎨', label: '修图' },
  { v: 'album', ic: '✨', label: 'AI 相册' },
];

export function BottomNav() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  return (
    <nav className="bottom">
      {TABS.map((t) => (
        <button key={t.v} data-v={t.v} className={view === t.v ? 'on' : ''} onClick={() => setView(t.v)}>
          <span className="ic">{t.ic}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

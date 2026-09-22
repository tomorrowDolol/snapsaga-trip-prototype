import { useAppStore } from '../store/useAppStore';

export function Toast() {
  const toast = useAppStore((s) => s.toast);
  return (
    <div id="toast" className={toast ? 'show' : ''}>
      {toast}
    </div>
  );
}

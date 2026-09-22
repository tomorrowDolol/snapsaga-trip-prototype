import { useAppStore } from '../store/useAppStore';

export function AppHeader() {
  const counts = useAppStore((s) => s.queueCounts);
  const openQueue = useAppStore((s) => s.openQueue);
  const openSettings = useAppStore((s) => s.openSettings);
  const n = counts.run + counts.queued;
  return (
    <header className="app">
      <div>
        <div className="logo">
          拾光<em>·</em>SnapSaga
        </div>
        <div className="sub">TRIP PROTOTYPE v0.7 · REACT</div>
      </div>
      <div className="right">
        <button className="iconbtn" id="btnQueue" title="生图队列" onClick={openQueue}>
          ✨
          <span id="queueBadge" className={`badge${n > 0 ? ' show' : ''}${counts.run > 0 ? ' hot' : ''}`}>
            {n > 9 ? '9+' : String(n)}
          </span>
        </button>
        <button className="iconbtn" id="btnSettings" title="设置" onClick={openSettings}>
          ⚙︎
        </button>
      </div>
    </header>
  );
}

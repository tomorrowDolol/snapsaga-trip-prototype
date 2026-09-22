import { useAppStore } from '../store/useAppStore';

const TITLE: Record<string, string> = {
  cam: '黄金时刻',
  theme: '主题模式',
  film: '胶卷',
  dark: '暗房',
  album: '相册',
  pola: '拍立得',
  edit: '修图',
};

export function AppHeader() {
  const counts = useAppStore((s) => s.queueCounts);
  const view = useAppStore((s) => s.view);
  const openQueue = useAppStore((s) => s.openQueue);
  const openSettings = useAppStore((s) => s.openSettings);
  const n = counts.run + counts.queued;
  return (
    <header className="app">
      <div>
        <div className="logo">
          拾光<em>·</em>SnapSaga
        </div>
        <div className="sub">TRIP PROTOTYPE v0.8 · REACT</div>
      </div>
      <div className="right">
        <span className="sbTitle mo" id="sbR">
          {TITLE[view] ?? ''}
        </span>
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

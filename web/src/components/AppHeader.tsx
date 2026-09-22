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
  // 取景页要干净：AppHeader 整个隐藏（版本号仍在 DOM 里），队列/设置入口改由取景器右上角的小圆钮提供
  // —— 那两个 id 在取景页只有一份实例（在这里不渲染），非取景页才由这里提供，避免重复 id。
  const inCam = view === 'cam';
  return (
    <header className={`app${inCam ? ' cam-hidden' : ''}`}>
      <div>
        <div className="logo">
          拾光<em>·</em>SnapSaga
        </div>
        <div className="sub">TRIP PROTOTYPE v0.10 · REACT</div>
      </div>
      <div className="right">
        <span className="sbTitle mo" id="sbR">
          {TITLE[view] ?? ''}
        </span>
        {inCam ? null : (
          <>
            <button className="iconbtn" id="btnQueue" title="生图队列" onClick={openQueue}>
              ✨
              <span id="queueBadge" className={`badge${n > 0 ? ' show' : ''}${counts.run > 0 ? ' hot' : ''}`}>
                {n > 9 ? '9+' : String(n)}
              </span>
            </button>
            <button className="iconbtn" id="btnSettings" title="设置" onClick={openSettings}>
              ⚙︎
            </button>
          </>
        )}
      </div>
    </header>
  );
}

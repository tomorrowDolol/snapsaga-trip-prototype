import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installDebugBridge } from './debug/bridge';
import './styles.css';

installDebugBridge();

const host = document.getElementById('root');
if (!host) throw new Error('#root 不存在');
createRoot(host).render(<App />);

// PWA：Service Worker 需同源独立文件（所以放在 public/sw.js，而不是内联进 HTML）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 注册失败不影响使用（例如 file:// 或受限环境） */
    });
  });
}

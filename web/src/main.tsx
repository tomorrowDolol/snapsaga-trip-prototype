import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installDebugBridge } from './debug/bridge';
import './styles.css';

installDebugBridge();

const host = document.getElementById('root');
if (!host) throw new Error('#root 不存在');
createRoot(host).render(<App />);

// PWA：Service Worker 需同源独立文件（所以放在 public/sw.js，而不是内联进 HTML）。
// URL 从页面里的 <link rel=manifest> 推出来：它在 HTML 里就是相对路径（./ 或 ./dist/），
// 所以无论应用挂在 /web/、/web/dist/ 还是根路径，sw.js 都能定位到旁边那一份。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') || './manifest.webmanifest';
    const swUrl = new URL('sw.js', new URL(href, location.href)).href;
    void navigator.serviceWorker.register(swUrl).catch(() => {
      /* 注册失败不影响使用（例如 file:// 或受限环境） */
    });
  });
}

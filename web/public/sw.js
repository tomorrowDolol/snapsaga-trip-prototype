/* 拾光 SnapSaga · Service Worker
   目的：首次打开后离线也能用（K1）。策略保守：
   - 导航请求（HTML）：network-first，失败回落缓存 → 不会把旧版本 HTML 长期钉住
   - 同源静态资源（./assets/*）：stale-while-revalidate → 立即出图，后台更新
   - 其余请求（AI 生图等）一律直接放行，不缓存 */
const CACHE = 'snapsaga-web-v1';
// 预缓存清单必须都是真实存在的文件（addAll 是原子的：一个 404 就全不进缓存）。
// 两个入口都在：app.html 是 Vite 源入口产物；index.html 是 manifest start_url="." 的落点
//（manifest 在 /web/dist/ 下，iOS 添加到主屏后打开的就是 /web/dist/，所以必须有它，否则 404）。
// 带 hash 的 JS/CSS 不列在这里，首次访问时会被 stale-while-revalidate 收进缓存。
const CORE = [
  './index.html',
  './app.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（生图服务）不碰

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./app.html'))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

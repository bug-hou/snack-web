/**
 * 站点 Service Worker：只为「安装到桌面 + 离线可用外壳」服务。
 * - 静态资源：优先走缓存，后台顺带更新（stale-while-revalidate）
 * - 页面导航：网络优先，断网时回落到已缓存的外壳 index.html
 * - /api、/uploads：只走网络，绝不缓存（订单、地址、鉴权数据必须实时）
 */
const VERSION = 'aishangli-v1';
const SHELL = `${self.location.pathname.replace(/sw\.js$/, '')}index.html`;
const PRECACHE = ['./index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/uploads/') === 0;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 接口与上传资源：不缓存，避免拿到过期的订单 / 登录态
  if (isApi(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 页面导航（hash 路由，只认首屏外壳）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(SHELL, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(SHELL).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // 其余静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

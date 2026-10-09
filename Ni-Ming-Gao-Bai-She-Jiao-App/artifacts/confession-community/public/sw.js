// 改版時把 VERSION 數字加 1，舊快取會自動清掉
const VERSION = 'v2';
const STATIC_CACHE = `confessionmiit-static-${VERSION}`;
const PAGE_CACHE = `confessionmiit-pages-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('confessionmiit-') && !keep.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 只處理自己網站的 GET 請求；登入（Clerk）、API、貼文資料一律不碰、不快取
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 開頁面：一定先連線拿最新版；連不上才用上次存的
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // 打包後的程式和圖示（檔名帶雜湊，內容不會變）：有存過就直接用，加快開啟速度
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

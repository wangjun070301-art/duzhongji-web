// Offline cache for the deployed build.
//
// Flutter's generated service worker is unregistered by the build (it only
// exists to clean up old versions), so every visit re-downloads 3 MB of
// JavaScript, 7 MB of CanvasKit and 2 MB of fonts. This worker keeps those in
// Cache Storage, which turns a repeat visit into a local read and makes the
// app usable with no connection at all.
//
// Strategy:
//   shell + engine + fonts  cache-first (they change only on redeploy)
//   word data + media       stale-while-revalidate (fast, self-updating)

const VERSION = 'dzj-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './main.dart.js',
  './flutter_bootstrap.js',
  './flutter.js',
  './canvaskit/canvaskit.js',
  './canvaskit/canvaskit.wasm',
  './assets/assets/fonts/Deng.ttf',
  './assets/assets/fonts/Dengb.ttf',
  './assets/assets/fonts/roboto-regular.ttf',
  './assets/assets/fonts/roboto-medium.ttf',
  './assets/assets/fonts/roboto-bold.ttf',
  './assets/assets/fonts/georgia.ttf',
  './assets/FontManifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // addAll fails the whole install if one URL 404s, so add individually.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Word data and media change rarely and are many small files: serve the
  // cached copy immediately and refresh it in the background.
  const isData = url.pathname.includes('/data/');
  if (isData) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await network) || Response.error();
      })()
    );
    return;
  }

  // Everything else in the shell: cache first, network fallback.
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // Offline and not cached: fall back to the app shell so the UI still
        // opens rather than showing the browser's network error.
        return (await cache.match('./index.html')) || Response.error();
      }
    })()
  );
});

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

const VERSION = 'dzj-v3';

// Small files only. Everything here is re-fetched at install time, so a big
// entry means the first visit downloads that file twice: once for the app and
// once for the cache. The engine (5.2 MB) and the Chinese faces (4.3 MB) are
// deliberately absent — the fetch handler below caches them on first use
// instead, which costs nothing extra.
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './flutter_bootstrap.js',
  './flutter.js',
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
      // The first visit cannot be cached while it happens: the worker is not
      // controlling the page yet, so its fetch handler never sees the engine
      // download. Fetch the big assets here, in the background, so they are in
      // Cache Storage by the time the learner comes back. This costs one extra
      // download on visit 1 and nothing afterwards.
      warm();
    })()
  );
});

// Fetched by the worker itself, so the bytes land straight in the cache.
const WARM = [
  './main.dart.js',
  './canvaskit/chromium/canvaskit.js',
  './canvaskit/chromium/canvaskit.wasm',
  './assets/assets/fonts/Deng.ttf',
  './assets/assets/fonts/Dengb.ttf',
  './assets/assets/fonts/roboto-regular.ttf',
  './assets/assets/fonts/roboto-medium.ttf',
  './assets/assets/fonts/roboto-bold.ttf',
  './assets/assets/fonts/georgia.ttf',
  './assets/assets/fonts/georgiai.ttf',
  './assets/assets/fonts/georgiab.ttf',
  './assets/assets/fonts/ipa.ttf',
];

async function warm() {
  const cache = await caches.open(VERSION);
  for (const url of WARM) {
    try {
      if (await cache.match(url)) continue;
      const res = await fetch(url, { cache: 'reload' });
      if (res && res.status === 200) await cache.put(url, res);
    } catch (_) {
      // A missing asset must not break the install.
    }
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // The engine asks fonts.gstatic.com for Roboto on every cold start even
  // though the app ships its own. That request sits in front of the first
  // frame and, on this network, hangs until it times out. Answer it locally
  // with the bundled face instead of letting it reach the network.
  //
  // Checked before the GET/method guard: the engine's font fetch is a CORS
  // request to another origin, and returning early for it let the real
  // network request through (measured: 63 KB from gstatic on every visit).
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const local = await cache.match('./assets/assets/fonts/roboto-regular.ttf');
        return local || Response.error();
      })()
    );
    return;
  }

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Word data and media change rarely and are many small files: serve the
  // cached copy immediately and refresh it in the background.
  const isData = url.pathname.includes('/data/');
  if (isData) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(req);
        // Only an OK response may enter the cache. A 404 stored here would be
        // served forever, even after the file exists — that is what kept the
        // word pictures blank after a path bug was fixed.
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

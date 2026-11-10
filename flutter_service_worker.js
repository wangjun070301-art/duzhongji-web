// Replaced by tools/patch_service_worker.py.
//
// Flutter's generated worker unregisters itself and reloads all clients, which
// discards the offline cache. The app registers dzj-sw.js from index.html
// instead, so this file must do nothing.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

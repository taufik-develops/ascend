/* Minimal service worker.
   Its real job here is to make the app installable ("Add to Home screen" as a
   proper standalone app). It caches the shell so the UI still opens offline —
   AI features obviously still need a connection. */

const CACHE = 'ascend-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // NEVER cache API calls — always hit the network for fresh AI responses.
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;

  // Network-first so you always get the newest UI, cache as offline fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

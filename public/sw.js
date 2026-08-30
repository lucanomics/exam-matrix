/*
 * A deliberately small service worker.
 *
 * It caches the application shell and serves it when the network is gone, and
 * it does nothing else — no runtime API caching, no background sync, no
 * versioned migration dance. The learner's data never travels over the network
 * in the first place (it is in IndexedDB), so offline support here means only
 * "the app opens". A more ambitious worker would be a more ambitious source of
 * stale-asset bugs (§31).
 */

const CACHE = 'exam-matrix-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navigations: network first so a deploy is picked up, cache as the fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Hashed build assets never change under one URL: cache first.
  event.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok && (req.url.includes('/assets/') || SHELL.some((s) => req.url.endsWith(s.slice(1))))) {
        const copy = res.clone();
        void caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});

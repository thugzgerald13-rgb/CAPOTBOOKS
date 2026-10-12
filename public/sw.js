// CAPOT Books service worker — enables PWA installability (install icon in
// the Chrome address bar + "Add to Home Screen" prompt). Network-first with
// static-asset caching; Supabase/auth/API calls always go to the network.
const CACHE_NAME = 'capot-books-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache auth, Supabase, storage, or API requests — always live.
  if (
    url.hostname.includes('supabase') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/storage/')
  ) {
    return;
  }

  // Network-first: try live, cache a copy, fall back to cache when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('/'))
      )
  );
});

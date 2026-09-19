/* UKPSC Mock — service worker
   Makes the app open instantly and work offline after the first online visit.
   Bump CACHE_VERSION whenever you change index.html so phones pick up the update. */
const CACHE_VERSION = 'v4';
const CACHE = 'ukpsc-mock-' + CACHE_VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

// Third-party files the page loads. `cors` must match how index.html requests them
// (React tags use crossorigin, the others don't) or the cached copy is rejected offline.
const LIBS = [
  { url: 'https://cdn.tailwindcss.com', mode: 'no-cors' },
  { url: 'https://unpkg.com/react@18/umd/react.production.min.js', mode: 'cors' },
  { url: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', mode: 'cors' },
  { url: 'https://unpkg.com/@babel/standalone/babel.min.js', mode: 'no-cors' },
  { url: 'https://fonts.googleapis.com/css2?family=Hind:wght@400;500;600;700&display=swap', mode: 'no-cors' }
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Best effort: a failed library download must not block installation.
    await Promise.all(LIBS.map(async ({ url, mode }) => {
      try {
        const req = new Request(url, { mode });
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') await cache.put(req, res);
      } catch (e) { /* will be cached on first normal load instead */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('ukpsc-mock-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Serve from cache immediately, refresh the cache in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isPage = req.mode === 'navigate';
    const cached = await cache.match(isPage ? './index.html' : req, { ignoreSearch: isPage });

    const refresh = fetch(req).then(async (res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        await cache.put(isPage ? './index.html' : req, res.clone());
      }
      return res;
    });

    if (cached) {
      event.waitUntil(refresh.catch(() => {}));   // offline: ignore, we already have a copy
      return cached;
    }
    try {
      return await refresh;
    } catch (e) {
      // Nothing cached and no network (e.g. a font that was never fetched): fail quietly.
      return isPage ? (await cache.match('./index.html')) || Response.error() : Response.error();
    }
  })());
});

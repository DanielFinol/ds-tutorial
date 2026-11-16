// Service worker: makes the tutorial installable and usable offline.
// Bump VERSION when you change caching logic here (content updates don't need it).
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PYODIDE = 'pyodide'; // URLs are versioned, so this cache never needs bumping
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      const core = ['./', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png'].map((p) => new URL(p, SCOPE).href);
      await cache.addAll(core);
      // Pre-cache every lesson page (list generated at build time by src/pages/precache.json.ts).
      try {
        const res = await fetch(new URL('precache.json', SCOPE));
        const { pages } = await res.json();
        await cache.addAll(pages.map((p) => new URL(p, SCOPE).href));
      } catch {
        /* non-fatal: pages will be cached as they are visited */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, ASSETS, PYODIDE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match(new URL('./', SCOPE).href)) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/')) {
    event.respondWith(cacheFirst(PYODIDE, request));
  } else if (url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)) {
    if (request.mode === 'navigate') event.respondWith(networkFirst(PAGES, request));
    else if (url.pathname.includes('/_astro/')) event.respondWith(cacheFirst(ASSETS, request)); // hashed, immutable
    else event.respondWith(networkFirst(ASSETS, request));
  }
});

import type { APIRoute } from 'astro';
import { LANGS } from '../lib/i18n';
import { getLessons, slugOf } from '../lib/lessons';

// The service worker is generated at build time so that every deploy ships a
// new worker (new BUILD id), which re-caches all lesson pages.
const BUILD = Date.now().toString(36);

export const GET: APIRoute = async () => {
  const pages = ['es/'];
  for (const lang of LANGS) {
    const prefix = lang === 'en' ? '' : `${lang}/`;
    for (const l of await getLessons(lang)) pages.push(`${prefix}lessons/${slugOf(l)}/`);
  }
  const js = `// Service worker: makes the tutorial installable and usable offline.
const BUILD = ${JSON.stringify(BUILD)};
const PAGES = 'pages-' + BUILD;
const ASSETS = 'assets-' + BUILD;
const PYODIDE = 'pyodide'; // URLs are versioned, so this cache survives deploys
const SCOPE = new URL(self.registration.scope);
const PRECACHE = ${JSON.stringify(['./', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', ...pages])};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      await cache.addAll(PRECACHE.map((p) => new URL(p, SCOPE).href));
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
`;
  return new Response(js, { headers: { 'Content-Type': 'text/javascript' } });
};

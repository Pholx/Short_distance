const CACHE = 'short-distance-v2';
const GL_CACHE = 'short-distance-map';
const MAX_GL_ENTRIES = 3000;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './css/lib/leaflet.css',
  './css/lib/maplibre-gl.css',
  './js/app.js',
  './js/ui.js',
  './js/nearby.js',
  './js/map.js',
  './js/lib/leaflet.js',
  './js/lib/maplibre-gl.js',
  './js/lib/leaflet-maplibre-gl.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const url of PRECACHE) {
        try { await cache.add(url); }
        catch (err) { console.warn('Could not precache:', url, err); }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== GL_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (e.request.url.includes('overpass-api.de')
    || e.request.url.includes('kumi.systems')
    || e.request.url.includes('private.coffee')) return;

  if (e.request.url.includes('tiles.openfreemap.org')) {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      try {
        const res = await fetch(e.request);
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(GL_CACHE);
          const keys = await cache.keys();
          if (keys.length >= MAX_GL_ENTRIES) await cache.delete(keys[0]);
          cache.put(e.request, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) {
      fetch(e.request).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone())).catch(() => {});
        }
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(e.request);
      if (res && (res.ok || res.type === 'opaque')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return res;
    } catch {
      return new Response('Offline – open the app online first', { status: 503 });
    }
  })());
});
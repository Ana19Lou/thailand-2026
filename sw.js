const CACHE_NAME = 'tailandia-2026-v6';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=6',
  './app.js?v=6',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Nunca fazer cache do Google Sheets nem de APIs ao vivo
  if (
    req.url.includes('docs.google.com') ||
    req.url.includes('googleusercontent.com') ||
    req.url.includes('overpass') ||
    req.url.includes('open-meteo.com') ||
    req.url.includes('frankfurter.dev')
  ) {
    event.respondWith(fetch(req));
    return;
  }

  const urlPath = new URL(req.url).pathname;
  const isAppFile = req.mode === 'navigate' || 
                    urlPath.endsWith('.js') || 
                    urlPath.endsWith('.css') || 
                    urlPath.endsWith('.json') ||
                    urlPath.endsWith('.html');

  // Network-First para todos os ficheiros de código da app
  if (isAppFile) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // Cache-First para o mapa e fontes/ícones
  const isMapTile = req.url.includes('openstreetmap.org') || req.url.includes('cartocdn.com');
  if (isMapTile) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
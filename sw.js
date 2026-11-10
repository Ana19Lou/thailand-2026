const CACHE_NAME = 'tailandia-2026-v5';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
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

  // 1. Nunca fazer cache no Service Worker de APIs dinâmicas / Google Sheets
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

  // 2. Network-First para os ficheiros da app (HTML, JS, CSS, Manifest)
  // Garante que qualquer alteração que faças no GitHub entra logo em vigor
  const isAppFile = req.mode === 'navigate' || 
                    req.url.endsWith('.js') || 
                    req.url.endsWith('.css') || 
                    req.url.endsWith('.json') ||
                    req.url.endsWith('.html');

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

  // 3. Cache-First para os blocos do mapa (funcionar offline)
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

  // 4. Cache-First para ícones e fontes externas
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
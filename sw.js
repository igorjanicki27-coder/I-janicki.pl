/* ══════════════════════════════════════════════════════════════════
   i-JANICKI — sw.js  (Service Worker)
   Cache-first for static assets; network-first for HTML and API
   ══════════════════════════════════════════════════════════════════ */

'use strict';

const CACHE_NAME    = 'ijanecki-v3';
const CACHE_FOREVER = 'ijanecki-static-v3';   // fonts, icons — very long-lived

// Assets to pre-cache on install
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './favicon.svg',
  './icons/icon.png',
  './icons/strzelca.png',
  './icons/get-dmg.png',
  './icons/sredzka-korona.png',
  './dokumenty/regulamin.html',
  './dokumenty/polityka-prywatnosci.html',
  './dokumenty/polityka-rodo.html',
  './dokumenty/polityka-wspolpracy.html',
];

// ── Install: pre-cache shell ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_FOREVER)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: strategy by request type ──────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin API calls (Firestore, web3forms, GA)
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // HTML pages → network-first (always fresh content)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (CSS, JS, images, fonts) → cache-first
  event.respondWith(cacheFirst(request));
});

// ── Strategies ────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — zasób niedostępny.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response(offlinePage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function offlinePage() {
  return `<!DOCTYPE html>
<html lang="pl" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>i-JANICKI — offline</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0b0e13;color:#e6e8ff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
    h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#9aa0c3;font-size:.9rem}
    a{color:#40c9ff}
  </style>
</head>
<body>
  <div>
    <h1>📡 Brak połączenia</h1>
    <p>Nie możesz teraz przeglądać strony offline.</p>
    <p>Spróbuj ponownie, gdy będziesz mieć dostęp do internetu.</p>
    <p><a href="/">Odśwież</a></p>
  </div>
</body>
</html>`;
}

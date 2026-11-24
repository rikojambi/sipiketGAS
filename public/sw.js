/* SIPIKET service worker — cache shell versi sipiket-v1 */
const CACHE_VERSION = 'sipiket-v1';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isPassthrough(request) {
  const url = new URL(request.url);
  return url.hostname.endsWith('script.google.com') || url.hostname.endsWith('script.googleusercontent.com');
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true }) || await cache.match('/index.html');
    if (cached) return cached;
    return (await cache.match('/offline.html')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (isPassthrough(request)) return; // JSONP ke Apps Script: jangan pernah di-cache.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'PREFETCH_STUDENTS') {
    event.waitUntil(
      caches.open(CACHE_VERSION).then((cache) => cache.put(
        new Request('/__prefetch__/students', { method: 'GET' }),
        new Response(JSON.stringify({ students: Array.isArray(data.students) ? data.students : [], savedAt: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        })
      ))
    );
    return;
  }
  if (data.type === 'CHECK_VERSION' && event.source) {
    event.source.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
  }
});

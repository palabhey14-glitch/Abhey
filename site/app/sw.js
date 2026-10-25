// Service worker: lets the app install to the home screen and open
// instantly. Only the app's own files are cached; client data always comes
// fresh from Supabase and is never stored here.
const CACHE = 'rewired-app-v3';
const SHELL = [
  './',
  'index.html',
  'app.css',
  '../styles.css',
  'config.js',
  'vendor/supabase-2.117.2.js',
  'js/stats.js',
  'js/app.js',
  'manifest.webmanifest',
  '../assets/fonts/montserrat-latin.woff2',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for the app's own files (so updates show up straight away),
// falling back to the cache when offline. Everything else is left alone.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});

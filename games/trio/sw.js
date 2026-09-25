// Offline support: every file is cached on install and served cache-first.
// VERSION and FILES are rewritten by scripts/build-sw.mjs; run it before deploying.
const VERSION = '0f2d48f8b7f7';
const FILES = [
  './',
  './app.css',
  './app.js',
  './core/base.css',
  './core/fx.js',
  './core/golf.js',
  './core/hallows.js',
  './core/hub.js',
  './core/icons.js',
  './core/jewels.js',
  './core/pwa.js',
  './core/results.js',
  './core/rng.js',
  './core/settings.js',
  './core/sound.js',
  './core/storage.js',
  './core/ui.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './icons/maskable-512.png',
  './index.html',
  './js/levels.js',
  './js/render.js',
  './js/rules.js',
  './js/sfx.js',
  './js/solver.js',
  './js/themes.js',
  './manifest.webmanifest'
];

const PREFIX = `freegames:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});

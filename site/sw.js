// Offline support for the hub page only. Each game has its own service
// worker for its own folder, so requests outside FILES are left alone.
// VERSION and FILES are rewritten by scripts/build-sw.mjs.
const VERSION = '7cc99c1ab24d';
const FILES = [
  './',
  './arcade.js',
  './backgammon.svg',
  './blocks.svg',
  './codebreaker.svg',
  './corridors.svg',
  './fleet.svg',
  './four.svg',
  './gems.svg',
  './hallows.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './icons/maskable-512.png',
  './index.html',
  './logic.svg',
  './manifest.webmanifest',
  './pour.svg',
  './pulse.svg',
  './reversi.svg',
  './slide.svg',
  './solitaire.svg',
  './trio.svg',
  './words.svg'
];

const PREFIX = `freegames-hub:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const urls = () => new Set(FILES.map((f) => new URL(f, self.registration.scope).href));

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
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  if (request.method !== 'GET' || !urls().has(url.href)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => (await cache.match(request, { ignoreSearch: true })) || fetch(request)),
  );
});

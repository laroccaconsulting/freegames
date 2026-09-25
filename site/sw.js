// Offline support for the hub page only. Each game has its own service
// worker for its own folder, so requests outside FILES are left alone.
// VERSION and FILES are rewritten by scripts/build-sw.mjs.
const VERSION = 'ec455acb7cf4';
const FILES = [
  './',
  './achievements.js',
  './arcade.js',
  './backgammon.svg',
  './blocks.svg',
  './boxes.svg',
  './bricks.svg',
  './checkers.svg',
  './clusters.svg',
  './codebreaker.svg',
  './corridors.svg',
  './dice.svg',
  './drift.svg',
  './flap.svg',
  './fleet.svg',
  './flood.svg',
  './four.svg',
  './gems.svg',
  './hallows.js',
  './hearts.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './icons/maskable-512.png',
  './index.html',
  './logic.svg',
  './mahjong.svg',
  './mancala.svg',
  './manifest.webmanifest',
  './mines.svg',
  './morris.svg',
  './nonograms.svg',
  './peaks.svg',
  './pipes.svg',
  './pour.svg',
  './pulse.svg',
  './rally.svg',
  './reversi.svg',
  './slide.svg',
  './snake.svg',
  './solitaire.svg',
  './spades.svg',
  './sudoku.svg',
  './trio.svg',
  './trophies.js',
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

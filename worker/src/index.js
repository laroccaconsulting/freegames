// Corridors online server: a tiny Worker in front of one Durable Object per game.
//   POST /api/rooms            → { id, players }   make a room ({ players: 2 | 4 })
//   GET  /api/rooms/:id/ws     → WebSocket to that room
//   anything else              → the static game (when deployed with assets)
export { CorridorsRoom } from './room.js';

const ROOM_ID = /^[A-Za-z0-9_-]{10}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function newRoomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ALPHABET[b & 63]).join('');
}

// CORS headers for this request, or null if its origin isn't allowed.
// ALLOWED_ORIGINS is "*" or a comma-separated list; this Worker's own
// origin is always allowed.
function cors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const self = new URL(request.url).origin;
  if (origin && !allowed.includes('*') && !allowed.includes(origin) && origin !== self) return null;
  return {
    'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin || self,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

const room = (env, id) => env.CORRIDORS_ROOM.get(env.CORRIDORS_ROOM.idFromName(id));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    const headers = cors(request, env);
    if (!headers) return json({ error: 'origin not allowed' }, 403, {});
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      let players = 2;
      try {
        if ((await request.json())?.players === 4) players = 4;
      } catch {
        /* default to two players */
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const id = newRoomId();
        if (await room(env, id).create(players)) return json({ id, players }, 201, headers);
      }
      return json({ error: 'could not make a room' }, 503, headers);
    }

    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (match && request.method === 'GET') {
      if (!ROOM_ID.test(match[1])) return json({ error: 'bad room id' }, 400, headers);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected a WebSocket' }, 426, headers);
      return room(env, match[1]).fetch(request);
    }

    return json({ error: 'not found' }, 404, headers);
  },
};

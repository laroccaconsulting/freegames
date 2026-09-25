# Corridors online server

Optional. Corridors plays fully offline against the computer or pass-and-play
without this. Online play adds one tiny Cloudflare Worker with a Durable
Object per game, all within Cloudflare's **free** plan.

```
Browser (static game)                      Cloudflare
┌──────────────────────┐   WebSocket   ┌──────────┐    ┌──────────────────────┐
│ UI ─ engine.js       │ ────────────▶ │ Worker   │ ─▶ │ CorridorsRoom (DO)   │
│ bot in a Web Worker  │               │ /api/... │    │ one per game link    │
└──────────────────────┘               └──────────┘    │ engine.js + SQLite   │
                                                        └──────────────────────┘
```

- The room is the authority. It checks every move with the same
  `games/corridors/js/engine.js` the browser uses, saves it, and broadcasts it.
- Computer opponents always run in the browser. They never cost server time.
- Games survive refreshes and everyone leaving. Finished games are deleted
  after 3 days, and abandoned ones after 14.

## Files

| File | What |
|---|---|
| `src/index.js` | Routes `POST /api/rooms` and `GET /api/rooms/:id/ws`; everything else is the static game |
| `src/room.js` | The Durable Object: Hibernation WebSockets, one SQLite row, cleanup alarms |
| `src/room-core.js` | Room rules (seats, turns, rematch) with no Cloudflare APIs; tested in `tests/corridors-room.test.js` |
| `wrangler.jsonc` | Config: SQLite-backed DO class, assets from `../games/corridors` |

## Develop

```sh
cd worker
npm install
npx wrangler dev          # http://localhost:8787 serves the game + API
```

The copy of the game that the Worker serves has `ONLINE_SERVER = ''`, so
turn online play on for that browser (DevTools console):

```js
localStorage['corridors:server'] = '"/"'
```

Test with two browser windows plus a private one for a third seat: make a
room, share the link, play to a win, refresh mid-game (you keep your seat),
close every window and come back (the game is still there), and open the link
a third time to watch.

## Deploy

```sh
cd worker
npx wrangler login
npx wrangler deploy       # prints https://corridors.<you>.workers.dev
```

Then point the game at it in `games/corridors/js/config.js`:

```js
export const ONLINE_SERVER = 'https://corridors.<you>.workers.dev';
```

Commit that line, then run `node scripts/build-sw.mjs`. The GitHub Pages
copy now shows **Play online**. The Worker also serves the game itself at its
own URL. To stop other sites from using your server, set `ALLOWED_ORIGINS`
in `wrangler.jsonc` to your sites, e.g.
`"https://laroccaconsulting.github.io"` (the Worker's own origin is always allowed).

After deploying, check the dashboard: the account should be on the Workers
**Free** plan, and **Durable Objects** should list `CorridorsRoom` as SQLite-backed.
Look at the DO metrics after a few test games.

## Protocol

JSON over the WebSocket.

```
client → server
  { type: 'join', token, name }       token: random id the browser keeps in localStorage
  { type: 'move', move, moveNo }      moveNo: the move number the client saw; stale → rejected + snapshot
  { type: 'rematch' }                 after a win; the player after the winner starts
  { type: 'sync' }                    ask for a fresh snapshot (e.g. hash mismatch)

server → client
  { type: 'snapshot', state, seats, you, hash }     on join; you = seat index, -1 = watching
  { type: 'moved', move, by, moveNo, hash }         after each accepted move
  { type: 'presence', seats }                       seats: [{ name, online } | null]
  { type: 'error', code, message }
```

Seats go to the first 2 (or 4) tokens that join; the game starts when every
seat is taken. Joining again with the same token reclaims the seat. Tokens
are never sent to other players. Messages over 2 KB and malformed JSON are
ignored.

## Free-plan budget

Daily free limits: 100k Worker requests, 100k DO requests, 13,000 GB-s of
DO duration, 100k SQLite rows written, 5M rows read, 5 GB stored. Going over
means errors until 00:00 UTC, never a bill. The game then shows a friendly
"online play is resting" message, and offline play is unaffected.

A two-player game costs about one room-creation request, a few WebSocket
connections, ~60–100 messages (billed 20:1 as requests) and one row write
per move, so roughly 1,000+ games a day fit.

- [x] Hibernation API only (`ctx.acceptWebSocket`); no timers keep the DO awake
- [x] One row write per move; presence is never written; seats only when they change
- [x] Cleanup alarm rewritten at most about once a week per game, not per move
- [x] Bots run client-side only
- [x] Alarms delete finished (3 days) and abandoned (14 days) games
- [x] Friendly message when the server errors or is unreachable

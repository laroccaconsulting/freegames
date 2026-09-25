// Snake: the rules, one tick at a time. Pure (no DOM), deterministic for a
// seed, so the tests can play whole games.
//
// State: { w, h, body: [cells, head first], dir, queue, food, alive, score, grow, mode, seed, rng }
// mode: 'classic' (walls kill), 'wrap' (walls wrap round), 'zen' (never
// die: biting yourself just cuts the tail off).

import { mulberry32 } from '../core/rng.js';

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function newGame({ w = 17, h = 17, mode = 'classic', seed = 1 } = {}) {
  const y = Math.floor(h / 2);
  const x = Math.floor(w / 4);
  const s = { w, h, mode, body: [y * w + x + 2, y * w + x + 1, y * w + x], dir: 'right', queue: [], food: -1, alive: true, score: 0, grow: 0, eaten: 0, seed, n: 0 };
  s.food = placeFood(s);
  return s;
}

function placeFood(s) {
  const random = mulberry32(s.seed + s.eaten * 7919);
  const taken = new Set(s.body);
  const free = [];
  for (let i = 0; i < s.w * s.h; i++) if (!taken.has(i)) free.push(i);
  return free.length ? free[Math.floor(random() * free.length)] : -1;
}

// Queue a turn (at most two ahead, so fast double-taps work). Reversing is ignored.
export function turn(s, dir) {
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (dir === last || dir === OPPOSITE[last] || s.queue.length >= 2) return s;
  return { ...s, queue: [...s.queue, dir] };
}

// One step. Returns the new state and what happened: 'move' | 'eat' | 'die' | 'cut'.
export function step(s) {
  if (!s.alive) return { state: s, event: 'dead' };
  const dir = s.queue.length ? s.queue[0] : s.dir;
  const [dx, dy] = DIRS[dir];
  const head = s.body[0];
  let x = (head % s.w) + dx;
  let y = Math.floor(head / s.w) + dy;
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) {
    if (s.mode === 'classic') return { state: { ...s, alive: false, dir, queue: s.queue.slice(1) }, event: 'die' };
    x = (x + s.w) % s.w;
    y = (y + s.h) % s.h;
  }
  const next = y * s.w + x;
  const eats = next === s.food;
  const grow = s.grow + (eats ? 3 : 0);
  // The tail moves away this tick unless growing, so moving into it is fine.
  const keepTail = grow > 0;
  let body = [next, ...(keepTail ? s.body : s.body.slice(0, -1))];
  let event = eats ? 'eat' : 'move';
  const hit = body.indexOf(next, 1);
  if (hit > 0) {
    if (s.mode !== 'zen') return { state: { ...s, alive: false, dir, queue: s.queue.slice(1) }, event: 'die' };
    body = body.slice(0, hit);
    event = 'cut';
  }
  const state = { ...s, body, dir, queue: s.queue.slice(1), grow: Math.max(0, grow - 1), n: s.n + 1 };
  if (eats) {
    state.eaten = s.eaten + 1;
    state.score = s.score + 1;
    state.food = placeFood(state);
  }
  return { state, event };
}

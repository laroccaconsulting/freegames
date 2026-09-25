// Unblock: slide the blocks until the key block can leave through the gap in
// the frame. Pure functions (no DOM), shared by the game, the worker and the
// tests.
//
// A puzzle is plain data:
//   { size: 6, exit: 2, blocks: [{ h, len, lane, pos }, ...] }
// blocks[0] is the key block: horizontal, in the exit row. A horizontal block
// lives in row `lane` and covers columns pos .. pos+len-1; a vertical block
// lives in column `lane` and covers rows pos .. pos+len-1 (row 0 at the top).
// One move slides one block any distance along its lane.
//
// Levels are made on the device: scatter blocks at random, explore every
// position reachable from there, then start the player from the position
// farthest from any solution. Par is that distance, so it is exact.

import { mulberry32 } from '../core/rng.js';

export const SIZE = 6;
export const EXIT = 2;

export const positions = (p) => p.blocks.map((b) => b.pos);
export const withPositions = (p, pos) => ({ ...p, blocks: p.blocks.map((b, i) => ({ ...b, pos: pos[i] })) });
export const isSolved = (p) => p.blocks[0].pos + p.blocks[0].len === p.size;

// Cells covered by block b at position pos.
export function cellsOf(b, pos = b.pos) {
  const out = [];
  for (let k = 0; k < b.len; k++) out.push(b.h ? [b.lane, pos + k] : [pos + k, b.lane]);
  return out;
}

function grid(p, pos) {
  const g = new Int8Array(p.size * p.size).fill(-1);
  p.blocks.forEach((b, i) => {
    for (let k = 0; k < b.len; k++) {
      const x = pos[i] + k;
      g[b.h ? b.lane * p.size + x : x * p.size + b.lane] = i;
    }
  });
  return g;
}

// How far block i can slide: [lowest pos, highest pos].
export function range(p, i, pos = positions(p)) {
  const g = grid(p, pos);
  const b = p.blocks[i];
  const free = (x) => x >= 0 && x < p.size && g[b.h ? b.lane * p.size + x : x * p.size + b.lane] === -1;
  let lo = pos[i];
  while (free(lo - 1)) lo--;
  let hi = pos[i];
  while (free(hi + b.len)) hi++;
  return [lo, hi];
}

export function isLegalMove(p, { b, to }) {
  if (!Number.isInteger(b) || b < 0 || b >= p.blocks.length || !Number.isInteger(to)) return false;
  const [lo, hi] = range(p, b);
  return to >= lo && to <= hi && to !== p.blocks[b].pos;
}

export function applyMove(p, move) {
  if (!isLegalMove(p, move)) throw new Error('illegal move');
  const pos = positions(p);
  pos[move.b] = move.to;
  return withPositions(p, pos);
}

// ---------- Search ----------

// Positions pack into one number: 3 bits per block (pos 0..5), so up to 17 blocks.
const encode = (pos) => {
  let k = 0;
  for (let i = pos.length - 1; i >= 0; i--) k = k * 8 + pos[i];
  return k;
};
const decode = (k, n, out) => {
  for (let i = 0; i < n; i++) {
    out[i] = k % 8;
    k = Math.floor(k / 8);
  }
  return out;
};

const scratch = new Int8Array(64);

function neighbours(p, pos, visit) {
  const n = p.size;
  const g = scratch;
  g.fill(-1, 0, n * n);
  const blocks = p.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    for (let k = 0; k < b.len; k++) g[b.h ? b.lane * n + pos[i] + k : (pos[i] + k) * n + b.lane] = i;
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const step = b.h ? 1 : n;
    const base = b.h ? b.lane * n : b.lane;
    const start = pos[i];
    for (let x = start - 1; x >= 0 && g[base + x * step] === -1; x--) {
      pos[i] = x;
      visit(encode(pos), i, x);
    }
    for (let x = start + b.len; x < n && g[base + x * step] === -1; x++) {
      pos[i] = x - b.len + 1;
      visit(encode(pos), i, pos[i]);
    }
    pos[i] = start;
  }
}

// Every position reachable from p (moves are reversible, so this is p's
// whole component). Returns null if there are more than `limit`.
export function explore(p, limit = 60000) {
  const n = p.blocks.length;
  const keys = [encode(positions(p))];
  const index = new Map([[keys[0], 0]]);
  const pos = new Array(n);
  for (let head = 0; head < keys.length; head++) {
    decode(keys[head], n, pos);
    neighbours(p, pos, (k) => {
      if (!index.has(k)) {
        index.set(k, keys.length);
        keys.push(k);
      }
    });
    if (keys.length > limit) return null;
  }
  return { keys, index };
}

// Fewest moves from every position in the component to a solution
// (-1 where there is none). Breadth-first from all solved positions at once.
function distances(p, comp) {
  const n = p.blocks.length;
  const { keys, index } = comp;
  const dist = new Int16Array(keys.length).fill(-1);
  const queue = [];
  const key0 = p.blocks[0];
  keys.forEach((k, i) => {
    if ((k % 8) + key0.len === p.size) {
      dist[i] = 0;
      queue.push(i);
    }
  });
  const pos = new Array(n);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    decode(keys[i], n, pos);
    neighbours(p, pos, (k) => {
      const j = index.get(k);
      if (dist[j] === -1) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    });
  }
  return dist;
}

// Shortest solution from p: a list of moves, or null if there is none.
export function solve(p, limit = 200000) {
  const n = p.blocks.length;
  const start = encode(positions(p));
  const prev = new Map([[start, null]]);
  const queue = [start];
  const pos = new Array(n);
  const keyLen = p.blocks[0].len;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    if ((k % 8) + keyLen === p.size) {
      const moves = [];
      for (let at = k; prev.get(at); at = prev.get(at).from) moves.unshift(prev.get(at).move);
      return moves;
    }
    decode(k, n, pos);
    neighbours(p, pos, (next, b, to) => {
      if (!prev.has(next)) {
        prev.set(next, { from: k, move: { b, to } });
        queue.push(next);
      }
    });
    if (queue.length > limit) return null;
  }
  return null;
}

// ---------- Making puzzles ----------

const fitsIn = (taken, b, n) => cellsOf(b).every(([r, c]) => r < n && c < n && !taken[r * n + c]);

function occupancy(p) {
  const taken = new Int8Array(p.size * p.size);
  for (const b of p.blocks) for (const [r, c] of cellsOf(b)) taken[r * p.size + c] = 1;
  return taken;
}

// A random block that fits in the gaps of p, or null. No horizontal blocks in
// the exit row: they could never get out of the key block's way.
function randomBlock(p, random) {
  const taken = occupancy(p);
  for (let tries = 0; tries < 60; tries++) {
    const len = random() < 0.28 ? 3 : 2;
    const b = { h: random() < 0.45, len, lane: Math.floor(random() * p.size), pos: Math.floor(random() * (p.size - len + 1)) };
    if (b.h && b.lane === p.exit) continue;
    if (fitsIn(taken, b, p.size)) return b;
  }
  return null;
}

function scatter(random) {
  let p = { size: SIZE, exit: EXIT, blocks: [{ h: true, len: 2, lane: EXIT, pos: Math.floor(random() * 3) }] };
  const count = 9 + Math.floor(random() * 5);
  for (let i = 0; i < count; i++) {
    const b = randomBlock(p, random);
    if (b) p = { ...p, blocks: [...p.blocks, b] };
  }
  return p;
}

// Remove, add or move one block.
function mutate(p, random) {
  const blocks = p.blocks.slice();
  const r = random();
  if ((r < 0.35 && blocks.length > 6) || blocks.length > 14) blocks.splice(1 + Math.floor(random() * (blocks.length - 1)), 1);
  else if (r < 0.65) {
    const b = randomBlock(p, random);
    if (b) blocks.push(b);
  } else {
    blocks.splice(1 + Math.floor(random() * (blocks.length - 1)), 1);
    const b = randomBlock({ ...p, blocks }, random);
    if (b) blocks.push(b);
  }
  return { ...p, blocks };
}

// Explore a layout's component: its hardest distance and every position's distance.
function measure(layout) {
  const comp = explore(layout, 12000);
  if (!comp) return null;
  const dist = distances(layout, comp);
  let max = -1;
  for (let i = 0; i < dist.length; i++) if (dist[i] > max) max = dist[i];
  return max > 0 ? { layout, comp, dist, max } : null;
}

// Start the player `par` moves from a solution (a random such position).
function startAt(m, par, random) {
  const picks = [];
  for (let i = 0; i < m.dist.length; i++) if (m.dist[i] === par) picks.push(i);
  const n = m.layout.blocks.length;
  const pos = decode(m.comp.keys[picks[Math.floor(random() * picks.length)]], n, new Array(n));
  return { puzzle: tidy(withPositions(m.layout, pos), par), par };
}

// Drop blocks that never need to move: if the par is the same without a
// block, it is only clutter. Keeps at least 8 blocks so boards look full.
function tidy(p, par) {
  let cur = p;
  for (let i = cur.blocks.length - 1; i >= 1 && cur.blocks.length > 8; i--) {
    const trial = { ...cur, blocks: cur.blocks.filter((_, j) => j !== i) };
    if (solve(trial)?.length === par) cur = trial;
  }
  return cur;
}

// The target par for a level: gentle at first, up to 22 moves.
export function levelTarget(level) {
  return Math.min(22, 3 + Math.floor(level * 0.6));
}

// A puzzle from a seed with par exactly `target` (or the hardest reached).
// Each round starts from the best of a few random layouts and climbs: change
// one block at a time, keeping changes that don't make the hardest position
// easier. A round that stops improving gives way to a fresh one.
// Deterministic: the same seed and target always give the same board.
export function generate(seed, target, { rounds = 8 } = {}) {
  const random = mulberry32(seed);
  let best = null;
  for (let round = 0; round < rounds && !(best?.max >= target); round++) {
    let cur = null;
    for (let t = 0; t < 6 && !(cur?.max >= target); t++) {
      const m = measure(scatter(random));
      if (m && (!cur || m.max > cur.max)) cur = m;
    }
    for (let t = 0, stale = 0; cur && cur.max < target && t < 80 && stale < 30; t++) {
      const m = measure(mutate(cur.layout, random));
      stale = m && m.max > cur.max ? 0 : stale + 1;
      if (m && m.max >= cur.max) cur = m;
    }
    if (cur && (!best || cur.max > best.max)) best = cur;
  }
  if (!best) return null;
  return startAt(best, Math.min(target, best.max), random);
}

export const levelSeed = (level) => 0x51de0000 + level * 7919;

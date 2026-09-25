// Pipes: every tile is a piece of pipe; rotate tiles until the whole board
// is one connected network with no open ends. Pure (no DOM).
//
// A tile's connections are a 4-bit mask: 1 up, 2 right, 4 down, 8 left.
// A puzzle is { w, h, wrap, solution: [mask], start: [rotation 0..3], source }.
// The board shows solution[i] rotated by start[i]; the player turns tiles
// back. Made as a random spanning tree (so there's exactly one network),
// then scrambled.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = { small: { w: 5, h: 5 }, medium: { w: 7, h: 7 }, large: { w: 9, h: 11 }, huge: { w: 11, h: 15 } };
export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;
const DIRS = [
  [UP, -1, 0, DOWN],
  [RIGHT, 0, 1, LEFT],
  [DOWN, 1, 0, UP],
  [LEFT, 0, -1, RIGHT],
];

// Rotate a mask clockwise k quarter turns.
export function rotate(mask, k) {
  let m = mask;
  for (let t = 0; t < ((k % 4) + 4) % 4; t++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}

// The neighbour of i in a direction (or -1), wrapping round the edges if asked.
export function step(p, i, d) {
  const [, dr, dc] = DIRS.find((x) => x[0] === d);
  let r = Math.floor(i / p.w) + dr;
  let c = (i % p.w) + dc;
  if (p.wrap) {
    r = (r + p.h) % p.h;
    c = (c + p.w) % p.w;
  } else if (r < 0 || c < 0 || r >= p.h || c >= p.w) return -1;
  return r * p.w + c;
}

export function generate(seed, size = 'medium', { wrap = false } = {}) {
  const { w, h } = SIZES[size];
  const random = mulberry32(seed);
  const p = { w, h, wrap };
  const n = w * h;
  const mask = new Array(n).fill(0);
  // Randomized Prim's: grow a tree from the middle; avoid too many straight
  // four-way crossings by never giving a tile more than three pipes.
  const source = Math.floor(h / 2) * w + Math.floor(w / 2);
  const inTree = new Array(n).fill(false);
  inTree[source] = true;
  const frontier = [];
  const addEdges = (i) => {
    for (const [d] of DIRS) {
      const j = step(p, i, d);
      if (j >= 0 && !inTree[j]) frontier.push([i, d, j]);
    }
  };
  addEdges(source);
  let count = 1;
  while (count < n && frontier.length) {
    const k = Math.floor(random() * frontier.length);
    const [i, d, j] = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    if (inTree[j]) continue;
    const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
    if (bits(mask[i]) >= 3 && random() < 0.85) {
      frontier.push([i, d, j]); // try later, maybe from another side
      if (frontier.length > 4 * n) break;
      continue;
    }
    mask[i] |= d;
    mask[j] |= DIRS.find((x) => x[0] === d)[3];
    inTree[j] = true;
    count++;
    addEdges(j);
  }
  if (count < n) return generate(seed + 1, size, { wrap });
  // Scramble: every tile turned at random (straights and crosses can't show it).
  const start = mask.map(() => Math.floor(random() * 4));
  return { ...p, solution: mask, start, source };
}

export const shown = (p, rot) => p.solution.map((m, i) => rotate(m, rot[i]));

// Which tiles are connected to the source through matching pipes.
export function flow(p, rot) {
  const tiles = shown(p, rot);
  const on = new Array(tiles.length).fill(false);
  const stack = [p.source];
  on[p.source] = true;
  while (stack.length) {
    const i = stack.pop();
    for (const [d, , , back] of DIRS) {
      if (!(tiles[i] & d)) continue;
      const j = step(p, i, d);
      if (j < 0 || on[j] || !(tiles[j] & back)) continue;
      on[j] = true;
      stack.push(j);
    }
  }
  return on;
}

// Solved when every tile is reached and no pipe end points at nothing.
export function isSolved(p, rot) {
  const tiles = shown(p, rot);
  if (!flow(p, rot).every(Boolean)) return false;
  for (let i = 0; i < tiles.length; i++) {
    for (const [d, , , back] of DIRS) {
      if (!(tiles[i] & d)) continue;
      const j = step(p, i, d);
      if (j < 0 || !(tiles[j] & back)) return false;
    }
  }
  return true;
}

// Clockwise taps each tile still needs to look like the answer (a straight
// or a cross looks right in more than one position).
export function turnsLeft(p, rot) {
  return p.solution.map((m, i) => {
    for (let t = 0; t < 4; t++) if (rotate(m, rot[i] + t) === m) return t;
    return 0;
  });
}

// Par: the fewest taps to solve from the start, turning either way.
export const par = (p) => turnsLeft(p, p.start).reduce((a, t) => a + Math.min(t, 4 - t), 0);

// Board generation. Layouts are symmetric stacks built from a seed; tile
// types are then dealt along a random clearing order so every board can be
// won, and the solver sets par (the lowest tray peak it can find).
import { mulberry32, shuffle } from '../core/rng.js';
import { hashSeed } from '../core/golf.js';
import { coverMap, freeTiles, TRAY } from './rules.js';
import { solve } from './solver.js';

export const LAUNCH_DAY = '2026-09-24';

// Board size, layers, picture count and how tangled the deal is, by level.
const STEPS = [
  // [first level, cols, rows, layers, icons, tangle]
  [1, 4, 3, 1, 4, 1],
  [3, 5, 4, 2, 5, 2],
  [6, 5, 5, 3, 6, 2],
  [10, 6, 5, 3, 7, 3],
  [15, 6, 6, 3, 8, 3],
  [21, 7, 6, 4, 9, 3],
  [29, 7, 7, 4, 10, 4],
  [39, 7, 8, 5, 11, 4],
  [51, 7, 8, 5, 12, 5],
];
export function levelSpec(level) {
  const [, cols, rows, layers, icons, tangle] = STEPS.filter((s) => s[0] <= level).at(-1);
  return { cols, rows, layers, icons, tangle };
}
export const DAILY_SPEC = { cols: 7, rows: 7, layers: 4, icons: 10, tangle: 4 };
export const levelSeed = (level) => hashSeed(`trio:level:${level}`);

// A left–right symmetric pyramid. Each layer is inset by half a tile and
// rests on at least two tiles of the layer below (or squarely on one).
export function layout(random, { cols, rows, layers }) {
  const tiles = [];
  const occupied = new Set();
  const key = (x, y, z) => `${x},${y},${z}`;
  const supported = (x, y, z) =>
    z === 0 ||
    occupied.has(key(x, y, z - 1)) ||
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].filter(([dx, dy]) => occupied.has(key(x + dx, y + dy, z - 1))).length >= 2;
  for (let z = 0; z < layers; z++) {
    const c = cols - z;
    const r = rows - z;
    if (c < 1 || r < 1) break;
    const keep = z === 0 ? 0.88 : 0.9;
    const placed = [];
    for (let row = 0; row < r; row++) {
      for (let col = 0; col < Math.ceil(c / 2); col++) {
        if (random() > keep) continue;
        const y = row * 2 + z;
        const x = col * 2 + z;
        const mirror = (c - 1 - col) * 2 + z;
        if (!supported(x, y, z) || !supported(mirror, y, z)) continue;
        for (const px of new Set([x, mirror])) placed.push({ x: px, y, z });
      }
    }
    for (const t of placed) {
      tiles.push(t);
      occupied.add(key(t.x, t.y, z));
    }
  }
  return tiles;
}

// Deals tile types along a random clearing order. `tangle` is how many
// triples may be half-collected at once in that order.
export function dealTypes(random, tiles, covers, icons, tangle) {
  const n = tiles.length;
  const removed = new Uint8Array(n);
  const order = [];
  for (let k = 0; k < n; k++) {
    const free = freeTiles(covers, removed);
    const i = free[Math.floor(random() * free.length)];
    removed[i] = 1;
    order.push(i);
  }
  const types = new Array(n);
  const open = []; // [{ type, need }]
  const palette = shuffle([...Array(icons).keys()], random);
  let next = 0;
  let triplesLeft = n / 3;
  for (let k = 0; k < n; k++) {
    const remaining = n - k;
    const needed = open.reduce((s, g) => s + g.need, 0);
    const canOpen = triplesLeft > 0 && open.length < tangle && remaining - needed >= 3;
    let group;
    if (open.length === 0 || (canOpen && random() < 0.45)) {
      // Start a triple with a picture that isn't already half-collected.
      let type = palette[next++ % palette.length];
      for (let tries = 0; open.some((g) => g.type === type) && tries < icons; tries++) type = palette[next++ % palette.length];
      group = { type, need: 3 };
      open.push(group);
      triplesLeft--;
    } else group = open[Math.floor(random() * open.length)];
    types[order[k]] = group.type;
    if (--group.need === 0) open.splice(open.indexOf(group), 1);
  }
  return types;
}

export function generate(seed, spec) {
  for (let attempt = 0; ; attempt++) {
    const random = mulberry32(attempt ? hashSeed(`${seed}:${attempt}`) : seed);
    let tiles = layout(random, spec);
    // Trim loose top tiles until the count divides into triples.
    while (tiles.length % 3) {
      const top = Math.max(...tiles.map((t) => t.z));
      const candidates = tiles.filter((t) => t.z === top);
      tiles.splice(tiles.indexOf(candidates[Math.floor(random() * candidates.length)]), 1);
    }
    if (tiles.length < 9) continue;
    tiles.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    const covers = coverMap(tiles);
    const types = dealTypes(random, tiles, covers, spec.icons, spec.tangle);
    tiles = tiles.map((t, i) => ({ ...t, type: types[i] }));
    const result = solve(tiles, covers, { capacity: TRAY });
    if (result.order) return { tiles, par: result.peak, proven: result.proven, solution: result.order, seed };
  }
}

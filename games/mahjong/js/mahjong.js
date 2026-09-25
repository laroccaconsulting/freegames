// Mahjong solitaire: the rules and winnable deals. Pure (no DOM).
//
// Positions are { x, y, z } in half-tile units (a tile is 2 × 2), so tiles
// can sit half a tile apart. A tile is free when nothing lies on top of it
// and its left or right side is open. Matching free pairs are removed.
//
// Deals are built backwards: from the full layout, repeatedly take two
// positions that would be free and give them a matching pair. Played
// forwards, that order clears the board, so every deal can be won.

import { mulberry32, shuffle } from '../core/rng.js';

const rows = (z, spec) => spec.flatMap(([row, from, to]) => Array.from({ length: to - from + 1 }, (_, k) => ({ x: (from + k) * 2, y: row * 2, z })));

export const LAYOUTS = {
  turtle: {
    name: 'Turtle',
    positions: [
      ...rows(0, [[0, 1, 12], [1, 3, 10], [2, 2, 11], [3, 1, 12], [4, 1, 12], [5, 2, 11], [6, 3, 10], [7, 1, 12]]),
      { x: 0, y: 7, z: 0 },
      { x: 26, y: 7, z: 0 },
      { x: 28, y: 7, z: 0 },
      ...rows(1, [[1, 4, 9], [2, 4, 9], [3, 4, 9], [4, 4, 9], [5, 4, 9], [6, 4, 9]]),
      ...rows(2, [[2, 5, 8], [3, 5, 8], [4, 5, 8], [5, 5, 8]]),
      ...rows(3, [[3, 6, 7], [4, 6, 7]]),
      { x: 13, y: 7, z: 4 },
    ],
  },
  pyramid: {
    name: 'Pyramid',
    positions: [...rows(0, [[0, 0, 7], [1, 0, 7], [2, 0, 7], [3, 0, 7], [4, 0, 7], [5, 0, 7]]), ...rows(1, [[1, 1, 6], [2, 1, 6], [3, 1, 6], [4, 1, 6]]), ...rows(2, [[2, 2, 5], [3, 2, 5]]), { x: 6, y: 5, z: 3 }, { x: 8, y: 5, z: 3 }],
  },
  quick: {
    name: 'Quick',
    positions: [...rows(0, [[0, 0, 5], [1, 0, 5], [2, 0, 5], [3, 0, 5]]), ...rows(1, [[1, 1, 4], [2, 1, 4]]), { x: 4, y: 3, z: 2 }, { x: 6, y: 3, z: 2 }],
  },
};

// The 144 faces: three suits of 1–9, four winds, three dragons (four of
// each), plus four flowers and four seasons that match within their group.
export const KINDS = [
  ...['d', 'b', 'c'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${s}${n}`)),
  'wE', 'wS', 'wW', 'wN', 'rR', 'rG', 'rW',
];
export const matchKey = (face) => (face[0] === 'f' ? 'f' : face[0] === 's' ? 's' : face);
export const matches = (a, b) => matchKey(a) === matchKey(b);

const overlaps = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

// Neighbour lists, worked out once per layout.
export function geometry(positions) {
  return positions.map((p) => ({
    above: positions.map((q, j) => (q.z === p.z + 1 && overlaps(p, q) ? j : -1)).filter((j) => j >= 0),
    left: positions.map((q, j) => (q.z === p.z && q.x === p.x - 2 && Math.abs(q.y - p.y) < 2 ? j : -1)).filter((j) => j >= 0),
    right: positions.map((q, j) => (q.z === p.z && q.x === p.x + 2 && Math.abs(q.y - p.y) < 2 ? j : -1)).filter((j) => j >= 0),
  }));
}

export function isFree(geo, present, i) {
  const g = geo[i];
  if (g.above.some((j) => present[j])) return false;
  return !g.left.some((j) => present[j]) || !g.right.some((j) => present[j]);
}

// Pairs of faces for n tiles, drawn from the full set.
function facePairs(n, random) {
  const pairs = [];
  for (const k of KINDS) pairs.push([k, k], [k, k]);
  pairs.push(['f1', 'f2'], ['f3', 'f4'], ['s1', 's2'], ['s3', 's4']);
  return shuffle(pairs, random).slice(0, n / 2);
}

// Assigns faces to the positions marked in `present` by removing free pairs
// backwards. Returns faces (null where not present), or null on a dead end.
function fill(positions, geo, present, pairs, random) {
  const left = present.slice();
  const faces = new Array(positions.length).fill(null);
  let k = 0;
  while (left.some(Boolean)) {
    const free = left.map((on, i) => (on && isFree(geo, left, i) ? i : -1)).filter((i) => i >= 0);
    if (free.length < 2) return null;
    // Prefer taking tiles from the top, so stacks don't hide both halves of a pair.
    const pick = shuffle(free, random).sort((a, b) => positions[b].z - positions[a].z);
    const a = pick[0];
    const rest = pick.slice(1);
    const b = rest[Math.floor(random() * Math.min(rest.length, 4))];
    faces[a] = pairs[k][0];
    faces[b] = pairs[k][1];
    left[a] = false;
    left[b] = false;
    k++;
  }
  return faces;
}

export function deal(layoutId, seed) {
  const { positions } = LAYOUTS[layoutId];
  const geo = geometry(positions);
  const random = mulberry32(seed);
  for (let t = 0; t < 500; t++) {
    const faces = fill(positions, geo, positions.map(() => true), facePairs(positions.length, random), random);
    if (faces) return faces;
  }
  throw new Error('no deal');
}

// Reshuffles the tiles still on the board into another winnable arrangement.
export function reshuffle(layoutId, faces, present, seed) {
  const { positions } = LAYOUTS[layoutId];
  const geo = geometry(positions);
  const random = mulberry32(seed);
  // Keep the same faces: group what's left into matching pairs.
  const groups = new Map();
  faces.forEach((f, i) => {
    if (!present[i]) return;
    const key = matchKey(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });
  const pairs = [];
  for (const list of groups.values()) for (let k = 0; k + 1 < list.length; k += 2) pairs.push([list[k], list[k + 1]]);
  for (let t = 0; t < 500; t++) {
    const filled = fill(positions, geo, present, shuffle(pairs.slice(), random), random);
    if (filled) return filled.map((f, i) => (present[i] ? f : faces[i]));
  }
  return null;
}

// Free matching pairs on the board: [[i, j], ...].
export function moves(geo, faces, present) {
  const free = present.map((on, i) => (on && isFree(geo, present, i) ? i : -1)).filter((i) => i >= 0);
  const out = [];
  for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) if (matches(faces[free[a]], faces[free[b]])) out.push([free[a], free[b]]);
  return out;
}

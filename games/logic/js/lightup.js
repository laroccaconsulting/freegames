// Light Up: put bulbs in white squares so every white square is lit. A bulb
// lights its row and column until a black square stops it; no bulb may
// light another; a numbered black square has exactly that many bulbs on its
// four sides. Pure (no DOM).
//
// A puzzle is { n, cells: [-2 white | -1 black | 0..4 numbered black], solution: [bool] }.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = { small: { n: 7 }, medium: { n: 9 }, large: { n: 11 } };
export const WHITE = -2;
export const BLACK = -1;
const isWhite = (v) => v === WHITE;

// The white squares a bulb at i would light (not including i).
export function sight(n, cells, i) {
  const out = [];
  const r = Math.floor(i / n);
  const c = i % n;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && cc >= 0 && rr < n && cc < n && isWhite(cells[rr * n + cc])) {
      out.push(rr * n + cc);
      rr += dr;
      cc += dc;
    }
  }
  return out;
}

const sides = (n, i) => {
  const r = Math.floor(i / n);
  const c = i % n;
  return [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1].filter((j) => j >= 0);
};

// Count solutions up to `max` with a lit-cell search: pick the unlit square
// with the fewest places a bulb could light it from, and try each (making
// earlier choices "no bulb" so branches never repeat a solution).
export function solve(p, { max = 2, limit = 200000 } = {}) {
  const { n, cells } = p;
  const N = n * n;
  const seen = Array.from({ length: N }, (_, i) => (isWhite(cells[i]) ? sight(n, cells, i) : []));
  const state = new Int8Array(N); // 0 open, 1 bulb, -1 no bulb
  const lit = new Int16Array(N); // how many bulbs light this square
  const numbers = [];
  for (let i = 0; i < N; i++) if (cells[i] >= 0) numbers.push(i);
  for (let i = 0; i < N; i++) if (!isWhite(cells[i])) state[i] = -1;
  const solutions = [];
  let nodes = 0;

  const numbersOk = (final) => {
    for (const k of numbers) {
      let bulbs = 0;
      let open = 0;
      for (const j of sides(n, k)) {
        if (state[j] === 1) bulbs++;
        else if (state[j] === 0 && !lit[j]) open++;
      }
      if (bulbs > cells[k] || bulbs + (final ? 0 : open) < cells[k]) return false;
    }
    return true;
  };
  const place = (i, d) => {
    state[i] = d ? 1 : 0;
    lit[i] += d ? 1 : -1;
    for (const j of seen[i]) lit[j] += d ? 1 : -1;
  };
  function go() {
    if (++nodes > limit) return true;
    if (!numbersOk(false)) return false;
    // The unlit square with the fewest candidate bulb spots.
    let best = -1;
    let bestC = null;
    for (let i = 0; i < N; i++) {
      if (!isWhite(cells[i]) || lit[i]) continue;
      const cand = [i, ...seen[i]].filter((j) => state[j] === 0 && !lit[j]);
      if (!cand.length) return false;
      if (!bestC || cand.length < bestC.length) {
        best = i;
        bestC = cand;
        if (cand.length === 1) break;
      }
    }
    if (best < 0) {
      if (numbersOk(true)) solutions.push(Array.from(state, (v) => v === 1));
      return solutions.length >= max;
    }
    const blocked = [];
    for (const j of bestC) {
      place(j, true);
      if (go()) return true;
      place(j, false);
      state[j] = -1; // later branches: no bulb here
      blocked.push(j);
    }
    for (const j of blocked) state[j] = 0;
    return false;
  }
  go();
  return { count: nodes > limit ? -1 : solutions.length, solutions };
}

export function generate(seed, size = 'medium') {
  const { n } = SIZES[size];
  const random = mulberry32(seed);
  for (let t = 0; t < 200; t++) {
    // Black squares with a half-turn symmetry, like printed puzzles.
    const cells = new Array(n * n).fill(WHITE);
    for (let i = 0; i < Math.ceil((n * n) / 2); i++) if (random() < 0.19) cells[i] = cells[n * n - 1 - i] = BLACK;
    // Light everything with bulbs dropped on random unlit squares.
    const bulbs = new Array(n * n).fill(false);
    const lit = new Array(n * n).fill(false);
    for (const i of shuffle([...Array(n * n).keys()], random)) {
      if (!isWhite(cells[i]) || lit[i]) continue;
      bulbs[i] = true;
      lit[i] = true;
      for (const j of sight(n, cells, i)) lit[j] = true;
    }
    // Number every black square, then take numbers away while it stays unique.
    for (let i = 0; i < n * n; i++) if (cells[i] === BLACK) cells[i] = sides(n, i).filter((j) => bulbs[j]).length;
    let p = { n, cells, solution: bulbs };
    if (solve(p).count !== 1) continue;
    for (const i of shuffle([...Array(n * n).keys()], random)) {
      if (cells[i] < 0) continue;
      const trial = p.cells.slice();
      trial[i] = BLACK;
      if (solve({ ...p, cells: trial }, { limit: 20000 }).count === 1) p = { ...p, cells: trial };
    }
    return p;
  }
  throw new Error('no light up');
}

// For drawing: which white squares are lit by the bulbs placed.
export function litBy(p, bulbs) {
  const lit = new Array(p.n * p.n).fill(false);
  bulbs.forEach((b, i) => {
    if (!b) return;
    lit[i] = true;
    for (const j of sight(p.n, p.cells, i)) lit[j] = true;
  });
  return lit;
}

// Squares breaking a rule: bulbs that light each other, numbers with too
// many bulbs (or too few once all their sides are decided).
export function conflicts(p, bulbs, dots = []) {
  const { n, cells } = p;
  const bad = new Set();
  bulbs.forEach((b, i) => {
    if (b && sight(n, cells, i).some((j) => bulbs[j])) bad.add(i);
  });
  for (let i = 0; i < n * n; i++) {
    if (cells[i] < 0) continue;
    const s = sides(n, i);
    const count = s.filter((j) => bulbs[j]).length;
    const open = s.filter((j) => isWhite(cells[j]) && !bulbs[j] && !dots[j]).length;
    if (count > cells[i] || (count < cells[i] && !open)) bad.add(i);
  }
  return bad;
}

export function isSolved(p, bulbs) {
  if (conflicts(p, bulbs).size) return false;
  const lit = litBy(p, bulbs);
  return p.cells.every((v, i) => !isWhite(v) || lit[i]) && p.cells.every((v, i) => v < 0 || sides(p.n, i).filter((j) => bulbs[j]).length === v);
}

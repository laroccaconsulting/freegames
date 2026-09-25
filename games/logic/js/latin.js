// Shared pieces for Latin-square puzzles (each row and column holds 1..n
// once): a random square and a solution counter with a pluggable rule.

import { shuffle } from '../core/rng.js';

// A uniformly shuffled Latin square, filled by randomized backtracking.
export function randomLatin(n, random) {
  const g = new Array(n * n).fill(0);
  const fill = (i) => {
    if (i === n * n) return true;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const v of shuffle([...Array(n).keys()].map((x) => x + 1), random)) {
      let ok = true;
      for (let k = 0; k < c && ok; k++) if (g[r * n + k] === v) ok = false;
      for (let k = 0; k < r && ok; k++) if (g[k * n + c] === v) ok = false;
      if (!ok) continue;
      g[i] = v;
      if (fill(i + 1)) return true;
      g[i] = 0;
    }
    return false;
  };
  fill(0);
  return g;
}

// Counts solutions (up to `max`) of an n×n Latin square with `givens`
// (0 = empty) where `ok(g, i)` checks the puzzle's own rules right after
// cell i is set. Picks the most constrained cell first.
export function countLatin(n, givens, ok, { max = 2, limit = 400000 } = {}) {
  const g = givens.slice();
  const rowUsed = new Array(n).fill(0);
  const colUsed = new Array(n).fill(0);
  for (let i = 0; i < n * n; i++) {
    if (!g[i]) continue;
    const bit = 1 << g[i];
    const r = Math.floor(i / n);
    if (rowUsed[r] & bit || colUsed[i % n] & bit) return { count: 0, solutions: [] };
    rowUsed[r] |= bit;
    colUsed[i % n] |= bit;
  }
  for (let i = 0; i < n * n; i++) if (g[i] && !ok(g, i)) return { count: 0, solutions: [] };
  const solutions = [];
  let nodes = 0;
  const options = (i) => {
    const used = rowUsed[Math.floor(i / n)] | colUsed[i % n];
    const out = [];
    for (let v = 1; v <= n; v++) {
      if (used & (1 << v)) continue;
      g[i] = v;
      if (ok(g, i)) out.push(v);
      g[i] = 0;
    }
    return out;
  };
  function go() {
    if (++nodes > limit) return true;
    let best = -1;
    let bestOpts = null;
    for (let i = 0; i < n * n; i++) {
      if (g[i]) continue;
      const opts = options(i);
      if (!opts.length) return false;
      if (!bestOpts || opts.length < bestOpts.length) {
        best = i;
        bestOpts = opts;
        if (opts.length === 1) break;
      }
    }
    if (best < 0) {
      solutions.push(g.slice());
      return solutions.length >= max;
    }
    const r = Math.floor(best / n);
    const c = best % n;
    for (const v of bestOpts) {
      g[best] = v;
      rowUsed[r] |= 1 << v;
      colUsed[c] |= 1 << v;
      if (go()) return true;
      rowUsed[r] &= ~(1 << v);
      colUsed[c] &= ~(1 << v);
    }
    g[best] = 0;
    return false;
  }
  go();
  return { count: nodes > limit ? -1 : solutions.length, solutions };
}

// Numbers that could go in empty cell i without breaking a row, column or
// the puzzle's rule, given the other values.
export function candidates(n, values, ok, i) {
  const out = [];
  const g = values.slice();
  for (let v = 1; v <= n; v++) {
    let clash = false;
    for (let k = 0; k < n && !clash; k++) {
      const a = Math.floor(i / n) * n + k;
      const b = k * n + (i % n);
      if ((a !== i && g[a] === v) || (b !== i && g[b] === v)) clash = true;
    }
    if (clash) continue;
    g[i] = v;
    if (ok(g, i)) out.push(v);
  }
  return out;
}

// Cells that repeat a number in their row or column.
export function repeats(n, values) {
  const bad = new Set();
  for (let i = 0; i < n * n; i++) {
    if (!values[i]) continue;
    for (let k = 0; k < n; k++) {
      const a = Math.floor(i / n) * n + k;
      const b = k * n + (i % n);
      if ((a !== i && values[a] === values[i]) || (b !== i && values[b] === values[i])) bad.add(i);
    }
  }
  return bad;
}

// Add givens from `solution` until the puzzle has one answer, each time
// picking a square where two answers disagree (so few are needed).
export function disambiguate(n, givens, makeOk, solution, random) {
  const g = givens.slice();
  for (;;) {
    const res = countLatin(n, g, makeOk(g), { limit: 3000 });
    if (res.count === 1) return g;
    let diff = [];
    if (res.count === 2) diff = [...Array(n * n).keys()].filter((i) => res.solutions[0][i] !== res.solutions[1][i]);
    if (!diff.length) diff = [...Array(n * n).keys()].filter((i) => !g[i]);
    const i = diff[Math.floor(random() * diff.length)];
    g[i] = solution[i];
  }
}

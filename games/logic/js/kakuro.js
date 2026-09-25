// Kakuro: a crossword of numbers. Fill the white squares with 1–9 so each
// run across or down adds up to the clue at its start, with no digit twice
// in a run. Pure (no DOM).
//
// A puzzle is { n, white: [bool], runs: [{ cells, sum, dir, clue }], givens, solution }
// where clue is the black square the run's sum is written in.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = { small: { n: 6 }, medium: { n: 8 }, large: { n: 9 } };
const ALL = 0b1111111110; // digits 1..9 as bits

// For each run length and sum, which digits can appear (over every set of
// distinct digits with that sum).
const COMBOS = (() => {
  const t = Array.from({ length: 10 }, () => new Map());
  for (let set = 0; set < 512; set++) {
    let len = 0;
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (set & (1 << (d - 1))) {
      len++;
      sum += d;
    }
    t[len].set(sum, (t[len].get(sum) || 0) | (set << 1));
  }
  return t;
})();
export const digitsFor = (len, sum) => COMBOS[len]?.get(sum) || 0;
// How many sets of `len` distinct digits add up to `sum`.
const setsFor = (len, sum) => SETS[len].filter(([, s]) => s === sum).length;
// Every set of distinct digits, grouped by size: [mask, sum].
const SETS = (() => {
  const t = Array.from({ length: 10 }, () => []);
  for (let set = 0; set < 512; set++) {
    let len = 0;
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (set & (1 << (d - 1))) {
      len++;
      sum += d;
    }
    t[len].push([set << 1, sum]);
  }
  return t;
})();
const bits = (m) => {
  let c = 0;
  for (let x = m; x; x &= x - 1) c++;
  return c;
};

// White squares: row 0 and column 0 are always black (they hold clues).
// Black squares inside are placed with half-turn symmetry, then fixed so no
// run is a single square or longer than 9.
function pattern(n, random) {
  const white = new Array(n * n).fill(false);
  for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) white[r * n + c] = true;
  for (let r = 1; r < n; r++)
    for (let c = 1; c < n; c++) {
      const i = r * n + c;
      if (random() < 0.15) {
        white[i] = false;
        const j = (n - r) * n + (n - c);
        if (j > 0 && j < n * n) white[j] = false;
      }
    }
  // Every white square must sit in a run both across and down (so both sums
  // constrain it); drop squares that don't until none are left.
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (let i = 0; i < n * n; i++) {
      if (!white[i]) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      const across = (c > 0 && white[i - 1]) || (c < n - 1 && white[i + 1]);
      const down = (r > 0 && white[i - n]) || (r < n - 1 && white[i + n]);
      if (!across || !down) {
        white[i] = false;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return white;
}

// Runs of two or more white squares, across and down, with their clue square.
export function findRuns(n, white) {
  const runs = [];
  for (const dir of ['across', 'down']) {
    for (let a = 0; a < n; a++) {
      let cur = [];
      const flush = () => {
        if (cur.length >= 2) {
          const first = cur[0];
          runs.push({ cells: cur, dir, clue: dir === 'across' ? first - 1 : first - n });
        }
        cur = [];
      };
      for (let b = 0; b < n; b++) {
        const i = dir === 'across' ? a * n + b : b * n + a;
        if (white[i]) cur.push(i);
        else flush();
      }
      flush();
    }
  }
  return runs;
}

// Fill the white squares with digits, no repeats in any run.
function fill(n, white, runs, random) {
  const runsOf = Array.from({ length: n * n }, () => []);
  runs.forEach((run, k) => run.cells.forEach((i) => runsOf[i].push(k)));
  const g = new Array(n * n).fill(0);
  const order = [...Array(n * n).keys()].filter((i) => white[i]);
  let nodes = 0;
  const go = (k) => {
    if (k === order.length) return true;
    if (++nodes > 20000) return false;
    const i = order[k];
    for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random)) {
      if (runsOf[i].some((r) => runs[r].cells.some((j) => g[j] === d))) continue;
      // A 2×2 block reading a b / b a could swap to b a / a b with the same
      // sums, so never fill one.
      const c = i % n;
      if (c > 0 && i >= n && white[i - 1] && white[i - n] && white[i - n - 1] && g[i - n - 1] === d && g[i - 1] === g[i - n]) continue;
      g[i] = d;
      if (go(k + 1)) return true;
      g[i] = 0;
    }
    return false;
  };
  return go(0) ? g : null;
}

// Count solutions (up to `max`) from the sums and any givens.
export function solve(p, { max = 2, limit = 200000 } = {}) {
  const { n, runs } = p;
  const runsOf = Array.from({ length: n * n }, () => []);
  runs.forEach((run, k) => run.cells.forEach((i) => runsOf[i].push(k)));
  const g = p.givens.slice();
  const solutions = [];
  let nodes = 0;
  // What a square may still hold, from its runs' sums and what's placed.
  const options = (i) => {
    let m = ALL;
    for (const k of runsOf[i]) {
      const run = runs[k];
      let used = 0;
      let sum = 0;
      let open = 0;
      for (const j of run.cells) {
        if (g[j]) {
          used |= 1 << g[j];
          sum += g[j];
        } else open++;
      }
      const left = run.sum - sum;
      // Digits that can finish this run: from combos of `open` digits making `left`, avoiding used ones.
      let allowed = 0;
      for (const [mask, s] of SETS[open]) if (s === left && !(mask & used)) allowed |= mask;
      m &= allowed;
    }
    return m;
  };
  const go = () => {
    if (++nodes > limit) return true;
    let best = -1;
    let bestM = 0;
    let bestC = 10;
    for (let i = 0; i < n * n; i++) {
      if (!p.white[i] || g[i]) continue;
      const m = options(i);
      const c = bits(m);
      if (!c) return false;
      if (c < bestC) [best, bestM, bestC] = [i, m, c];
      if (c === 1) break;
    }
    if (best < 0) {
      solutions.push(g.slice());
      return solutions.length >= max;
    }
    for (let d = 1; d <= 9; d++) {
      if (!(bestM & (1 << d))) continue;
      g[best] = d;
      if (go()) return true;
    }
    g[best] = 0;
    return false;
  };
  go();
  return { count: nodes > limit ? -1 : solutions.length, solutions };
}

export function generate(seed, size = 'medium') {
  const { n } = SIZES[size];
  const random = mulberry32(seed);
  for (let t = 0; t < 120; t++) {
    const white = pattern(n, random);
    const whites = white.filter(Boolean).length;
    if (whites < (n - 1) * (n - 1) * 0.45) continue;
    const runs = findRuns(n, white);
    if (runs.some((r) => r.cells.length > 9)) continue;
    const solution = fill(n, white, runs, random);
    if (!solution) continue;
    const runsOf = Array.from({ length: n * n }, () => []);
    runs.forEach((run, k) => run.cells.forEach((i) => runsOf[i].push(k)));
    const sums = () => runs.map((r) => ({ ...r, sum: r.cells.reduce((a, i) => a + solution[i], 0) }));
    // Where two answers disagree, change the digit there (keeping runs free
    // of repeats) and try again; sums then pin it down. A given digit is the
    // last resort.
    let givens = new Array(n * n).fill(0);
    // Given digits only once plain sums have failed on many fresh grids.
    const repairs = t < 100 ? 90 : 50;
    for (let round = 0; round < repairs + 12; round++) {
      const p = { n, white, runs: sums(), givens, solution };
      const res = solve(p, { limit: 30000 });
      if (res.count === 1) return p;
      if (res.count !== 2) break;
      const diff = res.solutions[0].map((v, i) => (v !== res.solutions[1][i] ? i : -1)).filter((i) => i >= 0);
      const i = diff[Math.floor(random() * diff.length)];
      const taken = new Set(runsOf[i].flatMap((k) => runs[k].cells.filter((j) => j !== i).map((j) => solution[j])));
      const choices = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== solution[i] && !taken.has(d));
      // Prefer the digit that leaves its runs with the fewest ways to make their sums.
      const ways = (d) => {
        const old = solution[i];
        solution[i] = d;
        const w = runsOf[i].reduce((a, k) => a + setsFor(runs[k].cells.length, runs[k].cells.reduce((x, j) => x + solution[j], 0)), 0);
        solution[i] = old;
        return w + random() * 0.9;
      };
      if (choices.length && round < repairs) solution[i] = choices.sort((a, b) => ways(a) - ways(b))[0];
      else if (t < 100) break;
      else {
        givens = givens.slice();
        givens[i] = solution[i];
      }
    }
  }
  throw new Error('no kakuro');
}

// Squares breaking a rule: repeats in a run, or a full run with the wrong sum.
export function conflicts(p, v) {
  const bad = new Set();
  for (const run of p.runs) {
    const seen = new Map();
    for (const i of run.cells) {
      if (!v[i]) continue;
      if (seen.has(v[i])) {
        bad.add(i);
        bad.add(seen.get(v[i]));
      } else seen.set(v[i], i);
    }
    if (run.cells.every((i) => v[i]) && run.cells.reduce((a, i) => a + v[i], 0) !== run.sum) run.cells.forEach((i) => bad.add(i));
  }
  return bad;
}

export function badRuns(p, v) {
  return p.runs.map((run) => run.cells.every((i) => v[i]) && run.cells.reduce((a, i) => a + v[i], 0) !== run.sum);
}

export const isSolved = (p, v) => p.solution.every((d, i) => !p.white[i] || v[i] === d);

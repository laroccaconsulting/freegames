// Calcudoku: fill the grid with 1..n so no number repeats in a row or
// column, and every outlined cage makes its target with its operation
// (+, −, ×, ÷). Pure (no DOM).
//
// A puzzle is { n, cages: [{ cells, op, target }], solution }.
// Made from a random Latin square cut into random cages; kept only when
// the solver proves there is one answer.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = { small: { n: 4 }, medium: { n: 5 }, large: { n: 6 } };

function latin(n, random) {
  const rows = shuffle([...Array(n).keys()], random);
  const cols = shuffle([...Array(n).keys()], random);
  const syms = shuffle([...Array(n).keys()].map((x) => x + 1), random);
  const g = new Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g[r * n + c] = syms[(rows[r] + cols[c]) % n];
  return g;
}

function makeCages(n, solution, random) {
  const owner = new Array(n * n).fill(-1);
  const groups = [];
  const nbrs = (i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    return [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1].filter((j) => j >= 0);
  };
  for (const start of shuffle([...Array(n * n).keys()], random)) {
    if (owner[start] !== -1) continue;
    const roll = random();
    const size = roll < 0.07 ? 1 : roll < 0.5 ? 2 : roll < 0.88 ? 3 : 4;
    const cells = [start];
    owner[start] = groups.length;
    while (cells.length < size) {
      const options = cells.flatMap(nbrs).filter((j) => owner[j] === -1);
      if (!options.length) break;
      const j = options[Math.floor(random() * options.length)];
      owner[j] = groups.length;
      cells.push(j);
    }
    groups.push({ cells, single: size === 1 });
  }
  // A cage stranded at one square it didn't want joins a small neighbour.
  for (const g of groups) {
    if (g.cells.length !== 1 || g.single) continue;
    const near = nbrs(g.cells[0]).map((j) => groups[owner[j]]).filter((h) => h !== g && h.cells.length && h.cells.length < 4);
    if (!near.length) continue;
    const h = near[Math.floor(random() * near.length)];
    h.cells.push(g.cells[0]);
    owner[g.cells[0]] = groups.indexOf(h);
    g.cells = [];
  }
  return groups.filter((g) => g.cells.length).map(({ cells }) => {
    const vals = cells.map((i) => solution[i]);
    let op;
    let target;
    if (cells.length === 1) [op, target] = ['', vals[0]];
    else if (cells.length === 2) {
      const [a, b] = [Math.max(...vals), Math.min(...vals)];
      const r2 = random();
      if (a % b === 0 && r2 < 0.45) [op, target] = ['÷', a / b];
      else if (r2 < 0.75) [op, target] = ['−', a - b];
      else if (r2 < 0.88) [op, target] = ['+', a + b];
      else [op, target] = ['×', a * b];
    } else if (random() < 0.55) [op, target] = ['+', vals.reduce((x, y) => x + y, 0)];
    else [op, target] = ['×', vals.reduce((x, y) => x * y, 1)];
    return { cells: cells.sort((x, y) => x - y), op, target };
  });
}

// Can these values (some cells still 0) still make the cage's target?
function cageOk(cage, vals, n) {
  const filled = vals.filter(Boolean);
  const open = vals.length - filled.length;
  const { op, target } = cage;
  if (op === '') return !filled.length || filled[0] === target;
  if (op === '+') {
    const s = filled.reduce((a, b) => a + b, 0);
    return open ? s + open <= target && s + open * n >= target : s === target;
  }
  if (op === '×') {
    const p = filled.reduce((a, b) => a * b, 1);
    return open ? target % p === 0 : p === target;
  }
  if (open) return true;
  const [a, b] = [Math.max(...filled), Math.min(...filled)];
  return op === '−' ? a - b === target : a === b * target;
}

// Counts solutions up to `max`.
export function solve(p, { max = 2, limit = 300000 } = {}) {
  const { n, cages } = p;
  const cageOf = new Array(n * n);
  cages.forEach((c, k) => c.cells.forEach((i) => (cageOf[i] = k)));
  const g = new Array(n * n).fill(0);
  const rowUsed = new Array(n).fill(0);
  const colUsed = new Array(n).fill(0);
  const solutions = [];
  let nodes = 0;
  function go() {
    if (++nodes > limit) return true;
    // The empty cell with the fewest options.
    let best = -1;
    let bestOpts = null;
    for (let i = 0; i < n * n; i++) {
      if (g[i]) continue;
      const used = rowUsed[Math.floor(i / n)] | colUsed[i % n];
      const opts = [];
      const cage = cages[cageOf[i]];
      for (let v = 1; v <= n; v++) {
        if (used & (1 << v)) continue;
        g[i] = v;
        if (cageOk(cage, cage.cells.map((j) => g[j]), n)) opts.push(v);
        g[i] = 0;
      }
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
      g[best] = 0;
    }
    return false;
  }
  go();
  return { count: nodes > limit ? -1 : solutions.length, solutions };
}

export function generate(seed, size = 'medium') {
  const { n } = SIZES[size];
  const random = mulberry32(seed);
  for (let t = 0; t < 300; t++) {
    const solution = latin(n, random);
    const cages = makeCages(n, solution, random);
    const p = { n, cages, solution };
    if (solve(p).count === 1) return p;
  }
  throw new Error('no calcudoku');
}

// Cells whose value breaks a rule: repeats in a row or column, or a full cage that misses its target.
export function conflicts(p, values) {
  const { n, cages } = p;
  const bad = new Set();
  for (let a = 0; a < n * n; a++) {
    if (!values[a]) continue;
    for (let b = a + 1; b < n * n; b++) {
      if (values[b] !== values[a]) continue;
      if (Math.floor(a / n) === Math.floor(b / n) || a % n === b % n) {
        bad.add(a);
        bad.add(b);
      }
    }
  }
  for (const cage of cages) {
    const vals = cage.cells.map((i) => values[i]);
    if (vals.every(Boolean) && !cageOk(cage, vals, n)) cage.cells.forEach((i) => bad.add(i));
  }
  return bad;
}

export const isSolved = (p, values) => p.solution.every((v, i) => values[i] === v);
export const label = (cage) => (cage.op ? `${cage.target}${cage.op}` : `${cage.target}`);

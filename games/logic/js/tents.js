// Tents: every tree gets its own tent on one of its four sides. Tents never
// touch each other, not even diagonally. The numbers outside the grid say
// how many tents are in each row and column. Pure (no DOM).
//
// A puzzle is { n, trees: [bool], rows: [count], cols: [count], solution: [bool] }.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = { small: { n: 6 }, medium: { n: 8 }, large: { n: 10 } };

const sides = (n, i) => {
  const r = Math.floor(i / n);
  const c = i % n;
  return [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1].filter((j) => j >= 0);
};
export const around = (n, i) => {
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc);
    }
  return out;
};

// Can every tree be paired with its own neighbouring tent? (Bipartite
// matching by augmenting paths.)
export function matches(n, trees, tents) {
  const treeList = [];
  trees.forEach((t, i) => t && treeList.push(i));
  const tentOwner = new Map();
  const tryTree = (t, seen) => {
    for (const j of sides(n, t)) {
      if (!tents[j] || seen.has(j)) continue;
      seen.add(j);
      if (!tentOwner.has(j) || tryTree(tentOwner.get(j), seen)) {
        tentOwner.set(j, t);
        return true;
      }
    }
    return false;
  };
  return treeList.every((t) => tryTree(t, new Set())) && tentOwner.size === tents.filter(Boolean).length;
}

export function solve(p, { max = 2, limit = 300000 } = {}) {
  const { n, trees, rows, cols } = p;
  const N = n * n;
  // Only squares beside a tree can hold a tent.
  const cand = [];
  for (let i = 0; i < N; i++) if (!trees[i] && sides(n, i).some((j) => trees[j])) cand.push(i);
  const tents = new Array(N).fill(false);
  const rowCount = new Array(n).fill(0);
  const colCount = new Array(n).fill(0);
  // How many candidates are left in each row/column from position k on.
  const rowLeft = Array.from({ length: cand.length + 1 }, () => new Array(n).fill(0));
  const colLeft = Array.from({ length: cand.length + 1 }, () => new Array(n).fill(0));
  for (let k = cand.length - 1; k >= 0; k--) {
    rowLeft[k] = rowLeft[k + 1].slice();
    colLeft[k] = colLeft[k + 1].slice();
    rowLeft[k][Math.floor(cand[k] / n)]++;
    colLeft[k][cand[k] % n]++;
  }
  const solutions = [];
  let nodes = 0;
  function go(k) {
    if (++nodes > limit) return true;
    // Rows above the current candidate's row must be complete.
    for (let r = 0; r < n; r++) if (rowCount[r] > rows[r] || rowCount[r] + rowLeft[k][r] < rows[r]) return false;
    for (let c = 0; c < n; c++) if (colCount[c] > cols[c] || colCount[c] + colLeft[k][c] < cols[c]) return false;
    if (k === cand.length) {
      if (matches(n, trees, tents)) solutions.push(tents.slice());
      return solutions.length >= max;
    }
    const i = cand[k];
    const r = Math.floor(i / n);
    const c = i % n;
    if (rowCount[r] < rows[r] && colCount[c] < cols[c] && !around(n, i).some((j) => tents[j])) {
      tents[i] = true;
      rowCount[r]++;
      colCount[c]++;
      if (go(k + 1)) return true;
      tents[i] = false;
      rowCount[r]--;
      colCount[c]--;
    }
    return go(k + 1);
  }
  go(0);
  return { count: nodes > limit ? -1 : solutions.length, solutions };
}

export function generate(seed, size = 'medium') {
  const { n } = SIZES[size];
  const random = mulberry32(seed);
  for (let t = 0; t < 300; t++) {
    const trees = new Array(n * n).fill(false);
    const tents = new Array(n * n).fill(false);
    const target = Math.round((n * n) / 5);
    for (const i of shuffle([...Array(n * n).keys()], random)) {
      if (tents.filter(Boolean).length >= target) break;
      if (trees[i] || tents[i] || around(n, i).some((j) => tents[j])) continue;
      const spots = sides(n, i).filter((j) => !trees[j] && !tents[j]);
      if (!spots.length) continue;
      tents[i] = true;
      trees[spots[Math.floor(random() * spots.length)]] = true;
    }
    const rows = Array.from({ length: n }, (_, r) => tents.slice(r * n, r * n + n).filter(Boolean).length);
    const cols = Array.from({ length: n }, (_, c) => tents.filter((x, i) => x && i % n === c).length);
    const p = { n, trees, rows, cols, solution: tents };
    if (solve(p).count === 1) return p;
  }
  throw new Error('no tents');
}

// Squares breaking a rule: touching tents, and rows/columns over their count.
export function conflicts(p, tents) {
  const { n } = p;
  const bad = new Set();
  tents.forEach((t, i) => {
    if (t && around(n, i).some((j) => tents[j])) bad.add(i);
    if (t && !sides(n, i).some((j) => p.trees[j])) bad.add(i);
  });
  return bad;
}

export const counts = (p, tents) => ({
  rows: Array.from({ length: p.n }, (_, r) => tents.slice(r * p.n, r * p.n + p.n).filter(Boolean).length),
  cols: Array.from({ length: p.n }, (_, c) => tents.filter((x, i) => x && i % p.n === c).length),
});

export function isSolved(p, tents) {
  const c = counts(p, tents);
  return !conflicts(p, tents).size && c.rows.every((v, r) => v === p.rows[r]) && c.cols.every((v, k) => v === p.cols[k]) && matches(p.n, p.trees, tents);
}

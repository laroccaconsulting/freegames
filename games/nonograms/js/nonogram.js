// Nonograms: shade cells so each row and column shows the runs its clue
// lists, in order. Pure (no DOM).
//
// A puzzle is { w, h, solution: [0 | 1], rows: [[run]], cols: [[run]] }.
// Cell states while solving: 1 filled, 0 unknown, -1 empty (crossed).

import { mulberry32 } from '../core/rng.js';

export const SIZES = { small: { w: 5, h: 5 }, medium: { w: 10, h: 10 }, large: { w: 15, h: 15 } };

export function clue(line) {
  const runs = [];
  let n = 0;
  for (const v of line) {
    if (v === 1) n++;
    else if (n) {
      runs.push(n);
      n = 0;
    }
  }
  if (n) runs.push(n);
  return runs;
}

const rowOf = (g, w, r) => g.slice(r * w, r * w + w);
const colOf = (g, w, h, c) => Array.from({ length: h }, (_, r) => g[r * w + c]);

export function clues(w, h, solution) {
  return {
    rows: Array.from({ length: h }, (_, r) => clue(rowOf(solution, w, r))),
    cols: Array.from({ length: w }, (_, c) => clue(colOf(solution, w, h, c))),
  };
}

// Solve one line as far as it goes: which cells must be filled or empty in
// every arrangement of the runs that fits what's known? Returns the new line,
// or null if nothing fits.
export function solveLine(runs, line) {
  const n = line.length;
  const k = runs.length;
  // canPlace[i][j]: runs j.. can fit in cells i.. (with what's known).
  const memo = new Map();
  const noneFilled = (a, b) => {
    for (let x = a; x < b; x++) if (line[x] === 1) return false;
    return true;
  };
  const fits = (i, j) => {
    const key = i * 64 + j;
    if (memo.has(key)) return memo.get(key);
    let ok = false;
    if (j === k) ok = noneFilled(i, n);
    else {
      const len = runs[j];
      for (let s = i; s + len <= n; s++) {
        if (!noneFilled(i, s)) break; // a filled cell before the run would be skipped
        let block = true;
        for (let x = s; x < s + len; x++) if (line[x] === -1) block = false;
        if (!block) continue;
        if (s + len < n && line[s + len] === 1) continue;
        if (fits(Math.min(n, s + len + 1), j + 1)) {
          ok = true;
          break;
        }
      }
    }
    memo.set(key, ok);
    return ok;
  };
  if (!fits(0, 0)) return null;
  // Walk every valid placement, marking cells that can be filled / empty.
  const canFill = new Array(n).fill(false);
  const canEmpty = new Array(n).fill(false);
  const seen = new Set();
  const walk = (i, j) => {
    const key = i * 64 + j;
    if (seen.has(key)) return;
    seen.add(key);
    if (j === k) {
      for (let x = i; x < n; x++) canEmpty[x] = true;
      return;
    }
    const len = runs[j];
    for (let s = i; s + len <= n; s++) {
      if (!noneFilled(i, s)) break;
      let block = true;
      for (let x = s; x < s + len; x++) if (line[x] === -1) block = false;
      if (!block || (s + len < n && line[s + len] === 1)) continue;
      const next = Math.min(n, s + len + 1);
      if (!fits(next, j + 1)) continue;
      for (let x = i; x < s; x++) canEmpty[x] = true;
      for (let x = s; x < s + len; x++) canFill[x] = true;
      if (s + len < n) canEmpty[s + len] = true;
      walk(next, j + 1);
    }
  };
  walk(0, 0);
  return line.map((v, x) => (v !== 0 ? v : canFill[x] && !canEmpty[x] ? 1 : canEmpty[x] && !canFill[x] ? -1 : 0));
}

// Line-by-line solving until nothing changes. Returns the grid (0 where
// still unknown) or null on a contradiction.
export function solve(p, start = null) {
  const { w, h } = p;
  const g = start ? start.slice() : new Array(w * h).fill(0);
  let dirty = true;
  const rowsDirty = new Array(h).fill(true);
  const colsDirty = new Array(w).fill(true);
  while (dirty) {
    dirty = false;
    for (let r = 0; r < h; r++) {
      if (!rowsDirty[r]) continue;
      rowsDirty[r] = false;
      const next = solveLine(p.rows[r], rowOf(g, w, r));
      if (!next) return null;
      next.forEach((v, c) => {
        if (v !== g[r * w + c]) {
          g[r * w + c] = v;
          colsDirty[c] = true;
          dirty = true;
        }
      });
    }
    for (let c = 0; c < w; c++) {
      if (!colsDirty[c]) continue;
      colsDirty[c] = false;
      const next = solveLine(p.cols[c], colOf(g, w, h, c));
      if (!next) return null;
      next.forEach((v, r) => {
        if (v !== g[r * w + c]) {
          g[r * w + c] = v;
          rowsDirty[r] = true;
          dirty = true;
        }
      });
    }
  }
  return g;
}

// A blobby random picture (smoothed noise), kept only if line solving alone
// finishes it, so it never needs a guess.
export function generate(seed, size = 'medium') {
  const { w, h } = SIZES[size];
  const random = mulberry32(seed);
  for (let t = 0; t < 400; t++) {
    let g = Array.from({ length: w * h }, () => (random() < 0.5 ? 1 : 0));
    // One or two smoothing passes make shapes instead of static.
    for (let pass = 0; pass < (w > 5 ? 2 : 1); pass++) {
      g = g.map((v, i) => {
        const r = Math.floor(i / w);
        const c = i % w;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && g[(r + dr) * w + (c + dc)] && r + dr >= 0 && r + dr < h && c + dc >= 0 && c + dc < w) n++;
        return n >= 5 ? 1 : n <= 2 ? 0 : v;
      });
    }
    const filled = g.filter(Boolean).length;
    if (filled < w * h * 0.4 || filled > w * h * 0.62) continue;
    const p = { w, h, solution: g, ...clues(w, h, g) };
    // No empty lines: every row and column has something to work with.
    if (p.rows.some((r) => !r.length) || p.cols.some((c) => !c.length)) continue;
    const s = solve(p);
    if (s && s.every((v, i) => (v === 1) === (g[i] === 1))) return p;
  }
  throw new Error('no nonogram');
}

export const isSolved = (p, cells) => p.solution.every((v, i) => (cells[i] === 1) === (v === 1));

// Which row and column clues are satisfied by the filled cells right now.
export function doneLines(p, cells) {
  const filled = cells.map((v) => (v === 1 ? 1 : 0));
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  return {
    rows: p.rows.map((runs, r) => same(clue(rowOf(filled, p.w, r)), runs)),
    cols: p.cols.map((runs, c) => same(clue(colOf(filled, p.w, p.h, c)), runs)),
  };
}

// Skyscrapers: each square holds a building of height 1..n; no height
// repeats in a row or column. A clue outside the grid says how many
// buildings you can see from there (taller ones hide shorter ones behind
// them). Pure (no DOM).
//
// A puzzle is { n, givens, clues: { top, bottom, left, right } (0 = no
// clue; top/bottom by column, left/right by row), solution }.

import { mulberry32, shuffle } from '../core/rng.js';
import { randomLatin, countLatin, repeats, disambiguate } from './latin.js';

export const SIZES = { small: { n: 4 }, medium: { n: 5 }, large: { n: 6 } };

export function visible(line) {
  let tallest = 0;
  let seen = 0;
  for (const h of line) {
    if (h > tallest) {
      tallest = h;
      seen++;
    }
  }
  return seen;
}

const rowOf = (g, n, r) => g.slice(r * n, r * n + n);
const colOf = (g, n, c) => Array.from({ length: n }, (_, r) => g[r * n + c]);

// Does a line (maybe partly filled) still fit a clue seen from its start?
// The line is read from g at start, start + step, … (n squares).
function lineOk(g, start, step, n, clue) {
  if (!clue) return true;
  let tallest = 0;
  let seen = 0;
  let full = true;
  let gap = false;
  let topAt = -1;
  for (let k = 0; k < n; k++) {
    const h = g[start + k * step];
    if (!h) {
      full = false;
      gap = true;
      continue;
    }
    if (h === n) topAt = k;
    if (!gap && h > tallest) {
      tallest = h;
      seen++;
    }
  }
  if (full) return seen === clue;
  // Before the first gap, the count so far can't pass the clue, and once the
  // tallest is placed nothing more becomes visible.
  if (seen > clue) return false;
  if (tallest === n && seen !== clue) return false;
  // Too few squares before the tallest to reach the clue.
  if (topAt >= 0 && topAt + 1 < clue) return false;
  return true;
}

export function rule(p) {
  const { n, clues } = p;
  // A clue of k means the square d steps in (from 0) is at most n - k + 1 + d.
  const cap = new Array(n * n).fill(n);
  for (let k = 0; k < n; k++) {
    for (let d = 0; d < n; d++) {
      const lim = (clue) => (clue ? n - clue + 1 + d : n);
      const at = [[k * n + d, clues.left[k]], [k * n + n - 1 - d, clues.right[k]], [d * n + k, clues.top[k]], [(n - 1 - d) * n + k, clues.bottom[k]]];
      for (const [i, clue] of at) cap[i] = Math.min(cap[i], lim(clue));
    }
  }
  return (g, i) => {
    if (g[i] > cap[i]) return false;
    const r = Math.floor(i / n);
    const c = i % n;
    return lineOk(g, r * n, 1, n, clues.left[r]) && lineOk(g, r * n + n - 1, -1, n, clues.right[r]) && lineOk(g, c, n, n, clues.top[c]) && lineOk(g, (n - 1) * n + c, -n, n, clues.bottom[c]);
  };
}

export function generate(seed, size = 'medium') {
  const { n } = SIZES[size];
  const random = mulberry32(seed);
  {
    const solution = randomLatin(n, random);
    const clues = { top: [], bottom: [], left: [], right: [] };
    for (let k = 0; k < n; k++) {
      clues.left[k] = visible(rowOf(solution, n, k));
      clues.right[k] = visible(rowOf(solution, n, k).reverse());
      clues.top[k] = visible(colOf(solution, n, k));
      clues.bottom[k] = visible(colOf(solution, n, k).reverse());
    }
    let p = { n, givens: new Array(n * n).fill(0), clues, solution };
    // A small search budget also keeps puzzles that need deep guessing out.
    const unique = (q) => countLatin(n, q.givens, rule(q), { limit: 3000 }).count === 1;
    p.givens = disambiguate(n, p.givens, (givens) => rule({ ...p, givens }), solution, random);
    const slots = shuffle(['top', 'bottom', 'left', 'right'].flatMap((side) => [...Array(n).keys()].map((k) => [side, k])), random);
    for (const [side, k] of slots) {
      const next = { ...p.clues, [side]: p.clues[side].slice() };
      next[side][k] = 0;
      const trial = { ...p, clues: next };
      if (unique(trial)) p = trial;
    }
    return p;
  }
}

// Cells that break a rule: repeats, or a full line that misses its clue.
export function conflicts(p, values) {
  const { n, clues } = p;
  const bad = repeats(n, values);
  for (let k = 0; k < n; k++) {
    const row = rowOf(values, n, k);
    const col = colOf(values, n, k);
    const rowBad = row.every(Boolean) && ((clues.left[k] && visible(row) !== clues.left[k]) || (clues.right[k] && visible(row.slice().reverse()) !== clues.right[k]));
    const colBad = col.every(Boolean) && ((clues.top[k] && visible(col) !== clues.top[k]) || (clues.bottom[k] && visible(col.slice().reverse()) !== clues.bottom[k]));
    if (rowBad) for (let c = 0; c < n; c++) bad.add(k * n + c);
    if (colBad) for (let r = 0; r < n; r++) bad.add(r * n + k);
  }
  return bad;
}

// Which clues are broken by full lines (for drawing them red).
export function badClues(p, values) {
  const { n, clues } = p;
  const out = new Set();
  for (let k = 0; k < n; k++) {
    const row = rowOf(values, n, k);
    const col = colOf(values, n, k);
    if (row.every(Boolean)) {
      if (clues.left[k] && visible(row) !== clues.left[k]) out.add(`left${k}`);
      if (clues.right[k] && visible(row.slice().reverse()) !== clues.right[k]) out.add(`right${k}`);
    }
    if (col.every(Boolean)) {
      if (clues.top[k] && visible(col) !== clues.top[k]) out.add(`top${k}`);
      if (clues.bottom[k] && visible(col.slice().reverse()) !== clues.bottom[k]) out.add(`bottom${k}`);
    }
  }
  return out;
}

export const isSolved = (p, values) => p.solution.every((v, i) => values[i] === v);

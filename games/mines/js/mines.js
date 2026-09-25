// Minesweeper: the rules, a logical solver and no-guess board making.
// Pure (no DOM).
//
// A board is { w, h, mines: Set-like array of cell indexes, start }.
// The solver only makes moves that logic proves safe (or proves are mines),
// so a board is "no guess" when the solver clears it from the start square.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = {
  beginner: { w: 9, h: 9, mines: 10, label: 'Beginner' },
  intermediate: { w: 16, h: 16, mines: 40, label: 'Intermediate' },
  expert: { w: 16, h: 30, mines: 99, label: 'Expert' },
};

export function neighbours(w, h, i) {
  const r = Math.floor(i / w);
  const c = i % w;
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && cc >= 0 && rr < h && cc < w) out.push(rr * w + cc);
    }
  return out;
}

export function counts(w, h, mines) {
  const isMine = new Uint8Array(w * h);
  for (const m of mines) isMine[m] = 1;
  const out = new Int8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = isMine[i] ? -1 : neighbours(w, h, i).reduce((s, j) => s + isMine[j], 0);
  return out;
}

// Opens cell i (flood-filling zeros). Returns the new open set as an array of booleans.
export function reveal(w, h, num, open, i) {
  const next = open.slice();
  const stack = [i];
  while (stack.length) {
    const j = stack.pop();
    if (next[j]) continue;
    next[j] = true;
    if (num[j] === 0) for (const k of neighbours(w, h, j)) if (!next[k]) stack.push(k);
  }
  return next;
}

// One logical step from what the player can see. Returns
// { safe: [cells], mines: [cells], why: { kind, from: [cells] } } or null.
export function deduce(w, h, num, open, flagged, totalMines) {
  const known = new Uint8Array(w * h); // 1 = mine (flagged or deduced)
  for (const f of flagged) known[f] = 1;
  const constraints = [];
  for (let i = 0; i < w * h; i++) {
    if (!open[i] || num[i] <= 0) continue;
    const unknown = [];
    let mines = num[i];
    for (const j of neighbours(w, h, i)) {
      if (open[j]) continue;
      if (known[j]) mines--;
      else unknown.push(j);
    }
    if (unknown.length) constraints.push({ at: i, cells: unknown, mines });
  }
  // Rule 1: a number that already has all its mines, or needs every square.
  for (const c of constraints) {
    if (c.mines === 0) return { safe: c.cells, mines: [], why: { kind: 'full', from: [c.at] } };
    if (c.mines === c.cells.length) return { safe: [], mines: c.cells, why: { kind: 'all', from: [c.at] } };
  }
  // Rule 2: one number's squares lie inside another's.
  const sets = constraints.map((c) => new Set(c.cells));
  for (let a = 0; a < constraints.length; a++) {
    for (let b = 0; b < constraints.length; b++) {
      if (a === b) continue;
      const A = constraints[a];
      const B = constraints[b];
      if (A.cells.length >= B.cells.length || !A.cells.every((x) => sets[b].has(x))) continue;
      const rest = B.cells.filter((x) => !sets[a].has(x));
      const m = B.mines - A.mines;
      if (m === 0) return { safe: rest, mines: [], why: { kind: 'subset-safe', from: [A.at, B.at] } };
      if (m === rest.length) return { safe: [], mines: rest, why: { kind: 'subset-mines', from: [A.at, B.at] } };
    }
  }
  // Rule 3: overlapping numbers. The squares both numbers touch hold
  // between lo and hi mines; whatever B needs outside them follows.
  for (let a = 0; a < constraints.length; a++) {
    for (let b = 0; b < constraints.length; b++) {
      if (a === b) continue;
      const A = constraints[a];
      const B = constraints[b];
      const shared = A.cells.filter((x) => sets[b].has(x));
      if (!shared.length) continue;
      const onlyA = A.cells.length - shared.length;
      const onlyB = B.cells.filter((x) => !sets[a].has(x));
      if (!onlyB.length) continue;
      const lo = Math.max(0, A.mines - onlyA, B.mines - onlyB.length);
      const hi = Math.min(shared.length, A.mines, B.mines);
      if (B.mines - lo === 0) return { safe: onlyB, mines: [], why: { kind: 'overlap-safe', from: [A.at, B.at] } };
      if (B.mines - hi === onlyB.length) return { safe: [], mines: onlyB, why: { kind: 'overlap-mines', from: [A.at, B.at] } };
    }
  }
  // Rule 4: the mine count. If every mine is accounted for, the rest is safe.
  let unknownAll = 0;
  let flaggedAll = 0;
  const hidden = [];
  for (let i = 0; i < w * h; i++) {
    if (open[i]) continue;
    if (known[i]) flaggedAll++;
    else {
      unknownAll++;
      hidden.push(i);
    }
  }
  if (totalMines - flaggedAll === 0 && unknownAll) return { safe: hidden, mines: [], why: { kind: 'count', from: [] } };
  if (totalMines - flaggedAll === unknownAll && unknownAll) return { safe: [], mines: hidden, why: { kind: 'count', from: [] } };
  return null;
}

// Plays the board by logic alone from `start`. True if it clears it.
export function solvable(w, h, mines, start) {
  const num = counts(w, h, mines);
  let open = reveal(w, h, num, new Array(w * h).fill(false), start);
  const flags = new Set();
  const safeTotal = w * h - mines.length;
  for (let steps = 0; steps < w * h * 4; steps++) {
    if (open.filter(Boolean).length === safeTotal) return true;
    const d = deduce(w, h, num, open, flags, mines.length);
    if (!d) return false;
    for (const m of d.mines) flags.add(m);
    for (const s of d.safe) open = reveal(w, h, num, open, s);
  }
  return false;
}

// A no-guess board: mines placed at random away from the start square,
// re-rolled until the solver clears it by logic.
export function generate(size, seed, start) {
  const { w, h, mines: count } = SIZES[size];
  const random = mulberry32(seed);
  const keepClear = new Set([start, ...neighbours(w, h, start)]);
  const cells = [...Array(w * h).keys()].filter((i) => !keepClear.has(i));
  for (let t = 0; t < 3000; t++) {
    const mines = shuffle(cells.slice(), random).slice(0, count).sort((a, b) => a - b);
    if (solvable(w, h, mines, start)) return { size, w, h, mines, start, tries: t + 1 };
  }
  throw new Error('no board');
}

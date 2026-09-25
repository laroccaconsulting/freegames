// Clusters: tap a group of two or more touching tiles of one colour to pop
// it. Tiles above fall down; empty columns close up to the left. A group of
// n scores (n - 2)², and clearing the whole board is worth a bonus.
//
// board: { cols, rows, cells: [colour | -1], ids: [tile id | -1] }, index = r * cols + c, row 0 at the top.

import { mulberry32 } from '../core/rng.js';

export const CLEAR_BONUS = 1000;
export const points = (n) => (n < 2 ? 0 : (n - 2) ** 2);

export function newBoard(cols, rows, colors, seed) {
  const random = mulberry32(seed);
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    // A little clumping, so boards have some juicy groups to find.
    const left = i % cols ? cells[i - 1] : -1;
    const up = i >= cols ? cells[i - cols] : -1;
    const r = random();
    cells.push(r < 0.05 && left >= 0 ? left : r < 0.1 && up >= 0 ? up : Math.floor(random() * colors));
  }
  return { cols, rows, cells, ids: cells.map((_, i) => i) };
}

export function groupAt(b, i) {
  const color = b.cells[i];
  if (color == null || color < 0) return [];
  const seen = new Set([i]);
  const stack = [i];
  while (stack.length) {
    const k = stack.pop();
    const r = Math.floor(k / b.cols);
    const c = k % b.cols;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (rr < 0 || cc < 0 || rr >= b.rows || cc >= b.cols) continue;
      const j = rr * b.cols + cc;
      if (!seen.has(j) && b.cells[j] === color) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return [...seen];
}

// Every poppable group, once each (as index lists).
export function groups(b) {
  const seen = new Uint8Array(b.cells.length);
  const out = [];
  for (let i = 0; i < b.cells.length; i++) {
    if (seen[i] || b.cells[i] < 0) continue;
    const g = groupAt(b, i);
    for (const k of g) seen[k] = 1;
    if (g.length >= 2) out.push(g);
  }
  return out;
}

export function hasMoves(b) {
  const { cols, rows, cells } = b;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] < 0) continue;
    if (i % cols < cols - 1 && cells[i + 1] === cells[i]) return true;
    if (i + cols < rows * cols && cells[i + cols] === cells[i]) return true;
  }
  return false;
}

export const tilesLeft = (b) => b.cells.filter((c) => c >= 0).length;

// Pop the group at i. Returns { board, popped, score } or null if it can't.
export function pop(b, i) {
  const g = groupAt(b, i);
  if (g.length < 2) return null;
  const gone = new Set(g);
  const { cols, rows } = b;
  // Gravity per column, then drop empty columns.
  const columns = [];
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = rows - 1; r >= 0; r--) {
      const k = r * cols + c;
      if (b.cells[k] >= 0 && !gone.has(k)) col.push([b.cells[k], b.ids[k]]);
    }
    if (col.length) columns.push(col);
  }
  const cells = new Array(cols * rows).fill(-1);
  const ids = new Array(cols * rows).fill(-1);
  columns.forEach((col, c) =>
    col.forEach(([color, id], h) => {
      const k = (rows - 1 - h) * cols + c;
      cells[k] = color;
      ids[k] = id;
    }),
  );
  const board = { cols, rows, cells, ids };
  let score = points(g.length);
  if (!columns.length) score += CLEAR_BONUS;
  return { board, popped: g.map((k) => b.ids[k]), score };
}

// A target score for a board: the best of many quick playouts that favour
// big groups and colours that are nearly gone. Deterministic per seed.
export function target(b, { tries = 160, seed = 1 } = {}) {
  const random = mulberry32(seed);
  let best = 0;
  let bestLine = null;
  for (let t = 0; t < tries; t++) {
    let cur = b;
    let total = 0;
    const line = [];
    const greed = 0.5 + random() * 2.5;
    for (;;) {
      const gs = groups(cur);
      if (!gs.length) break;
      // Weight groups: large ones are worth waiting for, so early on prefer
      // small groups of colours with many tiles left (building up big ones).
      const counts = {};
      for (const c of cur.cells) if (c >= 0) counts[c] = (counts[c] || 0) + 1;
      let pick = null;
      let bestW = -Infinity;
      for (const g of gs) {
        const color = cur.cells[g[0]];
        const share = g.length / counts[color];
        const w = share * greed + (g.length === counts[color] ? 2 : 0) - (counts[color] > 8 && g.length < 4 ? 0.2 : 0) + random();
        if (w > bestW) {
          bestW = w;
          pick = g;
        }
      }
      const res = pop(cur, pick[0]);
      total += res.score;
      line.push(pick[0]);
      cur = res.board;
    }
    if (total > best) {
      best = total;
      bestLine = line;
    }
  }
  return { score: best, line: bestLine };
}

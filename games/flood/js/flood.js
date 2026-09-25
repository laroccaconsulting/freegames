// Flood: pick a colour to repaint the region that touches the top-left
// corner; it swallows every neighbour of that colour. Fill the whole board
// in as few moves as you can. Pure (no DOM).
//
// Par comes from a beam search (keep the best few hundred positions at each
// depth, scored by region size and colours left), so it's a very good
// solution but not always the best: beating it scores a Birdie.

import { mulberry32 } from '../core/rng.js';

export function newBoard(n, colors, seed) {
  const random = mulberry32(seed);
  return { n, colors, cells: Array.from({ length: n * n }, () => Math.floor(random() * colors)) };
}

// Cells in the corner region.
export function region(n, cells) {
  const c = cells[0];
  const seen = new Uint8Array(n * n);
  const stack = [0];
  seen[0] = 1;
  const out = [];
  while (stack.length) {
    const i = stack.pop();
    out.push(i);
    const r = Math.floor(i / n);
    const x = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1]) {
      if (j >= 0 && !seen[j] && cells[j] === c) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return out;
}

export function flood(n, cells, color) {
  if (cells[0] === color) return cells;
  const next = cells.slice();
  for (const i of region(n, cells)) next[i] = color;
  return next;
}

export const done = (cells) => cells.every((c) => c === cells[0]);

// Colours touching the region (the only useful moves).
function borderColors(n, cells, reg) {
  const inReg = new Uint8Array(n * n);
  for (const i of reg) inReg[i] = 1;
  const out = new Set();
  for (const i of reg) {
    const r = Math.floor(i / n);
    const x = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1]) if (j >= 0 && !inReg[j]) out.add(cells[j]);
  }
  return [...out];
}

// Beam search: returns the list of colours to play.
export function solve(n, cells, { width = 250, limit = 60 } = {}) {
  let beam = [{ cells, moves: [] }];
  for (let depth = 0; depth < limit; depth++) {
    const next = [];
    const seen = new Set();
    for (const b of beam) {
      const reg = region(n, b.cells);
      for (const c of borderColors(n, b.cells, reg)) {
        const cells2 = flood(n, b.cells, c);
        const moves = [...b.moves, c];
        if (done(cells2)) return moves;
        const reg2 = region(n, cells2);
        let key = reg2.length * 1000003 + c;
        for (const i of reg2) key = (key + i * i * 2654435761) % 4294967296;
        if (seen.has(key)) continue;
        seen.add(key);
        const inReg = new Uint8Array(n * n);
        for (const i of reg2) inReg[i] = 1;
        const colorsLeft = new Set();
        for (let i = 0; i < n * n; i++) if (!inReg[i]) colorsLeft.add(cells2[i]);
        const left = colorsLeft.size;
        next.push({ cells: cells2, moves, score: reg2.length - left * n * 0.9 });
      }
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, width);
  }
  return null;
}

export function levelSpec(level) {
  const n = Math.min(18, 8 + Math.floor((level - 1) / 3));
  const colors = Math.min(6, 4 + Math.floor((level - 1) / 5));
  return { n, colors };
}

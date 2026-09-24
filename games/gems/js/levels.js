// Board generation, backwards from an empty board: each step puts three
// gems of one colour back where a swap would clear them, then undoes that
// swap. Playing the steps forward always clears the board, so every puzzle
// is solvable; the solver then looks for something shorter to set par.
import { mulberry32, shuffle } from '../core/rng.js';
import { hashSeed } from '../core/golf.js';
import { COLS, ROWS, EMPTY, at, findMatches, trySwap } from './rules.js';
import { solve } from './solver.js';

export const LAUNCH_DAY = '2026-09-24';

const STEPS = [
  // [first level, swaps, colours]
  [1, 3, 3],
  [3, 4, 4],
  [6, 5, 4],
  [10, 6, 5],
  [15, 7, 5],
  [21, 8, 5],
  [28, 9, 6],
  [36, 10, 6],
  [46, 12, 6],
];
export function levelSpec(level) {
  const [, swaps, colors] = STEPS.filter((s) => s[0] <= level).at(-1);
  return { swaps, colors };
}
export const DAILY_SPEC = { swaps: 9, colors: 6 };
export const levelSeed = (level) => hashSeed(`gems:level:${level}`);

const toGrid = (cols) => {
  const grid = new Array(ROWS * COLS).fill(EMPTY);
  cols.forEach((col, c) => col.forEach((v, h) => (grid[at(ROWS - 1 - h, c)] = v)));
  return grid;
};

// One backward step. Returns new columns (bottom first) or null.
function unclear(random, cols, colors) {
  const color = Math.floor(random() * colors);
  const heights = cols.map((c) => c.length);
  const options = [];
  for (let x = 0; x < COLS; x++) {
    // Vertical: three in a column, from height h.
    for (let h = 0; h <= heights[x] && heights[x] + 3 <= ROWS; h++) options.push({ kind: 'v', x, h });
    // Horizontal: across columns x..x+2 at height h.
    if (x + 2 < COLS)
      for (let h = 0; h <= Math.min(heights[x], heights[x + 1], heights[x + 2]); h++)
        if ([0, 1, 2].every((k) => heights[x + k] < ROWS)) options.push({ kind: 'h', x, h });
  }
  // Prefer low placements in short columns, so boards stay compact and even.
  const cost = (o) => o.h + (o.kind === 'v' ? heights[o.x] * 0.5 + 1.5 : 0) + random() * 2.5;
  const ranked = options.map((o) => ({ o, cost: cost(o) })).sort((a, b) => a.cost - b.cost);
  for (const { o } of ranked.slice(0, 14)) {
    const next = cols.map((c) => c.slice());
    const placed = [];
    if (o.kind === 'v') {
      next[o.x].splice(o.h, 0, color, color, color);
      for (let k = 0; k < 3; k++) placed.push(at(ROWS - 1 - (o.h + k), o.x));
    } else {
      for (let k = 0; k < 3; k++) {
        next[o.x + k].splice(o.h, 0, color);
        placed.push(at(ROWS - 1 - o.h, o.x + k));
      }
    }
    const after = toGrid(next);
    const before = toGrid(cols);
    // Break the line by swapping one of its gems with a different neighbour.
    for (const g of shuffle(placed.slice(), random)) {
      const r = Math.floor(g / COLS);
      const c = g % COLS;
      const neighbours = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS);
      for (const [rr, cc] of shuffle(neighbours, random)) {
        const n = at(rr, cc);
        if (after[n] === EMPTY || after[n] === color) continue;
        const pre = after.slice();
        [pre[g], pre[n]] = [pre[n], pre[g]];
        if (findMatches(pre).length) continue;
        const res = trySwap(pre, g, n);
        if (!res || res.grid.join() !== before.join()) continue;
        // Keep columns compact: the swapped board must already be settled.
        const settled = pre.every((v, i) => v === EMPTY || i + COLS >= ROWS * COLS || pre[i + COLS] !== EMPTY);
        if (!settled) continue;
        return { cols: gridToCols(pre), swap: [g, n] };
      }
    }
  }
  return null;
}

function gridToCols(grid) {
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = ROWS - 1; r >= 0; r--) if (grid[at(r, c)] !== EMPTY) col.push(grid[at(r, c)]);
    cols.push(col);
  }
  return cols;
}

export function generate(seed, { swaps, colors }) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const random = mulberry32(attempt ? hashSeed(`${seed}:${attempt}`) : seed);
    // The last swap of any clear must move two colours at once: two columns
    // of three side by side, one gem traded between them.
    let cols = Array.from({ length: COLS }, () => []);
    // Boards grow out from this pair, so start it in the middle.
    const x = Math.floor(COLS / 2) - 1 + (random() < 0.5 ? 0 : 1);
    const a = Math.floor(random() * colors);
    const b = (a + 1 + Math.floor(random() * (colors - 1))) % colors;
    const h = Math.floor(random() * 3);
    cols[x] = [a, a, a];
    cols[x + 1] = [b, b, b];
    cols[x][h] = b;
    cols[x + 1][h] = a;
    const plan = [[at(ROWS - 1 - h, x), at(ROWS - 1 - h, x + 1)]];
    let ok = true;
    for (let k = 1; k < swaps; k++) {
      const step = unclear(random, cols, colors);
      if (!step) {
        ok = false;
        break;
      }
      cols = step.cols;
      plan.unshift(step.swap);
    }
    if (!ok) continue;
    const grid = toGrid(cols);
    // The construction is a solution; the solver may find a shorter one.
    const found = solve(grid, { bound: swaps });
    const solution = found.moves && found.moves.length < swaps ? found.moves : plan;
    return { grid, par: solution.length, proven: found.proven, solution, seed };
  }
  throw new Error('could not build a board');
}

// Gems: match-3 puzzle rules. Pure data, no DOM.
//
// The grid is COLS × ROWS, row 0 at the top; -1 is empty. Swapping two
// neighbouring gems is allowed when it makes a line of three or more. Lines
// clear, gems fall, and new lines clear again (a cascade). Nothing refills:
// the goal is to clear the whole board in as few swaps as possible.

export const COLS = 7;
export const ROWS = 8;
export const EMPTY = -1;

export const at = (r, c) => r * COLS + c;
export const rowOf = (i) => Math.floor(i / COLS);
export const colOf = (i) => i % COLS;

export function adjacent(a, b) {
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  return dr + dc === 1;
}

// Every cell that is part of a run of three or more.
export function findMatches(grid) {
  const hit = new Set();
  for (let r = 0; r < ROWS; r++) {
    let start = 0;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && grid[at(r, c)] !== EMPTY && grid[at(r, c)] === grid[at(r, start)];
      if (!same) {
        if (grid[at(r, start)] !== EMPTY && c - start >= 3) for (let k = start; k < c; k++) hit.add(at(r, k));
        start = c;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let start = 0;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && grid[at(r, c)] !== EMPTY && grid[at(r, c)] === grid[at(start, c)];
      if (!same) {
        if (grid[at(start, c)] !== EMPTY && r - start >= 3) for (let k = start; k < r; k++) hit.add(at(k, c));
        start = r;
      }
    }
  }
  return [...hit];
}

// Gems drop to the bottom of their column. Returns the moves for animation.
export function gravity(grid) {
  const next = grid.slice();
  const falls = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const v = grid[at(r, c)];
      if (v === EMPTY) continue;
      if (write !== r) falls.push({ from: at(r, c), to: at(write, c) });
      next[at(write, c)] = v;
      write--;
    }
    for (let r = write; r >= 0; r--) next[at(r, c)] = EMPTY;
  }
  return { grid: next, falls };
}

// Clears lines and lets gems fall until nothing matches.
// Returns the final grid and each step (for animating a cascade).
export function resolve(grid) {
  const steps = [];
  let g = grid;
  for (;;) {
    const cleared = findMatches(g);
    if (!cleared.length) break;
    const colors = cleared.map((i) => g[i]);
    const emptied = g.slice();
    for (const i of cleared) emptied[i] = EMPTY;
    const fall = gravity(emptied);
    steps.push({ cleared, colors, falls: fall.falls });
    g = fall.grid;
  }
  return { grid: g, steps };
}

// Tries a swap. Returns null if it isn't allowed.
export function trySwap(grid, a, b) {
  if (!adjacent(a, b) || grid[a] === EMPTY || grid[b] === EMPTY || grid[a] === grid[b]) return null;
  const swapped = grid.slice();
  [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
  const res = resolve(swapped);
  if (!res.steps.length) return null;
  return res;
}

// Every allowed swap, each once (right and down neighbours).
export function validSwaps(grid) {
  const out = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    if (grid[i] === EMPTY) continue;
    const r = rowOf(i);
    const c = colOf(i);
    if (c + 1 < COLS && trySwap(grid, i, i + 1)) out.push([i, i + 1]);
    if (r + 1 < ROWS && trySwap(grid, i, i + COLS)) out.push([i, i + COLS]);
  }
  return out;
}

export const isCleared = (grid) => grid.every((v) => v === EMPTY);
export const gemsLeft = (grid) => grid.filter((v) => v !== EMPTY).length;

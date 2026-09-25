// Tiles: the classic sliding number puzzle. Put the tiles in order with the
// gap in the bottom-right corner. Pure functions (no DOM).
//
// A board is { n, tiles } where tiles[r * n + c] is a number 1..n²-1, or 0
// for the gap. Tapping a tile in line with the gap slides it (and every tile
// between) toward the gap; each tile that moves counts as one move.
//
// Par is the true fewest moves, found with IDA* (Manhattan distance plus
// linear conflicts). Boards are scrambled with a seeded random walk and
// re-rolled until the solver finishes within its budget, so every board's
// par is exact.

import { mulberry32 } from '../core/rng.js';

export const goal = (n) => Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? 0 : i + 1));
export const isSolved = ({ n, tiles }) => tiles.every((t, i) => t === (i === n * n - 1 ? 0 : i + 1));

// Tiles that would move if index i were tapped (nearest the gap first), or [].
export function slideLine({ n, tiles }, i) {
  const g = tiles.indexOf(0);
  const [gr, gc] = [Math.floor(g / n), g % n];
  const [r, c] = [Math.floor(i / n), i % n];
  if (i === g || (r !== gr && c !== gc)) return [];
  const step = r === gr ? (c > gc ? 1 : -1) : c === gc ? (r > gr ? n : -n) : 0;
  const out = [];
  for (let k = g + step; ; k += step) {
    out.push(k);
    if (k === i) break;
  }
  return out;
}

// Tap tile i: { board, moved: [[from, to], ...] } or null if it can't move.
export function tap(board, i) {
  const line = slideLine(board, i);
  if (!line.length) return null;
  const tiles = board.tiles.slice();
  let gap = tiles.indexOf(0);
  const moved = [];
  for (const k of line) {
    moved.push([k, gap]);
    tiles[gap] = tiles[k];
    tiles[k] = 0;
    gap = k;
  }
  return { board: { n: board.n, tiles }, moved };
}

// Solvable iff (for odd n) inversions are even; (even n) inversions + gap row from bottom is odd.
export function isSolvable({ n, tiles }) {
  const list = tiles.filter((t) => t);
  let inv = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (list[i] > list[j]) inv++;
  if (n % 2) return inv % 2 === 0;
  const rowFromBottom = n - Math.floor(tiles.indexOf(0) / n);
  return (inv + rowFromBottom) % 2 === 1;
}

// ---------- Solver (IDA*) ----------

// Length of the longest increasing run of goal positions: tiles outside it
// must step out of their line and back, two extra moves each.
function lisLength(a) {
  const tails = [];
  for (const x of a) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

function lineConflict(t, n, line, row) {
  const own = [];
  for (let k = 0; k < n; k++) {
    const idx = row ? line * n + k : k * n + line;
    const v = t[idx];
    if (!v) continue;
    const g = v - 1;
    if (row ? Math.floor(g / n) === line : g % n === line) own.push(row ? g % n : Math.floor(g / n));
  }
  return 2 * (own.length - lisLength(own));
}

export function heuristic({ n, tiles }) {
  let h = 0;
  for (let i = 0; i < tiles.length; i++) {
    const v = tiles[i];
    if (v) h += Math.abs(Math.floor(i / n) - Math.floor((v - 1) / n)) + Math.abs((i % n) - ((v - 1) % n));
  }
  for (let k = 0; k < n; k++) h += lineConflict(tiles, n, k, true) + lineConflict(tiles, n, k, false);
  return h;
}

class Budget extends Error {}

// Fewest single-tile moves as a list of tile indices to tap (each moves one
// tile into the gap), or null if the search needs more than `limit` nodes.
export function solve(board, { limit = 3_000_000 } = {}) {
  const { n } = board;
  const t = Uint8Array.from(board.tiles);
  let gap = board.tiles.indexOf(0);
  const rowC = new Int8Array(n);
  const colC = new Int8Array(n);
  let md = 0;
  for (let i = 0; i < t.length; i++) {
    const v = t[i];
    if (v) md += Math.abs(Math.floor(i / n) - Math.floor((v - 1) / n)) + Math.abs((i % n) - ((v - 1) % n));
  }
  for (let k = 0; k < n; k++) {
    rowC[k] = lineConflict(t, n, k, true);
    colC[k] = lineConflict(t, n, k, false);
  }
  const lc = () => {
    let s = 0;
    for (let k = 0; k < n; k++) s += rowC[k] + colC[k];
    return s;
  };
  let nodes = 0;
  const path = [];
  const DIRS = [-n, n, -1, 1];

  function dfs(g, bound, last) {
    const h = md + lc();
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) return -1;
    if (++nodes > limit) throw new Budget();
    let min = Infinity;
    for (const d of DIRS) {
      if (d === -last) continue;
      const from = gap + d;
      if (from < 0 || from >= t.length) continue;
      if ((d === -1 || d === 1) && Math.floor(from / n) !== Math.floor(gap / n)) continue;
      // Move tile at `from` into the gap.
      const v = t[from];
      const goalR = Math.floor((v - 1) / n);
      const goalC = (v - 1) % n;
      const before = Math.abs(Math.floor(from / n) - goalR) + Math.abs((from % n) - goalC);
      const after = Math.abs(Math.floor(gap / n) - goalR) + Math.abs((gap % n) - goalC);
      const oldGap = gap;
      t[oldGap] = v;
      t[from] = 0;
      gap = from;
      md += after - before;
      // Only the lines the tile left and entered change their conflicts.
      const vertical = d === -n || d === n;
      const a = vertical ? Math.floor(from / n) : from % n;
      const b = vertical ? Math.floor(oldGap / n) : oldGap % n;
      const ca = vertical ? rowC[a] : colC[a];
      const cb = vertical ? rowC[b] : colC[b];
      if (vertical) {
        rowC[a] = lineConflict(t, n, a, true);
        rowC[b] = lineConflict(t, n, b, true);
      } else {
        colC[a] = lineConflict(t, n, a, false);
        colC[b] = lineConflict(t, n, b, false);
      }
      path.push(from);
      const r = dfs(g + 1, bound, d);
      if (r === -1) return -1;
      path.pop();
      if (vertical) {
        rowC[a] = ca;
        rowC[b] = cb;
      } else {
        colC[a] = ca;
        colC[b] = cb;
      }
      md -= after - before;
      gap = oldGap;
      t[from] = v;
      t[oldGap] = 0;
      if (r < min) min = r;
    }
    return min;
  }

  try {
    let bound = md + lc();
    for (;;) {
      const r = dfs(0, bound, 0);
      if (r === -1) return path.slice();
      if (r === Infinity) return null;
      bound = r;
    }
  } catch (e) {
    if (e instanceof Budget) return null;
    throw e;
  }
}

// ---------- Making boards ----------

function walk(n, steps, random) {
  const tiles = goal(n);
  let gap = n * n - 1;
  let last = 0;
  for (let s = 0; s < steps; s++) {
    const options = [-n, n, -1, 1].filter((d) => {
      if (d === -last) return false;
      const to = gap + d;
      if (to < 0 || to >= n * n) return false;
      return !((d === -1 || d === 1) && Math.floor(to / n) !== Math.floor(gap / n));
    });
    const d = options[Math.floor(random() * options.length)];
    tiles[gap] = tiles[gap + d];
    tiles[gap + d] = 0;
    gap += d;
    last = d;
  }
  return tiles;
}

// Walk length for a level: short at first, then fully scrambled.
export function levelSteps(n, level) {
  if (n === 3) return Math.min(200, 10 + level * 8);
  return Math.min(180, 12 + level * 5);
}

// A board from a seed: { board, par }. Deterministic for the same arguments.
export function generate(seed, n, steps, { limit = 2_500_000 } = {}) {
  const random = mulberry32(seed);
  let len = steps;
  for (let tries = 0; tries < 40; tries++) {
    const board = { n, tiles: walk(n, len, random) };
    if (isSolved(board)) continue;
    const moves = solve(board, { limit });
    if (moves && moves.length >= 2) return { board, par: moves.length };
    if (!moves) len = Math.max(10, Math.floor(len * 0.85));
  }
  // Unreachable in practice: a short walk always solves quickly.
  const board = { n, tiles: walk(n, 12, random) };
  return { board, par: solve(board).length };
}

export const levelSeed = (n, level) => 0x7113 * n + level * 104729;

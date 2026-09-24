// Blocks: 8×8 block puzzle rules. Pure data, no DOM.
//
// The board is 64 cells, row by row: 0 is empty, otherwise a colour + 1.
// Pieces are placed whole; any full row or column clears. The game ends when
// none of the pieces in hand fit anywhere.
import { mulberry32 } from '../core/rng.js';
import { hashSeed } from '../core/golf.js';

export const SIZE = 8;

// [cells as [row, col], weight, colour]
const RAW = [
  ['#', 3, 0],
  ['##', 4, 1], ['#|#', 4, 1],
  ['###', 4, 2], ['#|#|#', 4, 2],
  ['####', 3, 3], ['#|#|#|#', 3, 3],
  ['#####', 2, 4], ['#|#|#|#|#', 2, 4],
  ['##|##', 5, 5],
  ['###|###|###', 2, 6],
  ['###|###', 2, 7], ['##|##|##', 2, 7],
  ['##|#.', 3, 0], ['##|.#', 3, 0], ['#.|##', 3, 0], ['.#|##', 3, 0],
  ['#.|#.|##', 2, 1], ['.#|.#|##', 2, 1], ['##|#.|#.', 2, 1], ['##|.#|.#', 2, 1],
  ['###|#..', 2, 2], ['###|..#', 2, 2], ['#..|###', 2, 2], ['..#|###', 2, 2],
  ['###|.#.', 2, 3], ['.#.|###', 2, 3], ['#.|##|#.', 2, 3], ['.#|##|.#', 2, 3],
  ['##.|.##', 2, 4], ['.##|##.', 2, 4], ['#.|##|.#', 2, 4], ['.#|##|#.', 2, 4],
  ['###|#..|#..', 1, 5], ['###|..#|..#', 1, 5], ['#..|#..|###', 1, 5], ['..#|..#|###', 1, 5],
];

export const PIECES = RAW.map(([pattern, weight, color], id) => {
  const cells = [];
  pattern.split('|').forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && cells.push([r, c])));
  const h = Math.max(...cells.map(([r]) => r)) + 1;
  const w = Math.max(...cells.map(([, c]) => c)) + 1;
  return { id, cells, h, w, weight, color };
});
const TOTAL = PIECES.reduce((s, p) => s + p.weight, 0);

// The n-th piece of a game: depends only on the seed and n, so every player
// of a daily game gets the same pieces in the same order.
export function pieceAt(seed, n) {
  let x = mulberry32(hashSeed(`${seed}:${n}`))() * TOTAL;
  for (const p of PIECES) if ((x -= p.weight) < 0) return p.id;
  return 0;
}

export const emptyBoard = () => new Array(SIZE * SIZE).fill(0);

export function canPlace(board, piece, row, col) {
  if (row < 0 || col < 0 || row + piece.h > SIZE || col + piece.w > SIZE) return false;
  return piece.cells.every(([r, c]) => !board[(row + r) * SIZE + col + c]);
}

export function fitsAnywhere(board, piece) {
  for (let r = 0; r + piece.h <= SIZE; r++) for (let c = 0; c + piece.w <= SIZE; c++) if (canPlace(board, piece, r, c)) return true;
  return false;
}

// Rows and columns that would be full with these cells filled.
export function fullLines(board) {
  const rows = [];
  const cols = [];
  for (let i = 0; i < SIZE; i++) {
    let row = true;
    let col = true;
    for (let j = 0; j < SIZE; j++) {
      if (!board[i * SIZE + j]) row = false;
      if (!board[j * SIZE + i]) col = false;
    }
    if (row) rows.push(i);
    if (col) cols.push(i);
  }
  return { rows, cols };
}

// Points: one per block placed, plus 10 × lines² for lines cleared together,
// multiplied by the streak (placements in a row that each clear something).
export function points(cells, lines, streak) {
  if (!lines) return cells;
  return cells + 10 * lines * lines * (1 + Math.min(streak, 5));
}

// Places a piece. Returns the new board, the cells that cleared and points.
export function place(board, piece, row, col, streak = 0) {
  if (!canPlace(board, piece, row, col)) return null;
  const next = board.slice();
  for (const [r, c] of piece.cells) next[(row + r) * SIZE + col + c] = piece.color + 1;
  const { rows, cols } = fullLines(next);
  const cleared = new Set();
  for (const r of rows) for (let j = 0; j < SIZE; j++) cleared.add(r * SIZE + j);
  for (const c of cols) for (let j = 0; j < SIZE; j++) cleared.add(j * SIZE + c);
  for (const i of cleared) next[i] = 0;
  const lines = rows.length + cols.length;
  const newStreak = lines ? streak + 1 : 0;
  return { board: next, rows, cols, cleared: [...cleared], lines, streak: newStreak, points: points(piece.cells.length, lines, streak) };
}

// Zen mode: when stuck, clear the fullest row and column.
export function sweep(board) {
  let bestRow = 0;
  let bestCol = 0;
  const rowCount = (r) => board.slice(r * SIZE, r * SIZE + SIZE).filter(Boolean).length;
  const colCount = (c) => board.filter((v, i) => v && i % SIZE === c).length;
  for (let i = 1; i < SIZE; i++) {
    if (rowCount(i) > rowCount(bestRow)) bestRow = i;
    if (colCount(i) > colCount(bestCol)) bestCol = i;
  }
  const cleared = [];
  for (let j = 0; j < SIZE; j++) cleared.push(bestRow * SIZE + j, j * SIZE + bestCol);
  const next = board.slice();
  for (const i of cleared) next[i] = 0;
  return { board: next, cleared: [...new Set(cleared)], rows: [bestRow], cols: [bestCol] };
}

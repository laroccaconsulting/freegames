// Reversi: the rules. Pure functions, no DOM. Players are 1 (dark, moves
// first) and 2 (light). A move places a disc that brackets a line of the
// opponent's discs, which flip. With no legal move you pass; when neither
// player can move, the one with more discs wins.
//
// A state is { cells: 64 numbers (0 empty, 1, 2), turn, moves: [index | -1 for a pass], winner }
// winner: null while playing, 1 or 2, or 0 for a draw.

export const N = 8;
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

export function newGame() {
  const cells = new Array(64).fill(0);
  cells[27] = cells[36] = 2;
  cells[28] = cells[35] = 1;
  return { cells, turn: 1, moves: [], winner: null };
}

// The discs a move at i would flip for player p ([] if it is not legal).
export function flips(cells, i, p) {
  if (cells[i] !== 0) return [];
  const q = 3 - p;
  const out = [];
  for (const d of DIRS) {
    const line = [];
    let j = i;
    for (;;) {
      const col = j % N;
      j += d;
      if (j < 0 || j >= 64) break;
      // Stop at the edge: a step must not wrap round to the other side.
      if (Math.abs((j % N) - col) > 1) break;
      if (cells[j] === q) line.push(j);
      else {
        if (cells[j] === p && line.length) out.push(...line);
        break;
      }
    }
  }
  return out;
}

export function legalMoves(s, p = s.turn) {
  if (s.winner != null) return [];
  const out = [];
  for (let i = 0; i < 64; i++) if (s.cells[i] === 0 && flips(s.cells, i, p).length) out.push(i);
  return out;
}

export const count = (cells, p) => cells.reduce((n, v) => n + (v === p), 0);

function settle(s) {
  if (legalMoves(s).length) return s;
  const other = { ...s, turn: 3 - s.turn };
  if (legalMoves(other).length) return { ...other, moves: [...s.moves, -1] }; // a forced pass
  const a = count(s.cells, 1);
  const b = count(s.cells, 2);
  return { ...s, winner: a > b ? 1 : b > a ? 2 : 0 };
}

export function applyMove(s, i) {
  const f = flips(s.cells, i, s.turn);
  if (s.winner != null || !f.length) throw new Error(`illegal move ${i}`);
  const cells = s.cells.slice();
  cells[i] = s.turn;
  for (const j of f) cells[j] = s.turn;
  return settle({ cells, turn: 3 - s.turn, moves: [...s.moves, i], winner: null });
}

// Rebuilds a game from its moves (passes are implied and skipped).
export function replay(moves) {
  let s = newGame();
  for (const m of moves) if (m >= 0) s = applyMove(s, m);
  return s;
}

export const name = (i) => `${'abcdefgh'[i % N]}${Math.floor(i / N) + 1}`;

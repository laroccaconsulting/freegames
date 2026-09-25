// Four in a Row: the rules. Pure functions, no DOM, so the game, the bot and
// the tests share them. Discs drop to the lowest empty cell of a column; the
// first to line up four (across, up or diagonally) wins.
//
// A state is plain data (it is saved to localStorage as JSON):
//   { cols, rows, cells, turn, moves, winner, line }
// cells[c * rows + r] is 0 (empty), 1 or 2, with r = 0 the bottom row.
// winner is null while playing, 1 or 2 for a win, 0 for a draw.

export const SIZES = {
  classic: { cols: 7, rows: 6 },
  big: { cols: 9, rows: 7 },
};

export function newGame({ cols = 7, rows = 6, first = 1 } = {}) {
  return { cols, rows, cells: new Array(cols * rows).fill(0), turn: first, moves: [], winner: null, line: null };
}

export const at = (s, c, r) => (c < 0 || c >= s.cols || r < 0 || r >= s.rows ? -1 : s.cells[c * s.rows + r]);
export const other = (p) => 3 - p;

// Row the next disc in column c lands on, or -1 if the column is full.
export function dropRow(s, c) {
  if (c < 0 || c >= s.cols) return -1;
  for (let r = 0; r < s.rows; r++) if (s.cells[c * s.rows + r] === 0) return r;
  return -1;
}

export function legalColumns(s) {
  if (s.winner != null) return [];
  const out = [];
  for (let c = 0; c < s.cols; c++) if (dropRow(s, c) >= 0) out.push(c);
  return out;
}

export const isLegal = (s, c) => s.winner == null && Number.isInteger(c) && dropRow(s, c) >= 0;

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

// The cells of a line of four or more through (c, r) for player p, or null.
export function lineThrough(s, c, r, p) {
  for (const [dc, dr] of DIRS) {
    const cells = [[c, r]];
    for (let k = 1; at(s, c + dc * k, r + dr * k) === p; k++) cells.push([c + dc * k, r + dr * k]);
    for (let k = 1; at(s, c - dc * k, r - dr * k) === p; k++) cells.unshift([c - dc * k, r - dr * k]);
    if (cells.length >= 4) return cells;
  }
  return null;
}

export function applyMove(s, c) {
  if (!isLegal(s, c)) throw new Error(`illegal move ${c}`);
  const r = dropRow(s, c);
  const cells = s.cells.slice();
  cells[c * s.rows + r] = s.turn;
  const next = { ...s, cells, moves: [...s.moves, c], turn: other(s.turn), winner: null, line: null };
  const line = lineThrough(next, c, r, s.turn);
  if (line) {
    next.winner = s.turn;
    next.line = line;
  } else if (next.moves.length === s.cols * s.rows) next.winner = 0;
  return next;
}

// Would a disc of player p at (c, r) make four? The cell must be empty.
export function wouldWin(s, c, r, p) {
  if (at(s, c, r) !== 0) return false;
  const cells = s.cells.slice();
  cells[c * s.rows + r] = p;
  return !!lineThrough({ ...s, cells }, c, r, p);
}

// Columns where the player to move (or `p`) wins at once.
export function winningColumns(s, p = s.turn) {
  if (s.winner != null) return [];
  return legalColumns(s).filter((c) => wouldWin(s, c, dropRow(s, c), p));
}

// Every empty cell that would complete four for someone: [{ c, r, p }].
// "Threats" are what good play is about; the game can show them.
export function threats(s) {
  const out = [];
  for (let c = 0; c < s.cols; c++)
    for (let r = dropRow(s, c); r >= 0 && r < s.rows; r++)
      for (const p of [1, 2]) if (wouldWin(s, c, r, p)) out.push({ c, r, p });
  return out;
}

export function replay({ cols, rows, first }, moves) {
  let s = newGame({ cols, rows, first });
  for (const c of moves) s = applyMove(s, c);
  return s;
}

export function isValidState(s) {
  try {
    if (!s || !Number.isInteger(s.cols) || !Number.isInteger(s.rows) || !Array.isArray(s.moves)) return false;
    if (s.cols < 4 || s.cols > 12 || s.rows < 4 || s.rows > 12) return false;
    const first = s.moves.length % 2 === 0 ? s.turn : other(s.turn);
    const again = replay({ cols: s.cols, rows: s.rows, first }, s.moves);
    return again.cells.every((v, i) => v === s.cells[i]) && again.winner === s.winner && again.turn === s.turn;
  } catch {
    return false;
  }
}

// Checkers (American rules): the rules. Pure (no DOM).
//
// An 8×8 board; pieces sit on dark squares. cells[r * 8 + c]:
//   0 empty, 1 dark man, 2 dark king, -1 light man, -2 light king.
// Dark moves first, up the board (toward row 0). Captures are compulsory,
// multi-jumps continue, and a man that reaches the far row is crowned
// (which ends its move). No captures for 40 moves each is a draw.

export const DARK = 1;
export const LIGHT = -1;

export function newGame() {
  const cells = new Array(64).fill(0);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) cells[r * 8 + c] = LIGHT;
      else if (r > 4) cells[r * 8 + c] = DARK;
    }
  return { cells, turn: DARK, quiet: 0, moves: [], winner: null };
}

const side = (v) => Math.sign(v);
const isKing = (v) => Math.abs(v) === 2;
const on = (r, c) => r >= 0 && c >= 0 && r < 8 && c < 8;
const dirsFor = (v) => (isKing(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : side(v) === DARK ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);

// All jump sequences from square i for piece v: [{ path: [squares...], captures: [...] }].
function jumps(cells, i, v, taken = []) {
  const r = Math.floor(i / 8);
  const c = i % 8;
  const out = [];
  for (const [dr, dc] of dirsFor(v)) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (!on(lr, lc)) continue;
    const mid = mr * 8 + mc;
    const land = lr * 8 + lc;
    if (side(cells[mid]) !== -side(v) || taken.includes(mid) || cells[land] !== 0) continue;
    const crowned = !isKing(v) && (side(v) === DARK ? lr === 0 : lr === 7);
    const further = crowned ? [] : jumps(cells, land, v, [...taken, mid]);
    if (further.length) for (const f of further) out.push({ path: [land, ...f.path], captures: [mid, ...f.captures] });
    else out.push({ path: [land], captures: [mid] });
  }
  return out;
}

// Legal moves for the player to move: [{ from, path, captures }].
export function legalMoves(s) {
  if (s.winner != null) return [];
  const caps = [];
  const steps = [];
  // Jumps look up the pieces on a board where the mover has left its square.
  for (let i = 0; i < 64; i++) {
    const v = s.cells[i];
    if (side(v) !== s.turn) continue;
    const board = s.cells.slice();
    board[i] = 0;
    for (const j of jumps(board, i, v)) caps.push({ from: i, ...j });
    const r = Math.floor(i / 8);
    const c = i % 8;
    for (const [dr, dc] of dirsFor(v)) if (on(r + dr, c + dc) && s.cells[(r + dr) * 8 + c + dc] === 0) steps.push({ from: i, path: [(r + dr) * 8 + c + dc], captures: [] });
  }
  return caps.length ? caps : steps;
}

export function applyMove(s, m) {
  const cells = s.cells.slice();
  let v = cells[m.from];
  cells[m.from] = 0;
  for (const x of m.captures) cells[x] = 0;
  const to = m.path[m.path.length - 1];
  const row = Math.floor(to / 8);
  if (!isKing(v) && ((side(v) === DARK && row === 0) || (side(v) === LIGHT && row === 7))) v *= 2;
  cells[to] = v;
  const next = { cells, turn: -s.turn, quiet: m.captures.length || !isKing(s.cells[m.from]) ? 0 : s.quiet + 1, moves: [...s.moves, m], winner: null };
  if (!legalMoves(next).length) next.winner = s.turn;
  else if (next.quiet >= 80) next.winner = 0;
  return next;
}

export const sameMove = (a, b) => a.from === b.from && a.path.length === b.path.length && a.path.every((x, k) => x === b.path[k]);

export function replay(moves) {
  let s = newGame();
  for (const m of moves) {
    const legal = legalMoves(s).find((x) => sameMove(x, m));
    if (!legal) throw new Error('bad move in replay');
    s = applyMove(s, legal);
  }
  return s;
}

export const count = (cells, who) => cells.filter((v) => side(v) === who).length;
export const squareName = (i) => `${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}`;

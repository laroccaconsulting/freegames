// The bot that sets the daily target. It plays each hand greedily, trying
// all three piece orders and keeping the board open (few holes, room for
// big pieces). It is decent, not perfect: beating it is the challenge.
import { SIZE, PIECES, canPlace, place, fitsAnywhere, pieceAt } from './rules.js';

const BIG = [PIECES.find((p) => p.w === 3 && p.h === 3 && p.cells.length === 9), PIECES.find((p) => p.w === 5), PIECES.find((p) => p.h === 5)];

// Higher is better: an open, tidy board.
export function evaluate(board) {
  let score = 0;
  let empty = 0;
  let holes = 0;
  let edges = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      if (board[i]) continue;
      empty++;
      let walls = 0;
      if (r === 0 || board[i - SIZE]) walls++;
      if (r === SIZE - 1 || board[i + SIZE]) walls++;
      if (c === 0 || board[i - 1]) walls++;
      if (c === SIZE - 1 || board[i + 1]) walls++;
      if (walls >= 3) holes++;
      edges += walls;
    }
  }
  score += empty * 2 - holes * 12 - edges * 0.6;
  for (const p of BIG) if (fitsAnywhere(board, p)) score += 18;
  return score;
}

export function bestPlacement(board, piece, streak) {
  let best = null;
  for (let r = 0; r + piece.h <= SIZE; r++) {
    for (let c = 0; c + piece.w <= SIZE; c++) {
      if (!canPlace(board, piece, r, c)) continue;
      const res = place(board, piece, r, c, streak);
      const value = res.points * 1.5 + evaluate(res.board);
      if (!best || value > best.value) best = { r, c, res, value };
    }
  }
  return best;
}

const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

// Plays a whole game of `count` pieces (or until stuck).
// Returns { score, complete } where complete means every piece was placed.
export function botScore(seed, count) {
  let board = new Array(SIZE * SIZE).fill(0);
  let streak = 0;
  let score = 0;
  for (let n = 0; n < count; n += 3) {
    const hand = [0, 1, 2].map((k) => PIECES[pieceAt(seed, n + k)]).slice(0, Math.min(3, count - n));
    let bestRun = null;
    for (const order of ORDERS) {
      if (order.some((k) => k >= hand.length)) continue;
      let b = board;
      let s = streak;
      let pts = 0;
      let ok = true;
      for (const k of order) {
        const move = bestPlacement(b, hand[k], s);
        if (!move) {
          ok = false;
          break;
        }
        b = move.res.board;
        s = move.res.streak;
        pts += move.res.points;
      }
      if (!ok) continue;
      const value = pts * 1.5 + evaluate(b);
      if (!bestRun || value > bestRun.value) bestRun = { value, board: b, streak: s, pts };
    }
    if (!bestRun) return { score, complete: false };
    board = bestRun.board;
    streak = bestRun.streak;
    score += bestRun.pts;
  }
  return { score, complete: true };
}

// The best single move for a hand, for hints.
export function bestMove(board, hand, streak) {
  let best = null;
  hand.forEach((id, slot) => {
    if (id == null) return;
    const move = bestPlacement(board, PIECES[id], streak);
    if (move && (!best || move.value > best.value)) best = { slot, row: move.r, col: move.c, value: move.value };
  });
  return best;
}

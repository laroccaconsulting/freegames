// Reversi: the computer player and hint explainer. Pure (no DOM).
// Negamax with alpha-beta and iterative deepening. The evaluation weighs
// squares (corners good, the squares next to them bad), mobility (having more
// moves than the opponent) and, near the end, discs. Hard plays the last
// dozen moves perfectly.

import { flips, legalMoves, applyMove, count, name } from './engine.js';

export const LEVELS = ['easy', 'medium', 'hard'];

const W = [
  120, -25, 20, 5, 5, 20, -25, 120,
  -25, -45, -4, -4, -4, -4, -45, -25,
  20, -4, 12, 2, 2, 12, -4, 20,
  5, -4, 2, 1, 1, 2, -4, 5,
  5, -4, 2, 1, 1, 2, -4, 5,
  20, -4, 12, 2, 2, 12, -4, 20,
  -25, -45, -4, -4, -4, -4, -45, -25,
  120, -25, 20, 5, 5, 20, -25, 120,
];
const CORNERS = [0, 7, 56, 63];
// The squares diagonally inside each corner, and the corner they give away.
const X_SQUARES = { 9: 0, 14: 7, 49: 56, 54: 63 };
const C_SQUARES = { 1: 0, 8: 0, 6: 7, 15: 7, 48: 56, 57: 56, 55: 63, 62: 63 };

function movesFor(cells, p) {
  const out = [];
  for (let i = 0; i < 64; i++) if (cells[i] === 0 && flips(cells, i, p).length) out.push(i);
  return out;
}

// Score for player p.
export function evaluate(cells, p) {
  const q = 3 - p;
  let empties = 0;
  let pos = 0;
  for (let i = 0; i < 64; i++) {
    const v = cells[i];
    if (!v) {
      empties++;
      continue;
    }
    let w = W[i];
    // Squares next to a corner stop being dangerous once the corner is taken.
    const corner = X_SQUARES[i] ?? C_SQUARES[i];
    if (corner !== undefined && cells[corner]) w = 5;
    pos += v === p ? w : -w;
  }
  const mp = movesFor(cells, p).length;
  const mq = movesFor(cells, q).length;
  const mobility = mp + mq ? (100 * (mp - mq)) / (mp + mq + 2) : 0;
  const discs = count(cells, p) - count(cells, q);
  const late = empties < 16 ? (16 - empties) * 1.5 : 0;
  return pos + mobility * 1.2 + discs * late;
}

class Timeout extends Error {}

function search(cells, p, depth, alpha, beta, ctx, passed = false) {
  if ((++ctx.nodes & 1023) === 0 && ctx.deadline && Date.now() > ctx.deadline) throw new Timeout();
  const moves = movesFor(cells, p);
  const q = 3 - p;
  if (!moves.length) {
    if (passed) {
      const d = count(cells, p) - count(cells, q);
      return d * 10000; // game over: exact
    }
    return -search(cells, q, depth, -beta, -alpha, ctx, true);
  }
  if (depth <= 0) return evaluate(cells, p);
  // Corners first, then by square weight.
  moves.sort((a, b) => W[b] - W[a]);
  let best = -Infinity;
  for (const m of moves) {
    const f = flips(cells, m, p);
    cells[m] = p;
    for (const j of f) cells[j] = p;
    const v = -search(cells, q, depth - 1, -beta, -alpha, ctx);
    cells[m] = 0;
    for (const j of f) cells[j] = q;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// Scores every legal move for the player to move, searching `depth` deep.
function scoreMoves(s, depth, ctx) {
  const cells = s.cells.slice();
  const p = s.turn;
  const out = new Map();
  for (const m of legalMoves(s)) {
    const f = flips(cells, m, p);
    cells[m] = p;
    for (const j of f) cells[j] = p;
    out.set(m, -search(cells, 3 - p, depth - 1, -Infinity, Infinity, ctx));
    cells[m] = 0;
    for (const j of f) cells[j] = 3 - p;
  }
  return out;
}

export function analyse(s, { timeMs = 800, maxDepth = 60 } = {}) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  const empties = s.cells.filter((v) => !v).length;
  const ctx = { nodes: 0, deadline: Date.now() + timeMs };
  let result = { scores: new Map(moves.map((m) => [m, 0])), depth: 0 };
  for (let d = 1; d <= Math.min(maxDepth, empties); d++) {
    try {
      result = { scores: scoreMoves(s, d, ctx), depth: d };
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  const best = [...result.scores].sort((a, b) => b[1] - a[1])[0];
  return { move: best[0], score: best[1], scores: result.scores, depth: result.depth, exact: result.depth >= empties };
}

export function chooseMove(s, level = 'medium', { timeMs = 900, random = Math.random, maxDepth = null } = {}) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (level === 'easy') {
    // Grabs the move that flips the most, with a bit of chance; takes corners.
    const corner = moves.find((m) => CORNERS.includes(m));
    if (corner !== undefined && random() < 0.8) return corner;
    const scored = moves.map((m) => [m, flips(s.cells, m, s.turn).length + random() * 3]);
    return scored.sort((a, b) => b[1] - a[1])[0][0];
  }
  if (level === 'medium') {
    const ctx = { nodes: 0, deadline: 0 };
    const scores = scoreMoves(s, maxDepth ?? 3, ctx);
    const top = Math.max(...scores.values());
    const ties = [...scores].filter(([, v]) => v >= top - 4).map(([m]) => m);
    return ties[Math.floor(random() * ties.length)];
  }
  return analyse(s, { timeMs, maxDepth: maxDepth ?? 60 }).move;
}

// { move, text } for the player to move.
export function explain(s, result) {
  const m = result?.move ?? legalMoves(s)[0];
  const n = flips(s.cells, m, s.turn).length;
  const after = applyMove(s, m);
  const theirMoves = after.winner == null && after.turn !== s.turn ? legalMoves(after).length : 0;
  const giveCorner = after.turn !== s.turn && legalMoves(after).some((x) => CORNERS.includes(x));
  const where = name(m);
  let text;
  if (CORNERS.includes(m)) text = `Play ${where}: a corner can never be flipped back, and it anchors the edges.`;
  else if (result?.exact && result.score > 0) text = `Play ${where}: counting to the end, this wins by ${Math.round(result.score / 10000)} discs with best play.`;
  else if (after.turn === s.turn && after.winner == null) text = `Play ${where}: your opponent has no reply and must pass.`;
  else if (theirMoves <= 2) text = `Play ${where}: it leaves your opponent only ${theirMoves} move${theirMoves === 1 ? '' : 's'}, all of them poor.`;
  else if (n <= 2) text = `Play ${where}: it flips just ${n}. Flipping few discs early keeps your opponent short of moves.`;
  else text = `Play ${where}: it flips ${n} and keeps you safe on the edges.`;
  if (giveCorner) text += ' Careful: it does let them reach a corner.';
  else {
    const risky = legalMoves(s).filter((x) => X_SQUARES[x] !== undefined && !s.cells[X_SQUARES[x]]);
    if (risky.length && !risky.includes(m)) text += ` Avoid ${risky.map(name).join(' and ')}: next to an empty corner, it hands the corner over.`;
  }
  return { move: m, text };
}

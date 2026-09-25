// Checkers: the computer and the hint explainer. Pure (no DOM).
// Negamax with alpha-beta and iterative deepening. The evaluation counts
// material (kings worth more), advancement, the centre and a guarded back row.

import { legalMoves, applyMove, squareName } from './engine.js';

export const LEVELS = ['easy', 'medium', 'hard'];

export function evaluate(s) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const v = s.cells[i];
    if (!v) continue;
    const who = Math.sign(v);
    const r = Math.floor(i / 8);
    const c = i % 8;
    let val = Math.abs(v) === 2 ? 170 : 100;
    if (Math.abs(v) === 1) val += who === 1 ? (7 - r) * 4 : r * 4; // advance
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) val += 6; // centre
    if (Math.abs(v) === 1 && ((who === 1 && r === 7) || (who === -1 && r === 0))) val += 8; // back row guard
    score += who * val;
  }
  return score * s.turn;
}

class Timeout extends Error {}

function search(s, depth, alpha, beta, ctx, ply) {
  if ((++ctx.nodes & 511) === 0 && ctx.deadline && Date.now() > ctx.deadline) throw new Timeout();
  if (s.winner != null) return s.winner === 0 ? 0 : s.winner === s.turn ? 100000 - ply : -100000 + ply;
  const moves = legalMoves(s);
  // Keep searching through captures so exchanges are seen to the end.
  if (depth <= 0 && !moves[0]?.captures.length) return evaluate(s);
  moves.sort((a, b) => b.captures.length - a.captures.length);
  let best = -Infinity;
  for (const m of moves) {
    const v = -search(applyMove(s, m), depth - 1, -beta, -alpha, ctx, ply + 1);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export function analyse(s, { timeMs = 900, maxDepth = 30 } = {}) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  const ctx = { nodes: 0, deadline: Date.now() + timeMs };
  let result = { scores: moves.map(() => 0), depth: 0 };
  for (let d = 1; d <= maxDepth; d++) {
    try {
      const scores = moves.map((m) => -search(applyMove(s, m), d - 1, -Infinity, Infinity, ctx, 1));
      result = { scores, depth: d };
      if (Math.max(...scores) > 90000) break;
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  const k = result.scores.indexOf(Math.max(...result.scores));
  return { move: moves[k], score: result.scores[k], moves, scores: result.scores, depth: result.depth };
}

export function chooseMove(s, level = 'medium', { timeMs = 900, random = Math.random, maxDepth = null } = {}) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (level === 'easy') {
    // Takes the biggest capture, otherwise plays a sensible-looking move at random.
    if (moves[0].captures.length) return moves.sort((a, b) => b.captures.length - a.captures.length)[0];
    const r = analyse(s, { timeMs: 50, maxDepth: 2 });
    const good = r.moves.filter((_, k) => r.scores[k] >= Math.max(...r.scores) - 60);
    return good[Math.floor(random() * good.length)];
  }
  const depth = maxDepth ?? (level === 'medium' ? 4 : 30);
  const r = analyse(s, { timeMs: level === 'hard' ? timeMs : 10000, maxDepth: depth });
  const top = Math.max(...r.scores);
  const ties = r.moves.filter((_, k) => r.scores[k] >= top - (level === 'medium' ? 8 : 0));
  return ties[Math.floor(random() * ties.length)];
}

// Would the opponent be able to capture right after this move?
function givesCapture(s, m) {
  const next = applyMove(s, m);
  return next.winner == null && legalMoves(next).some((x) => x.captures.length);
}

export function explain(s, result) {
  const m = result?.move ?? legalMoves(s)[0];
  const where = `${squareName(m.from)} to ${squareName(m.path[m.path.length - 1])}`;
  if (result && result.score > 90000) return { move: m, text: `Play ${where}: it forces a win.` };
  if (m.captures.length > 1) return { move: m, text: `Jump ${where}: a ${m.captures.length}-piece capture.` };
  if (m.captures.length) return { move: m, text: `Jump ${where}. Captures are compulsory, and this is the best one.` };
  const next = applyMove(s, m);
  const crowned = Math.abs(next.cells[m.path[m.path.length - 1]]) === 2 && Math.abs(s.cells[m.from]) === 1;
  if (crowned) return { move: m, text: `Play ${where}: it reaches the far row and is crowned.` };
  const risky = legalMoves(s).filter((x) => givesCapture(s, x)).length;
  if (!givesCapture(s, m) && risky) return { move: m, text: `Play ${where}: it’s safe. ${risky} of your moves would let your opponent jump you.` };
  return { move: m, text: `Play ${where}: it keeps your pieces together and gives nothing away.` };
}

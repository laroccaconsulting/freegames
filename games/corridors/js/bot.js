// Computer players for Corridors. Pure (no DOM) so it runs in a Web Worker,
// in node:test, or anywhere else.
//
//   easy    walks its shortest route most of the time, sometimes wanders,
//           now and then drops a wall in someone's way. Never looks ahead.
//   medium  one move deep: picks whatever leaves it furthest ahead.
//   hard    alpha-beta search a few moves deep within a time budget
//           (iterative deepening, transposition table). Four-player games
//           use the one-move search.
//
// The score of a position for player p is how much further the leading
// rival has to go than p, plus most of a step for each wall p still holds.
import { applyMove, legalPawnMoves, isLegalWall, distanceMap, shortestPath, canStep, positionKey, SIZE } from './engine.js';

export const LEVELS = ['easy', 'medium', 'hard'];
const N = SIZE;
// Walls in hand matter: whoever keeps some for the end game can block the
// other's final approach. (0.8 beat 0.2 and 0.5 in bot-vs-bot tests.)
const WALL_BONUS = 0.8;
const WIN = 10000;
// Searched values often tie when every step forward can be walled back; a
// small nudge towards the goal stops the bot pacing back and forth.
const PROGRESS = 0.3;

// ---------- Evaluation ----------

// sharp: count "one step from the goal with the move" as decided. Medium
// needs that to see a threat; hard's search sees real wins, and the cliff
// would only make it burn walls at its horizon.
export function evaluate(state, p, sharp = false) {
  if (state.winner != null) return state.winner === p ? WIN : -WIN;
  const mine = shortestPath(state, p);
  let rival = Infinity;
  let rivalWalls = 0;
  state.players.forEach((pl, q) => {
    if (q === p) return;
    const d = shortestPath(state, q);
    // A rival about to move is effectively one step closer.
    const adjusted = d - (q === state.turn ? 1 : 0);
    if (adjusted < rival) {
      rival = adjusted;
      rivalWalls = pl.wallsLeft;
    }
  });
  const tempo = p === state.turn ? 1 : 0;
  if (sharp && tempo && mine === 1) return WIN / 2;
  if (sharp && rival === 0) return -WIN / 2;
  return rival - (mine - tempo) + WALL_BONUS * (state.players[p].wallsLeft - rivalWalls);
}

// ---------- Candidate moves ----------

// Walls that cut a step on any shortest route of player q.
function wallsAcross(state, q, out) {
  const d = distanceMap(state, q);
  const [sr, sc] = state.players[q].pos;
  const seen = new Uint8Array(N * N);
  const stack = [sr * N + sc];
  seen[stack[0]] = 1;
  const add = (r, c, o) => {
    if (r < 0 || c < 0 || r >= N - 1 || c >= N - 1) return;
    out.set(`${o}${r},${c}`, { r, c, o });
  };
  while (stack.length) {
    const cell = stack.pop();
    const r = (cell / N) | 0;
    const c = cell % N;
    if (d[cell] <= 0) continue;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const next = (r + dr) * N + c + dc;
      if (!canStep(state, r, c, dr, dc) || d[next] !== d[cell] - 1) continue;
      if (dr) {
        const row = dr > 0 ? r : r - 1;
        add(row, c, 'H');
        add(row, c - 1, 'H');
      } else {
        const col = dc > 0 ? c : c - 1;
        add(r, col, 'V');
        add(r - 1, col, 'V');
      }
      if (!seen[next]) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
}

// Legal walls in the way of the other players, as moves.
export function candidateWalls(state, p = state.turn) {
  if (state.players[p].wallsLeft <= 0) return [];
  const found = new Map();
  state.players.forEach((_, q) => q !== p && wallsAcross(state, q, found));
  return [...found.values()].filter((w) => isLegalWall(state, w, p)).map((w) => ({ t: 'wall', ...w }));
}

// Walls that protect player p's own route: each takes the crossing spot of a
// wall that would cut that route, so a rival can no longer put it there.
export function defensiveWalls(state, p = state.turn) {
  if (state.players[p].wallsLeft <= 0) return [];
  const threats = new Map();
  wallsAcross(state, p, threats);
  const mine = shortestPath(state, p);
  const out = new Map();
  for (const w of threats.values()) {
    const guard = { r: w.r, c: w.c, o: w.o === 'H' ? 'V' : 'H' };
    const key = `${guard.o}${guard.r},${guard.c}`;
    if (out.has(key) || !isLegalWall(state, guard, p)) continue;
    const move = { t: 'wall', ...guard };
    if (shortestPath(applyMove(state, move), p) === mine) out.set(key, move);
  }
  return [...out.values()];
}

const pawnMoves = (state) => legalPawnMoves(state).map((to) => ({ t: 'pawn', to }));

// Candidate moves with the score each leaves for the mover, best first.
function scored(state, moves, random, noise = 0, sharp = false) {
  const p = state.turn;
  return moves
    .map((move) => {
      const next = applyMove(state, move);
      return { move, next, score: evaluate(next, p, sharp) + noise * random() };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------- Levels ----------

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function easy(state, random) {
  const p = state.turn;
  const walls = candidateWalls(state);
  if (walls.length && random() < 0.12) return pick(walls, random);
  const pawns = pawnMoves(state);
  if (random() < 0.7) {
    const dist = (m) => distanceMap(state, p)[m.to[0] * N + m.to[1]];
    const best = Math.min(...pawns.map(dist));
    return pick(pawns.filter((m) => dist(m) === best), random);
  }
  return pick(pawns, random);
}

function medium(state, random) {
  return scored(state, [...pawnMoves(state), ...candidateWalls(state)], random, 0.05, true)[0]?.move ?? null;
}

class Timeout extends Error {}

function hard(state, random, timeMs, maxDepth) {
  if (state.players.length !== 2) return medium(state, random);
  const deadline = Date.now() + timeMs;
  const table = new Map();
  let nodes = 0;

  // Moves worth searching, best guesses first.
  const ordered = (s, limit) => {
    const list = scored(s, pawnMoves(s), random);
    const walls = scored(s, candidateWalls(s), random).slice(0, limit);
    const guards = scored(s, defensiveWalls(s), random).slice(0, 4);
    return [...list, ...walls, ...guards].sort((a, b) => b.score - a.score);
  };

  // Negamax: the value of s for player p, who is to move.
  const search = (s, p, depth, alpha, beta) => {
    if (s.winner != null) return s.winner === p ? WIN + depth : -WIN - depth;
    if (depth === 0) return evaluate(s, p);
    if ((++nodes & 255) === 0 && Date.now() > deadline) throw new Timeout();
    const key = positionKey(s);
    const hit = table.get(key);
    if (hit && hit.depth >= depth) {
      if (hit.flag === 0) return hit.value;
      if (hit.flag < 0 && hit.value <= alpha) return hit.value;
      if (hit.flag > 0 && hit.value >= beta) return hit.value;
    }
    const moves = ordered(s, 10);
    if (hit?.best) {
      const i = moves.findIndex((m) => sameMove(m.move, hit.best));
      if (i > 0) moves.unshift(moves.splice(i, 1)[0]);
    }
    const start = alpha;
    let best = -Infinity;
    let bestMove = null;
    for (const { move, next } of moves) {
      const value = -search(next, 1 - p, depth - 1, -beta, -alpha);
      if (value > best) {
        best = value;
        bestMove = move;
      }
      if (value > alpha) alpha = value;
      if (alpha >= beta) break;
    }
    if (table.size > 200000) table.clear();
    table.set(key, { depth, value: best, best: bestMove, flag: best <= start ? -1 : best >= beta ? 1 : 0 });
    return best;
  };

  const root = ordered(state, 16);
  if (!root.length) return null;
  const here = shortestPath(state, state.turn);
  const nudge = (next) => PROGRESS * (here - shortestPath(next, state.turn));
  let choice = root[0].move;
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let best = -Infinity;
      let bestMove = null;
      let alpha = -Infinity;
      for (const { move, next } of root) {
        const value = -search(next, 1 - state.turn, depth - 1, -Infinity, -alpha) + nudge(next) + random() * 0.01;
        if (value > best) {
          best = value;
          bestMove = move;
        }
        if (value > alpha) alpha = value;
      }
      choice = bestMove;
      // Search the best move first next time round.
      root.unshift(root.splice(root.findIndex((m) => m.move === bestMove), 1)[0]);
      if (best >= WIN) break; // a forced win: no need to look deeper
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return choice;
}

export function sameMove(a, b) {
  if (!a || !b || a.t !== b.t) return false;
  return a.t === 'pawn' ? a.to[0] === b.to[0] && a.to[1] === b.to[1] : a.r === b.r && a.c === b.c && a.o === b.o;
}

// Picks a move for the player to move. Always legal when any move exists.
// maxDepth caps hard's search (tests use it to be independent of CPU speed).
export function chooseMove(state, level = 'medium', { random = Math.random, timeMs = 900, maxDepth = 6 } = {}) {
  if (state.winner != null) return null;
  const move = level === 'easy' ? easy(state, random) : level === 'hard' ? hard(state, random, timeMs, maxDepth) : medium(state, random);
  return move ?? pawnMoves(state)[0] ?? null;
}

// What a move does to everyone's shortest route, for hints that explain
// themselves: [{ player, before, after }].
export function routeChanges(state, move) {
  const next = applyMove(state, move);
  return state.players.map((_, q) => ({ player: q, before: shortestPath(state, q), after: shortestPath(next, q) }));
}

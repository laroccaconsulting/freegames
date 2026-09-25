// Mancala, Kalah rules. Pure (no DOM).
//
// pits[0..5] are player 0's pits (left to right from their side), pits[6]
// their store; pits[7..12] player 1's pits, pits[13] their store. Seeds are
// sown one per pit counterclockwise (rising index), skipping the opponent's
// store. Ending in your own store earns another turn; ending in an empty pit
// of yours captures that seed and everything opposite. When one side has
// no seeds, each player banks what is left on their own side.

export const STORE = [6, 13];
export const pitsOf = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
export const opposite = (i) => 12 - i;

export function newGame({ seeds = 4, first = 0 } = {}) {
  const pits = new Array(14).fill(seeds);
  pits[6] = 0;
  pits[13] = 0;
  return { pits, turn: first, moves: [], winner: null, seeds };
}

export const legalMoves = (s) => (s.winner != null ? [] : pitsOf(s.turn).filter((i) => s.pits[i] > 0));

// Plays pit i. Returns { state, path: [pits in sowing order], extra, capture }.
export function play(s, i) {
  if (!legalMoves(s).includes(i)) throw new Error(`illegal move ${i}`);
  const pits = s.pits.slice();
  const me = s.turn;
  const skip = STORE[1 - me];
  let seeds = pits[i];
  pits[i] = 0;
  let at = i;
  const path = [];
  while (seeds) {
    at = (at + 1) % 14;
    if (at === skip) continue;
    pits[at]++;
    path.push(at);
    seeds--;
  }
  let capture = null;
  if (pitsOf(me).includes(at) && pits[at] === 1 && pits[opposite(at)] > 0) {
    capture = { pit: at, from: opposite(at), seeds: pits[opposite(at)] + 1 };
    pits[STORE[me]] += pits[opposite(at)] + 1;
    pits[at] = 0;
    pits[opposite(at)] = 0;
  }
  const extra = at === STORE[me];
  let next = { ...s, pits, turn: extra ? me : 1 - me, moves: [...s.moves, i], winner: null };
  // Game over when a side is empty: each player banks their own side.
  if (pitsOf(0).every((k) => !pits[k]) || pitsOf(1).every((k) => !pits[k])) {
    for (const p of [0, 1]) for (const k of pitsOf(p)) {
      pits[STORE[p]] += pits[k];
      pits[k] = 0;
    }
    next = { ...next, pits, winner: pits[6] > pits[13] ? 0 : pits[13] > pits[6] ? 1 : -1 };
  }
  return { state: next, path, extra: extra && next.winner == null, capture };
}

export function replay(moves, opts) {
  let s = newGame(opts);
  for (const m of moves) s = play(s, m).state;
  return s;
}

// ---------- Computer ----------

class Timeout extends Error {}

function search(s, depth, alpha, beta, ctx) {
  if ((++ctx.nodes & 1023) === 0 && ctx.deadline && Date.now() > ctx.deadline) throw new Timeout();
  const me = s.turn;
  if (s.winner != null || depth <= 0) {
    // Score for the player to move: store difference (plus seeds on side, lightly).
    const side = (p) => pitsOf(p).reduce((a, k) => a + s.pits[k], 0);
    return (s.pits[STORE[me]] - s.pits[STORE[1 - me]]) * 4 + (side(me) - side(1 - me)) + (s.winner != null ? (s.winner === me ? 1000 : s.winner === -1 ? 0 : -1000) : 0);
  }
  let best = -Infinity;
  const moves = legalMoves(s).sort((a, b) => (a + s.pits[a] === STORE[me] ? -1 : 0) - (b + s.pits[b] === STORE[me] ? -1 : 0));
  for (const m of moves) {
    const { state } = play(s, m);
    // Extra turns keep the same player: don't flip the sign.
    const v = state.turn === me && state.winner == null ? search(state, depth - 1, alpha, beta, ctx) : -search(state, depth - 1, -beta, -alpha, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export function analyse(s, { timeMs = 800, maxDepth = 20 } = {}) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  const ctx = { nodes: 0, deadline: Date.now() + timeMs };
  let scores = moves.map(() => 0);
  for (let d = 1; d <= maxDepth; d++) {
    try {
      scores = moves.map((m) => {
        const { state } = play(s, m);
        return state.turn === s.turn && state.winner == null ? search(state, d - 1, -Infinity, Infinity, ctx) : -search(state, d - 1, -Infinity, Infinity, ctx);
      });
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  const k = scores.indexOf(Math.max(...scores));
  return { move: moves[k], moves, scores };
}

export function chooseMove(s, level = 'medium', { timeMs = 800, random = Math.random, maxDepth = null } = {}) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (level === 'easy') {
    const extra = moves.find((m) => (m + s.pits[m]) % 14 === STORE[s.turn] && s.pits[m] < 14);
    if (extra !== undefined && random() < 0.7) return extra;
    return moves[Math.floor(random() * moves.length)];
  }
  const r = analyse(s, { timeMs: level === 'hard' ? timeMs : 5000, maxDepth: maxDepth ?? (level === 'medium' ? 3 : 20) });
  const top = Math.max(...r.scores);
  const ties = r.moves.filter((_, k) => r.scores[k] >= top - (level === 'medium' ? 2 : 0));
  return ties[Math.floor(random() * ties.length)];
}

export function explain(s, result) {
  const m = result?.move ?? legalMoves(s)[0];
  const { state, extra, capture } = play(s, m);
  const pitNo = pitsOf(s.turn).indexOf(m) + 1;
  if (extra) return { move: m, text: `Play pit ${pitNo}: the last seed lands in your store, so you go again.` };
  if (capture) return { move: m, text: `Play pit ${pitNo}: it ends in an empty pit and captures ${capture.seeds} seeds.` };
  const threats = legalMoves({ ...state, turn: 1 - s.turn }).filter((k) => play({ ...state, turn: 1 - s.turn }, k).capture).length;
  if (!threats) return { move: m, text: `Play pit ${pitNo}: it leaves your opponent nothing to capture.` };
  return { move: m, text: `Play pit ${pitNo}: looking ahead, it gives up the least.` };
}

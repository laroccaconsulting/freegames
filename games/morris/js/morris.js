// Nine Men's Morris. Each player places nine pieces on the 24 points, then
// moves them along the lines. Three in a row (a mill) removes an enemy
// piece, which may not come from a mill unless every enemy piece is in one.
// With three pieces left a player may fly to any empty point. A player with
// two pieces, or no legal move, loses. Pure (no DOM).
//
// state: { board: [0 | 1 | 2] × 24, turn, inHand: [_, n1, n2], onBoard: [_, n1, n2], quiet (moves since a capture), winner }
// A move: { to, from?: point, take?: point }.

// Points numbered row by row over the three squares:
//  0-----1-----2
//  | 3---4---5 |
//  | | 6-7-8 | |
//  9-10-11 12-13-14
//  | |15-16-17 | |
//  |18---19---20 |
//  21----22----23
export const COORDS = [
  [0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6],
];
export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];
export const ADJ = (() => {
  const adj = Array.from({ length: 24 }, () => []);
  for (const [a, b, c] of LINES) {
    adj[a].push(b);
    adj[b].push(a, c);
    adj[c].push(b);
  }
  return adj;
})();
const MILLS_AT = Array.from({ length: 24 }, (_, p) => LINES.filter((l) => l.includes(p)));
export const DRAW_AFTER = 50; // moves in a row without a capture

export function newGame(first = 1) {
  return { board: new Array(24).fill(0), turn: first, inHand: [0, 9, 9], onBoard: [0, 0, 0], quiet: 0, winner: 0 };
}

export const inMill = (board, p) => MILLS_AT[p].some((l) => l.every((q) => board[q] === board[p]));
const phase = (s, who) => (s.inHand[who] > 0 ? 'place' : s.onBoard[who] === 3 ? 'fly' : 'move');

// Pieces that may be taken: not in a mill, unless all of them are.
export function takeable(board, enemy) {
  const theirs = [];
  for (let p = 0; p < 24; p++) if (board[p] === enemy) theirs.push(p);
  const free = theirs.filter((p) => !inMill(board, p));
  return free.length ? free : theirs;
}

// Would moving a piece of `who` to `to` (from `from`) close a mill?
function closes(board, who, to, from) {
  return MILLS_AT[to].some((l) => l.every((q) => q === to || (q !== from && board[q] === who)));
}

// Every legal move for the player to move.
export function moves(s) {
  if (s.winner) return [];
  const who = s.turn;
  const enemy = 3 - who;
  const out = [];
  const add = (to, from) => {
    if (closes(s.board, who, to, from)) {
      const b = s.board.slice();
      if (from != null) b[from] = 0;
      b[to] = who;
      for (const take of takeable(b, enemy)) out.push({ from, to, take });
    } else out.push({ from, to });
  };
  const ph = phase(s, who);
  if (ph === 'place') {
    for (let p = 0; p < 24; p++) if (!s.board[p]) add(p, undefined);
    return out;
  }
  for (let from = 0; from < 24; from++) {
    if (s.board[from] !== who) continue;
    const targets = ph === 'fly' ? [...Array(24).keys()] : ADJ[from];
    for (const to of targets) if (!s.board[to]) add(to, from);
  }
  return out;
}

export function play(s, m) {
  const who = s.turn;
  const enemy = 3 - who;
  const next = { ...s, board: s.board.slice(), inHand: s.inHand.slice(), onBoard: s.onBoard.slice() };
  if (m.from != null) next.board[m.from] = 0;
  else {
    next.inHand[who]--;
    next.onBoard[who]++;
  }
  next.board[m.to] = who;
  next.quiet++;
  if (m.take != null) {
    next.board[m.take] = 0;
    next.onBoard[enemy]--;
    next.quiet = 0;
  }
  next.turn = enemy;
  // Lose with fewer than three pieces left in all, or with no move.
  if (next.onBoard[enemy] + next.inHand[enemy] < 3) next.winner = who;
  else if (!moves(next).length) next.winner = who;
  else if (next.quiet >= DRAW_AFTER) next.winner = 3; // a draw
  return next;
}

// ---------- The computer ----------

function evaluate(s, me) {
  if (s.winner) return s.winner === me ? 10000 : s.winner === 3 ? 0 : -10000;
  const you = 3 - me;
  let score = 0;
  score += 60 * (s.onBoard[me] + s.inHand[me] - s.onBoard[you] - s.inHand[you]);
  for (const l of LINES) {
    const mine = l.filter((p) => s.board[p] === me).length;
    const yours = l.filter((p) => s.board[p] === you).length;
    if (mine === 3) score += 8;
    if (yours === 3) score -= 8;
    if (mine === 2 && !yours) score += 6;
    if (yours === 2 && !mine) score -= 6;
  }
  // Mobility matters once pieces move.
  if (!s.inHand[me] && !s.inHand[you]) {
    const count = (who) => {
      let n = 0;
      for (let p = 0; p < 24; p++) if (s.board[p] === who) for (const q of ADJ[p]) if (!s.board[q]) n++;
      return n;
    };
    score += 2 * (count(me) - count(you));
  }
  return score;
}

function search(s, depth, alpha, beta, me) {
  if (!depth || s.winner) return evaluate(s, me);
  const list = moves(s);
  // Captures first: better pruning.
  list.sort((a, b) => (b.take != null) - (a.take != null));
  if (s.turn === me) {
    let best = -Infinity;
    for (const m of list) {
      best = Math.max(best, search(play(s, m), depth - 1, alpha, beta, me));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of list) {
    best = Math.min(best, search(play(s, m), depth - 1, alpha, beta, me));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export const DEPTH = { easy: 1, normal: 2, hard: 3 };

export function choose(s, level = 'normal', random = Math.random) {
  const list = moves(s);
  if (!list.length) return null;
  const me = s.turn;
  const depth = DEPTH[level] ?? 3;
  let best = [];
  let bestScore = -Infinity;
  for (const m of list) {
    // Easy plays loosely: its scores get a lot of noise.
    const v = search(play(s, m), depth - 1, -Infinity, Infinity, me) + (level === 'easy' ? random() * 90 : random() * 0.5);
    if (v > bestScore) [best, bestScore] = [[m], v];
    else if (v === bestScore) best.push(m);
  }
  return best[Math.floor(random() * best.length)];
}

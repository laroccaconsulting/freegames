// Four in a Row: the computer player and the hint explainer. Pure (no DOM):
// runs in a Web Worker and in the tests.
//
// Search is negamax with alpha-beta pruning, a transposition table (Zobrist
// hashing), iterative deepening and centre-first move ordering. The leaf
// evaluation counts open lines of two and three and knows the odd/even rule:
// a threat on an odd row (counting from 1 at the bottom) is worth more to
// the player who moved first, one on an even row to the other player.

import { legalColumns, dropRow, applyMove, winningColumns, wouldWin, other, threats } from './engine.js';

export const LEVELS = ['easy', 'medium', 'hard'];
const WIN = 1_000_000;

// ---------- A fast mutable board for searching ----------

const cache = new Map();

function geometry(cols, rows) {
  const key = `${cols}x${rows}`;
  if (cache.has(key)) return cache.get(key);
  const windows = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++)
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const ec = c + dc * 3;
        const er = r + dr * 3;
        if (ec < 0 || ec >= cols || er < 0 || er >= rows) continue;
        windows.push([0, 1, 2, 3].map((k) => (c + dc * k) * rows + (r + dr * k)));
      }
  // Zobrist keys: two 26-bit halves per (cell, player), combined into one safe integer.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 0x3ffffff;
  };
  const zHi = [[], [], []];
  const zLo = [[], [], []];
  for (let p = 1; p <= 2; p++)
    for (let i = 0; i < cols * rows; i++) {
      zHi[p][i] = rand();
      zLo[p][i] = rand();
    }
  // Columns from the middle out: central discs take part in more lines.
  const mid = (cols - 1) / 2;
  const order = [...Array(cols).keys()].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  const g = { windows, zHi, zLo, order };
  cache.set(key, g);
  return g;
}

class SearchBoard {
  constructor(s) {
    this.cols = s.cols;
    this.rows = s.rows;
    this.cells = Int8Array.from(s.cells);
    this.heights = new Int8Array(s.cols);
    for (let c = 0; c < s.cols; c++) this.heights[c] = Math.max(0, dropRow(s, c) < 0 ? s.rows : dropRow(s, c));
    this.turn = s.turn;
    this.count = s.moves.length;
    // Whoever moved first (the odd/even rule depends on it).
    this.first = s.moves.length % 2 === 0 ? s.turn : other(s.turn);
    this.g = geometry(s.cols, s.rows);
    this.hi = 0;
    this.lo = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const p = this.cells[i];
      if (p) {
        this.hi ^= this.g.zHi[p][i];
        this.lo ^= this.g.zLo[p][i];
      }
    }
  }

  key() {
    return this.hi * 0x4000000 + this.lo + (this.turn === 2 ? 0.5 : 0);
  }

  play(c) {
    const i = c * this.rows + this.heights[c]++;
    this.cells[i] = this.turn;
    this.hi ^= this.g.zHi[this.turn][i];
    this.lo ^= this.g.zLo[this.turn][i];
    this.turn = 3 - this.turn;
    this.count++;
  }

  undo(c) {
    const i = c * this.rows + --this.heights[c];
    this.turn = 3 - this.turn;
    this.cells[i] = 0;
    this.hi ^= this.g.zHi[this.turn][i];
    this.lo ^= this.g.zLo[this.turn][i];
    this.count--;
  }

  // Does a disc of player p in column c (at its drop row) make four?
  wins(c, p) {
    const r = this.heights[c];
    if (r >= this.rows) return false;
    const { cols, rows, cells } = this;
    const get = (cc, rr) => (cc < 0 || cc >= cols || rr < 0 || rr >= rows ? 0 : cells[cc * rows + rr]);
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let n = 1;
      for (let k = 1; k < 4 && get(c + dc * k, r + dr * k) === p; k++) n++;
      for (let k = 1; k < 4 && get(c - dc * k, r - dr * k) === p; k++) n++;
      if (n >= 4) return true;
    }
    return false;
  }

  full() {
    return this.count >= this.cols * this.rows;
  }

  // Score for the player to move.
  evaluate() {
    const { cells, rows, first } = this;
    let score = 0;
    for (const w of this.g.windows) {
      let a = 0;
      let b = 0;
      let gap = -1;
      for (let k = 0; k < 4; k++) {
        const v = cells[w[k]];
        if (v === 1) a++;
        else if (v === 2) b++;
        else gap = w[k];
      }
      if (a && b) continue;
      const n = a || b;
      if (n < 2) {
        if (n === 1) score += a ? 1 : -1;
        continue;
      }
      let v = n === 2 ? 6 : 40;
      if (n === 3) {
        // A threat: better if its row suits its owner (odd rows for the first player).
        const owner = a ? 1 : 2;
        const oddRow = (gap % rows) % 2 === 0;
        if ((owner === first) === oddRow) v += 30;
      }
      score += a ? v : -v;
    }
    return this.turn === 1 ? score : -score;
  }
}

// ---------- Search ----------

class Timeout extends Error {}

function search(board, { maxDepth, deadline, random }) {
  const tt = new Map();
  const { order } = board.g;
  let nodes = 0;

  function negamax(depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && deadline && Date.now() > deadline) throw new Timeout();
    const me = board.turn;
    // Win now if we can.
    for (const c of order) if (board.heights[c] < board.rows && board.wins(c, me)) return WIN - ply;
    if (board.full()) return 0;
    // If the opponent threatens to win, only blocking can help.
    const them = 3 - me;
    let forced = -1;
    for (const c of order) {
      if (board.heights[c] < board.rows && board.wins(c, them)) {
        if (forced >= 0) return -(WIN - ply - 1); // two threats: lost
        forced = c;
      }
    }
    if (depth <= 0) return board.evaluate();

    const key = board.key();
    const hit = tt.get(key);
    let first = -1;
    if (hit) {
      if (hit.depth >= depth) {
        if (hit.flag === 0) return hit.score;
        if (hit.flag === 1 && hit.score >= beta) return hit.score;
        if (hit.flag === -1 && hit.score <= alpha) return hit.score;
      }
      first = hit.best;
    }

    const moves = forced >= 0 ? [forced] : orderMoves(first);
    let best = -Infinity;
    let bestMove = moves[0];
    const a0 = alpha;
    for (const c of moves) {
      board.play(c);
      const score = -negamax(depth - 1, -beta, -alpha, ply + 1);
      board.undo(c);
      if (score > best) {
        best = score;
        bestMove = c;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    tt.set(key, { depth, score: best, flag: best <= a0 ? -1 : best >= beta ? 1 : 0, best: bestMove });
    return best;
  }

  function orderMoves(first) {
    const out = [];
    if (first >= 0 && board.heights[first] < board.rows) out.push(first);
    for (const c of order) if (c !== first && board.heights[c] < board.rows) out.push(c);
    return out;
  }

  // Root: score every column so ties can be broken at random.
  function root(depth) {
    const scores = new Map();
    let alpha = -Infinity;
    const moves = orderMoves(lastBest);
    for (const c of moves) {
      if (board.wins(c, board.turn)) {
        scores.set(c, WIN);
        alpha = WIN;
        continue;
      }
      board.play(c);
      // A slightly widened window keeps equal moves' exact scores.
      const score = -negamax(depth - 1, -Infinity, -(alpha - 3), 1);
      board.undo(c);
      scores.set(c, score);
      if (score > alpha) alpha = score;
    }
    return scores;
  }

  let lastBest = -1;
  let result = null;
  let reached = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const scores = root(depth);
      const top = Math.max(...scores.values());
      const ties = [...scores].filter(([, v]) => v >= top - (Math.abs(top) >= WIN - 100 ? 0 : 2)).map(([c]) => c);
      lastBest = ties[Math.floor(random() * ties.length)];
      result = { move: lastBest, score: top, scores };
      reached = depth;
      if (Math.abs(top) >= WIN - 100) break; // the result is decided
      if (board.count + depth >= board.cols * board.rows) break; // searched to the end
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      break;
    }
  }
  return { ...result, depth: reached, nodes };
}

// ---------- Levels ----------

const LEVEL = {
  easy: { depth: 2, blunder: 0.35 },
  medium: { depth: 5, blunder: 0 },
  hard: { depth: 42, blunder: 0 },
};

// The computer's move for state s. Hard searches until timeMs runs out.
export function chooseMove(s, level = 'medium', { timeMs = 900, maxDepth = null, random = Math.random } = {}) {
  const legal = legalColumns(s);
  if (!legal.length) return null;
  const cfg = LEVEL[level] || LEVEL.medium;
  if (level === 'easy') {
    const win = winningColumns(s);
    if (win.length) return win[0];
    // Easy sometimes plays a friendly, centre-leaning move without looking ahead.
    if (random() < cfg.blunder) {
      const weights = legal.map((c) => 1 + s.cols / 2 - Math.abs(c - (s.cols - 1) / 2));
      let t = random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < legal.length; i++) if ((t -= weights[i]) <= 0) return legal[i];
      return legal[legal.length - 1];
    }
  }
  const board = new SearchBoard(s);
  const depth = Math.min(maxDepth ?? cfg.depth, s.cols * s.rows - s.moves.length);
  const deadline = level === 'hard' && !maxDepth ? Date.now() + timeMs : 0;
  return search(board, { maxDepth: depth, deadline, random }).move;
}

// Search result with scores, for hints: { move, score, scores, depth }.
export function analyse(s, { timeMs = 700, maxDepth = 42, random = () => 0 } = {}) {
  if (!legalColumns(s).length) return null;
  const board = new SearchBoard(s);
  return search(board, { maxDepth: Math.min(maxDepth, s.cols * s.rows - s.moves.length), deadline: Date.now() + timeMs, random });
}

// When a score is a forced result: how many moves the winner needs,
// counting this one (1 = wins now). Otherwise null.
export function forcedIn(score) {
  if (Math.abs(score) < WIN - 100) return null;
  return Math.floor((WIN - Math.abs(score)) / 2) + 1;
}

// ---------- Hints that explain themselves ----------

// Columns the player to move should avoid: a disc there lets the opponent
// win on the cell just above it.
export function poisonedColumns(s) {
  const them = other(s.turn);
  return legalColumns(s).filter((c) => {
    const r = dropRow(s, c);
    return r + 1 < s.rows && wouldWin(s, c, r + 1, them);
  });
}

// { column, text } for the player to move. `result` is from analyse().
export function explain(s, result, names = { 1: 'Player 1', 2: 'Player 2' }) {
  const me = s.turn;
  const them = other(me);
  const col = (c) => `column ${c + 1}`;
  const wins = winningColumns(s, me);
  if (wins.length) return { column: wins[0], text: `Play ${col(wins[0])}: it makes four in a row and wins.` };
  const blocks = winningColumns(s, them);
  if (blocks.length > 1)
    return { column: blocks[0], text: `${names[them]} can win in ${blocks.length} places. You can only block one, so block ${col(blocks[0])} and hope.` };
  if (blocks.length) return { column: blocks[0], text: `Block ${col(blocks[0])}: otherwise ${names[them]} makes four there next turn.` };

  const c = result?.move ?? legalColumns(s)[0];
  const after = applyMove(s, c);
  const myWinsNext = winningColumns({ ...after, turn: me }, me);
  const n = result ? forcedIn(result.score) : null;
  const poisoned = poisonedColumns(s).filter((p) => p !== c);
  let text;
  if (myWinsNext.length >= 2) text = `Play ${col(c)}: it makes two threats at once, and ${names[them]} can only block one.`;
  else if (n && result.score > 0) text = `Play ${col(c)}: from here you can force a win in ${n} moves, whatever ${names[them]} does.`;
  else if (myWinsNext.length === 1) text = `Play ${col(c)}: it threatens four in ${col(myWinsNext[0])}, so ${names[them]} has to answer.`;
  else if (newThreats(s, after, me) > 0) text = `Play ${col(c)}: it builds a three with a gap to fill later. Threats higher up the board win games.`;
  else if (s.moves.length < 2 && c === Math.floor(s.cols / 2)) text = `Play ${col(c)}: the middle column is part of the most possible fours.`;
  else text = `Play ${col(c)}: it keeps the most lines of four open for you and closes some of ${names[them]}’s.`;
  if (n && result.score < 0) text += ` It’s a tough spot: with best play ${names[them]} can still win.`;
  else if (poisoned.length) text += ` Avoid ${poisoned.map((p) => col(p)).join(' and ')}: a disc there lets ${names[them]} win right on top of it.`;
  return { column: c, text };
}

function newThreats(before, after, p) {
  const count = (s) => threats(s).filter((t) => t.p === p).length;
  return count(after) - count(before);
}

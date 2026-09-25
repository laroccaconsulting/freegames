// Backgammon rules. Pure functions on plain objects (no DOM), so the game,
// the computer player and the tests all share them.
//
// The board is 24 points, index 0–23. board[i] > 0 is that many checkers of
// player 0, board[i] < 0 is player 1. Player 0 moves from index 23 down to 0
// and bears off from its home board, indexes 0–5. Player 1 moves the other
// way, home board 18–23. Each player counts points from their own side:
// point 1 is the deepest point of their home board, 25 is the bar, 0 is off.
//
// A step moves one checker by one die: { from: index | 'bar', to: index | 'off', die }.
// A play is every step of one turn.

export const CHECKERS = 15;

// Player 0's opening position as [index, checkers]; player 1's mirrors it.
const START = [
  [23, 2],
  [12, 5],
  [7, 3],
  [5, 5],
];

export const pointOf = (p, i) => (p === 0 ? i + 1 : 24 - i);
export const indexOf = (p, pt) => (p === 0 ? pt - 1 : 24 - pt);
export const count = (s, p, i) => (p === 0 ? Math.max(0, s.board[i]) : Math.max(0, -s.board[i]));

export function newBoard() {
  const board = Array(24).fill(0);
  for (const [i, n] of START) {
    board[i] += n;
    board[23 - i] -= n;
  }
  return board;
}

const diceFor = (a, b) => (a === b ? [a, a, a, a] : [a, b]);
const rollDie = (random) => 1 + Math.floor(random() * 6);

// A new game starts with the opening roll: each player rolls one die (rolled
// again on a tie) and the higher one moves first, playing both numbers.
// `opening` is [player 0's die, player 1's die].
export function newGame(random = Math.random) {
  let a, b;
  do {
    a = rollDie(random);
    b = rollDie(random);
  } while (a === b);
  return {
    board: newBoard(),
    bar: [0, 0],
    off: [0, 0],
    turn: a > b ? 0 : 1,
    dice: [a, b],
    rolled: [a, b],
    opening: [a, b],
    winner: null,
    result: 0,
    moveNo: 0,
  };
}

export function clone(s) {
  return { ...s, board: s.board.slice(), bar: s.bar.slice(), off: s.off.slice(), dice: s.dice.slice() };
}

export function roll(s, random = Math.random) {
  const a = rollDie(random);
  const b = rollDie(random);
  return { ...clone(s), dice: diceFor(a, b), rolled: [a, b], opening: null };
}

export const needsRoll = (s) => s.winner == null && s.dice.length === 0;

export function endTurn(s) {
  return { ...clone(s), turn: 1 - s.turn, dice: [], rolled: null, opening: null, moveNo: s.moveNo + 1 };
}

// Every checker of p is in their home board (so they may bear off).
export function allHome(s, p) {
  if (s.bar[p]) return false;
  for (let i = 0; i < 24; i++) if (count(s, p, i) && pointOf(p, i) > 6) return false;
  return true;
}

export function pipCount(s, p) {
  let pips = s.bar[p] * 25;
  for (let i = 0; i < 24; i++) pips += count(s, p, i) * pointOf(p, i);
  return pips;
}

// Every single step the mover could make with this die, before the rule
// that as many dice as possible must be used.
function stepsForDie(s, die) {
  const p = s.turn;
  const open = (i) => count(s, 1 - p, i) < 2;
  if (s.bar[p]) {
    const to = indexOf(p, 25 - die);
    return open(to) ? [{ from: 'bar', to, die }] : [];
  }
  const out = [];
  const home = allHome(s, p);
  let highest = 0; // p's highest occupied point, for bearing off with a larger die
  if (home) for (let i = 0; i < 24; i++) if (count(s, p, i)) highest = Math.max(highest, pointOf(p, i));
  for (let i = 0; i < 24; i++) {
    if (!count(s, p, i)) continue;
    const pt = pointOf(p, i);
    const dest = pt - die;
    if (dest >= 1) {
      const to = indexOf(p, dest);
      if (open(to)) out.push({ from: i, to, die });
    } else if (home && (dest === 0 || pt === highest)) out.push({ from: i, to: 'off', die });
  }
  return out;
}

const distinct = (dice) => [...new Set(dice)];

function anySteps(s) {
  const out = [];
  if (s.winner != null) return out;
  for (const die of distinct(s.dice)) out.push(...stepsForDie(s, die));
  return out;
}

export function applyStep(s, step) {
  const p = s.turn;
  const sign = p === 0 ? 1 : -1;
  const n = clone(s);
  n.dice.splice(n.dice.indexOf(step.die), 1);
  if (step.from === 'bar') n.bar[p]--;
  else n.board[step.from] -= sign;
  if (step.to === 'off') n.off[p]++;
  else {
    if (count(n, 1 - p, step.to) === 1) {
      n.board[step.to] = 0;
      n.bar[1 - p]++;
    }
    n.board[step.to] += sign;
  }
  if (n.off[p] === CHECKERS) {
    n.winner = p;
    n.result = resultOf(n, p);
    n.dice = [];
  }
  return n;
}

// 1 for a single game, 2 for a gammon (the loser has borne off nothing),
// 3 for a backgammon (…and still has a checker on the bar or in the winner's home board).
function resultOf(s, w) {
  const l = 1 - w;
  if (s.off[l] > 0) return 1;
  if (s.bar[l]) return 3;
  for (let i = 0; i < 24; i++) if (count(s, l, i) && pointOf(w, i) <= 6) return 3;
  return 2;
}

// The most dice the mover can still use this turn.
function maxDepth(s) {
  if (s.winner != null) return 0;
  const left = s.dice.length;
  let best = 0;
  for (const step of anySteps(s)) {
    const next = applyStep(s, step);
    // Winning ends the turn, so it counts as using every die.
    const used = next.winner != null ? left : 1 + maxDepth(next);
    if (used > best) best = used;
    if (best === left) break;
  }
  return best;
}

// The steps the mover may make now: you must use both dice (all four on a
// double) if you can; if only one die can be used, it must be the larger.
export function legalSteps(s) {
  if (s.winner != null || !s.dice.length) return [];
  const all = anySteps(s);
  if (!all.length) return [];
  const most = maxDepth(s);
  let legal = all.filter((step) => {
    const next = applyStep(s, step);
    return next.winner != null || 1 + maxDepth(next) === most;
  });
  if (most === 1 && s.dice.length === 2 && s.dice[0] !== s.dice[1]) {
    const high = Math.max(...s.dice);
    if (legal.some((st) => st.die === high)) legal = legal.filter((st) => st.die === high);
  }
  return legal;
}

export const sameStep = (a, b) => a.from === b.from && a.to === b.to && a.die === b.die;

export function isLegalStep(s, step) {
  return legalSteps(s).some((st) => sameStep(st, step));
}

// The turn is over: no dice left, or none that can be played.
export const turnOver = (s) => s.winner != null || (s.dice.length > 0 ? legalSteps(s).length === 0 : true);

export function positionKey(s) {
  return `${s.board.join(',')}|${s.bar.join(',')}|${s.off.join(',')}`;
}

// Every distinct way to play the dice: [{ steps, state }], one per final
// position. Used by the computer player.
export function allPlays(s) {
  const found = new Map();
  let most = 0;
  const seen = new Set();
  const left = s.dice.length;
  const visit = (st, steps) => {
    const key = `${steps.length}|${positionKey(st)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const next = st.winner == null ? anySteps(st) : [];
    if (!next.length) {
      const used = st.winner != null ? left : steps.length;
      if (used < most) return;
      if (used > most) {
        most = used;
        found.clear();
      }
      const k = positionKey(st);
      if (!found.has(k)) found.set(k, { steps, state: st, used });
      return;
    }
    for (const step of next) visit(applyStep(st, step), [...steps, step]);
  };
  visit(s, []);
  let plays = [...found.values()];
  if (most === 1 && s.dice.length === 2 && s.dice[0] !== s.dice[1]) {
    const high = Math.max(...s.dice);
    if (plays.some((pl) => pl.steps[0].die === high)) plays = plays.filter((pl) => pl.steps[0].die === high);
  }
  return plays.map(({ steps, state }) => ({ steps, state }));
}

// Standard notation for a play from the mover's side, e.g. "13/7 8/7*" or "bar/22 6/off".
export function notation(s, steps) {
  const p = s.turn;
  let st = s;
  return steps
    .map((step) => {
      const hit = step.to !== 'off' && count(st, 1 - p, step.to) === 1;
      const from = step.from === 'bar' ? 'bar' : pointOf(p, step.from);
      const to = step.to === 'off' ? 'off' : pointOf(p, step.to);
      st = applyStep(st, step);
      return `${from}/${to}${hit ? '*' : ''}`;
    })
    .join(' ');
}

export function isValidState(s) {
  if (!s || !Array.isArray(s.board) || s.board.length !== 24 || !s.board.every(Number.isInteger)) return false;
  if (!Array.isArray(s.bar) || !Array.isArray(s.off) || !Array.isArray(s.dice)) return false;
  if (s.turn !== 0 && s.turn !== 1) return false;
  if (!s.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6) || s.dice.length > 4) return false;
  for (const p of [0, 1]) {
    let n = s.bar[p] + s.off[p];
    for (let i = 0; i < 24; i++) n += count(s, p, i);
    if (n !== CHECKERS) return false;
  }
  return true;
}

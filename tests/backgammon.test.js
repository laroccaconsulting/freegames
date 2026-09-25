import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKERS,
  newBoard,
  newGame,
  clone,
  roll,
  endTurn,
  needsRoll,
  allHome,
  pipCount,
  legalSteps,
  isLegalStep,
  applyStep,
  turnOver,
  positionKey,
  allPlays,
  notation,
  isValidState,
  pointOf,
  indexOf,
  count,
} from '../games/backgammon/js/engine.js';
import { choosePlay, describePlay, evaluate, inContact, shots, LEVELS } from '../games/backgammon/js/bot.js';

// Builds a state directly, bypassing the opening roll, for deterministic tests.
function state(overrides = {}) {
  return { board: Array(24).fill(0), bar: [0, 0], off: [0, 0], turn: 0, dice: [], rolled: null, opening: null, winner: null, result: 0, moveNo: 0, ...overrides };
}

test('newBoard: standard opening position, 15 checkers and 167 pips a side', () => {
  const board = newBoard();
  assert.equal(board.reduce((n, v) => n + Math.max(0, v), 0), CHECKERS);
  assert.equal(board.reduce((n, v) => n + Math.max(0, -v), 0), CHECKERS);
  const s = state({ board });
  assert.equal(pipCount(s, 0), 167);
  assert.equal(pipCount(s, 1), 167);
  // Player 0's back checkers start on point 24 (index 23); player 1's mirror it.
  assert.equal(board[23], 2);
  assert.equal(board[0], -2);
});

test('point/index numbering round-trips for both players', () => {
  for (const p of [0, 1]) {
    for (let i = 0; i < 24; i++) assert.equal(indexOf(p, pointOf(p, i)), i);
  }
});

test('newGame: opening roll is never a tie, and the higher roll moves first', () => {
  let calls = [0.5, 0.1]; // die a = 4, die b = 1 (1 + floor(x*6))
  let i = 0;
  const random = () => calls[i++];
  const g = newGame(random);
  assert.deepEqual(g.opening, [4, 1]);
  assert.deepEqual(g.dice, [4, 1]);
  assert.equal(g.turn, 0); // a > b, player 0 goes first
  assert.equal(isValidState(g), true);
});

test('clone does not alias the original', () => {
  const s = newGame();
  const c = clone(s);
  c.board[0] = 99;
  c.bar[0] = 5;
  assert.notEqual(s.board[0], 99);
  assert.notEqual(s.bar[0], 5);
});

test('roll: a double gives four of the same die', () => {
  const random = () => 0.5; // always die 4
  const s = roll(state(), random);
  assert.deepEqual(s.dice, [4, 4, 4, 4]);
  assert.deepEqual(s.rolled, [4, 4]);
  assert.equal(s.opening, null);
  assert.equal(needsRoll(s), false);
  assert.equal(needsRoll(state()), true);
});

test('endTurn flips the mover and clears the dice', () => {
  const s = state({ turn: 0, dice: [3], rolled: [3, 5], moveNo: 2 });
  const n = endTurn(s);
  assert.equal(n.turn, 1);
  assert.deepEqual(n.dice, []);
  assert.equal(n.rolled, null);
  assert.equal(n.moveNo, 3);
});

test('a checker moves the distance of its die', () => {
  const board = Array(24).fill(0);
  board[23] = 1; // player 0's back checker, on point 24
  const s = state({ board, turn: 0, dice: [3] });
  const steps = legalSteps(s);
  assert.deepEqual(steps, [{ from: 23, to: 20, die: 3 }]);
  const n = applyStep(s, steps[0]);
  assert.equal(n.board[23], 0);
  assert.equal(n.board[20], 1);
  assert.deepEqual(n.dice, []);
});

test('a lone enemy checker is hit onto the bar', () => {
  const board = Array(24).fill(0);
  board[10] = 1; // player 0 checker
  board[7] = -1; // lone player 1 checker, 3 pips away
  const s = state({ board, turn: 0, dice: [3] });
  const step = { from: 10, to: 7, die: 3 };
  assert.equal(isLegalStep(s, step), true);
  const n = applyStep(s, step);
  assert.equal(n.board[7], 1);
  assert.equal(n.bar[1], 1);
});

test('a point held by two or more enemy checkers is blocked', () => {
  const board = Array(24).fill(0);
  board[10] = 1;
  board[7] = -2;
  const s = state({ board, turn: 0, dice: [3] });
  assert.equal(legalSteps(s).length, 0);
});

test('a checker on the bar must enter before anything else moves', () => {
  const board = Array(24).fill(0);
  board[10] = 3; // could otherwise move freely
  const s = state({ board, bar: [1, 0], turn: 0, dice: [3, 5] });
  const steps = legalSteps(s);
  assert.ok(steps.every((st) => st.from === 'bar'));
  assert.deepEqual(
    steps.map((st) => st.to).sort((a, b) => a - b),
    [indexOf(0, 25 - 5), indexOf(0, 25 - 3)].sort((a, b) => a - b),
  );
});

test('entry from the bar is blocked by a made point', () => {
  const board = Array(24).fill(0);
  board[indexOf(0, 22)] = -2; // player 1 holds point 22, blocking a 3 (25-3=22)
  const s = state({ board, bar: [1, 0], turn: 0, dice: [3, 5] });
  const steps = legalSteps(s);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].to, indexOf(0, 20)); // the 5 (25-5=20) still enters
});

test('must use as many dice as possible: playing the 2 first also lets the 5 bear off', () => {
  const board = Array(24).fill(0);
  board[indexOf(0, 3)] = 1; // one checker, already home
  const s = state({ board, turn: 0, dice: [2, 5] });
  const steps = legalSteps(s);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].die, 2); // playing the 5 first would strand the 2 unplayed
});

test('doubles play the same die four times', () => {
  const board = Array(24).fill(0);
  board[indexOf(0, 24)] = 2;
  const s = state({ board, turn: 0, dice: [3, 3, 3, 3] });
  const steps = legalSteps(s);
  assert.ok(steps.every((st) => st.die === 3));
});

test('bearing off: needs every checker home, and a die too big for any point bears off the highest', () => {
  const board = Array(24).fill(0);
  board[indexOf(0, 4)] = 1; // the highest occupied point
  board[indexOf(0, 3)] = 1;
  let s = state({ board, turn: 0, dice: [6] });
  assert.equal(allHome(s, 0), true);
  // No checker sits on point 6, so the 6 bears off the highest point (4), not point 3.
  const steps = legalSteps(s);
  assert.deepEqual(steps, [{ from: indexOf(0, 4), to: 'off', die: 6 }]);
  s = applyStep(s, steps[0]);
  assert.equal(s.off[0], 1);
});

test('winning ends the game and scores single, gammon or backgammon', () => {
  // Single: the loser has already borne one off.
  let board = Array(24).fill(0);
  board[indexOf(0, 1)] = 1;
  let s = state({ board, off: [14, 1], turn: 0, dice: [1] });
  let step = legalSteps(s)[0];
  let n = applyStep(s, step);
  assert.equal(n.winner, 0);
  assert.equal(n.result, 1);

  // Gammon: the loser has borne off none, and has no checker on the bar or in the winner's home.
  board = Array(24).fill(0);
  board[indexOf(0, 1)] = 1;
  board[indexOf(1, 12)] = -15;
  s = state({ board, off: [14, 0], turn: 0, dice: [1] });
  n = applyStep(s, legalSteps(s)[0]);
  assert.equal(n.result, 2);

  // Backgammon: the loser still has a checker on the bar.
  board = Array(24).fill(0);
  board[indexOf(0, 1)] = 1;
  board[indexOf(1, 12)] = -14;
  s = state({ board, bar: [0, 1], off: [14, 0], turn: 0, dice: [1] });
  n = applyStep(s, legalSteps(s)[0]);
  assert.equal(n.result, 3);
});

test('turnOver: no dice left, or a roll with no legal moves', () => {
  const withDiceLeft = state({ dice: [3], board: (() => { const b = Array(24).fill(0); b[indexOf(0, 6)] = 1; return b; })() });
  assert.equal(turnOver(withDiceLeft), false);
  const noDice = state({ dice: [] });
  assert.equal(turnOver(noDice), true);
  const blocked = (() => {
    const b = Array(24).fill(0);
    b[indexOf(0, 4)] = 1;
    b[indexOf(0, 1)] = -2;
    return state({ board: b, dice: [3] });
  })();
  assert.equal(turnOver(blocked), true);
});

test('positionKey and notation', () => {
  const s = newGame();
  assert.equal(typeof positionKey(s), 'string');
  const board = Array(24).fill(0);
  board[indexOf(0, 24)] = 1;
  board[indexOf(0, 21)] = -1; // a lone blot, 3 away
  const st = state({ board, turn: 0, dice: [3] });
  const steps = legalSteps(st);
  assert.equal(notation(st, steps), '24/21*');
});

test('isValidState rejects malformed states', () => {
  assert.equal(isValidState(newGame()), true);
  assert.equal(isValidState(null), false);
  assert.equal(isValidState({ ...newGame(), board: [] }), false);
  const tooMany = newGame();
  tooMany.board[0] += 1;
  assert.equal(isValidState(tooMany), false);
});

test('allPlays finds every distinct resulting position', () => {
  const board = Array(24).fill(0);
  board[indexOf(0, 24)] = 2;
  const s = state({ board, turn: 0, dice: [6, 5] });
  const plays = allPlays(s);
  assert.ok(plays.length > 0);
  for (const { steps, state: end } of plays) {
    assert.equal(steps.length, 2);
    assert.equal(end.dice.length, 0);
    assert.equal(end.board.reduce((n, v) => n + Math.max(0, v), 0), 2);
  }
});

test('bot: choosePlay returns a legal play, for every level', () => {
  const s = newGame();
  for (const level of LEVELS) {
    const steps = choosePlay(s, level, { random: () => 0.5 });
    assert.ok(steps.length > 0);
    let cur = s;
    for (const step of steps) {
      assert.equal(isLegalStep(cur, step), true);
      cur = applyStep(cur, step);
    }
  }
});

test('bot: describePlay explains a hit', () => {
  const board = Array(24).fill(0);
  board[indexOf(0, 24)] = 1;
  board[indexOf(0, 21)] = -1;
  const s = state({ board, turn: 0, dice: [3] });
  const steps = legalSteps(s);
  assert.match(describePlay(s, steps), /hits a checker/i);
});

test('bot: inContact and shots agree with the board', () => {
  const s = newGame();
  assert.equal(inContact(s), true);
  const board = Array(24).fill(0);
  board[indexOf(0, 24)] = 1;
  board[indexOf(0, 21)] = -1;
  const st = state({ board, turn: 1 });
  assert.ok(shots(st, 0, indexOf(0, 21)) > 0);
});

test('bot: evaluate favours the side ahead in the race', () => {
  const s = newGame();
  const ahead = clone(s);
  ahead.board = ahead.board.slice();
  // Move a player-0 checker 5 pips closer without changing anything else material.
  ahead.board[indexOf(0, 24)] -= 1;
  ahead.board[indexOf(0, 19)] += 1;
  assert.ok(evaluate(ahead, 0) > evaluate(s, 0));
});

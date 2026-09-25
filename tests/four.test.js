import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import { newGame, applyMove, replay, dropRow, legalColumns, winningColumns, threats, isValidState, isLegal } from '../games/four/js/engine.js';
import { chooseMove, analyse, explain, poisonedColumns, forcedIn, LEVELS } from '../games/four/js/bot.js';

const play = (moves, opts) => replay({ cols: 7, rows: 6, first: 1, ...opts }, moves);

test('discs drop to the lowest empty row and turns alternate', () => {
  let s = newGame();
  assert.equal(dropRow(s, 3), 0);
  s = applyMove(s, 3);
  assert.equal(s.turn, 2);
  assert.equal(dropRow(s, 3), 1);
  s = play([0, 0, 0, 0, 0, 0]);
  assert.equal(dropRow(s, 0), -1);
  assert.ok(!legalColumns(s).includes(0));
  assert.throws(() => applyMove(s, 0));
  assert.ok(!isLegal(s, 7));
});

test('four across, up and on both diagonals wins', () => {
  const across = play([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(across.winner, 1);
  assert.equal(across.line.length, 4);
  const up = play([6, 5, 6, 5, 6, 5, 6]);
  assert.equal(up.winner, 1);
  // Rising diagonal: 1 at (0,0) (1,1) (2,2) (3,3).
  const rising = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(rising.winner, 1);
  // Falling diagonal for player 2.
  const falling = play([3, 3, 3, 3, 2, 2, 1, 2, 6, 1, 6, 0]);
  assert.equal(falling.winner, 2);
  assert.deepEqual(legalColumns(falling), []);
});

test('a full board with no four is a draw', () => {
  // Columns filled in pairs so no line of four ever forms.
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  const s = play(order);
  assert.equal(s.winner, 0);
});

test('winning columns, threats and poisoned columns', () => {
  const s = play([0, 0, 1, 1, 2]); // player 1 has three across the bottom
  assert.equal(s.turn, 2);
  assert.deepEqual(winningColumns(s, 1), [3]);
  assert.deepEqual(winningColumns(s), []);
  assert.ok(threats(s).some((t) => t.c === 3 && t.r === 0 && t.p === 1));
  // Player 2 threatens (3, 1): a disc in column 3 would let them win on top.
  const p = play([6, 4, 2, 2, 1, 1, 2, 4]);
  assert.ok(threats(p).some((t) => t.c === 3 && t.r === 1 && t.p === 2));
  assert.deepEqual(poisonedColumns(p), [3]);
});

test('saved states are checked by replaying the moves', () => {
  const s = play([3, 3, 4]);
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.ok(!isValidState({ ...s, cells: s.cells.map(() => 1) }));
  assert.ok(!isValidState(null));
});

test('the computer takes a win and blocks a loss at every level', () => {
  const win = play([0, 6, 1, 6, 2]); // player 2 to move, player 1 threatens column 3
  for (const level of LEVELS) {
    // Easy blocks most of the time; the others always do.
    if (level !== 'easy') assert.equal(chooseMove(win, level, { timeMs: 200, random: mulberry32(1) }), 3, `${level} blocks`);
  }
  const mine = play([0, 6, 1, 6, 2, 6]); // player 1 to move and can win at 3
  for (const level of LEVELS) assert.equal(chooseMove(mine, level, { timeMs: 200, random: mulberry32(2) }), 3, `${level} wins`);
});

test('medium beats easy, and hard beats medium, most of the time', () => {
  const games = (a, b, n) => {
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const random = mulberry32(100 + i);
      const levels = i % 2 ? { 1: b, 2: a } : { 1: a, 2: b };
      let s = newGame();
      while (s.winner == null) s = applyMove(s, chooseMove(s, levels[s.turn], { random, maxDepth: levels[s.turn] === 'hard' ? 7 : null }));
      if (s.winner && levels[s.winner] === a) wins++;
    }
    return wins;
  };
  assert.ok(games('medium', 'easy', 10) >= 8, 'medium vs easy');
  assert.ok(games('hard', 'medium', 6) >= 4, 'hard vs medium');
});

test('analysis finds a forced win and the hint explains it', () => {
  // Player 1 to move with two open ends on the bottom row: a double threat wins.
  const s = play([2, 2, 3, 3]);
  const r = analyse(s, { timeMs: 2000, maxDepth: 6 });
  assert.ok([1, 4].includes(r.move));
  assert.equal(forcedIn(r.score), 2);
  const hint = explain(s, r, { 1: 'You', 2: 'the computer' });
  assert.ok([1, 4].includes(hint.column));
  assert.match(hint.text, /two threats|force a win/);
  const block = play([0, 6, 1, 6, 2]);
  assert.match(explain(block, null, { 1: 'Black', 2: 'White' }).text, /Block column 4/);
});

test('bigger boards work too', () => {
  let s = newGame({ cols: 9, rows: 7 });
  const random = mulberry32(5);
  while (s.winner == null) s = applyMove(s, chooseMove(s, 'medium', { random }));
  assert.ok(s.moves.length <= 63);
  assert.ok(isValidState(s));
});

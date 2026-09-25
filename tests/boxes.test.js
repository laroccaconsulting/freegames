import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, play, choose, over, winner, hLine, vLine, sides, boxesOf, lineCount, moves } from '../games/boxes/js/boxes.js';
import { mulberry32 } from '../games/boxes/core/rng.js';

const draw = (s, lines) => lines.reduce((st, l) => play(st, l).state, s);

test('line numbering covers every edge once', () => {
  const s = newGame(3, 2);
  assert.equal(lineCount(s), 3 * 3 + 2 * 4);
  const all = new Set();
  for (let b = 0; b < 6; b++) for (const l of sides(s, b)) all.add(l);
  assert.equal(all.size, lineCount(s));
  assert.deepEqual(boxesOf(s, hLine(s, 1, 0)).sort(), [0, 3]);
  assert.deepEqual(boxesOf(s, vLine(s, 0, 0)), [0]);
});

test('closing a box scores it and keeps the turn', () => {
  let s = newGame(2, 2);
  s = draw(s, [hLine(s, 0, 0), hLine(s, 1, 0), vLine(s, 0, 0)]);
  assert.equal(s.turn, 2, 'turns alternate while nothing closes');
  const res = play(s, vLine(s, 0, 1));
  assert.deepEqual(res.closed, [0]);
  assert.equal(res.state.boxes[0], 2);
  assert.equal(res.state.score[2], 1);
  assert.equal(res.state.turn, 2, 'closing a box means going again');
  assert.throws(() => play(res.state, vLine(s, 0, 1)));
});

test('one line can close two boxes', () => {
  let s = newGame(2, 1);
  s = draw(s, [hLine(s, 0, 0), hLine(s, 1, 0), vLine(s, 0, 0), hLine(s, 0, 1), hLine(s, 1, 1), vLine(s, 0, 2)]);
  const res = play(s, vLine(s, 0, 1));
  assert.equal(res.closed.length, 2);
  assert.ok(over(res.state));
  assert.equal(winner(res.state), res.state.turn);
});

test('the computer takes a free box and avoids giving one away', () => {
  let s = newGame(3, 3);
  s = draw(s, [hLine(s, 0, 0), hLine(s, 1, 0), vLine(s, 0, 0)]);
  for (const level of ['normal', 'hard']) assert.equal(choose(s, level, () => 0.1), vLine(s, 0, 1));
  // With a free box gone, a normal computer never draws a box's third side early.
  const s2 = draw(newGame(3, 3), [hLine(s, 0, 1)]);
  const random = mulberry32(3);
  for (let k = 0; k < 30; k++) {
    const l = choose(s2, 'normal', random);
    const { state } = play(s2, l);
    assert.ok(boxesOf(state, l).every((b) => sides(state, b).filter((x) => state.lines[x]).length < 3));
  }
});

test('games always finish, and harder computers win more', () => {
  const random = mulberry32(11);
  let hardWins = 0;
  for (let g = 0; g < 40; g++) {
    let s = newGame(4, 4, g % 2 ? 1 : 2);
    let guard = 0;
    while (!over(s) && guard++ < 100) s = play(s, choose(s, s.turn === 1 ? 'easy' : 'hard', random)).state;
    assert.ok(over(s));
    assert.equal(s.score[1] + s.score[2], 16);
    assert.equal(moves(s).length, 0);
    if (winner(s) === 2) hardWins++;
  }
  assert.ok(hardWins >= 34, `hard won ${hardWins} of 40`);
});

test('hard plays the double-dealing handout at the end of a long chain', () => {
  // Over many games against Normal, Hard sometimes declines the last two
  // boxes of a chain to keep control.
  const random = mulberry32(5);
  let dd = 0;
  let trials = 0;
  for (let g = 0; g < 60; g++) {
    let s = newGame(5, 5, 1);
    while (!over(s)) {
      const before = s;
      const l = choose(s, s.turn === 1 ? 'normal' : 'hard', random);
      s = play(s, l).state;
      // A handout: hard had a box to take, took nothing, and passed the turn.
      if (before.turn === 2 && s.turn === 1 && moves(before).some((m) => play(before, m).closed.length)) dd++;
    }
    trials++;
  }
  assert.ok(dd > 0, `hard made ${dd} handouts in ${trials} games`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import * as Y from '../games/dice/js/yacht.js';
import * as T from '../games/dice/js/tenk.js';

test('yacht: box scores', () => {
  assert.equal(Y.scoreBox('threes', [3, 3, 1, 2, 3]), 9);
  assert.equal(Y.scoreBox('three', [3, 3, 1, 2, 3]), 12);
  assert.equal(Y.scoreBox('four', [3, 3, 1, 2, 3]), 0);
  assert.equal(Y.scoreBox('house', [2, 2, 5, 5, 5]), 25);
  assert.equal(Y.scoreBox('small', [1, 2, 3, 4, 6]), 30);
  assert.equal(Y.scoreBox('small', [1, 2, 3, 5, 6]), 0);
  assert.equal(Y.scoreBox('large', [2, 3, 4, 5, 6]), 40);
  assert.equal(Y.scoreBox('yacht', [4, 4, 4, 4, 4]), 50);
  assert.equal(Y.scoreBox('chance', [1, 2, 3, 4, 6]), 16);
});

test('yacht: bonus, extra yachts and totals', () => {
  let card = {};
  for (const [id, dice] of [['ones', [1, 1, 1, 2, 2]], ['twos', [2, 2, 2, 1, 1]], ['threes', [3, 3, 3, 1, 1]], ['fours', [4, 4, 4, 1, 1]], ['fives', [5, 5, 5, 1, 1]], ['sixes', [6, 6, 6, 1, 1]]]) card = Y.score(card, id, dice);
  assert.equal(Y.upperTotal(card), 63);
  assert.equal(Y.total(card), 63 + 35);
  card = Y.score(card, 'yacht', [6, 6, 6, 6, 6]);
  card = Y.score(card, 'chance', [6, 6, 6, 6, 6]);
  assert.equal(card.extra, 100);
  assert.throws(() => Y.score(card, 'chance', [1, 1, 1, 1, 1]));
});

test('yacht: seeded dice keep held dice and repeat for the same holds', () => {
  const d1 = Y.roll(7, 0, 0, [0, 0, 0, 0, 0], [false, false, false, false, false]);
  assert.deepEqual(d1, Y.roll(7, 0, 0, [0, 0, 0, 0, 0], [false, false, false, false, false]));
  const d2 = Y.roll(7, 0, 1, d1, [true, false, true, false, false]);
  assert.equal(d2[0], d1[0]);
  assert.equal(d2[2], d1[2]);
  for (const d of d2) assert.ok(d >= 1 && d <= 6);
});

test('yacht: the computer fills its card and scores sensibly', () => {
  const card = Y.botGame(3, mulberry32(3));
  assert.ok(Y.finished(card));
  assert.ok(Y.total(card) > 120);
});

test('ten thousand: scoring sets', () => {
  assert.equal(T.scoreSet([1, 1, 1]), 1000);
  assert.equal(T.scoreSet([2, 2, 2, 2]), 400);
  assert.equal(T.scoreSet([1, 2, 3, 4, 5, 6]), 1500);
  assert.equal(T.scoreSet([3, 3, 4, 4, 6, 6]), 1500);
  assert.equal(T.scoreSet([1, 5, 5]), 200);
  assert.equal(T.scoreSet([1, 2]), 0, 'every die must score');
  assert.deepEqual(T.best([1, 1, 1, 5, 2, 3]), { pick: [0, 1, 2, 3], points: 1050 });
  assert.ok(!T.scores([2, 3, 4, 6, 6, 2]));
  assert.ok(T.shouldBank(1200, 2, 0, 0));
  assert.ok(!T.shouldBank(100, 6, 0, 0));
  assert.ok(T.shouldBank(500, 6, 9600, 0), 'banks to win');
});

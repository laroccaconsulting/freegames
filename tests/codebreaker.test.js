import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, score, allCodes, consistent, solverGuesses, secretFrom, nextGuess } from '../games/codebreaker/js/rules.js';
import { mulberry32 } from '../template/core/rng.js';

test('scoring counts exact and near pegs, repeats included', () => {
  assert.deepEqual(score([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, near: 0 });
  assert.deepEqual(score([0, 1, 2, 3], [3, 2, 1, 0]), { exact: 0, near: 4 });
  assert.deepEqual(score([0, 0, 1, 1], [0, 1, 0, 2]), { exact: 1, near: 2 });
  assert.deepEqual(score([0, 0, 0, 1], [0, 0, 1, 1]), { exact: 3, near: 0 });
  assert.deepEqual(score([5, 5, 5, 5], [0, 1, 2, 3]), { exact: 0, near: 0 });
});

test('all codes and consistency', () => {
  const all = allCodes(MODES.classic);
  assert.equal(all.length, 1296);
  const secret = [2, 4, 4, 1];
  const history = [{ guess: [0, 0, 1, 1], result: score(secret, [0, 0, 1, 1]) }];
  const left = consistent(all, history);
  assert.ok(left.some((c) => c.join() === secret.join()));
  assert.ok(left.length < all.length);
});

test('the solver cracks every classic code within six guesses', () => {
  const random = mulberry32(1);
  for (let i = 0; i < 25; i++) {
    const secret = allCodes(MODES.classic)[Math.floor(random() * 1296)];
    assert.ok(solverGuesses(MODES.classic, secret) <= 6);
  }
  assert.ok(solverGuesses(MODES.hard, secretFrom(MODES.hard, 5)) <= 9);
});

test('secrets are deterministic; a guess is always suggested', () => {
  assert.deepEqual(secretFrom(MODES.classic, 9), secretFrom(MODES.classic, 9));
  const all = allCodes(MODES.classic);
  assert.ok(nextGuess(MODES.classic, all.slice(0, 50), mulberry32(2), all));
});

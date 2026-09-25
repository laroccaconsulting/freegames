import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../games/logic/js/lightup.js';
import * as T from '../games/logic/js/tents.js';

test('light up: bulbs light to the first black square', () => {
  const W = L.WHITE;
  const p = { n: 3, cells: [W, W, W, W, L.BLACK, W, W, W, W] };
  assert.deepEqual(L.sight(3, p.cells, 0).sort(), [1, 2, 3, 6]);
  assert.deepEqual(L.sight(3, p.cells, 1).sort(), [0, 2]);
});

test('light up puzzles are unique and their answers follow the rules', () => {
  for (const size of ['small', 'medium', 'large']) {
    for (const seed of [1, 2, 3]) {
      const p = L.generate(seed, size);
      assert.deepEqual(p, L.generate(seed, size));
      const res = L.solve(p);
      assert.equal(res.count, 1, `${size} #${seed}`);
      assert.deepEqual(res.solutions[0], p.solution);
      assert.ok(L.isSolved(p, p.solution));
      // Symmetric black squares.
      const N = p.n * p.n;
      for (let i = 0; i < N; i++) assert.equal(p.cells[i] === L.WHITE, p.cells[N - 1 - i] === L.WHITE);
    }
  }
});

test('light up flags bulbs that see each other', () => {
  const p = L.generate(4, 'small');
  const bulbs = p.solution.slice();
  const i = bulbs.indexOf(true);
  const j = L.sight(p.n, p.cells, i)[0];
  if (j != null) {
    bulbs[j] = true;
    assert.ok(L.conflicts(p, bulbs).has(i));
    assert.ok(!L.isSolved(p, bulbs));
  }
});

test('tents puzzles are unique, with a tree for every tent', () => {
  for (const size of ['small', 'medium', 'large']) {
    for (const seed of [1, 2, 3]) {
      const p = T.generate(seed, size);
      const res = T.solve(p);
      assert.equal(res.count, 1, `${size} #${seed}`);
      assert.deepEqual(res.solutions[0], p.solution);
      assert.equal(p.trees.filter(Boolean).length, p.solution.filter(Boolean).length);
      assert.ok(T.matches(p.n, p.trees, p.solution));
      assert.ok(T.isSolved(p, p.solution));
    }
  }
});

test('tents that touch are flagged', () => {
  const p = T.generate(2, 'small');
  const tents = p.solution.slice();
  const i = tents.indexOf(true);
  const j = T.around(p.n, i).find((k) => !p.trees[k] && !tents[k]);
  tents[j] = true;
  assert.ok(T.conflicts(p, tents).has(i));
  assert.ok(!T.isSolved(p, tents));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../games/logic/js/kakuro.js';

test('digit sets for a run length and sum', () => {
  const bitsOf = (m) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & (1 << d));
  assert.deepEqual(bitsOf(K.digitsFor(2, 3)), [1, 2]);
  assert.deepEqual(bitsOf(K.digitsFor(2, 17)), [8, 9]);
  assert.deepEqual(bitsOf(K.digitsFor(9, 45)), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(K.digitsFor(2, 2), 0, 'no two different digits make 2');
});

test('kakuro puzzles: every white square in two runs, one answer, no givens needed', () => {
  for (const size of ['small', 'medium', 'large']) {
    for (const seed of [1, 2, 3]) {
      const p = K.generate(seed, size);
      assert.deepEqual(p, K.generate(seed, size));
      const { n } = p;
      for (let i = 0; i < n * n; i++) {
        if (!p.white[i]) continue;
        const runs = p.runs.filter((r) => r.cells.includes(i));
        assert.deepEqual(runs.map((r) => r.dir).sort(), ['across', 'down'], `${size} #${seed} square ${i}`);
      }
      for (const run of p.runs) {
        const ds = run.cells.map((i) => p.solution[i]);
        assert.equal(new Set(ds).size, ds.length, 'no repeats in a run');
        assert.equal(ds.reduce((a, b) => a + b, 0), run.sum);
        assert.ok(run.cells.length <= 9 && !p.white[run.clue]);
      }
      const res = K.solve(p);
      assert.equal(res.count, 1, `${size} #${seed} unique`);
      assert.ok(K.isSolved(p, res.solutions[0]));
      assert.equal(K.conflicts(p, p.solution).size, 0);
    }
  }
});

test('kakuro flags repeats and wrong sums', () => {
  const p = K.generate(4, 'small');
  const v = p.solution.slice();
  const run = p.runs[0];
  v[run.cells[0]] = v[run.cells[1]];
  const bad = K.conflicts(p, v);
  assert.ok(bad.has(run.cells[0]) && bad.has(run.cells[1]));
  assert.ok(K.badRuns(p, v)[0]);
});

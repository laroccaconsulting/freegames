import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../games/nonograms/js/nonogram.js';

test('clues list the runs in order', () => {
  assert.deepEqual(N.clue([1, 1, 0, 1, 0, 0, 1, 1, 1]), [2, 1, 3]);
  assert.deepEqual(N.clue([0, 0, 0]), []);
  assert.deepEqual(N.clue([1, 1, 1]), [3]);
});

test('line solving finds the forced squares', () => {
  // 10 in 10: all filled.
  assert.deepEqual(N.solveLine([10], new Array(10).fill(0)), new Array(10).fill(1));
  // 7 in 10: the middle four overlap.
  assert.deepEqual(N.solveLine([7], new Array(10).fill(0)), [0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  // 3 1 in 5: fully decided.
  assert.deepEqual(N.solveLine([3, 1], new Array(5).fill(0)), [1, 1, 1, -1, 1]);
  // A known crossed square splits the options.
  assert.deepEqual(N.solveLine([2], [0, -1, 0, 0, -1]), [-1, -1, 1, 1, -1]);
  // No runs: everything is empty.
  assert.deepEqual(N.solveLine([], [0, 0, 0]), [-1, -1, -1]);
  // Contradiction.
  assert.equal(N.solveLine([3], [0, -1, 0, -1, 0]), null);
});

test('generated puzzles solve by lines alone to their picture', () => {
  for (const size of ['small', 'medium', 'large']) {
    for (const seed of [1, 2, 3, 4]) {
      const p = N.generate(seed, size);
      assert.deepEqual(p, N.generate(seed, size));
      const s = N.solve(p);
      assert.ok(s.every((v, i) => (v === 1) === Boolean(p.solution[i])), `${size} #${seed}`);
      assert.ok(p.rows.every((r) => r.length) && p.cols.every((c) => c.length));
      const fill = p.solution.filter(Boolean).length / p.solution.length;
      assert.ok(fill >= 0.4 && fill <= 0.62);
    }
  }
});

test('finished lines and a solved grid are recognised', () => {
  const p = N.generate(5, 'small');
  const cells = p.solution.map((v) => (v ? 1 : -1));
  assert.ok(N.isSolved(p, cells));
  const d = N.doneLines(p, cells);
  assert.ok(d.rows.every(Boolean) && d.cols.every(Boolean));
  const partial = cells.slice();
  const i = partial.indexOf(1);
  partial[i] = 0;
  assert.ok(!N.isSolved(p, partial));
  assert.ok(!N.doneLines(p, partial).rows[Math.floor(i / p.w)]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../games/logic/js/stars.js';

test('star battle: every size has one answer that follows the rules', () => {
  for (const size of Object.keys(S.SIZES)) {
    for (const seed of [1, 2, 3]) {
      const p = S.generate(seed * 97, size);
      assert.deepEqual(p, S.generate(seed * 97, size), 'deterministic');
      const { n, k } = p;
      assert.equal(new Set(p.regions).size, n, 'n regions');
      assert.equal(S.solve(n, k, p.regions).count, 1, 'unique');
      const marks = p.solution.map((s) => (s ? 2 : 0));
      assert.equal(S.conflicts(p, marks).size, 0);
      assert.ok(S.isSolved(p, marks));
      for (let r = 0; r < n; r++) assert.equal(p.solution.slice(r * n, r * n + n).filter(Boolean).length, k);
    }
  }
});

test('star battle: touching stars and crowded rows are conflicts', () => {
  const p = S.generate(5, 'small');
  const marks = new Array(36).fill(0);
  marks[0] = 2;
  marks[7] = 2; // diagonal neighbour
  assert.deepEqual([...S.conflicts(p, marks)].sort((a, b) => a - b), [0, 7]);
  const row = new Array(36).fill(0);
  row[0] = 2;
  row[2] = 2; // two in a row of a one-star puzzle
  assert.ok(S.conflicts(p, row).has(0));
  assert.ok(!S.isSolved(p, row));
});

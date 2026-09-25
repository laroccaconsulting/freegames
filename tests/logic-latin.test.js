import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomLatin, countLatin, candidates } from '../games/logic/js/latin.js';
import * as F from '../games/logic/js/futoshiki.js';
import * as S from '../games/logic/js/skyscrapers.js';
import { mulberry32 } from '../games/logic/core/rng.js';

const isLatin = (n, g) => {
  for (let k = 0; k < n; k++) {
    const row = new Set(g.slice(k * n, k * n + n));
    const col = new Set(Array.from({ length: n }, (_, r) => g[r * n + k]));
    if (row.size !== n || col.size !== n) return false;
  }
  return g.every((v) => v >= 1 && v <= n);
};

test('random Latin squares are valid and seeded', () => {
  for (const n of [4, 5, 6, 7]) {
    const g = randomLatin(n, mulberry32(n));
    assert.ok(isLatin(n, g));
    assert.deepEqual(g, randomLatin(n, mulberry32(n)));
  }
  assert.equal(countLatin(3, new Array(9).fill(0), () => true, { max: 20 }).count, 12);
});

test('futoshiki puzzles have one answer that keeps every sign', () => {
  for (const size of ['small', 'medium', 'large']) {
    for (const seed of [1, 2, 3]) {
      const p = F.generate(seed, size);
      assert.deepEqual(p, F.generate(seed, size));
      assert.ok(isLatin(p.n, p.solution));
      for (const s of p.signs) assert.ok(p.solution[s.a] < p.solution[s.b]);
      p.givens.forEach((v, i) => v && assert.equal(v, p.solution[i]));
      const res = countLatin(p.n, p.givens, F.rule(p));
      assert.equal(res.count, 1, `${size} #${seed}`);
      assert.deepEqual(res.solutions[0], p.solution);
      assert.ok(p.givens.filter(Boolean).length <= p.n, 'not too many givens');
    }
  }
});

test('futoshiki flags broken signs and repeats', () => {
  const p = { n: 3, givens: new Array(9).fill(0), signs: [{ a: 0, b: 1 }], solution: [1, 2, 3, 2, 3, 1, 3, 1, 2] };
  const v = [2, 1, 0, 0, 0, 0, 0, 0, 2];
  const bad = F.conflicts(p, v);
  assert.ok(bad.has(0) && bad.has(1), 'broken sign');
  assert.ok(!bad.has(8));
  assert.deepEqual(candidates(3, [0, 0, 0, 0, 0, 0, 0, 0, 0], F.rule(p), 0), [1, 2]);
});

test('skyscraper clues count visible buildings', () => {
  assert.equal(S.visible([1, 2, 3, 4]), 4);
  assert.equal(S.visible([4, 3, 2, 1]), 1);
  assert.equal(S.visible([2, 1, 4, 3]), 2);
  for (const size of ['small', 'medium', 'large']) {
    for (const seed of [1, 2]) {
      const p = S.generate(seed, size);
      const { n } = p;
      assert.ok(isLatin(n, p.solution));
      for (let k = 0; k < n; k++) {
        const row = p.solution.slice(k * n, k * n + n);
        if (p.clues.left[k]) assert.equal(S.visible(row), p.clues.left[k]);
        if (p.clues.right[k]) assert.equal(S.visible(row.slice().reverse()), p.clues.right[k]);
      }
      const res = countLatin(n, p.givens, S.rule(p));
      assert.equal(res.count, 1, `${size} #${seed}`);
      assert.deepEqual(res.solutions[0], p.solution);
      assert.equal(S.conflicts(p, p.solution).size, 0);
      assert.equal(S.badClues(p, p.solution).size, 0);
    }
  }
});

test('a full row that breaks its view clue is flagged', () => {
  const p = S.generate(1, 'small');
  const k = p.clues.left.findIndex(Boolean);
  const v = new Array(16).fill(0);
  // Fill that row in an order that shows a different number of buildings.
  const want = p.clues.left[k];
  const perms = [[1, 2, 3, 4], [4, 3, 2, 1], [2, 1, 4, 3]];
  const row = perms.find((r) => S.visible(r) !== want);
  row.forEach((h, c) => (v[k * 4 + c] = h));
  assert.ok(S.badClues(p, v).has(`left${k}`));
});

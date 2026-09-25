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

import * as C from '../games/logic/js/calc.js';

test('calcudoku: Latin square, cages hit their targets, one answer', () => {
  for (const size of Object.keys(C.SIZES)) {
    for (const seed of [1, 2, 3]) {
      const p = C.generate(seed * 13, size);
      const { n } = p;
      assert.deepEqual(p, C.generate(seed * 13, size), 'deterministic');
      for (let r = 0; r < n; r++) assert.equal(new Set(p.solution.slice(r * n, r * n + n)).size, n, 'row');
      for (let c = 0; c < n; c++) assert.equal(new Set(p.solution.filter((_, i) => i % n === c)).size, n, 'column');
      const covered = p.cages.flatMap((k) => k.cells).sort((a, b) => a - b);
      assert.deepEqual(covered, [...Array(n * n).keys()], 'cages cover the grid once');
      assert.equal(C.conflicts(p, p.solution).size, 0);
      assert.equal(C.solve(p).count, 1, 'unique');
    }
  }
});

test('calcudoku: repeats and missed targets are conflicts', () => {
  const p = C.generate(4, 'small');
  const v = p.solution.slice();
  v[0] = v[1];
  assert.ok(C.conflicts(p, v).has(0));
  assert.ok(!C.isSolved(p, v));
  assert.ok(C.isSolved(p, p.solution));
  assert.equal(C.label({ op: '+', target: 7 }), '7+');
});

import * as B from '../games/logic/js/bridges.js';

test('bridges: the answer fits every island, is connected, and is the only one', () => {
  for (const size of Object.keys(B.SIZES)) {
    for (const seed of [1, 2, 3]) {
      const p = B.generate(seed * 29, size);
      assert.deepEqual(p, B.generate(seed * 29, size), 'deterministic');
      assert.equal(p.islands.length, B.SIZES[size].islands);
      assert.ok(B.isSolved(p, p.solution));
      assert.equal(B.solve(p).count, 1, 'unique');
      for (const s of p.islands) assert.ok(s.n >= 1 && s.n <= 8);
    }
  }
});

test('bridges: crossing, totals and connection', () => {
  const islands = [{ r: 0, c: 1 }, { r: 2, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 2 }];
  assert.ok(B.crosses(islands, [0, 1], [2, 3]));
  assert.ok(!B.crosses(islands, [0, 1], [0, 1]));
  const p = { w: 3, h: 3, islands: islands.map((s) => ({ ...s, n: 1 })), edges: [[0, 1], [2, 3]], solution: [1, 1] };
  assert.deepEqual(B.totals(p, [1, 0]), [1, 1, 0, 0]);
  assert.ok(!B.connected(4, p.edges, [1, 1]));
  assert.ok(!B.isSolved(p, [1, 1]), 'crossing and not connected');
});

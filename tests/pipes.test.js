import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../games/pipes/js/pipes.js';

test('rotation turns pipe ends clockwise', () => {
  assert.equal(P.rotate(P.UP, 1), P.RIGHT);
  assert.equal(P.rotate(P.UP | P.RIGHT, 1), P.RIGHT | P.DOWN);
  assert.equal(P.rotate(P.LEFT, 1), P.UP);
  assert.equal(P.rotate(P.UP | P.DOWN, 2), P.UP | P.DOWN);
  assert.equal(P.rotate(P.UP, -1), P.LEFT);
});

test('boards are one connected tree that solves at rotation zero', () => {
  for (const size of Object.keys(P.SIZES)) {
    for (const seed of [1, 2, 3]) {
      const p = P.generate(seed, size);
      assert.deepEqual(p, P.generate(seed, size));
      const zero = new Array(p.w * p.h).fill(0);
      assert.ok(P.isSolved(p, zero), `${size} #${seed}`);
      // A tree: edges = tiles - 1.
      const ends = p.solution.reduce((s, m) => s + [1, 2, 4, 8].filter((b) => m & b).length, 0);
      assert.equal(ends / 2, p.w * p.h - 1);
    }
  }
});

test('par turns every tile back, and turning them solves the board', () => {
  const p = P.generate(4, 'medium');
  const left = P.turnsLeft(p, p.start);
  const rot = p.start.map((r, i) => r + left[i]);
  assert.ok(P.isSolved(p, rot));
  assert.equal(P.par(p), left.reduce((a, t) => a + Math.min(t, 4 - t), 0));
  assert.ok(!P.isSolved(p, p.start) || P.par(p) === 0);
});

test('water reaches only tiles joined to the source', () => {
  const p = P.generate(5, 'small');
  const zero = new Array(p.w * p.h).fill(0);
  assert.ok(P.flow(p, zero).every(Boolean));
  const broken = zero.slice();
  const k = p.solution.findIndex((m, i) => i !== p.source && P.rotate(m, 1) !== m);
  broken[k] = 1;
  assert.ok(!P.isSolved(p, broken));
});

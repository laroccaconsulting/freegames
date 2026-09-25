import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBoard, region, flood, done, solve, levelSpec } from '../games/flood/js/flood.js';

test('flooding repaints the corner region and joins neighbours', () => {
  const n = 3;
  const cells = [0, 0, 1, 1, 0, 1, 2, 2, 2];
  assert.deepEqual(region(n, cells).sort((a, b) => a - b), [0, 1, 4]);
  const next = flood(n, cells, 1);
  assert.deepEqual(region(n, next).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.equal(flood(n, cells, 0), cells, 'same colour does nothing');
  assert.ok(done(flood(n, next, 2)));
});

test('the solver floods every board it is given', () => {
  for (const [n, colors, seed] of [[6, 3, 1], [10, 4, 2], [12, 6, 3]]) {
    const b = newBoard(n, colors, seed);
    assert.deepEqual(b, newBoard(n, colors, seed));
    const moves = solve(n, b.cells);
    let cells = b.cells;
    for (const m of moves) cells = flood(n, cells, m);
    assert.ok(done(cells));
    assert.ok(moves.length <= n * 2);
  }
});

test('levels grow in size and colours', () => {
  assert.deepEqual(levelSpec(1), { n: 8, colors: 4 });
  assert.ok(levelSpec(50).n <= 18 && levelSpec(50).colors <= 6);
});

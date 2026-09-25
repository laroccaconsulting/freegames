import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import * as U from '../games/slide/js/unblock.js';
import * as T from '../games/slide/js/tiles.js';

// A small hand-made board: the key block at the left of row 2, blocked by an
// upright block in column 3 that can move down once the block below it moves.
const sample = {
  size: 6,
  exit: 2,
  blocks: [
    { h: true, len: 2, lane: 2, pos: 0 },
    { h: false, len: 2, lane: 3, pos: 1 }, // column 3, rows 1–2
    { h: true, len: 2, lane: 0, pos: 2 }, // row 0, columns 2–3: blocks it going up
    { h: true, len: 3, lane: 4, pos: 2 }, // row 4, columns 2–4
  ],
};

test('unblock: blocks slide along their lane and stop at others', () => {
  assert.deepEqual(U.range(sample, 0), [0, 1]);
  assert.deepEqual(U.range(sample, 1), [1, 2]); // down one, then row 4 is taken
  assert.deepEqual(U.range(sample, 2), [0, 4]);
  assert.ok(U.isLegalMove(sample, { b: 1, to: 2 }));
  assert.ok(!U.isLegalMove(sample, { b: 1, to: 3 }));
  assert.ok(!U.isLegalMove(sample, { b: 0, to: 0 }), 'staying put is not a move');
  const moved = U.applyMove(sample, { b: 2, to: 4 });
  assert.equal(moved.blocks[2].pos, 4);
  assert.equal(sample.blocks[2].pos, 2, 'input untouched');
  assert.ok(!U.isSolved(sample));
  assert.ok(U.isSolved(U.withPositions(sample, [4, 3, 2, 2])));
});

test('unblock: the solver finds the shortest solution', () => {
  const moves = U.solve(sample);
  // Row 0 block slides away, the upright block goes up, the key block goes out.
  assert.equal(moves.length, 3);
  let p = sample;
  for (const m of moves) p = U.applyMove(p, m);
  assert.ok(U.isSolved(p));
  const stuck = { ...sample, blocks: [...sample.blocks, { h: false, len: 3, lane: 5, pos: 0 }, { h: false, len: 3, lane: 5, pos: 3 }] };
  assert.equal(U.solve(stuck), null, 'a full exit column can never clear');
});

test('unblock: generated levels have exact par and are deterministic', () => {
  for (const level of [1, 4, 9]) {
    const target = U.levelTarget(level);
    const a = U.generate(U.levelSeed(level), target);
    const b = U.generate(U.levelSeed(level), target);
    assert.deepEqual(a, b, 'same seed, same board');
    assert.equal(a.par, target);
    assert.equal(U.solve(a.puzzle).length, a.par);
    const cells = new Set();
    for (const blk of a.puzzle.blocks) for (const [r, c] of U.cellsOf(blk)) {
      assert.ok(r >= 0 && r < 6 && c >= 0 && c < 6);
      assert.ok(!cells.has(`${r},${c}`), 'no overlaps');
      cells.add(`${r},${c}`);
    }
    assert.ok(!a.puzzle.blocks.slice(1).some((blk) => blk.h && blk.lane === 2), 'no across block in the exit row');
  }
  assert.ok(U.levelTarget(100) <= 25);
});

test('tiles: tapping slides a whole line toward the gap', () => {
  const board = { n: 3, tiles: [1, 2, 3, 4, 5, 6, 7, 8, 0] };
  assert.ok(T.isSolved(board));
  assert.deepEqual(T.slideLine(board, 6), [7, 6]);
  assert.deepEqual(T.slideLine(board, 4), [], 'not in line with the gap');
  const r = T.tap(board, 6);
  assert.deepEqual(r.board.tiles, [1, 2, 3, 4, 5, 6, 0, 7, 8]);
  assert.equal(r.moved.length, 2);
  assert.equal(T.tap(board, 0), null);
  assert.deepEqual(T.tap(board, 2).board.tiles, [1, 2, 0, 4, 5, 3, 7, 8, 6]);
});

test('tiles: solvability parity', () => {
  assert.ok(T.isSolvable({ n: 3, tiles: [1, 2, 3, 4, 5, 6, 7, 8, 0] }));
  assert.ok(!T.isSolvable({ n: 3, tiles: [2, 1, 3, 4, 5, 6, 7, 8, 0] }));
  assert.ok(T.isSolvable({ n: 4, tiles: T.goal(4) }));
  const swapped = T.goal(4);
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.ok(!T.isSolvable({ n: 4, tiles: swapped }));
});

// Breadth-first search over every 3×3 position: the ground truth for par.
function bfs(board) {
  const key = (t) => t.join(',');
  const goal = key(T.goal(3));
  const seen = new Map([[key(board.tiles), 0]]);
  const queue = [board.tiles];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head];
    const d = seen.get(key(t));
    if (key(t) === goal) return d;
    const gap = t.indexOf(0);
    for (const i of [gap - 3, gap + 3, gap % 3 ? gap - 1 : -1, gap % 3 < 2 ? gap + 1 : -1]) {
      if (i < 0 || i > 8) continue;
      const next = t.slice();
      [next[gap], next[i]] = [next[i], 0];
      if (!seen.has(key(next))) {
        seen.set(key(next), d + 1);
        queue.push(next);
      }
    }
  }
  return -1;
}

test('tiles: IDA* par matches breadth-first search on 3×3', () => {
  const random = mulberry32(11);
  for (let k = 0; k < 6; k++) {
    let tiles;
    do tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => random() - 0.5);
    while (!T.isSolvable({ n: 3, tiles }));
    const path = T.solve({ n: 3, tiles });
    assert.equal(path.length, bfs({ n: 3, tiles }));
    let b = { n: 3, tiles };
    for (const i of path) b = T.tap(b, i).board;
    assert.ok(T.isSolved(b));
  }
});

test('tiles: generated boards are deterministic with exact par', () => {
  for (const [n, level] of [[3, 1], [3, 12], [4, 1], [4, 4]]) {
    const a = T.generate(T.levelSeed(n, level), n, T.levelSteps(n, level));
    assert.deepEqual(a, T.generate(T.levelSeed(n, level), n, T.levelSteps(n, level)));
    assert.ok(T.isSolvable(a.board));
    assert.ok(!T.isSolved(a.board));
    assert.equal(T.solve(a.board).length, a.par);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topRun, pourAmount, pour, isSolved, isComplete, usefulMoves, segmentsOver, stateKey, hasLegalMove } from '../games/sort/js/rules.js';
import { solve } from '../games/sort/js/solver.js';
import { generate, deal, levelColors, levelSeed } from '../games/sort/js/levels.js';

test('pouring moves the whole top run, as much as fits', () => {
  const tubes = [[0, 1, 1], [2, 1], []];
  assert.equal(topRun(tubes[0]), 2);
  assert.equal(pourAmount(tubes, 0, 1), 2);
  assert.deepEqual(pour(tubes, 0, 1), [[0], [2, 1, 1, 1], []]);
  assert.equal(pourAmount([[1, 1, 1], [0, 0, 1], []], 0, 1), 1); // only one space left
  assert.equal(pourAmount(tubes, 0, 0), 0);
  assert.equal(pourAmount([[0], [1]], 0, 1), 0); // colour mismatch
  assert.equal(pourAmount([[0], [1, 1, 1, 1]], 0, 1), 0); // full
  assert.equal(pour([[0], [1]], 0, 1), null);
  assert.deepEqual(tubes, [[0, 1, 1], [2, 1], []], 'input untouched');
});

test('solved and complete', () => {
  assert.ok(isComplete([2, 2, 2, 2]));
  assert.ok(!isComplete([2, 2, 2]));
  assert.ok(isSolved([[1, 1, 1, 1], [], [0, 0, 0, 0]]));
  assert.ok(!isSolved([[1, 1, 1], [1], [0, 0, 0, 0]]));
});

test('useful moves skip pointless pours', () => {
  const tubes = [[0, 0, 0, 0], [1, 1], [], []];
  const moves = usefulMoves(tubes);
  assert.ok(!moves.some(([f]) => f === 0), 'finished tube never moves');
  assert.ok(!moves.some(([f, t]) => f === 1 && tubes[t].length === 0), 'single-colour tube never tipped into an empty one');
  assert.ok(hasLegalMove(tubes));
  assert.ok(!hasLegalMove([[0, 1, 0, 1], [1, 0, 1, 0]]));
});

test('state key ignores tube order', () => {
  assert.equal(stateKey([[0, 1], [], [1]]), stateKey([[1], [0, 1], []]));
  assert.equal(segmentsOver([[0, 1, 1], [1, 0]]), 2);
});

test('solver finds the known shortest solution', () => {
  // Two swaps needed: best is 3 pours.
  const tubes = [[0, 0, 0, 1], [1, 1, 1, 0], []];
  const { moves } = solve(tubes);
  assert.equal(moves.length, 3);
  let t = tubes;
  for (const [a, b] of moves) t = pour(t, a, b);
  assert.ok(isSolved(t));
});

test('solver reports unsolvable positions', () => {
  const { moves, gaveUp } = solve([[0, 1, 0, 1], [1, 0, 1, 0]]);
  assert.equal(moves, null);
  assert.ok(!gaveUp);
});

test('deals are seeded and contain each colour exactly four times', () => {
  const a = deal(1234, 7);
  assert.deepEqual(a, deal(1234, 7));
  assert.notDeepEqual(a, deal(1235, 7));
  assert.equal(a.length, 9);
  const counts = new Map();
  for (const c of a.flat()) counts.set(c, (counts.get(c) || 0) + 1);
  assert.equal(counts.size, 7);
  assert.ok([...counts.values()].every((n) => n === 4));
});

test('generated levels are solvable in exactly par moves', () => {
  for (const level of [1, 4, 12, 25]) {
    const g = generate(levelSeed(level), levelColors(level));
    assert.equal(g.solution.length, g.par);
    let t = g.tubes;
    for (const [a, b] of g.solution) {
      t = pour(t, a, b);
      assert.ok(t, `legal move on level ${level}`);
    }
    assert.ok(isSolved(t), `level ${level} solves`);
    assert.deepEqual(generate(levelSeed(level), levelColors(level)).tubes, g.tubes, 'same level every time');
  }
});

test('difficulty ramps up and stays within bounds', () => {
  assert.equal(levelColors(1), 3);
  for (let l = 1; l < 200; l++) {
    assert.ok(levelColors(l) >= 3 && levelColors(l) <= 12);
    if (l < 80) assert.ok(levelColors(l + 1) >= levelColors(l));
  }
});

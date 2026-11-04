import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topRun, pourAmount, pour, replay, isSolved, isComplete, isOpen, lockOf, usefulMoves, segmentsOver, stateKey, hasLegalMove } from '../games/sort/js/rules.js';
import { solve } from '../games/sort/js/solver.js';
import { generate, deal, levelColors, levelSeed, advancedSpec, dealAdvanced, generateAdvanced } from '../games/sort/js/levels.js';

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

test('classic levels are unchanged by the Advanced rules', () => {
  // Pinned from before Advanced: same seeds must give the same par.
  for (const [level, par] of [[3, 13], [12, 17], [30, 30]]) assert.equal(generate(levelSeed(level), levelColors(level)).par, par, `level ${level}`);
});

test('hidden units stay put until they reach the top, then show', () => {
  const tubes = [[~0, 1, 1], [1], []];
  assert.equal(topRun([~1, 1]), 1, 'a hidden unit does not join the run above it');
  const next = pour(tubes, 0, 2);
  assert.deepEqual(next[0], [0], 'revealed once on top');
  assert.deepEqual(pour([[~1, 1], [1, 1], [0]], 0, 1)[0], [1]);
  // A tube that fills up with one colour shows everything.
  assert.deepEqual(pour([[~0, 0, 0], [1, 0]], 1, 0)[0], [0, 0, 0, 0]);
  assert.ok(!isComplete([~0, 0, 0, 0]));
  assert.equal(segmentsOver([[~0, 0], [~1, 1]]), 0, 'hidden counts as its colour');
});

test('small tubes hold less and never count as finished', () => {
  const layout = { size: 4, kinds: [null, { cap: 2 }] };
  assert.equal(pourAmount([[0, 0, 0], []], 0, 1, layout), 2);
  assert.ok(!isComplete([0, 0], 4));
  assert.ok(!isSolved([[0, 0], [0, 0]], 4));
});

test('locked tubes open once their key colour is finished', () => {
  const layout = { size: 4, kinds: [{ key: 1 }, null, null] };
  const tubes = [[0, 0], [1, 1, 1], [1, 0, 0]];
  assert.equal(lockOf(tubes, 0, layout), 1);
  assert.ok(!isOpen(tubes, 0, layout));
  assert.equal(pourAmount(tubes, 2, 0, layout), 0, 'cannot pour into a locked tube');
  assert.equal(lockOf([[0, 0], [1, 1, 1, 1], [0, 0]], 0, layout), null);
  assert.equal(pourAmount([[0, 0], [1, 1, 1, 1], [0, 0]], 2, 0, layout), 2);
});

test('frozen tubes thaw after their pours, and undo replays', () => {
  const layout = { size: 4, kinds: [{ ice: 2 }, null, null] };
  const tubes = [[0], [1, 0], [1]];
  assert.equal(pourAmount(tubes, 1, 0, layout, 0), 0);
  assert.equal(pourAmount(tubes, 1, 0, layout, 2), 1);
  assert.notEqual(stateKey(tubes, layout, 0), stateKey(tubes, layout, 1), 'pour count matters while frozen');
  assert.equal(stateKey(tubes, layout, 2), stateKey(tubes, layout, 5));
  assert.ok(!hasLegalMove([[0], [1], [2]], { size: 4, kinds: [{ ice: 3 }] }));
  // Replaying from the start puts a hidden unit back.
  const start = [[~0, 1], [1], []];
  assert.deepEqual(replay(start, [[0, 1]])[0], [0]);
  assert.deepEqual(replay(start, []), start);
  assert.notEqual(stateKey([[0], []], { size: 4, kinds: [null, { cap: 2 }] }), stateKey([[], [0]], { size: 4, kinds: [null, { cap: 2 }] }), 'tubes of different kinds do not swap');
});

test('solver respects locks: the key colour has to be finished first', () => {
  const layout = { size: 2, kinds: [{ key: 0 }] };
  // Tube 0 holds the 1s but is locked until the 0s are together.
  const { moves } = solve([[1, 1], [0, 2], [0, 2], []], { layout });
  assert.ok(moves);
  let t = [[1, 1], [0, 2], [0, 2], []];
  moves.forEach(([a, b], i) => (t = pour(t, a, b, layout, i)));
  assert.ok(isSolved(t, 2));
});

test('advanced bands bring in one twist at a time', () => {
  assert.equal(advancedSpec(1).empties, 1);
  assert.equal(advancedSpec(1).small, 1);
  assert.ok(advancedSpec(12).hidden > 0 && !advancedSpec(12).locks);
  assert.ok(advancedSpec(22).locks && !advancedSpec(22).ice);
  assert.ok(advancedSpec(32).ice && !advancedSpec(32).locks);
  assert.ok(advancedSpec(42).size > 4);
  for (let l = 1; l < 120; l++) {
    const s = advancedSpec(l);
    assert.ok(s.colors >= 5 && s.colors <= 9 && s.size >= 4 && s.size <= 6 && s.hidden < s.size, `level ${l}`);
  }
  const { tubes, layout } = dealAdvanced(42, advancedSpec(22));
  assert.equal(tubes.length, layout.kinds.length);
  assert.equal(layout.kinds.filter((k) => k?.key != null).length, 1);
});

test('advanced levels are seeded and solve in exactly par moves', () => {
  for (const level of [1, 12, 23, 34, 43]) {
    const g = generateAdvanced(level);
    assert.equal(g.solution.length, g.par);
    let t = g.tubes;
    g.solution.forEach(([a, b], i) => {
      t = pour(t, a, b, g.layout, i);
      assert.ok(t, `legal move on advanced ${level}`);
    });
    assert.ok(isSolved(t, g.layout.size), `advanced ${level} solves`);
    assert.deepEqual(replay(g.tubes, g.solution, g.layout), t);
    assert.deepEqual(generateAdvanced(level).tubes, g.tubes, 'same level every time');
  }
});

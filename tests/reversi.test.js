import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import { newGame, applyMove, legalMoves, flips, count, replay, name } from '../games/reversi/js/engine.js';
import { chooseMove, analyse, explain, LEVELS } from '../games/reversi/js/bot.js';

test('opening: four legal moves for dark, each flips one', () => {
  const s = newGame();
  assert.deepEqual(legalMoves(s).map(name).sort(), ['c4', 'd3', 'e6', 'f5']);
  for (const m of legalMoves(s)) assert.equal(flips(s.cells, m, 1).length, 1);
  const t = applyMove(s, 19); // d3
  assert.equal(count(t.cells, 1), 4);
  assert.equal(count(t.cells, 2), 1);
  assert.equal(t.turn, 2);
  assert.throws(() => applyMove(t, 0));
});

test('lines do not wrap round the edge of the board', () => {
  const cells = new Array(64).fill(0);
  cells[7] = 2; // h1
  cells[8] = 1; // a2: would bracket h1 only by wrapping
  assert.deepEqual(flips(cells, 6, 1), []);
});

test('passing and the end of the game', () => {
  // Dark fills everything except one square that light cannot use.
  const cells = new Array(64).fill(1);
  cells[0] = 0;
  cells[1] = 2;
  const s = { cells, turn: 1, moves: [], winner: null };
  const end = applyMove(s, 0);
  assert.equal(end.winner, 1);
  assert.equal(count(end.cells, 1), 64);
});

test('every level plays whole legal games; replay rebuilds them', () => {
  for (const level of LEVELS) {
    const random = mulberry32(3);
    let s = newGame();
    while (s.winner == null) {
      const m = chooseMove(s, level, { random, maxDepth: level === 'hard' ? 3 : null, timeMs: 60000 });
      assert.ok(legalMoves(s).includes(m));
      s = applyMove(s, m);
    }
    assert.deepEqual(replay(s.moves).cells, s.cells);
    assert.ok(s.winner === 0 || s.winner === 1 || s.winner === 2);
  }
});

test('the computer takes a corner and hints explain why', () => {
  const cells = new Array(64).fill(0);
  cells[9] = 2; // b2
  cells[18] = 1; // c3: dark can take a1
  cells[27] = 2;
  cells[36] = 1;
  const s = { cells, turn: 1, moves: [], winner: null };
  assert.ok(legalMoves(s).includes(0));
  assert.equal(chooseMove(s, 'hard', { maxDepth: 2 }), 0);
  const r = analyse(s, { maxDepth: 2 });
  assert.match(explain(s, r).text, /corner/);
});

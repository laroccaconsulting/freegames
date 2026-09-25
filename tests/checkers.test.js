import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import { DARK, LIGHT, newGame, legalMoves, applyMove, replay, count, sameMove } from '../games/checkers/js/engine.js';
import { chooseMove, analyse, explain, LEVELS } from '../games/checkers/js/bot.js';

const at = (r, c) => r * 8 + c;

test('opening: 12 pieces each, seven moves for dark', () => {
  const s = newGame();
  assert.equal(count(s.cells, DARK), 12);
  assert.equal(count(s.cells, LIGHT), 12);
  assert.equal(legalMoves(s).length, 7);
});

test('captures are compulsory and chain', () => {
  const cells = new Array(64).fill(0);
  cells[at(5, 0)] = DARK;
  cells[at(4, 1)] = LIGHT;
  cells[at(2, 3)] = LIGHT;
  cells[at(6, 7)] = DARK;
  const s = { cells, turn: DARK, quiet: 0, moves: [], winner: null };
  const moves = legalMoves(s);
  assert.equal(moves.length, 1, 'only the jump');
  assert.deepEqual(moves[0].path, [at(3, 2), at(1, 4)]);
  assert.equal(moves[0].captures.length, 2);
  const after = applyMove(s, moves[0]);
  assert.equal(count(after.cells, LIGHT), 0);
  assert.equal(after.winner, DARK);
});

test('reaching the far row crowns, and kings move backwards', () => {
  const cells = new Array(64).fill(0);
  cells[at(1, 2)] = DARK;
  cells[at(2, 5)] = LIGHT;
  let s = { cells, turn: DARK, quiet: 0, moves: [], winner: null };
  s = applyMove(s, legalMoves(s).find((m) => m.path[0] === at(0, 1)));
  assert.equal(s.cells[at(0, 1)], 2 * DARK);
  s = applyMove(s, legalMoves(s)[0]);
  assert.ok(legalMoves(s).some((m) => m.path[0] === at(1, 0) || m.path[0] === at(1, 2)), 'king steps back');
});

test('every level plays legal games; replay rebuilds them', () => {
  for (const level of LEVELS) {
    const random = mulberry32(2);
    let s = newGame();
    for (let n = 0; n < 60 && s.winner == null; n++) {
      const m = chooseMove(s, level, { random, maxDepth: 3, timeMs: 60000 });
      assert.ok(legalMoves(s).some((x) => sameMove(x, m)));
      s = applyMove(s, m);
    }
    assert.deepEqual(replay(s.moves).cells, s.cells);
  }
});

test('hints explain a forced capture', () => {
  const cells = new Array(64).fill(0);
  cells[at(5, 2)] = DARK;
  cells[at(4, 3)] = LIGHT;
  cells[at(0, 7)] = LIGHT;
  const s = { cells, turn: DARK, quiet: 0, moves: [], winner: null };
  const r = analyse(s, { maxDepth: 3 });
  assert.match(explain(s, r).text, /Jump|win/);
});

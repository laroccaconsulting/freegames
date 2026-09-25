import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import { newGame, legalMoves, play, replay, chooseMove, analyse, explain, STORE } from '../games/mancala/js/engine.js';

const total = (s) => s.pits.reduce((a, b) => a + b, 0);

test('sowing, extra turns and skipping the other store', () => {
  const s = newGame();
  const r = play(s, 2); // 4 seeds: pits 3, 4, 5 and the store
  assert.ok(r.extra);
  assert.equal(r.state.turn, 0);
  assert.equal(r.state.pits[STORE[0]], 1);
  assert.equal(total(r.state), 48);
  const big = { ...newGame(), pits: [0, 0, 0, 0, 0, 13, 0, 1, 1, 1, 1, 1, 1, 0] };
  const r2 = play(big, 5);
  assert.equal(r2.state.pits[13], 0, 'never sows into the opponent’s store');
  assert.equal(total(r2.state), 19);
});

test('capturing from an empty pit of your own', () => {
  const s = { ...newGame(), pits: [1, 0, 3, 3, 3, 3, 0, 4, 4, 4, 4, 5, 4, 0] };
  const r = play(s, 0); // lands in empty pit 1; opposite is 11 (5 seeds)
  assert.deepEqual(r.capture, { pit: 1, from: 11, seeds: 6 });
  assert.equal(r.state.pits[STORE[0]], 6);
  assert.equal(r.state.pits[11], 0);
});

test('the game ends when a side is empty and each side banks its own', () => {
  const s = { ...newGame(), pits: [0, 0, 0, 0, 0, 1, 20, 2, 2, 2, 2, 2, 2, 15] };
  const r = play(s, 5);
  assert.equal(r.state.winner, 1, 'player 1 banks 12 more and wins 27 to 21');
  assert.equal(r.state.pits[13], 27);
  assert.equal(r.state.pits[6], 21);
});

test('computer levels play legal games; hints explain', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const random = mulberry32(4);
    let s = newGame();
    while (s.winner == null) {
      const m = chooseMove(s, level, { random, maxDepth: 3, timeMs: 60000 });
      assert.ok(legalMoves(s).includes(m));
      s = play(s, m).state;
    }
    assert.equal(total(s), 48);
    assert.deepEqual(replay(s.moves).pits, s.pits);
  }
  const s = newGame();
  assert.match(explain(s, analyse(s, { maxDepth: 2 })).text, /pit \d/);
});

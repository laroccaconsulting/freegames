import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import { newGame, applyMove, isLegalMove, shortestPath } from '../games/corridors/js/engine.js';
import { chooseMove, candidateWalls, evaluate, routeChanges, LEVELS } from '../games/corridors/js/bot.js';

// Plays a whole game; players[i] is a level for seat i. Returns the final state.
// Hard searches a fixed depth here, so results don't depend on the machine.
function playOut(levels, seed, { maxMoves = 300, maxDepth = 2 } = {}) {
  const random = mulberry32(seed);
  let s = newGame(levels.length);
  while (s.winner == null && s.moveNo < maxMoves) {
    const move = chooseMove(s, levels[s.turn], { random, timeMs: 60000, maxDepth });
    assert.ok(move && isLegalMove(s, move), `legal move at ${s.moveNo}`);
    s = applyMove(s, move);
  }
  return s;
}

test('every level plays legal moves to the end of a game', () => {
  for (const level of LEVELS) {
    const s = playOut([level, level], 7);
    assert.notEqual(s.winner, null, `${level} game finishes`);
  }
  const four = playOut(['medium', 'easy', 'hard', 'easy'], 3);
  assert.notEqual(four.winner, null);
});

test('evaluation is symmetric for two players', () => {
  let s = newGame(2);
  s = applyMove(s, { t: 'wall', r: 1, c: 3, o: 'H' });
  assert.equal(evaluate(s, 0), -evaluate(s, 1));
});

test('takes a winning step when there is one', () => {
  const s = newGame(2);
  s.players[0].pos = [1, 4];
  s.players[1].pos = [7, 0];
  for (const level of ['medium', 'hard']) {
    assert.deepEqual(chooseMove(s, level, { random: mulberry32(1), timeMs: 60000, maxDepth: 2 }), { t: 'pawn', to: [0, 4] });
  }
});

test('medium and hard block a rival about to win', () => {
  // Player 1 is one step from their goal; player 0, far behind, is to move.
  const s = newGame(2);
  s.players[1].pos = [7, 4];
  s.players[0].pos = [8, 0];
  for (const level of ['medium', 'hard']) {
    const move = chooseMove(s, level, { random: mulberry32(2), timeMs: 60000, maxDepth: 3 });
    assert.equal(move.t, 'wall', level);
    assert.ok(shortestPath(applyMove(s, move), 1) > 1, level);
  }
});

test('candidate walls sit on rival routes and are legal', () => {
  const s = newGame(2);
  const walls = candidateWalls(s);
  assert.ok(walls.length > 0 && walls.length <= 20);
  for (const w of walls) {
    assert.ok(isLegalMove(s, w));
    assert.ok(routeChanges(s, w)[1].after >= routeChanges(s, w)[1].before);
  }
  s.players[0].wallsLeft = 0;
  assert.deepEqual(candidateWalls(s), []);
});

test('stronger levels beat weaker ones', () => {
  const wins = (a, b, games) => {
    let won = 0;
    for (let g = 0; g < games; g++) {
      const levels = g % 2 ? [b, a] : [a, b];
      const s = playOut(levels, 100 + g, { maxDepth: 3 });
      if (s.winner != null && levels[s.winner] === a) won++;
    }
    return won;
  };
  assert.ok(wins('medium', 'easy', 6) >= 5, 'medium beats easy');
  assert.ok(wins('hard', 'medium', 4) >= 4, 'hard beats medium');
  assert.ok(wins('hard', 'easy', 4) >= 4, 'hard beats easy');
});

test('hard stays within its time budget', () => {
  let s = newGame(2);
  s = applyMove(s, { t: 'pawn', to: [7, 4] });
  s = applyMove(s, { t: 'pawn', to: [1, 4] });
  const t = Date.now();
  chooseMove(s, 'hard', { timeMs: 250 });
  assert.ok(Date.now() - t < 900);
});

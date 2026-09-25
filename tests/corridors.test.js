import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  applyMove,
  legalPawnMoves,
  wallError,
  legalWalls,
  shortestPath,
  shortestRoute,
  hashState,
  isValidState,
  moveError,
  IllegalMove,
} from '../games/corridors/js/engine.js';

const sorted = (cells) => cells.map(([r, c]) => `${r},${c}`).sort();
// Build a position directly: pawns at the given cells, with the given walls.
function position(n, pawns, walls = [], turn = 0) {
  const s = newGame(n);
  pawns.forEach((pos, i) => (s.players[i].pos = pos));
  s.walls = walls;
  s.turn = turn;
  return s;
}

test('new games: start squares, goals and wall counts', () => {
  const two = newGame(2);
  assert.deepEqual(two.players.map((p) => p.pos), [[8, 4], [0, 4]]);
  assert.deepEqual(two.players.map((p) => p.goal), ['N', 'S']);
  assert.ok(two.players.every((p) => p.wallsLeft === 10));
  const four = newGame(4);
  assert.deepEqual(four.players.map((p) => p.goal), ['N', 'E', 'S', 'W']);
  assert.ok(four.players.every((p) => p.wallsLeft === 5));
  assert.equal(newGame(2, { first: 1 }).turn, 1);
  assert.throws(() => newGame(3));
  assert.ok(isValidState(two) && isValidState(four));
});

test('plain moves in the open and at the edge', () => {
  const s = newGame(2);
  assert.deepEqual(sorted(legalPawnMoves(s, 0)), sorted([[7, 4], [8, 3], [8, 5]]));
  const corner = position(2, [[8, 0], [0, 4]]);
  assert.deepEqual(sorted(legalPawnMoves(corner, 0)), sorted([[7, 0], [8, 1]]));
});

test('walls stop pawns', () => {
  // H wall under cells (6,4),(6,5): blocks moving up from (7,4).
  const s = position(2, [[7, 4], [0, 4]], [{ r: 6, c: 4, o: 'H' }]);
  assert.deepEqual(sorted(legalPawnMoves(s, 0)), sorted([[8, 4], [7, 3], [7, 5]]));
  // The same wall anchored one left also covers column 4.
  const t = position(2, [[7, 4], [0, 4]], [{ r: 6, c: 3, o: 'H' }]);
  assert.ok(!legalPawnMoves(t, 0).some(([r, c]) => r === 6 && c === 4));
  // V wall right of column 4, rows 7-8.
  const v = position(2, [[7, 4], [0, 4]], [{ r: 7, c: 4, o: 'V' }]);
  assert.ok(!legalPawnMoves(v, 0).some(([r, c]) => r === 7 && c === 5));
});

test('straight jump over an adjacent pawn', () => {
  const s = position(2, [[5, 4], [4, 4]]);
  const moves = sorted(legalPawnMoves(s, 0));
  assert.ok(moves.includes('3,4'));
  assert.ok(!moves.includes('4,4'));
});

test('diagonal jump when a wall stops the straight jump', () => {
  // Wall behind the opponent (between rows 3 and 4).
  const s = position(2, [[5, 4], [4, 4]], [{ r: 3, c: 4, o: 'H' }]);
  assert.deepEqual(sorted(legalPawnMoves(s, 0)), sorted([[4, 3], [4, 5], [6, 4], [5, 3], [5, 5]]));
  // A wall beside the opponent (right of column 4, rows 4-5) cuts that diagonal.
  const u = position(2, [[5, 4], [4, 4]], [{ r: 3, c: 4, o: 'H' }, { r: 4, c: 4, o: 'V' }]);
  const moves = sorted(legalPawnMoves(u, 0));
  assert.ok(moves.includes('4,3'));
  assert.ok(!moves.includes('4,5'));
});

test('diagonal jump when the board edge stops the straight jump', () => {
  const s = position(2, [[1, 4], [0, 4]]);
  assert.deepEqual(sorted(legalPawnMoves(s, 0)), sorted([[0, 3], [0, 5], [2, 4], [1, 3], [1, 5]]));
});

test('no jump through a wall between the pawns', () => {
  const s = position(2, [[5, 4], [4, 4]], [{ r: 4, c: 4, o: 'H' }]);
  const moves = sorted(legalPawnMoves(s, 0));
  assert.ok(!moves.includes('4,4') && !moves.includes('3,4') && !moves.includes('4,3') && !moves.includes('4,5'));
});

test('four players: jumps, and diagonals when a pawn stops the jump', () => {
  // Pawn 0 at (5,4), pawn 1 at (4,4), pawn 2 at (3,4): straight jump lands on a pawn.
  const s = position(4, [[5, 4], [4, 4], [3, 4], [4, 8]]);
  const moves = sorted(legalPawnMoves(s, 0));
  assert.ok(!moves.includes('3,4'));
  assert.ok(moves.includes('4,3') && moves.includes('4,5'));
  // A diagonal onto another pawn isn't allowed either.
  const t = position(4, [[5, 4], [4, 4], [3, 4], [4, 5]]);
  assert.ok(!sorted(legalPawnMoves(t, 0)).includes('4,5'));
  // Players to move rotate clockwise and each has their own goal side.
  let g = newGame(4);
  g = applyMove(g, { t: 'pawn', to: [7, 4] });
  assert.equal(g.turn, 1);
  g = applyMove(g, { t: 'pawn', to: [4, 1] });
  assert.equal(shortestPath(g, 1), 7);
});

test('wall overlap and crossing are rejected', () => {
  const s = position(2, [[8, 4], [0, 4]], [{ r: 3, c: 3, o: 'H' }]);
  assert.equal(wallError(s, { r: 3, c: 3, o: 'H' }), 'overlap');
  assert.equal(wallError(s, { r: 3, c: 2, o: 'H' }), 'overlap');
  assert.equal(wallError(s, { r: 3, c: 4, o: 'H' }), 'overlap');
  assert.equal(wallError(s, { r: 3, c: 3, o: 'V' }), 'overlap', 'crossing');
  assert.equal(wallError(s, { r: 3, c: 5, o: 'H' }), null, 'touching end to end is fine');
  assert.equal(wallError(s, { r: 2, c: 3, o: 'V' }), null, 'a T junction is fine');
  const v = position(2, [[8, 4], [0, 4]], [{ r: 3, c: 3, o: 'V' }]);
  assert.equal(wallError(v, { r: 2, c: 3, o: 'V' }), 'overlap');
  assert.equal(wallError(v, { r: 4, c: 3, o: 'V' }), 'overlap');
  assert.equal(wallError(v, { r: 5, c: 3, o: 'V' }), null);
});

test('walls must be on the board', () => {
  const s = newGame(2);
  for (const w of [{ r: 8, c: 0, o: 'H' }, { r: 0, c: -1, o: 'V' }, { r: 0.5, c: 0, o: 'H' }, { r: 0, c: 0, o: 'X' }, null]) {
    assert.equal(wallError(s, w), 'out-of-bounds');
  }
});

test('a wall that cuts a player off from their goal is rejected', () => {
  // Player 1 sits in the top-left corner heading south. H(0,0) closes the
  // floor under (0,0) and (0,1); V(0,1) would close the only way out.
  const s = position(2, [[8, 4], [0, 0]], [{ r: 0, c: 0, o: 'H' }]);
  assert.equal(wallError(s, { r: 0, c: 1, o: 'V' }), 'blocks-path');
  assert.equal(wallError(s, { r: 0, c: 2, o: 'V' }), null, 'one column further along leaves a way out');
  assert.ok(legalWalls(s).every((w) => shortestPath(applyMove(s, { t: 'wall', ...w }), 1) > 0));
});

test('shortest path, and routes follow it', () => {
  const s = newGame(2);
  assert.equal(shortestPath(s, 0), 8);
  assert.equal(shortestPath(s, 1), 8);
  const w = applyMove(s, { t: 'wall', r: 6, c: 3, o: 'H' }); // wall right in front of player 0
  assert.equal(shortestPath(w, 0), 9);
  const route = shortestRoute(w, 0);
  assert.equal(route.length, 9);
  assert.equal(route.at(-1)[0], 0);
});

test('wall counts go down and running out stops walls', () => {
  let s = newGame(2);
  s = applyMove(s, { t: 'wall', r: 0, c: 0, o: 'H' });
  assert.equal(s.players[0].wallsLeft, 9);
  assert.equal(s.walls.length, 1);
  s.players[1].wallsLeft = 0;
  assert.equal(wallError(s, { r: 5, c: 5, o: 'H' }), 'no-walls');
  assert.equal(legalWalls(s).length, 0);
});

test('reaching the goal side wins and ends the game', () => {
  const s = position(2, [[1, 2], [5, 5]]);
  const won = applyMove(s, { t: 'pawn', to: [0, 2] });
  assert.equal(won.winner, 0);
  assert.equal(moveError(won, { t: 'pawn', to: [5, 4] }), 'game-over');
  assert.throws(() => applyMove(won, { t: 'pawn', to: [5, 4] }), IllegalMove);
});

test('applyMove is pure and rejects illegal moves', () => {
  const s = newGame(2);
  const copy = JSON.parse(JSON.stringify(s));
  const a = applyMove(s, { t: 'pawn', to: [7, 4] });
  const b = applyMove(a, { t: 'wall', r: 4, c: 4, o: 'V' });
  assert.deepEqual(s, copy);
  assert.equal(a.walls.length, 0);
  assert.equal(b.walls.length, 1);
  assert.equal(a.players[1].wallsLeft, 10);
  assert.equal(b.moveNo, 2);
  assert.equal(b.turn, 0);
  assert.throws(() => applyMove(s, { t: 'pawn', to: [6, 4] }), (e) => e.code === 'illegal-pawn');
  assert.throws(() => applyMove(s, { t: 'pawn', to: 'x' }), (e) => e.code === 'bad-move');
  assert.throws(() => applyMove(s, { t: 'jump' }), (e) => e.code === 'bad-move');
});

test('hashState tracks every change and ignores wall order', () => {
  const s = newGame(2);
  const a = applyMove(s, { t: 'pawn', to: [7, 4] });
  assert.notEqual(hashState(s), hashState(a));
  assert.equal(hashState(a), hashState(JSON.parse(JSON.stringify(a))));
  const w1 = { ...s, walls: [{ r: 1, c: 1, o: 'H' }, { r: 5, c: 5, o: 'V' }] };
  const w2 = { ...s, walls: [{ r: 5, c: 5, o: 'V' }, { r: 1, c: 1, o: 'H' }] };
  assert.equal(hashState(w1), hashState(w2));
  assert.match(hashState(s), /^[0-9a-f]{8}$/);
});

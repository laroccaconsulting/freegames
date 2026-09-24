import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, PIECES, pieceAt, emptyBoard, canPlace, fitsAnywhere, place, points, sweep } from '../games/blocks/js/rules.js';
import { botScore, bestMove } from '../games/blocks/js/bot.js';

const byPattern = (w, h, n) => PIECES.find((p) => p.w === w && p.h === h && p.cells.length === n);

test('pieces are well formed', () => {
  for (const p of PIECES) {
    assert.ok(p.cells.length >= 1 && p.cells.length <= 9);
    assert.ok(p.cells.every(([r, c]) => r < p.h && c < p.w));
  }
});

test('placing, bounds and overlap', () => {
  const dot = byPattern(1, 1, 1);
  const board = emptyBoard();
  assert.ok(canPlace(board, dot, 7, 7));
  assert.ok(!canPlace(board, dot, 8, 0));
  const res = place(board, dot, 3, 3);
  assert.equal(res.board[3 * SIZE + 3], dot.color + 1);
  assert.ok(!canPlace(res.board, dot, 3, 3));
  assert.equal(res.points, 1);
});

test('full rows and columns clear together', () => {
  const board = emptyBoard();
  for (let c = 0; c < SIZE; c++) if (c !== 4) board[2 * SIZE + c] = 1;
  for (let r = 0; r < SIZE; r++) if (r !== 2) board[r * SIZE + 4] = 1;
  const res = place(board, byPattern(1, 1, 1), 2, 4);
  assert.deepEqual(res.rows, [2]);
  assert.deepEqual(res.cols, [4]);
  assert.equal(res.lines, 2);
  assert.ok(res.board.every((v) => v === 0));
  assert.equal(res.points, points(1, 2, 0));
  assert.equal(res.streak, 1);
});

test('streaks multiply clear points', () => {
  assert.equal(points(3, 0, 4), 3);
  assert.equal(points(3, 1, 0), 13);
  assert.equal(points(3, 1, 2), 3 + 10 * 3);
});

test('piece sequence depends only on seed and position', () => {
  const a = Array.from({ length: 30 }, (_, n) => pieceAt('x', n));
  assert.deepEqual(a, Array.from({ length: 30 }, (_, n) => pieceAt('x', n)));
  assert.notDeepEqual(a, Array.from({ length: 30 }, (_, n) => pieceAt('y', n)));
  assert.ok(new Set(a).size > 5);
});

test('zen sweep clears the fullest row and column', () => {
  const board = emptyBoard();
  for (let c = 0; c < 7; c++) board[5 * SIZE + c] = 1;
  board[0] = 1;
  const s = sweep(board);
  assert.deepEqual(s.rows, [5]);
  assert.equal(s.board.filter(Boolean).length, 0);
});

test('bot plays whole games and gives hints', () => {
  const run = botScore('test-seed', 45);
  assert.ok(run.score > 0);
  assert.equal(typeof run.complete, 'boolean');
  const hand = [pieceAt('h', 0), pieceAt('h', 1), pieceAt('h', 2)];
  const mv = bestMove(emptyBoard(), hand, 0);
  assert.ok(mv && canPlace(emptyBoard(), PIECES[hand[mv.slot]], mv.row, mv.col));
  const full = new Array(SIZE * SIZE).fill(1);
  assert.equal(bestMove(full, hand, 0), null);
  assert.ok(!fitsAnywhere(full, byPattern(1, 1, 1)));
});

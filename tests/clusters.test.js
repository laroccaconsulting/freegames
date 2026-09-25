import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBoard, groupAt, groups, pop, hasMoves, tilesLeft, points, target, CLEAR_BONUS } from '../games/clusters/js/clusters.js';

const board = (rows) => {
  const cells = rows.join('').split('').map((ch) => (ch === '.' ? -1 : Number(ch)));
  return { cols: rows[0].length, rows: rows.length, cells, ids: cells.map((c, i) => (c < 0 ? -1 : i)) };
};
const show = (b) => Array.from({ length: b.rows }, (_, r) => b.cells.slice(r * b.cols, (r + 1) * b.cols).map((c) => (c < 0 ? '.' : c)).join(''));

test('points reward big groups', () => {
  assert.deepEqual([1, 2, 3, 5, 12].map(points), [0, 0, 1, 9, 100]);
});

test('boards are seeded and full', () => {
  const b = newBoard(10, 12, 4, 7);
  assert.deepEqual(b, newBoard(10, 12, 4, 7));
  assert.equal(tilesLeft(b), 120);
  assert.ok(b.cells.every((c) => c >= 0 && c < 4));
  assert.ok(hasMoves(b));
});

test('groups are found by colour and touch', () => {
  const b = board(['0011', '0121', '2221']);
  assert.deepEqual(groupAt(b, 0).sort((x, y) => x - y), [0, 1, 4]);
  assert.deepEqual(groupAt(b, 5), [5]);
  assert.equal(groups(b).length, 3);
});

test('popping drops tiles and closes empty columns', () => {
  const b = board(['12', '02', '02']);
  const res = pop(b, 1); // the three 2s: the whole right column
  assert.equal(res.score, 1);
  assert.deepEqual(show(res.board), ['1.', '0.', '0.']);
  assert.deepEqual(res.popped.sort(), [1, 3, 5]);
  const res2 = pop(board(['10', '00', '21']), 1); // the 0s: things fall
  assert.deepEqual(show(res2.board), ['..', '1.', '21']);
  assert.equal(pop(b, 0), null, 'single tiles cannot pop');
  // Tile ids travel with their tiles.
  assert.equal(res2.board.ids[2], 0);
});

test('clearing the board earns the bonus and ends the game', () => {
  const b = board(['00', '11']);
  const r1 = pop(b, 2);
  const r2 = pop(r1.board, r1.board.cells.findIndex((c) => c >= 0));
  assert.equal(r2.score, CLEAR_BONUS);
  assert.equal(tilesLeft(r2.board), 0);
  assert.ok(!hasMoves(r2.board));
});

test('the target is a real line of play', () => {
  const b = newBoard(8, 8, 3, 3);
  const t = target(b, { seed: 3, tries: 40 });
  let cur = b;
  let total = 0;
  for (const i of t.line) {
    const res = pop(cur, i);
    assert.ok(res, 'every move in the line is legal');
    total += res.score;
    cur = res.board;
  }
  assert.equal(total, t.score);
  assert.ok(!hasMoves(cur));
  assert.deepEqual(target(b, { seed: 3, tries: 40 }), t);
});

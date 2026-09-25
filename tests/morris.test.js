import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADJ, LINES, newGame, moves, play, choose, inMill, takeable } from '../games/morris/js/morris.js';
import { mulberry32 } from '../games/morris/core/rng.js';

const at = (s, placements) => {
  const t = { ...s, board: s.board.slice(), inHand: s.inHand.slice(), onBoard: s.onBoard.slice() };
  for (const [p, who] of placements) {
    t.board[p] = who;
    t.onBoard[who]++;
    t.inHand[who]--;
  }
  return t;
};

test('the board: 16 lines of three, every point on two lines', () => {
  assert.equal(LINES.length, 16);
  for (let p = 0; p < 24; p++) {
    assert.equal(LINES.filter((l) => l.includes(p)).length, 2);
    for (const q of ADJ[p]) assert.ok(ADJ[q].includes(p));
    assert.ok(ADJ[p].length >= 2 && ADJ[p].length <= 4);
  }
});

test('placing a third in a row takes a piece, not one from a mill', () => {
  let s = at(newGame(1), [[0, 1], [1, 1], [9, 2], [10, 2], [11, 2], [22, 2]]);
  const ms = moves(s).filter((m) => m.to === 2);
  assert.ok(ms.length && ms.every((m) => m.take != null));
  assert.deepEqual(ms.map((m) => m.take).sort((a, b) => a - b), [22], 'the mill 9-10-11 is protected');
  s = play(s, ms[0]);
  assert.equal(s.board[22], 0);
  assert.equal(s.onBoard[2], 3);
  assert.equal(s.turn, 2);
  assert.ok(inMill(s.board, 1));
  assert.deepEqual(takeable(s.board, 1).sort(), [0, 1, 2].filter((p) => s.board[p] === 1).sort(), 'all in a mill: any can go');
});

test('pieces move only to free neighbours, and fly with three left', () => {
  const s = { ...newGame(1), inHand: [0, 0, 0] };
  s.board = new Array(24).fill(0);
  [[0, 1], [4, 1], [9, 1], [23, 1], [14, 2], [20, 2], [16, 2]].forEach(([p, w]) => (s.board[p] = w));
  s.onBoard = [0, 4, 3];
  for (const m of moves(s)) assert.ok(ADJ[m.from].includes(m.to));
  s.turn = 2;
  assert.ok(moves(s).some((m) => !ADJ[m.from].includes(m.to)), 'three pieces fly');
});

test('two pieces left, or no moves, loses', () => {
  const s = { ...newGame(1), inHand: [0, 0, 0], board: new Array(24).fill(0) };
  [[0, 1], [1, 1], [9, 1], [23, 2], [20, 2], [16, 2]].forEach(([p, w]) => (s.board[p] = w));
  s.onBoard = [0, 3, 3];
  const m = moves(s).find((x) => x.to === 21 && x.take != null);
  const after = play(s, m);
  assert.equal(after.winner, 1);
});

test('games finish, and harder computers win more', () => {
  const random = mulberry32(8);
  let hard = 0;
  for (let g = 0; g < 8; g++) {
    let s = newGame(g % 2 ? 1 : 2);
    for (let k = 0; k < 400 && !s.winner; k++) s = play(s, choose(s, s.turn === 1 ? 'easy' : 'hard', random));
    assert.ok(s.winner);
    if (s.winner === 2) hard++;
  }
  assert.ok(hard >= 7, `hard won ${hard} of 8`);
});

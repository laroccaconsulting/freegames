import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../games/spades/js/spades.js';

const card = (suit, rank) => S.CARDS.find((c) => c.suit === suit && c.rank === rank).id;

function botGame(seed) {
  let s = S.newGame(seed);
  for (let guard = 0; s.phase !== 'over' && guard < 20000; guard++) {
    if (s.phase === 'bid') s = S.bid(s, S.chooseBid(s));
    else if (s.phase === 'play') {
      const c = S.choosePlay(s);
      assert.ok(S.legal(s).includes(c));
      s = S.playCard(s, c).state;
    } else s = S.nextRound(s);
  }
  return s;
}

test('spades trump; otherwise the highest of the suit led wins', () => {
  assert.equal(S.trickWinner([{ seat: 0, card: card(1, 1) }, { seat: 1, card: card(0, 2) }, { seat: 2, card: card(1, 13) }, { seat: 3, card: card(2, 1) }]), 1);
  assert.equal(S.trickWinner([{ seat: 0, card: card(1, 5) }, { seat: 1, card: card(1, 1) }, { seat: 2, card: card(3, 1) }, { seat: 3, card: card(1, 13) }]), 1);
});

test('spades wait to be broken; follow suit when you can', () => {
  const s = { hands: [[card(0, 5), card(1, 3), card(2, 9)]], trick: [], broken: false, turn: 0, phase: 'play' };
  assert.deepEqual(H(s), [card(1, 3), card(2, 9)]);
  s.trick = [{ seat: 3, card: card(3, 4) }];
  assert.equal(H(s).length, 3, 'void in diamonds: anything goes');
  s.trick = [{ seat: 3, card: card(2, 4) }];
  assert.deepEqual(H(s), [card(2, 9)]);
  function H(x) {
    return S.legal(x, 0);
  }
});

test('scoring: bids, bags, sets and nil', () => {
  // Team 0 bids 3 + 2, takes 6: 50 + 1 bag. Team 1 bids 4 + nil, takes 3 + 0: set (−40) and nil made (+100).
  const r = S.scoreHand([3, 4, 2, 0], [4, 3, 2, 0]);
  assert.deepEqual([r[0].points, r[0].bags, r[0].made], [51, 1, true]);
  assert.deepEqual([r[1].points, r[1].made], [60, false]);
  assert.deepEqual(r[1].nils, [{ seat: 3, ok: true }]);
  const broken = S.scoreHand([1, 5, 1, 0], [2, 5, 3, 3]);
  assert.equal(broken[1].points, 50 - 100 + 3, 'a failed nil costs 100 and its tricks are bags');
});

test('whole games finish, every bid and card legal, with sensible bids', () => {
  for (const seed of [1, 2, 3]) {
    const s = botGame(seed);
    assert.equal(s.phase, 'over');
    assert.ok(Math.max(...s.scores) >= S.GAME_TO || Math.min(...s.scores) <= S.LOSE_AT);
    assert.ok(s.bags.every((b) => b >= 0 && b < 10));
  }
  const strong = [card(0, 1), card(0, 13), card(0, 12), card(0, 11), card(0, 10), card(1, 1), card(2, 1), card(3, 1), card(1, 13), card(2, 2), card(3, 2), card(1, 2), card(2, 3)];
  assert.ok(S.estimate(strong) >= 7);
});

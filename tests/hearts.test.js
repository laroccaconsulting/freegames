import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../games/hearts/js/hearts.js';

const card = (suit, rank) => H.CARDS.find((c) => c.suit === suit && c.rank === rank).id;

function botGame(seed) {
  let s = H.newGame(seed);
  for (let guard = 0; s.phase !== 'over' && guard < 5000; guard++) {
    if (s.phase === 'pass') s = H.pass(s, H.choosePass(s.hands[0]));
    else if (s.phase === 'play') {
      const c = H.choosePlay(s);
      assert.ok(H.legal(s).includes(c), 'bots play legal cards');
      s = H.playCard(s, c).state;
    } else s = H.nextRound(s);
  }
  return s;
}

test('a deal gives everyone 13 different cards', () => {
  const s = H.newGame(3);
  assert.ok(s.hands.every((h) => h.length === 13));
  assert.equal(new Set(s.hands.flat()).size, 52);
  assert.equal(s.phase, 'pass');
  assert.equal(s.passDir, 'left');
});

test('passing moves three cards to the right player', () => {
  const s = H.newGame(4);
  const mine = s.hands[0].slice(0, 3);
  const t = H.pass(s, mine);
  assert.ok(mine.every((c) => t.hands[1].includes(c)), 'left is the next seat');
  assert.ok(t.hands.every((h) => h.length === 13));
  assert.equal(t.phase, 'play');
  assert.ok(t.hands[t.turn].includes(H.TWO_CLUBS));
  assert.deepEqual(H.legal(t), [H.TWO_CLUBS]);
});

test('follow suit; no points on the first trick; hearts wait to be broken', () => {
  const s = { hands: [[card(2, 5), card(1, 3), H.QUEEN], [], [], []], trick: [{ seat: 3, card: card(3, 4) }], tricks: 0, broken: false, turn: 0, phase: 'play' };
  assert.deepEqual(H.legal(s), [card(2, 5)], 'void in diamonds, first trick: no hearts or queen');
  s.tricks = 3;
  assert.equal(H.legal(s).length, 3);
  s.trick = [];
  assert.ok(!H.legal(s).includes(card(1, 3)), 'hearts not broken');
  s.broken = true;
  assert.ok(H.legal(s).includes(card(1, 3)));
});

test('the highest card of the suit led wins; aces are high', () => {
  const trick = [
    { seat: 0, card: card(2, 10) },
    { seat: 1, card: card(2, 1) },
    { seat: 2, card: card(1, 13) },
    { seat: 3, card: card(2, 13) },
  ];
  assert.equal(H.trickWinner(trick), 1);
});

test('whole games finish with 26 points handed out each hand', () => {
  for (const seed of [1, 2, 3]) {
    const s = botGame(seed);
    assert.equal(s.phase, 'over');
    assert.ok(s.scores.some((x) => x >= H.GAME_TO));
    const total = s.scores.reduce((a, b) => a + b, 0);
    assert.equal(total % 26, 0, 'normal hands give 26, moon hands 78');
    assert.ok(H.winners(s).every((k) => s.scores[k] === Math.min(...s.scores)));
  }
});

test('bots pass the queen of spades when it is poorly guarded', () => {
  const hand = [H.QUEEN, card(0, 3), card(1, 2), card(1, 4), card(2, 2), card(2, 3), card(2, 4), card(2, 5), card(3, 2), card(3, 3), card(3, 4), card(3, 5), card(3, 6)];
  assert.ok(H.choosePass(hand).includes(H.QUEEN));
});

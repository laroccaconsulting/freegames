// Hearts for four: you (seat 0, south) and three computer players (west,
// north, east, in playing order). Pure (no DOM).
//
// Cards are ids 0..51 from cards.js: suit = spades 0, hearts 1, clubs 2,
// diamonds 3; rank 1 (ace, high) .. 13.
//
// state: { hands: [[id]×4], trick: [{ seat, card }], leader, turn, broken, tricks (played this round),
//          taken: [points this round ×4], scores: [×4], round, phase: 'pass' | 'play' | 'done' | 'over', passed: [[id]] }

import { makeCards } from './cards.js';
import { mulberry32, shuffle } from '../core/rng.js';

export const CARDS = makeCards([0, 1, 2, 3]);
export const SPADES = 0;
export const HEARTS = 1;
export const CLUBS = 2;
export const DIAMONDS = 3;
export const QUEEN = CARDS.find((c) => c.suit === SPADES && c.rank === 12).id;
export const TWO_CLUBS = CARDS.find((c) => c.suit === CLUBS && c.rank === 2).id;
export const GAME_TO = 100;
export const PASS = ['left', 'right', 'across', 'none'];

export const suitOf = (id) => CARDS[id].suit;
export const value = (id) => (CARDS[id].rank === 1 ? 14 : CARDS[id].rank);
export const points = (id) => (id === QUEEN ? 13 : suitOf(id) === HEARTS ? 1 : 0);
const sortHand = (h) => h.sort((a, b) => [CLUBS, DIAMONDS, SPADES, HEARTS].indexOf(suitOf(a)) - [CLUBS, DIAMONDS, SPADES, HEARTS].indexOf(suitOf(b)) || value(a) - value(b));

export function newGame(seed = 1) {
  return deal({ scores: [0, 0, 0, 0], round: 0, seed }, seed);
}

export function deal(prev, seed) {
  const deck = shuffle(CARDS.map((c) => c.id), mulberry32(seed));
  const hands = [0, 1, 2, 3].map((k) => sortHand(deck.slice(k * 13, k * 13 + 13)));
  const s = { ...prev, hands, trick: [], broken: false, tricks: 0, taken: [0, 0, 0, 0], lastTrick: null, moon: null, passed: null };
  s.passDir = PASS[s.round % 4];
  s.phase = s.passDir === 'none' ? 'play' : 'pass';
  if (s.phase === 'play') startPlay(s);
  return s;
}

const passTarget = (seat, dir) => (dir === 'left' ? (seat + 1) % 4 : dir === 'right' ? (seat + 3) % 4 : (seat + 2) % 4);

// Everyone passes three cards at once. `mine` is the human's choice.
export function pass(s, mine) {
  const choices = [mine, ...[1, 2, 3].map((seat) => choosePass(s.hands[seat]))];
  const hands = s.hands.map((h, seat) => h.filter((c) => !choices[seat].includes(c)));
  choices.forEach((cards, seat) => hands[passTarget(seat, s.passDir)].push(...cards));
  const next = { ...s, hands: hands.map(sortHand), passed: choices, received: choices[[0, 1, 2, 3].find((seat) => passTarget(seat, s.passDir) === 0)] };
  startPlay(next);
  return next;
}

function startPlay(s) {
  s.phase = 'play';
  s.leader = s.hands.findIndex((h) => h.includes(TWO_CLUBS));
  s.turn = s.leader;
}

// Cards the player to move may play.
export function legal(s, seat = s.turn) {
  const hand = s.hands[seat];
  const first = s.tricks === 0;
  if (!s.trick.length) {
    if (first) return hand.includes(TWO_CLUBS) ? [TWO_CLUBS] : [];
    const safe = hand.filter((c) => suitOf(c) !== HEARTS);
    return s.broken || !safe.length ? hand.slice() : safe;
  }
  const led = suitOf(s.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  if (follow.length) return follow;
  if (first) {
    // No points on the first trick, unless there's nothing else.
    const clean = hand.filter((c) => !points(c));
    if (clean.length) return clean;
  }
  return hand.slice();
}

export function trickWinner(trick) {
  const led = suitOf(trick[0].card);
  return trick.filter((t) => suitOf(t.card) === led).reduce((a, b) => (value(b.card) > value(a.card) ? b : a)).seat;
}

// Play a card; completes the trick and the round when due.
export function playCard(s, card) {
  if (s.phase !== 'play' || !legal(s).includes(card)) return null;
  const seat = s.turn;
  const next = { ...s, hands: s.hands.slice(), trick: [...s.trick, { seat, card }], taken: s.taken.slice(), scores: s.scores.slice() };
  next.hands[seat] = s.hands[seat].filter((c) => c !== card);
  if (suitOf(card) === HEARTS || card === QUEEN) next.broken = true;
  const events = { card, seat };
  if (next.trick.length < 4) {
    next.turn = (seat + 1) % 4;
    return { state: next, events };
  }
  const winner = trickWinner(next.trick);
  const pts = next.trick.reduce((a, t) => a + points(t.card), 0);
  next.taken[winner] += pts;
  next.tricks++;
  next.lastTrick = next.trick;
  next.trick = [];
  next.leader = next.turn = winner;
  events.trick = { winner, points: pts };
  if (next.tricks === 13) {
    // Shooting the moon: all 26 points to one player gives 26 to everyone else.
    const moon = next.taken.findIndex((p) => p === 26);
    next.moon = moon >= 0 ? moon : null;
    next.scores = next.scores.map((sc, k) => sc + (moon >= 0 ? (k === moon ? 0 : 26) : next.taken[k]));
    next.phase = next.scores.some((x) => x >= GAME_TO) ? 'over' : 'done';
    events.round = true;
  }
  return { state: next, events };
}

export function nextRound(s) {
  return deal({ ...s, round: s.round + 1 }, s.seed * 7 + s.round + 1);
}

export function winners(s) {
  const low = Math.min(...s.scores);
  return s.scores.map((x, k) => (x === low ? k : -1)).filter((k) => k >= 0);
}

// ---------- The computer ----------

// Pass the dangerous cards: the queen, ace and king of spades (unless well
// protected), then the highest hearts and other high cards, preferring to
// empty a short suit.
export function choosePass(hand) {
  const spades = hand.filter((c) => suitOf(c) === SPADES);
  const danger = (c) => {
    const v = value(c);
    if (c === QUEEN) return spades.length >= 5 ? 20 : 100;
    if (suitOf(c) === SPADES && v > 12) return spades.length >= 5 ? 10 : 80;
    if (suitOf(c) === SPADES) return v / 4;
    const suitLen = hand.filter((x) => suitOf(x) === suitOf(c)).length;
    return v * 3 + (suitOf(c) === HEARTS ? 6 : 0) + (suitLen <= 2 ? 12 : 0);
  };
  return hand
    .slice()
    .sort((a, b) => danger(b) - danger(a))
    .slice(0, 3);
}

export function choosePlay(s) {
  const options = legal(s);
  if (options.length === 1) return options[0];
  const hand = s.hands[s.turn];
  const hi = (list) => list.reduce((a, b) => (value(b) > value(a) ? b : a));
  const lo = (list) => list.reduce((a, b) => (value(b) < value(a) ? b : a));
  if (!s.trick.length) {
    // Lead low from a suit where we're least likely to win; avoid spades if
    // we hold the queen's guards badly.
    const noQueenRisk = options.filter((c) => !(suitOf(c) === SPADES && value(c) >= 12));
    const pool = noQueenRisk.length ? noQueenRisk : options;
    return lo(pool);
  }
  const led = suitOf(s.trick[0].card);
  const following = suitOf(options[0]) === led;
  const pts = s.trick.reduce((a, t) => a + points(t.card), 0);
  const best = s.trick.filter((t) => suitOf(t.card) === led).reduce((a, b) => (value(b.card) > value(a.card) ? b : a));
  if (following) {
    const under = options.filter((c) => value(c) < value(best.card));
    const last = s.trick.length === 3;
    // Never throw the queen onto a trick we'd win.
    if (led === SPADES && options.includes(QUEEN) && value(best.card) > 12) return QUEEN;
    if (under.length) return hi(under.filter((c) => c !== QUEEN).length ? under.filter((c) => c !== QUEEN) : under);
    if (last && !pts && !options.includes(QUEEN)) return hi(options);
    const safe = options.filter((c) => c !== QUEEN);
    return safe.length ? (last ? hi(safe) : lo(safe)) : options[0];
  }
  // Can't follow: dump the queen, then the ace/king of spades, then high hearts, then the highest card.
  if (options.includes(QUEEN)) return QUEEN;
  const bigSpade = options.filter((c) => suitOf(c) === SPADES && value(c) > 12);
  if (bigSpade.length && !hand.includes(QUEEN)) return hi(bigSpade);
  const hearts = options.filter((c) => suitOf(c) === HEARTS);
  if (hearts.length) return hi(hearts);
  return hi(options);
}

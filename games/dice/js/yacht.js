// Yacht: roll five dice up to three times a turn, then score them in one
// of thirteen boxes. Pure (no DOM).
//
// Dice come from a seeded stream keyed by (turn, roll, die), so the same
// holds always give the same dice: the daily game is fair to everyone,
// and the computer's score on the same dice makes a target to beat.

import { mulberry32, hashSeed } from './rng-lite.js';

export const BOXES = [
  { id: 'ones', name: 'Ones', upper: 1 },
  { id: 'twos', name: 'Twos', upper: 2 },
  { id: 'threes', name: 'Threes', upper: 3 },
  { id: 'fours', name: 'Fours', upper: 4 },
  { id: 'fives', name: 'Fives', upper: 5 },
  { id: 'sixes', name: 'Sixes', upper: 6 },
  { id: 'three', name: 'Three of a kind' },
  { id: 'four', name: 'Four of a kind' },
  { id: 'house', name: 'Full house' },
  { id: 'small', name: 'Small straight' },
  { id: 'large', name: 'Large straight' },
  { id: 'yacht', name: 'Yacht' },
  { id: 'chance', name: 'Chance' },
];
export const UPPER_BONUS = 35;
export const UPPER_TARGET = 63;
export const EXTRA_YACHT = 100;

const counts = (dice) => {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
};
const sum = (dice) => dice.reduce((a, b) => a + b, 0);
const run = (c, len) => {
  for (let start = 1; start + len - 1 <= 6; start++) {
    let ok = true;
    for (let v = start; v < start + len; v++) if (!c[v]) ok = false;
    if (ok) return true;
  }
  return false;
};

// Points the dice would score in a box.
export function scoreBox(id, dice) {
  const c = counts(dice);
  const most = Math.max(...c);
  switch (id) {
    case 'ones': return c[1];
    case 'twos': return c[2] * 2;
    case 'threes': return c[3] * 3;
    case 'fours': return c[4] * 4;
    case 'fives': return c[5] * 5;
    case 'sixes': return c[6] * 6;
    case 'three': return most >= 3 ? sum(dice) : 0;
    case 'four': return most >= 4 ? sum(dice) : 0;
    case 'house': return (c.includes(3) && c.includes(2)) || most === 5 ? 25 : 0;
    case 'small': return run(c, 4) ? 30 : 0;
    case 'large': return run(c, 5) ? 40 : 0;
    case 'yacht': return most === 5 ? 50 : 0;
    case 'chance': return sum(dice);
    default: return 0;
  }
}

export function upperTotal(card) {
  return BOXES.filter((b) => b.upper).reduce((s, b) => s + (card[b.id] ?? 0), 0);
}

export function total(card) {
  const upper = upperTotal(card);
  const lower = BOXES.filter((b) => !b.upper).reduce((s, b) => s + (card[b.id] ?? 0), 0);
  return upper + (upper >= UPPER_TARGET ? UPPER_BONUS : 0) + lower + (card.extra || 0);
}

// Scoring a box: extra Yachts earn a bonus when the Yacht box already has 50.
export function score(card, id, dice) {
  if (card[id] != null) throw new Error('box already used');
  const next = { ...card, [id]: scoreBox(id, dice) };
  if (Math.max(...counts(dice)) === 5 && card.yacht === 50) next.extra = (card.extra || 0) + EXTRA_YACHT;
  return next;
}

export const open = (card) => BOXES.filter((b) => card[b.id] == null).map((b) => b.id);
export const finished = (card) => open(card).length === 0;

// The dice for a roll: held dice stay; the rest come from the stream.
export function roll(seed, turnNo, rollNo, dice, held) {
  return dice.map((d, k) => (held[k] && d ? d : 1 + Math.floor(mulberry32(hashSeed(`${seed}:${turnNo}:${rollNo}:${k}`))() * 6)));
}

// ---------- The computer ----------

// What a box is worth to the computer now: its points, nudged by the upper
// bonus and by not wasting big boxes.
function boxValue(card, id, dice) {
  const pts = scoreBox(id, dice);
  const b = BOXES.find((x) => x.id === id);
  if (b.upper) {
    // Par for the upper bonus is three of each face.
    const par = b.upper * 3;
    return pts + (pts - par) * 0.6 + (pts >= par ? 4 : 0);
  }
  if (id === 'chance') return pts - 12; // keep Chance for a bad roll
  if (id === 'yacht') return pts ? pts + 10 : -14;
  if (pts === 0) return { three: -9, four: -6, house: -8, small: -9, large: -7 }[id] ?? 0;
  return pts;
}

export function bestBox(card, dice) {
  let best = null;
  let bestV = -Infinity;
  for (const id of open(card)) {
    const v = boxValue(card, id, dice);
    if (v > bestV) [best, bestV] = [id, v];
  }
  return best;
}

// Which dice to hold: try every hold, estimate the best box it leads to with
// a quick sample of rerolls (deterministic for the tests via `random`).
export function chooseHold(card, dice, rollsLeft, random, samples = 60) {
  let bestHold = [false, false, false, false, false];
  let bestV = -Infinity;
  for (let m = 0; m < 32; m++) {
    const held = [0, 1, 2, 3, 4].map((k) => !!(m & (1 << k)));
    let v = 0;
    for (let s = 0; s < samples; s++) {
      let d = dice.map((x, k) => (held[k] ? x : 1 + Math.floor(random() * 6)));
      if (rollsLeft > 1) {
        // One more (greedy) reroll: keep the most common face.
        const c = counts(d);
        const face = c.indexOf(Math.max(...c));
        d = d.map((x) => (x === face ? x : 1 + Math.floor(random() * 6)));
      }
      const id = bestBox(card, d);
      v += boxValue(card, id, d);
    }
    v /= samples;
    if (v > bestV) [bestHold, bestV] = [held, v];
  }
  return bestHold;
}

// Plays a whole solo game on the seeded dice; returns the final card.
export function botGame(seed, random) {
  let card = {};
  for (let t = 0; t < 13; t++) {
    let held = [false, false, false, false, false];
    let dice = roll(seed, t, 0, [0, 0, 0, 0, 0], held);
    for (let r = 1; r < 3; r++) {
      held = chooseHold(card, dice, 3 - r, random);
      if (held.every(Boolean)) break;
      dice = roll(seed, t, r, dice, held);
    }
    card = score(card, bestBox(card, dice), dice);
  }
  return card;
}

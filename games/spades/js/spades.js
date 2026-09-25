// Spades for four in two partnerships: you (seat 0, south) with north
// (seat 2) against west (1) and east (3). Pure (no DOM).
//
// Each hand: everyone bids how many tricks they'll take (0 = nil). Spades
// are trumps and can't be led until broken. A team making its combined bid
// scores 10 per trick bid plus 1 per extra trick (a "bag"); falling short
// loses 10 per trick bid. Ten bags cost 100. Nil scores ±100 for its bidder.
// First team to 500 wins (a team at −200 loses).
//
// Cards are ids 0..51 from cards.js: suit spades 0, hearts 1, clubs 2,
// diamonds 3; rank 1 (ace, high) .. 13.

import { makeCards } from './cards.js';
import { mulberry32, shuffle } from '../core/rng.js';

export const CARDS = makeCards([0, 1, 2, 3]);
export const SPADES = 0;
export const GAME_TO = 500;
export const LOSE_AT = -200;
export const teamOf = (seat) => seat % 2; // 0: you and north, 1: west and east

export const suitOf = (id) => CARDS[id].suit;
export const value = (id) => (CARDS[id].rank === 1 ? 14 : CARDS[id].rank);
const ORDER = [SPADES, 1, 2, 3];
const sortHand = (h) => h.sort((a, b) => ORDER.indexOf(suitOf(b)) - ORDER.indexOf(suitOf(a)) || value(a) - value(b));

export function newGame(seed = 1) {
  return deal({ scores: [0, 0], bags: [0, 0], round: 0, seed, dealer: 3 }, seed);
}

export function deal(prev, seed) {
  const deck = shuffle(CARDS.map((c) => c.id), mulberry32(seed));
  const hands = [0, 1, 2, 3].map((k) => sortHand(deck.slice(k * 13, k * 13 + 13)));
  const dealer = (prev.dealer + 1) % 4;
  const s = { ...prev, dealer, hands, bids: [null, null, null, null], taken: [0, 0, 0, 0], trick: [], broken: false, tricks: 0, lastTrick: null, phase: 'bid', last: null };
  s.turn = (dealer + 1) % 4; // bidding starts left of the dealer
  return s;
}

export function bid(s, n) {
  if (s.phase !== 'bid' || s.bids[s.turn] != null) return null;
  const next = { ...s, bids: s.bids.slice() };
  next.bids[s.turn] = n;
  next.turn = (s.turn + 1) % 4;
  if (next.bids.every((b) => b != null)) {
    next.phase = 'play';
    next.turn = (s.dealer + 1) % 4;
  }
  return next;
}

export function legal(s, seat = s.turn) {
  const hand = s.hands[seat];
  if (!s.trick.length) {
    const safe = hand.filter((c) => suitOf(c) !== SPADES);
    return s.broken || !safe.length ? hand.slice() : safe;
  }
  const led = suitOf(s.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand.slice();
}

export function trickWinner(trick) {
  const trumps = trick.filter((t) => suitOf(t.card) === SPADES);
  const led = suitOf(trick[0].card);
  const pool = trumps.length ? trumps : trick.filter((t) => suitOf(t.card) === led);
  return pool.reduce((a, b) => (value(b.card) > value(a.card) ? b : a)).seat;
}

// Score one hand for each team: { points, bags, made, nil: [seat results] }.
export function scoreHand(bids, taken) {
  const out = [0, 1].map((team) => {
    const seats = [team, team + 2];
    let points = 0;
    let bags = 0;
    const nils = [];
    let bidSum = 0;
    let tookSum = 0;
    for (const seat of seats) {
      if (bids[seat] === 0) {
        const ok = taken[seat] === 0;
        points += ok ? 100 : -100;
        nils.push({ seat, ok });
        // A failed nil's tricks count as bags: a point each, toward the penalty.
        bags += taken[seat];
        points += taken[seat];
      } else {
        bidSum += bids[seat];
        tookSum += taken[seat];
      }
    }
    const made = tookSum >= bidSum;
    if (bidSum) {
      if (made) {
        points += 10 * bidSum + (tookSum - bidSum);
        bags += tookSum - bidSum;
      } else points -= 10 * bidSum;
    }
    return { points, bags, made: bidSum ? made : null, nils };
  });
  return out;
}

export function playCard(s, card) {
  if (s.phase !== 'play' || !legal(s).includes(card)) return null;
  const seat = s.turn;
  const next = { ...s, hands: s.hands.slice(), trick: [...s.trick, { seat, card }], taken: s.taken.slice(), scores: s.scores.slice(), bags: s.bags.slice() };
  next.hands[seat] = s.hands[seat].filter((c) => c !== card);
  if (suitOf(card) === SPADES) next.broken = true;
  const events = { card, seat };
  if (next.trick.length < 4) {
    next.turn = (seat + 1) % 4;
    return { state: next, events };
  }
  const winner = trickWinner(next.trick);
  next.taken[winner]++;
  next.tricks++;
  next.lastTrick = next.trick;
  next.trick = [];
  next.turn = winner;
  events.trick = { winner };
  if (next.tricks === 13) {
    const result = scoreHand(next.bids, next.taken);
    result.forEach((r, team) => {
      next.scores[team] += r.points;
      next.bags[team] += r.bags;
      if (next.bags[team] >= 10) {
        next.scores[team] -= 100;
        next.bags[team] -= 10;
        r.bagPenalty = true;
      }
    });
    next.last = result;
    const top = Math.max(...next.scores);
    next.phase = top >= GAME_TO || next.scores.some((x) => x <= LOSE_AT) ? 'over' : 'done';
    events.round = result;
  }
  return { state: next, events };
}

export function nextRound(s) {
  return deal({ ...s, round: s.round + 1 }, s.seed * 7 + s.round + 1);
}

// The winning team (0 or 1), or -1 for a tie at the top.
export function winner(s) {
  const [a, b] = s.scores;
  if (a <= LOSE_AT && b > LOSE_AT) return 1;
  if (b <= LOSE_AT && a > LOSE_AT) return 0;
  return a > b ? 0 : b > a ? 1 : -1;
}

// ---------- The computer ----------

// Count the tricks a hand should take: aces, guarded kings and queens, and
// spade length.
export function estimate(hand) {
  let tricks = 0;
  const bySuit = [0, 1, 2, 3].map((st) => hand.filter((c) => suitOf(c) === st).map(value).sort((a, b) => b - a));
  bySuit.forEach((vals, st) => {
    const len = vals.length;
    if (st === SPADES) {
      for (const v of vals) if (v >= 14 || (v === 13 && len >= 2) || (v === 12 && len >= 3)) tricks++;
      if (len >= 4) tricks += len - 3;
    } else {
      if (vals.includes(14)) tricks++;
      if (vals.includes(13) && len >= 2 && len <= 5) tricks += vals.includes(14) ? 1 : 0.6;
      if (vals.includes(12) && len >= 3 && len <= 4) tricks += 0.3;
      // Short suits let spades ruff.
      if (len <= 1 && bySuit[SPADES].length >= 3) tricks += len === 0 ? 1 : 0.5;
    }
  });
  return tricks;
}

export function chooseBid(s, seat = s.turn) {
  const hand = s.hands[seat];
  const est = estimate(hand);
  const spades = hand.filter((c) => suitOf(c) === SPADES).map(value);
  const high = hand.filter((c) => value(c) >= 12).length;
  // Nil with a weak hand: no high spades, few high cards.
  if (est < 1.2 && !spades.some((v) => v >= 12) && spades.length <= 3 && high <= 1) return 0;
  return Math.max(1, Math.min(13, Math.round(est)));
}

export function choosePlay(s) {
  const options = legal(s);
  if (options.length === 1) return options[0];
  const seat = s.turn;
  const team = teamOf(seat);
  const partner = (seat + 2) % 4;
  const hi = (list) => list.reduce((a, b) => (value(b) > value(a) ? b : a));
  const lo = (list) => list.reduce((a, b) => (value(b) < value(a) ? b : a));
  const nil = s.bids[seat] === 0;
  const need = [team, team + 2].reduce((a, k) => a + (s.bids[k] || 0), 0) - [team, team + 2].reduce((a, k) => a + s.taken[k], 0);

  if (!s.trick.length) {
    if (nil) return lo(options);
    // Lead a sure winner (an ace outside spades), else low from the longest side suit.
    const aces = options.filter((c) => suitOf(c) !== SPADES && value(c) === 14);
    if (aces.length && need > 0) return aces[0];
    const side = options.filter((c) => suitOf(c) !== SPADES);
    return lo(side.length ? side : options);
  }
  const led = suitOf(s.trick[0].card);
  const winning = trickWinner(s.trick);
  const current = s.trick.find((t) => t.seat === winning).card;
  const beats = (c) => (suitOf(c) === SPADES && suitOf(current) !== SPADES) || (suitOf(c) === suitOf(current) && value(c) > value(current));
  const winners = options.filter(beats);
  const last = s.trick.length === 3;
  if (nil) {
    // Stay under: the highest card that still loses, else dump high.
    const losers = options.filter((c) => !beats(c));
    return losers.length ? hi(losers) : lo(options);
  }
  const partnerWins = winning === partner && s.bids[partner] !== 0;
  if (partnerWins || need <= 0) {
    // Don't take a trick we don't need (bags); throw low, or dump the highest loser.
    const losers = options.filter((c) => !beats(c));
    if (losers.length) return suitOf(losers[0]) === led ? lo(losers) : hi(losers.filter((c) => suitOf(c) !== SPADES).length ? losers.filter((c) => suitOf(c) !== SPADES) : losers);
    return lo(options);
  }
  if (winners.length) {
    // Win as cheaply as possible (last to play) or with authority.
    const following = winners.filter((c) => suitOf(c) === led);
    const pool = following.length ? following : winners;
    return last ? lo(pool) : suitOf(pool[0]) === SPADES ? lo(pool) : hi(pool);
  }
  const side = options.filter((c) => suitOf(c) !== SPADES);
  return lo(side.length ? side : options);
}

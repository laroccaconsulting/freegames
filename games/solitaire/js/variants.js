// Rules for each solitaire variant. Pure functions over the game state
// (see engine.js), so they can be unit-tested in Node.

import { makeCards, isRed } from './cards.js';
import { mulberry32, shuffle } from '../core/rng.js';

export const top = (pile) => pile.cards[pile.cards.length - 1];
const piles = (g, kind) => g.pileOrder.map((id) => g.piles[id]).filter((p) => p.kind === kind);

const altParent = (parent, child) => parent.rank === child.rank + 1 && isRed(parent.suit) !== isRed(child.suit);
const suitParent = (parent, child) => parent.rank === child.rank + 1 && parent.suit === child.suit;

function isRun(cards, linked) {
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i].up) return false;
    if (i > 0 && !linked(cards[i - 1], cards[i])) return false;
  }
  return true;
}

// Foundations that build up by suit from Ace (Klondike, FreeCell).
function canFoundation(cards, to) {
  if (cards.length !== 1 || !cards[0].up) return false;
  const t = top(to);
  return t ? t.suit === cards[0].suit && t.rank + 1 === cards[0].rank : cards[0].rank === 1;
}

function foundationRanks(g) {
  const ranks = [0, 0, 0, 0];
  for (const f of piles(g, 'foundation')) if (f.cards.length) ranks[f.cards[0].suit] = f.cards.length;
  return ranks;
}

// A card is safe to auto-play when no card that could still need it as a
// parent is left in play: both opposite-colour suits are within one rank.
function isSafeToFoundation(g, card) {
  if (card.rank <= 2) return true;
  const r = foundationRanks(g);
  const opposite = isRed(card.suit) ? [0, 2] : [1, 3];
  return opposite.every((s) => r[s] >= card.rank - 1);
}

// Every remaining card is face up and each tableau column is already in
// descending order, so the game can be finished by moving cards up.
function canFinishByFoundations(g) {
  for (const p of Object.values(g.piles)) {
    if (p.kind === 'stock' || p.kind === 'waste') {
      if (p.cards.length) return false;
    } else if (p.kind === 'tableau') {
      for (let i = 0; i < p.cards.length; i++) {
        if (!p.cards[i].up) return false;
        if (i > 0 && p.cards[i - 1].rank < p.cards[i].rank) return false;
      }
    }
  }
  return true;
}

const foundationsFull = (g, count) => piles(g, 'foundation').reduce((n, f) => n + f.cards.length, 0) === count;

// ---------------------------------------------------------------------------

const klondike = {
  id: 'klondike',
  name: 'Klondike',
  columns: 7,
  defaults: { draw: 1 },
  modeKey: (o) => `klondike-d${o.draw}`,
  modeLabel: (o) => `Draw ${o.draw}`,
  maxSeed: 999999,
  hasScore: true,

  piles() {
    return [
      { id: 'stock', kind: 'stock', col: 0, row: 0 },
      { id: 'waste', kind: 'waste', col: 1, row: 0 },
      ...[0, 1, 2, 3].map((i) => ({ id: `f${i}`, kind: 'foundation', col: 3 + i, row: 0 })),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: `t${i}`, kind: 'tableau', col: i, row: 1 })),
    ];
  },

  deal(g, seed) {
    g.cards = makeCards([0, 1, 2, 3]);
    const deck = shuffle([...g.cards], mulberry32(seed * 7 + 1));
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck.pop();
        card.up = row === col;
        g.piles[`t${col}`].cards.push(card);
      }
    }
    g.piles.stock.cards = deck.reverse();
  },

  canPick(g, pile, index) {
    const n = pile.cards.length;
    if (index < 0 || index >= n) return false;
    if (pile.kind === 'stock') return false;
    if (pile.kind === 'tableau') return isRun(pile.cards.slice(index), altParent);
    return index === n - 1;
  },

  canDrop(g, cards, from, to) {
    if (to.kind === 'foundation') return from.kind !== 'foundation' && canFoundation(cards, to);
    if (to.kind === 'tableau') {
      const t = top(to);
      return t ? t.up && altParent(t, cards[0]) : cards[0].rank === 13;
    }
    return false;
  },

  isNaturalParent: altParent,

  onStock(g) {
    const stock = g.piles.stock;
    const waste = g.piles.waste;
    if (stock.cards.length) {
      const drawn = [];
      for (let i = 0; i < g.options.draw && stock.cards.length; i++) {
        const card = stock.cards.pop();
        card.up = true;
        waste.cards.push(card);
        drawn.push(card.id);
      }
      return { ok: true, type: 'draw', cards: drawn };
    }
    if (waste.cards.length) {
      stock.cards = waste.cards.reverse();
      waste.cards = [];
      stock.cards.forEach((c) => (c.up = false));
      g.passes++;
      g.score = Math.max(0, g.score - (g.options.draw === 1 ? 100 : 20));
      return { ok: true, type: 'recycle', cards: stock.cards.map((c) => c.id) };
    }
    return { ok: false };
  },

  // Standard (Windows) scoring.
  scoreMove(g, from, to) {
    let delta = 0;
    if (from.kind === 'waste' && to.kind === 'tableau') delta = 5;
    else if (to.kind === 'foundation' && from.kind !== 'foundation') delta = 10;
    else if (from.kind === 'foundation' && to.kind === 'tableau') delta = -15;
    g.score = Math.max(0, g.score + delta);
  },
  flipScore: 5,

  winBonus(g) {
    return g.elapsed >= 30 ? Math.round(700000 / g.elapsed) : 0;
  },

  isSafeToFoundation,
  canAutoFinish: canFinishByFoundations,
  isWon: (g) => foundationsFull(g, 52),
};

// ---------------------------------------------------------------------------

const spider = {
  id: 'spider',
  name: 'Spider',
  columns: 10,
  defaults: { suits: 1 },
  modeKey: (o) => `spider-s${o.suits}`,
  modeLabel: (o) => `${o.suits} suit${o.suits > 1 ? 's' : ''}`,
  maxSeed: 999999,
  hasScore: true,
  initialScore: 500,

  piles() {
    return [
      { id: 'stock', kind: 'stock', col: 0, row: 0 },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `f${i}`, kind: 'foundation', col: 2 + i, row: 0 })),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ id: `t${i}`, kind: 'tableau', col: i, row: 1 })),
    ];
  },

  deal(g, seed) {
    const suitSets = { 1: [0, 0, 0, 0, 0, 0, 0, 0], 2: [0, 1, 0, 1, 0, 1, 0, 1], 4: [0, 1, 2, 3, 0, 1, 2, 3] };
    g.cards = makeCards(suitSets[g.options.suits] || suitSets[1]);
    const deck = shuffle([...g.cards], mulberry32(seed * 13 + g.options.suits));
    for (let i = 0; i < 54; i++) g.piles[`t${i % 10}`].cards.push(deck.pop());
    for (let i = 0; i < 10; i++) top(g.piles[`t${i}`]).up = true;
    g.piles.stock.cards = deck;
  },

  canPick(g, pile, index) {
    if (pile.kind !== 'tableau' || index < 0 || index >= pile.cards.length) return false;
    return isRun(pile.cards.slice(index), suitParent);
  },

  canDrop(g, cards, from, to) {
    if (to.kind !== 'tableau') return false;
    const t = top(to);
    return !t || t.rank === cards[0].rank + 1;
  },

  isNaturalParent: suitParent,

  onStock(g) {
    const stock = g.piles.stock;
    if (!stock.cards.length) return { ok: false };
    const tableau = piles(g, 'tableau');
    if (tableau.some((t) => !t.cards.length)) {
      return { ok: false, message: 'Every column needs at least one card before you deal.' };
    }
    const dealt = [];
    for (const t of tableau) {
      const card = stock.cards.pop();
      card.up = true;
      t.cards.push(card);
      dealt.push(card.id);
    }
    g.score = Math.max(0, g.score - 1);
    return { ok: true, type: 'deal', cards: dealt };
  },

  scoreMove(g) {
    g.score = Math.max(0, g.score - 1);
  },
  flipScore: 0,

  // Complete King-to-Ace runs of one suit leave the table on their own.
  afterMove(g, events, flipTop) {
    for (const t of piles(g, 'tableau')) {
      if (t.cards.length < 13) continue;
      const run = t.cards.slice(-13);
      if (run[0].rank !== 13 || !isRun(run, suitParent)) continue;
      const dest = piles(g, 'foundation').find((f) => !f.cards.length);
      t.cards.length -= 13;
      dest.cards.push(...run);
      g.score += 100;
      events.completed.push({ from: t.id, to: dest.id, cards: run.map((c) => c.id) });
      flipTop(t, events);
    }
  },

  canAutoFinish: () => false,
  isWon: (g) => foundationsFull(g, 104),
};

// ---------------------------------------------------------------------------

// Microsoft FreeCell deal numbers (1–32000) so players can share deals.
export function microsoftDeal(seed) {
  let state = seed;
  const rand = () => {
    state = (state * 214013 + 2531011) % 4294967296;
    return (state >>> 16) & 0x7fff;
  };
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const columns = Array.from({ length: 8 }, () => []);
  let left = 52;
  for (let i = 0; i < 52; i++) {
    const j = rand() % left;
    columns[i % 8].push(deck[j]);
    deck[j] = deck[--left];
  }
  return columns; // entries: rank = (n >> 2) + 1, suit = n & 3 in clubs, diamonds, hearts, spades order
}
const MS_SUIT = [2, 3, 1, 0];

function freeCellCapacity(g, toEmptyColumn) {
  const freeCells = piles(g, 'cell').filter((c) => !c.cards.length).length;
  const emptyCols = piles(g, 'tableau').filter((t) => !t.cards.length).length - (toEmptyColumn ? 1 : 0);
  return (freeCells + 1) * 2 ** Math.max(0, emptyCols);
}

const freecell = {
  id: 'freecell',
  name: 'FreeCell',
  columns: 8,
  defaults: {},
  modeKey: () => 'freecell',
  modeLabel: () => '',
  maxSeed: 32000,
  hasScore: false,

  piles() {
    return [
      ...[0, 1, 2, 3].map((i) => ({ id: `c${i}`, kind: 'cell', col: i, row: 0 })),
      ...[0, 1, 2, 3].map((i) => ({ id: `f${i}`, kind: 'foundation', col: 4 + i, row: 0 })),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `t${i}`, kind: 'tableau', col: i, row: 1 })),
    ];
  },

  deal(g, seed) {
    g.cards = makeCards([0, 1, 2, 3]);
    microsoftDeal(seed).forEach((column, col) => {
      for (const n of column) {
        const card = g.cards[MS_SUIT[n & 3] * 13 + (n >> 2)];
        card.up = true;
        g.piles[`t${col}`].cards.push(card);
      }
    });
  },

  canPick(g, pile, index) {
    const n = pile.cards.length;
    if (index < 0 || index >= n) return false;
    if (pile.kind === 'tableau') {
      const run = pile.cards.slice(index);
      return isRun(run, altParent) && run.length <= freeCellCapacity(g, false);
    }
    return index === n - 1;
  },

  canDrop(g, cards, from, to) {
    if (to.kind === 'cell') return cards.length === 1 && !to.cards.length;
    if (to.kind === 'foundation') return from.kind !== 'foundation' && canFoundation(cards, to);
    if (to.kind === 'tableau') {
      const t = top(to);
      if (cards.length > freeCellCapacity(g, !t)) return false;
      return !t || altParent(t, cards[0]);
    }
    return false;
  },

  isNaturalParent: altParent,
  onStock: () => ({ ok: false }),
  scoreMove() {},
  flipScore: 0,
  isSafeToFoundation,
  canAutoFinish: canFinishByFoundations,
  isWon: (g) => foundationsFull(g, 52),
};

export const VARIANTS = { klondike, spider, freecell };

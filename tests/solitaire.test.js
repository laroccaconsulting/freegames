import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, move, stockAction, undo, snapshot, legalMoves, bestTarget, nextFoundationMove, canAutoFinish, serialize, deserialize, hints } from '../games/solitaire/js/engine.js';
import { microsoftDeal } from '../games/solitaire/js/variants.js';
import { RANK_LABELS } from '../games/solitaire/js/cards.js';
import { mulberry32 } from '../games/solitaire/core/rng.js';

const label = (c) => RANK_LABELS[c.rank] + 'SHCD'[c.suit];
const allCards = (g) => g.pileOrder.flatMap((id) => g.piles[id].cards);

function assertIntact(g, total) {
  const ids = allCards(g).map((c) => c.id);
  assert.equal(ids.length, total, 'card count');
  assert.equal(new Set(ids).size, total, 'no duplicates');
}

test('Microsoft FreeCell deal #1 matches the known layout', () => {
  const g = createGame('freecell', {}, 1);
  const firstRow = g.pileOrder.filter((id) => id.startsWith('t')).map((id) => label(g.piles[id].cards[0]));
  assert.deepEqual(firstRow, ['JD', '2D', '9H', 'JC', '5D', '7H', '7C', '5H']);
  assert.equal(microsoftDeal(1).flat().length, 52);
  assertIntact(g, 52);
});

test('Klondike deal layout', () => {
  const g = createGame('klondike', { draw: 3 }, 42);
  for (let i = 0; i < 7; i++) {
    const pile = g.piles[`t${i}`].cards;
    assert.equal(pile.length, i + 1);
    assert.ok(pile.at(-1).up);
    assert.ok(pile.slice(0, -1).every((c) => !c.up));
  }
  assert.equal(g.piles.stock.cards.length, 24);
  assertIntact(g, 52);
});

test('Same seed deals the same game', () => {
  assert.deepEqual(snapshot(createGame('spider', { suits: 2 }, 7)), snapshot(createGame('spider', { suits: 2 }, 7)));
  assert.notDeepEqual(snapshot(createGame('spider', { suits: 2 }, 7)), snapshot(createGame('spider', { suits: 2 }, 8)));
});

test('Klondike draw 3 and recycle, with undo', () => {
  const g = createGame('klondike', { draw: 3 }, 5);
  const before = snapshot(g);
  const r = stockAction(g);
  assert.equal(r.cards.length, 3);
  assert.equal(g.piles.waste.cards.length, 3);
  for (let i = 0; i < 7; i++) stockAction(g);
  assert.equal(g.piles.stock.cards.length, 0);
  assert.equal(stockAction(g).type, 'recycle');
  assert.equal(g.piles.stock.cards.length, 24);
  assert.ok(g.piles.stock.cards.every((c) => !c.up));
  while (undo(g));
  assert.deepEqual(snapshot(g), before);
});

test('Spider will not deal onto an empty column', () => {
  const g = createGame('spider', { suits: 1 }, 3);
  g.piles.t0.cards = [];
  const r = stockAction(g);
  assert.equal(r.ok, false);
  assert.match(r.message, /column/);
});

test('Spider removes a completed suit run', () => {
  const g = createGame('spider', { suits: 1 }, 3);
  const spades = g.cards.filter((c) => c.suit === 0).slice(0, 13); // one full A..K
  // Put K..2 on t0 and the Ace on t1, then move the Ace across.
  for (const p of g.pileOrder) g.piles[p].cards = g.piles[p].cards.filter((c) => !spades.includes(c));
  const byRank = (r) => spades.find((c) => c.rank === r);
  g.piles.t0.cards.push(...[13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map(byRank));
  g.piles.t1.cards.push(byRank(1));
  spades.forEach((c) => (c.up = true));
  const r = move(g, 't1', g.piles.t1.cards.length - 1, 't0');
  assert.ok(r);
  assert.equal(r.completed.length, 1);
  assert.equal(g.piles.f0.cards.length, 13);
});

test('FreeCell limits how many cards move at once', () => {
  const g = createGame('freecell', {}, 1);
  const cap = (fc, empty, toEmpty) => (fc + 1) * 2 ** Math.max(0, empty - (toEmpty ? 1 : 0));
  assert.equal(cap(4, 0, false), 5);
  // Fill all four cells: only single cards may move.
  for (let i = 0; i < 4; i++) g.piles[`c${i}`].cards.push(g.piles[`t${i}`].cards.pop());
  const multi = legalMoves(g, { includePointless: true }).filter((m) => g.piles[m.from].cards.length - m.index > 1);
  assert.equal(multi.length, 0);
});

test('Serialize round-trip keeps state and history', () => {
  const g = createGame('klondike', { draw: 1 }, 99);
  stockAction(g);
  stockAction(g);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(g))));
  assert.deepEqual(snapshot(copy), snapshot(g));
  assert.equal(copy.history.length, 2);
  undo(copy);
  assert.equal(copy.piles.waste.cards.length, 1);
});

test('Auto-finish clears a sorted FreeCell board', () => {
  const g = createGame('freecell', {}, 1);
  // Lay each suit out as its own descending column.
  for (const id of g.pileOrder) g.piles[id].cards = [];
  for (let s = 0; s < 4; s++) {
    g.piles[`t${s}`].cards = g.cards.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);
  }
  assert.ok(canAutoFinish(g));
  let m;
  let guard = 0;
  while ((m = nextFoundationMove(g, { safeOnly: false })) && guard++ < 60) assert.ok(move(g, m.from, m.index, m.to));
  assert.ok(g.won);
});

// Plays many random games using hints and tap targets; the card set must
// stay intact and undo must always restore the exact prior state.
for (const [variant, options, total] of [
  ['klondike', { draw: 1 }, 52],
  ['klondike', { draw: 3 }, 52],
  ['spider', { suits: 1 }, 104],
  ['spider', { suits: 4 }, 104],
  ['freecell', {}, 52],
]) {
  test(`random play keeps ${variant} ${JSON.stringify(options)} consistent`, () => {
    const rand = mulberry32(1234);
    for (let seed = 1; seed <= 25; seed++) {
      const g = createGame(variant, options, seed);
      for (let step = 0; step < 300 && !g.won; step++) {
        const before = snapshot(g);
        const options = hints(g);
        if (!options.length) break;
        const pick = options[Math.floor(rand() * Math.min(options.length, 3))];
        const r = pick.stock ? stockAction(g) : move(g, pick.from, pick.index, pick.to);
        if (!r || r.ok === false) continue;
        assertIntact(g, total);
        if (rand() < 0.1) {
          undo(g);
          assert.deepEqual(snapshot(g), before);
        }
        const auto = nextFoundationMove(g);
        if (auto) assert.ok(move(g, auto.from, auto.index, auto.to));
      }
      // Tap targets must always be legal.
      for (const id of g.pileOrder) {
        const pile = g.piles[id];
        for (let i = 0; i < pile.cards.length; i++) {
          const to = bestTarget(g, id, i);
          if (to) {
            const copy = deserialize(serialize(g));
            assert.ok(move(copy, id, i, to), `tap ${id}[${i}] → ${to}`);
          }
        }
      }
    }
  });
}

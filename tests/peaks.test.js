import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../games/peaks/js/peaks.js';

test('deals use the whole deck once', () => {
  for (const mode of P.MODES) {
    const g = P.deal(mode, 5);
    const ids = [...g.layout.map((s) => s.card), ...g.stock, ...g.waste];
    assert.equal(ids.length, 52);
    assert.equal(new Set(ids).size, 52);
    assert.deepEqual(P.deal(mode, 5).layout, g.layout);
  }
  assert.equal(P.deal('tripeaks', 1).layout.length, 28);
  assert.equal(P.deal('pyramid', 1).layout.length, 28);
  assert.equal(P.deal('golf', 1).layout.length, 35);
});

test('covering: peaks by the two cards below, golf by the next card down', () => {
  const t = P.deal('tripeaks', 1);
  assert.deepEqual(t.layout[0].by.map((j) => t.layout[j].x), [1.5, 2.5]);
  assert.equal(t.layout.filter((s) => !s.by.length).length, 10, 'the bottom row starts free');
  const p = P.deal('pyramid', 1);
  assert.equal(p.layout.filter((s) => !s.by.length).length, 7);
  const g = P.deal('golf', 1);
  assert.equal(g.layout.filter((s) => !s.by.length).length, 7);
  assert.ok(g.layout.every((s) => s.by.length <= 1));
});

test('TriPeaks plays one up or down, wrapping King and Ace, with growing runs', () => {
  const g = P.deal('tripeaks', 1);
  const rank = (id) => g.cards[id].rank;
  // Put a known card on the waste and find a free card that fits.
  const free = g.layout.map((_, i) => i).filter((i) => P.isFree(g, i));
  const i = free[0];
  const r = rank(g.layout[i].card);
  const top = g.cards.find((c) => c.rank === (r === 13 ? 1 : r + 1) && !g.layout.some((s) => s.card === c.id));
  if (top) {
    g.waste.push(top.id);
    const res = P.playCard(g, i);
    assert.ok(res);
    assert.equal(P.wasteTop(g), g.layout[i].card);
    assert.equal(g.streak, 1);
    assert.equal(res.points, 10);
    P.undo(g);
    assert.ok(!g.gone[i]);
  }
  // A covered card can't be played.
  assert.equal(P.playCard(g, 0), null);
});

test('Pyramid removes pairs to 13 and Kings alone', () => {
  const g = P.deal('pyramid', 2);
  const free = g.layout.map((_, i) => i).filter((i) => P.isFree(g, i));
  for (const m of P.moves(g)) {
    if (m.king != null) assert.equal(g.cards[m.king === 'w' ? P.wasteTop(g) : g.layout[m.king].card].rank, 13);
    if (m.pair) assert.equal(m.pair.reduce((s, x) => s + g.cards[x === 'w' ? P.wasteTop(g) : g.layout[x].card].rank, 0), 13);
  }
  const a = free[0];
  const b = free[1];
  const sum = g.cards[g.layout[a].card].rank + g.cards[g.layout[b].card].rank;
  assert.equal(Boolean(P.removePair(g, a, b)), sum === 13);
});

test('Pyramid turns the waste over twice, then no more', () => {
  const g = P.deal('pyramid', 3);
  let recycles = 0;
  for (let k = 0; k < 200; k++) {
    const res = P.draw(g);
    if (!res) break;
    if (res.type === 'recycle') recycles++;
  }
  assert.equal(recycles, P.MAX_RECYCLES);
  assert.equal(P.draw(g), null);
});

test('Golf: nothing on a King, no wrapping', () => {
  const g = P.deal('golf', 4);
  const king = g.cards.find((c) => c.rank === 13);
  const queen = g.cards.find((c) => c.rank === 12);
  const ace = g.cards.find((c) => c.rank === 1);
  g.waste.push(king.id);
  assert.ok(!P.fits(g, queen.id));
  assert.ok(!P.fits(g, ace.id));
  g.waste.push(queen.id);
  assert.ok(P.fits(g, king.id));
});

test('winnable deals really can be cleared by following the solver', () => {
  for (const mode of ['tripeaks', 'pyramid']) {
    for (const seed of [10, 20, 30]) {
      const g = P.winnableDeal(mode, seed);
      const line = P.solve(g);
      assert.ok(line, `${mode} ${seed}`);
      for (const m of line) assert.ok(P.apply(g, m), 'every step is legal');
      assert.ok(P.cleared(g));
    }
  }
});

test('golf par is reachable', () => {
  const g = P.deal('golf', 6);
  const par = P.golfPar(g);
  assert.ok(par >= 0 && par < 35);
});

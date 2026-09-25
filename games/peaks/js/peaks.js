// Peaks: three quick tap-to-play solitaires on one model. Cards sit in a
// layout where some cover others; a card is free once everything covering
// it is gone. Pure (no DOM).
//
//   TriPeaks: play a free card one higher or lower than the waste card
//             (King and Ace wrap). Clear the three peaks.
//   Pyramid:  remove free cards in pairs that add up to 13 (Kings alone).
//             Clear the pyramid.
//   Golf:     like TriPeaks on seven columns, but nothing wraps and nothing
//             goes on a King. Clear as many cards as you can.
//
// game: { mode, seed, cards: [{ id, rank, suit }], layout: [{ card, row, x, covers: [layout index] , by: [layout index] }],
//         gone: [bool], stock: [card id], waste: [card id], recycles, score, streak, history }

import { makeCards } from './cards.js';
import { mulberry32, shuffle } from '../core/rng.js';

export const MODES = ['tripeaks', 'pyramid', 'golf'];

// Layout shapes: each spot has a row and an x (in card widths, centre).
function tripeaksSpots() {
  const spots = [];
  [2, 5, 8].forEach((x) => spots.push({ row: 0, x }));
  [1.5, 2.5, 4.5, 5.5, 7.5, 8.5].forEach((x) => spots.push({ row: 1, x }));
  for (let k = 1; k <= 9; k++) spots.push({ row: 2, x: k });
  for (let k = 0; k < 10; k++) spots.push({ row: 3, x: k + 0.5 });
  return spots;
}
function pyramidSpots() {
  const spots = [];
  for (let r = 0; r < 7; r++) for (let k = 0; k <= r; k++) spots.push({ row: r, x: 3.5 - r / 2 + k });
  return spots;
}
function golfSpots() {
  const spots = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) spots.push({ row: r, x: c + 0.5 });
  return spots;
}

// Who covers whom: a card is covered by cards in the next row that overlap
// it (half a card either side), or in Golf by the card below in its column.
function link(mode, spots) {
  spots.forEach((s) => (s.by = []));
  for (const s of spots) {
    spots.forEach((t, j) => {
      if (t.row !== s.row + 1) return;
      const overlap = mode === 'golf' ? t.x === s.x : Math.abs(t.x - s.x) === 0.5;
      if (overlap) s.by.push(j);
    });
  }
  return spots;
}

export function deal(mode, seed) {
  const cards = makeCards([0, 1, 2, 3]);
  const deck = shuffle(cards.map((c) => c.id), mulberry32(seed * 31 + MODES.indexOf(mode)));
  const spots = link(mode, mode === 'tripeaks' ? tripeaksSpots() : mode === 'pyramid' ? pyramidSpots() : golfSpots());
  const layout = spots.map((s) => ({ ...s, card: deck.pop() }));
  const g = { mode, seed, cards, layout, gone: layout.map(() => false), stock: deck, waste: [], recycles: 0, score: 0, streak: 0, best: 0, history: [] };
  // TriPeaks and Golf start with one card turned onto the waste.
  if (mode !== 'pyramid') g.waste.push(g.stock.pop());
  return g;
}

const rankOf = (g, id) => g.cards[id].rank;
export const isFree = (g, i) => !g.gone[i] && g.layout[i].by.every((j) => g.gone[j]);
// TriPeaks shows only free cards face up; the others are face down.
export const faceUp = (g, i) => g.mode !== 'tripeaks' || isFree(g, i) || g.gone[i];
export const wasteTop = (g) => g.waste[g.waste.length - 1];
export const cleared = (g) => g.gone.every(Boolean);
export const left = (g) => g.gone.filter((x) => !x).length;

// Can this card go on the waste (TriPeaks and Golf)?
export function fits(g, id) {
  const top = wasteTop(g);
  if (top == null) return false;
  const a = rankOf(g, id);
  const b = rankOf(g, top);
  if (g.mode === 'golf') return b !== 13 && Math.abs(a - b) === 1;
  return Math.abs(a - b) === 1 || Math.abs(a - b) === 12;
}

const snap = (g) => ({ gone: g.gone.slice(), stock: g.stock.slice(), waste: g.waste.slice(), recycles: g.recycles, score: g.score, streak: g.streak });
export function undo(g) {
  const s = g.history.pop();
  if (!s) return false;
  Object.assign(g, s);
  return true;
}

// Play a free layout card onto the waste. Returns events or null.
export function playCard(g, i) {
  if (g.mode === 'pyramid' || !isFree(g, i) || !fits(g, g.layout[i].card)) return null;
  g.history.push(snap(g));
  g.gone[i] = true;
  g.waste.push(g.layout[i].card);
  g.streak++;
  g.best = Math.max(g.best, g.streak);
  const events = { played: [i], points: 0, peak: false };
  if (g.mode === 'tripeaks') {
    events.points = 10 * g.streak;
    if (g.layout[i].row === 0) {
      events.peak = true;
      events.points += 150;
    }
    if (cleared(g)) events.points += 500 + 50 * g.stock.length;
    g.score += events.points;
  } else g.score = 52 - left(g); // Golf: cards cleared
  return events;
}

// Pyramid: remove one King or a pair adding to 13. Sources are layout
// indexes or 'w' for the waste top card.
export function removePair(g, a, b = null) {
  if (g.mode !== 'pyramid') return null;
  const id = (src) => (src === 'w' ? wasteTop(g) : g.layout[src].card);
  const ok = (src) => (src === 'w' ? wasteTop(g) != null : isFree(g, src));
  if (!ok(a) || (b != null && (!ok(b) || a === b))) return null;
  const sum = rankOf(g, id(a)) + (b == null ? 0 : rankOf(g, id(b)));
  if (sum !== 13) return null;
  g.history.push(snap(g));
  for (const src of [a, b]) {
    if (src == null) continue;
    if (src === 'w') g.waste.pop();
    else g.gone[src] = true;
  }
  g.streak++;
  const points = 5 + (cleared(g) ? 500 : 0) + [a, b].filter((s) => s != null && s !== 'w' && g.layout[s].row === 0).length * 100;
  g.score += points;
  return { removed: [a, b].filter((s) => s != null), points };
}

// Turn the next stock card onto the waste; Pyramid recycles the waste twice.
export const MAX_RECYCLES = 2;
export function draw(g) {
  if (g.stock.length) {
    g.history.push(snap(g));
    g.waste.push(g.stock.pop());
    g.streak = 0;
    return { type: 'draw' };
  }
  if (g.mode === 'pyramid' && g.recycles < MAX_RECYCLES && g.waste.length) {
    g.history.push(snap(g));
    g.stock = g.waste.reverse();
    g.waste = [];
    g.recycles++;
    return { type: 'recycle' };
  }
  return null;
}

// ---------- Moves and the solver ----------

// Every legal move: { play: i } | { pair: [a, b] } | { king: a } | { draw: true }.
export function moves(g) {
  const out = [];
  const free = g.layout.map((_, i) => i).filter((i) => isFree(g, i));
  if (g.mode === 'pyramid') {
    const srcs = [...free, ...(wasteTop(g) != null ? ['w'] : [])];
    const r = (s) => rankOf(g, s === 'w' ? wasteTop(g) : g.layout[s].card);
    for (const a of srcs) if (r(a) === 13) out.push({ king: a });
    for (let x = 0; x < srcs.length; x++) for (let y = x + 1; y < srcs.length; y++) if (r(srcs[x]) + r(srcs[y]) === 13) out.push({ pair: [srcs[x], srcs[y]] });
  } else for (const i of free) if (fits(g, g.layout[i].card)) out.push({ play: i });
  if (g.stock.length || (g.mode === 'pyramid' && g.recycles < MAX_RECYCLES && g.waste.length)) out.push({ draw: true });
  return out;
}

export function apply(g, m) {
  if (m.play != null) return playCard(g, m.play);
  if (m.king != null) return removePair(g, m.king);
  if (m.pair) return removePair(g, m.pair[0], m.pair[1]);
  return draw(g);
}

const keyOf = (g) => `${g.gone.map((x) => (x ? 1 : 0)).join('')}|${g.stock.length}|${g.mode === 'pyramid' ? `${g.waste.join(',')}|${g.recycles}` : wasteTop(g)}`;

// Depth-first search for a clearing line of play. Returns the moves, or null
// if none was found within the budget (or there is none).
export function solve(g, { limit = 60000 } = {}) {
  const work = { ...g, gone: g.gone.slice(), stock: g.stock.slice(), waste: g.waste.slice(), history: [] };
  const seen = new Set();
  const line = [];
  let nodes = 0;
  const go = () => {
    if (cleared(work)) return true;
    if (++nodes > limit) return false;
    const key = keyOf(work);
    if (seen.has(key)) return false;
    seen.add(key);
    // Layout moves first; drawing last.
    for (const m of moves(work)) {
      apply(work, m);
      line.push(m);
      if (go()) return true;
      line.pop();
      undo(work);
    }
    return false;
  };
  return go() ? line : null;
}

// A deal the solver can clear, starting from `seed` and trying the next few.
export function winnableDeal(mode, seed, { tries = 30, limit = 60000 } = {}) {
  for (let k = 0; k < tries; k++) {
    const g = deal(mode, seed + k * 7919);
    if (solve(g, { limit })) return g;
  }
  return deal(mode, seed);
}

// Golf is rarely cleared outright, so it gets a par instead: the fewest
// cards left that a search finds within its budget.
export function golfPar(g, { limit = 40000 } = {}) {
  const work = { ...g, gone: g.gone.slice(), stock: g.stock.slice(), waste: g.waste.slice(), history: [] };
  const seen = new Set();
  let nodes = 0;
  let best = left(work);
  const go = () => {
    best = Math.min(best, left(work));
    if (!best || ++nodes > limit) return;
    const key = keyOf(work);
    if (seen.has(key)) return;
    seen.add(key);
    for (const m of moves(work)) {
      apply(work, m);
      go();
      undo(work);
      if (!best) return;
    }
  };
  go();
  return best;
}

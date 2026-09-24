// Game state, moves, undo, hints and saving. Pure logic, no DOM.
//
// A game holds its piles (each a list of card objects) plus counters.
// Every action pushes a compact snapshot onto `history` first, so undo is
// just "restore the previous snapshot".

import { VARIANTS, top } from './variants.js';

export const SAVE_VERSION = 1;

export const variantOf = (g) => VARIANTS[g.variantId];

export function createGame(variantId, options = {}, seed = 1) {
  const variant = VARIANTS[variantId];
  const g = {
    variantId,
    options: { ...variant.defaults, ...options },
    seed,
    piles: {},
    pileOrder: [],
    cards: [],
    moves: 0,
    score: variant.initialScore || 0,
    passes: 0,
    elapsed: 0,
    started: false,
    won: false,
    history: [],
  };
  for (const def of variant.piles(g.options)) {
    g.piles[def.id] = { ...def, cards: [] };
    g.pileOrder.push(def.id);
  }
  variant.deal(g, seed);
  return g;
}

// ---------- Snapshots ----------

// Each card becomes one character: id and face-up flag. Piles are
// comma-separated in pileOrder, so a snapshot is ~110 bytes.
export function snapshot(g) {
  const p = g.pileOrder
    .map((id) => g.piles[id].cards.map((c) => String.fromCharCode(48 + c.id * 2 + (c.up ? 1 : 0))).join(''))
    .join(',');
  return { p, m: g.moves, s: g.score, r: g.passes };
}

export function restore(g, snap) {
  snap.p.split(',').forEach((chars, i) => {
    const pile = g.piles[g.pileOrder[i]];
    pile.cards = [...chars].map((ch) => {
      const code = ch.charCodeAt(0) - 48;
      const card = g.cards[code >> 1];
      card.up = (code & 1) === 1;
      return card;
    });
  });
  g.moves = snap.m;
  g.score = snap.s;
  g.passes = snap.r;
}

// ---------- Actions ----------

function flipTop(pile, events) {
  const t = top(pile);
  if (pile.kind === 'tableau' && t && !t.up) {
    t.up = true;
    events.flipped.push(t.id);
    return true;
  }
  return false;
}

function finishAction(g, events) {
  const variant = variantOf(g);
  variant.afterMove?.(g, events, (pile, ev) => {
    if (flipTop(pile, ev)) g.score += variant.flipScore || 0;
  });
  g.started = true;
  if (variant.isWon(g)) {
    g.won = true;
    g.score += variant.winBonus?.(g) || 0;
    events.won = true;
  }
  return events;
}

export function canMove(g, fromId, index, toId) {
  const variant = variantOf(g);
  const from = g.piles[fromId];
  const to = g.piles[toId];
  if (!from || !to || from === to || g.won) return false;
  if (!variant.canPick(g, from, index)) return false;
  return variant.canDrop(g, from.cards.slice(index), from, to);
}

// Returns an events object describing what happened, or null if illegal.
export function move(g, fromId, index, toId) {
  if (!canMove(g, fromId, index, toId)) return null;
  const variant = variantOf(g);
  const from = g.piles[fromId];
  const to = g.piles[toId];
  g.history.push(snapshot(g));
  const cards = from.cards.splice(index);
  to.cards.push(...cards);
  g.moves++;
  variant.scoreMove(g, from, to, cards);
  const events = { type: 'move', from: fromId, to: toId, cards: cards.map((c) => c.id), flipped: [], completed: [] };
  if (flipTop(from, events)) g.score += variant.flipScore || 0;
  return finishAction(g, events);
}

// Tap on the stock: draw, recycle, or deal a row (Spider).
export function stockAction(g) {
  if (g.won) return { ok: false };
  const snap = snapshot(g);
  const result = variantOf(g).onStock(g);
  if (!result.ok) return result;
  g.history.push(snap);
  g.moves++;
  return finishAction(g, { ...result, flipped: [], completed: [] });
}

export function undo(g) {
  if (!g.history.length) return false;
  restore(g, g.history.pop());
  g.won = false;
  return true;
}

// ---------- Move search ----------

function pickStarts(pile) {
  if (!pile.cards.length) return [];
  if (pile.kind !== 'tableau') return [pile.cards.length - 1];
  const starts = [];
  for (let i = 0; i < pile.cards.length; i++) if (pile.cards[i].up) starts.push(i);
  return starts;
}

// How useful a legal move is, for hints. 0 means "legal but pointless".
function usefulness(g, from, index, to) {
  const variant = variantOf(g);
  const card = from.cards[index];
  const below = from.cards[index - 1];
  const target = top(to);
  if (from.kind === 'foundation') return 0;
  if (to.kind === 'foundation') return 100;
  if (to.kind === 'cell') {
    if (from.kind === 'cell') return 0;
    return below && !below.up ? 20 : 8;
  }
  // to tableau
  if (from.kind === 'waste') return 60;
  if (from.kind === 'cell') return target ? 55 : 12;
  if (!below) return target ? 50 : 0; // empties a column; moving a whole column to an empty one is pointless
  if (!below.up) return 80 + from.cards.filter((c) => !c.up).length;
  if (variant.isNaturalParent(below, card)) return 0; // already sitting on a proper parent
  if (g.variantId === 'spider') {
    if (below.rank === card.rank + 1) return target && target.suit === card.suit ? 45 : 0;
    return target && target.suit === card.suit ? 40 : 25;
  }
  return target ? 30 : 15;
}

export function legalMoves(g, { includePointless = false } = {}) {
  const variant = variantOf(g);
  const out = [];
  if (g.won) return out;
  for (const fromId of g.pileOrder) {
    const from = g.piles[fromId];
    if (from.kind === 'stock') continue;
    for (const index of pickStarts(from)) {
      if (!variant.canPick(g, from, index)) continue;
      const cards = from.cards.slice(index);
      for (const toId of g.pileOrder) {
        const to = g.piles[toId];
        if (to === from || to.kind === 'stock' || to.kind === 'waste') continue;
        if (!variant.canDrop(g, cards, from, to)) continue;
        const priority = usefulness(g, from, index, to);
        if (priority > 0 || includePointless) out.push({ from: fromId, index, to: toId, priority });
      }
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

export function stockAvailable(g) {
  const stock = g.piles.stock;
  if (!stock) return false;
  return stock.cards.length > 0 || (g.piles.waste?.cards.length ?? 0) > 0;
}

// Hints in order of usefulness; a {stock: true} entry means "tap the stock".
export function hints(g) {
  const list = legalMoves(g);
  if (stockAvailable(g)) list.push({ stock: true, priority: 1 });
  return list;
}

export function isStuck(g) {
  return !g.won && !stockAvailable(g) && legalMoves(g).length === 0;
}

// Where a tapped card (and everything on it) should go, or null.
export function bestTarget(g, fromId, index) {
  const variant = variantOf(g);
  const from = g.piles[fromId];
  if (g.won || !variant.canPick(g, from, index)) return null;
  const cards = from.cards.slice(index);
  const card = cards[0];
  const ids = g.pileOrder;
  const start = ids.indexOf(fromId);
  const ordered = [...ids.slice(start + 1), ...ids.slice(0, start)].map((id) => g.piles[id]);
  const ok = (to) => variant.canDrop(g, cards, from, to);

  const foundation = ordered.find((p) => p.kind === 'foundation' && ok(p));
  if (foundation && cards.length === 1) return foundation.id;

  const tableaus = ordered.filter((p) => p.kind === 'tableau' && p.cards.length && ok(p));
  const sameSuit = tableaus.find((p) => top(p).suit === card.suit);
  const below = from.cards[index - 1];
  const alreadyHome = below && below.up && variant.isNaturalParent(below, card);
  if (g.variantId === 'spider' && sameSuit) return sameSuit.id;
  if (tableaus.length && !(alreadyHome && from.kind === 'tableau')) return tableaus[0].id;

  if (!(from.kind === 'tableau' && index === 0)) {
    const empty = ordered.find((p) => p.kind === 'tableau' && !p.cards.length && ok(p));
    if (empty) return empty.id;
  }
  if (from.kind !== 'cell') {
    const cell = ordered.find((p) => p.kind === 'cell' && ok(p));
    if (cell) return cell.id;
  }
  if (tableaus.length) return tableaus[0].id;
  return null;
}

// Next card that can go to a foundation. With safeOnly, only cards that no
// other card could still need (used for automatic play while the game runs).
export function nextFoundationMove(g, { safeOnly = true } = {}) {
  const variant = variantOf(g);
  if (g.won || !variant.isSafeToFoundation) return null;
  const foundations = g.pileOrder.filter((id) => g.piles[id].kind === 'foundation');
  let best = null;
  for (const fromId of g.pileOrder) {
    const from = g.piles[fromId];
    if (!['tableau', 'waste', 'cell'].includes(from.kind) || !from.cards.length) continue;
    const card = top(from);
    if (!card.up || (safeOnly && !variant.isSafeToFoundation(g, card))) continue;
    const to = foundations.find((id) => variant.canDrop(g, [card], from, g.piles[id]));
    if (to && (!best || card.rank < best.rank)) best = { from: fromId, index: from.cards.length - 1, to, rank: card.rank };
  }
  return best;
}

export function canAutoFinish(g) {
  return !g.won && variantOf(g).canAutoFinish(g);
}

// ---------- Saving ----------

export function serialize(g) {
  return {
    v: SAVE_VERSION,
    variantId: g.variantId,
    options: g.options,
    seed: g.seed,
    snap: snapshot(g),
    history: g.history.slice(-2000),
    elapsed: Math.round(g.elapsed),
    started: g.started,
    won: g.won,
  };
}

export function deserialize(data) {
  if (!data || data.v !== SAVE_VERSION || !VARIANTS[data.variantId]) return null;
  try {
    const g = createGame(data.variantId, data.options, data.seed);
    restore(g, data.snap);
    g.history = data.history || [];
    g.elapsed = data.elapsed || 0;
    g.started = !!data.started;
    g.won = !!data.won;
    return g;
  } catch {
    return null;
  }
}

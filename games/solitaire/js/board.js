// Draws the table and handles drag, drop and tap. Every card is one DOM
// element positioned with transforms; render() moves each card to where the
// game state says it belongs, and CSS transitions animate the difference.

import { RANK_LABELS, isRed, cardName } from './cards.js';
import { variantOf, canMove } from './engine.js';

const svgUse = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// Pip positions for number cards as [x, y] fractions of the pip area.
const L = 0, M = 0.5, R = 1;
const PIPS = {
  2: [[M, 0], [M, 1]],
  3: [[M, 0], [M, 0.5], [M, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [M, 0.5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [M, 0.75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [M, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [M, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [M, 5 / 6], [L, 1], [R, 1]],
};

function cardFace(card) {
  const rank = RANK_LABELS[card.rank];
  const suit = `suit-${card.suit}`;
  const court = card.rank > 10;
  let art;
  if (card.rank === 1) {
    art = `<div class="pips">${svgUse(suit, 'pip ace')}</div>`;
  } else if (court) {
    art = `<div class="court">${svgUse(`court-${card.rank}`, 'emblem')}${svgUse(suit, 'court-suit')}</div>`;
  } else {
    art = `<div class="pips">${PIPS[card.rank]
      .map(([x, y]) => `<svg class="pip${y > 0.5 ? ' flip' : ''}" style="left:${x * 100}%;top:${y * 100}%" aria-hidden="true"><use href="#${suit}"/></svg>`)
      .join('')}</div>`;
  }
  const corner = (cls) => `<div class="corner ${cls}"><span class="r">${rank}</span>${svgUse(suit, 's')}</div>`;
  return (
    `<div class="idx"><span class="r${rank === '10' ? ' ten' : ''}">${rank}</span>${svgUse(suit, 's')}</div>` +
    svgUse(court ? `court-${card.rank}` : suit, 'center') +
    corner('tl') + corner('br') + art
  );
}

export class Board {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers; // { onMove, onTap, onStock, onDragInvalid }
    this.game = null;
    this.cardEls = new Map();
    this.slotEls = new Map();
    this.where = new Map(); // card id -> { pile, index }
    this.pos = new Map(); // card id -> { x, y }
    this.pileRects = new Map();
    this.leftHanded = false;
    this.press = null;
    this.raiseTimers = new Map();

    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMoveEvent(e));
    root.addEventListener('pointerup', (e) => this.onUp(e));
    root.addEventListener('pointercancel', (e) => this.onCancel(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => this.game && this.render({ animate: false })).observe(root);
  }

  setGame(game, { deal = false } = {}) {
    this.game = game;
    this.cancelDrag();
    this.root.replaceChildren();
    this.cardEls.clear();
    this.slotEls.clear();
    this.pos.clear();
    this.root.dataset.variant = game.variantId;
    for (const id of game.pileOrder) {
      const pile = game.piles[id];
      const slot = document.createElement('div');
      slot.className = `slot slot-${pile.kind}`;
      slot.dataset.pile = id;
      this.slotEls.set(id, slot);
      this.root.append(slot);
    }
    for (const card of game.cards) {
      const el = document.createElement('div');
      el.className = `card s${card.suit} ${isRed(card.suit) ? 'red' : 'black'}${card.rank > 10 ? ' court-card' : ''}`;
      el.dataset.id = card.id;
      el.innerHTML = `<div class="card-inner"><div class="card-face">${cardFace(card)}</div><div class="card-back"></div></div>`;
      this.cardEls.set(card.id, el);
      this.root.append(el);
    }
    if (deal) this.dealAnimation();
    else this.render({ animate: false });
  }

  // ---------- Layout ----------

  metrics() {
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    const cols = variantOf(this.game).columns;
    const gapRatio = cols >= 10 ? 0.07 : cols >= 8 ? 0.09 : 0.12;
    const pad = Math.max(6, Math.min(18, W * 0.02));
    const ratio = 1.4;
    let cw = (W - 2 * pad) / (cols + (cols - 1) * gapRatio);
    cw = Math.floor(Math.max(24, Math.min(cw, (H - 2 * pad) / (ratio * 3.1), 132)));
    const ch = Math.round(cw * ratio);
    const gap = Math.max(3, cw * gapRatio);
    const totalW = cols * cw + (cols - 1) * gap;
    const x0 = (W - totalW) / 2;
    const topY = Math.max(6, pad * 0.75);
    const rowGap = Math.max(8, Math.round(ch * 0.16));
    const big = cw >= 74;
    return { W, H, cols, cw, ch, gap, x0, topY, tabY: topY + ch + rowGap, big, pad };
  }

  colX(col) {
    const m = this.m;
    const c = this.leftHanded ? m.cols - 1 - col : col;
    return m.x0 + c * (m.cw + m.gap);
  }

  pileLayout(pile) {
    const m = this.m;
    const x = this.colX(pile.col);
    const y = pile.row === 0 ? m.topY : m.tabY;
    const n = pile.cards.length;
    const dir = this.leftHanded ? -1 : 1;
    const positions = [];

    if (pile.kind === 'tableau') {
      let down = m.ch * 0.11;
      let up = m.ch * (m.big ? 0.25 : 0.3);
      const avail = m.H - y - m.ch - m.pad * 0.5;
      const nd = pile.cards.slice(0, -1).filter((c) => !c.up).length;
      const nu = Math.max(0, n - 1 - nd);
      if (nd * down + nu * up > avail) {
        down = Math.max(m.ch * 0.04, Math.min(down, (avail - nu * up) / Math.max(1, nd)));
        if (nd * down + nu * up > avail) up = Math.max(m.ch * 0.1, (avail - nd * down) / Math.max(1, nu));
      }
      let cy = y;
      for (const card of pile.cards) {
        positions.push({ x, y: cy });
        cy += card.up ? up : down;
      }
    } else if (pile.kind === 'waste' && this.game.options.draw === 3) {
      const visible = Math.min(3, n);
      pile.cards.forEach((_, i) => {
        const k = Math.max(0, i - (n - visible));
        positions.push({ x: x + dir * k * m.cw * 0.4, y });
      });
    } else if (pile.kind === 'stock' && this.game.variantId === 'spider') {
      pile.cards.forEach((_, i) => positions.push({ x: x + dir * Math.floor(i / 10) * m.cw * 0.14, y }));
    } else {
      pile.cards.forEach(() => positions.push({ x, y }));
    }
    const last = positions[positions.length - 1];
    const right = Math.max(x, last ? last.x : x) + m.cw;
    const left = Math.min(x, last ? last.x : x);
    this.pileRects.set(pile.id, { x: left, y, w: right - left, h: (last ? last.y - y : 0) + m.ch });
    return { slot: { x, y }, positions };
  }

  render({ animate = true } = {}) {
    const g = this.game;
    if (!g) return;
    this.m = this.metrics();
    const m = this.m;
    const root = this.root;
    root.style.setProperty('--cw', `${m.cw}px`);
    root.style.setProperty('--ch', `${m.ch}px`);
    root.classList.toggle('big', m.big);
    root.classList.toggle('no-anim', !animate);
    this.where.clear();

    g.pileOrder.forEach((id, pileIndex) => {
      const pile = g.piles[id];
      const { slot, positions } = this.pileLayout(pile);
      const slotEl = this.slotEls.get(id);
      slotEl.style.transform = `translate(${slot.x}px, ${slot.y}px)`;
      this.decorateSlot(pile, slotEl);

      pile.cards.forEach((card, i) => {
        const el = this.cardEls.get(card.id);
        const p = positions[i];
        this.where.set(card.id, { pile: id, index: i });
        const prev = this.pos.get(card.id);
        const moved = !prev || Math.abs(prev.x - p.x) > 0.5 || Math.abs(prev.y - p.y) > 0.5;
        const z = pileIndex * 160 + i + 1;
        el.classList.toggle('up', card.up);
        el.setAttribute('aria-label', card.up ? cardName(card) : 'Face-down card');
        el.classList.toggle('pickable', card.up && pile.kind !== 'stock');
        if (moved && animate && prev) this.raise(el, card.id, z);
        else if (!this.raiseTimers.has(card.id)) el.style.zIndex = z;
        else this.raiseTimers.get(card.id).z = z;
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        this.pos.set(card.id, p);
      });
    });
    if (!animate) {
      void root.offsetWidth;
      root.classList.remove('no-anim');
    }
  }

  // Keeps a moving card above everything until its transition ends.
  raise(el, id, z) {
    const existing = this.raiseTimers.get(id);
    if (existing) clearTimeout(existing.timer);
    el.style.zIndex = 3000 + z;
    const entry = { z };
    entry.timer = setTimeout(() => {
      el.style.zIndex = entry.z;
      this.raiseTimers.delete(id);
    }, 420);
    this.raiseTimers.set(id, entry);
  }

  decorateSlot(pile, el) {
    const g = this.game;
    let label = '';
    if (pile.kind === 'foundation' && g.variantId !== 'spider') label = 'A';
    else if (pile.kind === 'tableau' && g.variantId === 'klondike') label = 'K';
    else if (pile.kind === 'stock') label = g.variantId === 'klondike' && g.piles.waste.cards.length ? '↻' : '';
    if (el.dataset.label !== label) {
      el.dataset.label = label;
      el.textContent = label;
    }
    el.classList.toggle('slot-hidden', pile.kind === 'stock' && g.variantId === 'spider' && !pile.cards.length);
  }

  dealAnimation() {
    const g = this.game;
    this.m = this.metrics();
    const stock = g.piles.stock;
    const from = stock
      ? { x: this.colX(stock.col), y: this.m.topY }
      : { x: (this.m.W - this.m.cw) / 2, y: this.m.H + 20 };
    this.root.classList.add('no-anim');
    for (const el of this.cardEls.values()) {
      el.classList.remove('up');
      el.style.transform = `translate3d(${from.x}px, ${from.y}px, 0)`;
    }
    void this.root.offsetWidth;
    this.root.classList.remove('no-anim');
    // Stagger tableau cards row by row, like a real deal.
    const tableau = g.pileOrder.map((id) => g.piles[id]).filter((p) => p.kind === 'tableau');
    const maxLen = Math.max(...tableau.map((p) => p.cards.length));
    let k = 0;
    const step = g.cards.length > 60 ? 12 : 22;
    for (let row = 0; row < maxLen; row++) {
      for (const p of tableau) {
        const card = p.cards[row];
        if (card) this.cardEls.get(card.id).style.transitionDelay = `${k++ * step}ms`;
      }
    }
    this.pos.clear();
    for (const id of g.pileOrder) {
      for (const card of g.piles[id].cards) this.pos.set(card.id, from);
    }
    this.render({ animate: true });
    this.dealing = true;
    setTimeout(() => {
      for (const el of this.cardEls.values()) el.style.transitionDelay = '';
      this.dealing = false;
    }, k * step + 450);
    return k * step + 450;
  }

  // ---------- Feedback ----------

  topElementOf(pileId) {
    const pile = this.game.piles[pileId];
    const t = pile.cards[pile.cards.length - 1];
    return t ? this.cardEls.get(t.id) : this.slotEls.get(pileId);
  }

  highlight({ from, index, to, stock }) {
    this.clearHighlight();
    const els = [];
    if (stock) els.push(this.topElementOf('stock'));
    else {
      for (const card of this.game.piles[from].cards.slice(index)) els.push(this.cardEls.get(card.id));
      const target = this.topElementOf(to);
      target.classList.add('hint-target');
      els.push(target);
    }
    els.forEach((el) => el.classList.add('hint'));
    this.hintTimer = setTimeout(() => this.clearHighlight(), 1800);
  }

  clearHighlight() {
    clearTimeout(this.hintTimer);
    this.root.querySelectorAll('.hint, .hint-target').forEach((el) => el.classList.remove('hint', 'hint-target'));
  }

  shake(pileId, index) {
    const pile = this.game.piles[pileId];
    const els = pile ? pile.cards.slice(index).map((c) => this.cardEls.get(c.id)) : [];
    for (const el of els) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 400);
    }
  }

  // Card rectangles in page coordinates, for the win celebration.
  foundationCardRects() {
    const box = this.root.getBoundingClientRect();
    const g = this.game;
    return g.pileOrder
      .filter((id) => g.piles[id].kind === 'foundation')
      .map((id) => {
        const r = this.pileRects.get(id);
        return { cards: [...g.piles[id].cards], x: box.left + r.x, y: box.top + r.y };
      });
  }

  // ---------- Pointer input ----------

  onDown(e) {
    if (!this.game || (e.pointerType === 'mouse' && e.button !== 0) || this.press) return;
    const cardEl = e.target.closest('.card');
    const slotEl = !cardEl && e.target.closest('.slot');
    let pileId;
    let index;
    if (cardEl) {
      const w = this.where.get(Number(cardEl.dataset.id));
      if (!w) return;
      ({ pile: pileId, index } = w);
    } else if (slotEl) {
      pileId = slotEl.dataset.pile;
      index = -1;
    } else return;
    const pile = this.game.piles[pileId];
    const variant = variantOf(this.game);
    this.press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      pileId,
      index,
      draggable: index >= 0 && pile.kind !== 'stock' && !this.game.won && variant.canPick(this.game, pile, index),
      dragging: false,
    };
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  onMoveEvent(e) {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging) {
      if (!p.draggable || Math.hypot(dx, dy) < (e.pointerType === 'mouse' ? 4 : 8)) return;
      p.dragging = true;
      this.clearHighlight();
      p.cards = this.game.piles[p.pileId].cards.slice(p.index);
      p.cards.forEach((card, k) => {
        const el = this.cardEls.get(card.id);
        el.classList.add('dragging');
        el.style.zIndex = 9000 + k;
      });
    }
    p.dx = dx;
    p.dy = dy;
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.applyDrag();
      });
    }
  }

  applyDrag() {
    const p = this.press;
    if (!p?.dragging) return;
    for (const card of p.cards) {
      const base = this.pos.get(card.id);
      this.cardEls.get(card.id).style.transform = `translate3d(${base.x + p.dx}px, ${base.y + p.dy}px, 0)`;
    }
    const target = this.dropTarget();
    if (target !== p.target) {
      if (p.target) this.topElementOf(p.target).classList.remove('drop-target');
      if (target) this.topElementOf(target).classList.add('drop-target');
      p.target = target;
    }
  }

  dropTarget() {
    const p = this.press;
    const g = this.game;
    const first = this.pos.get(p.cards[0].id);
    const r = { x: first.x + p.dx, y: first.y + p.dy, w: this.m.cw, h: this.m.ch };
    let best = null;
    let bestArea = 0;
    for (const id of g.pileOrder) {
      if (id === p.pileId) continue;
      const pr = this.pileRects.get(id);
      const ox = Math.min(r.x + r.w, pr.x + pr.w) - Math.max(r.x, pr.x);
      const oy = Math.min(r.y + r.h, pr.y + pr.h) - Math.max(r.y, pr.y);
      if (ox <= 0 || oy <= 0) continue;
      const area = ox * oy;
      if (area > bestArea && canMove(g, p.pileId, p.index, id)) {
        best = id;
        bestArea = area;
      }
    }
    return best;
  }

  onUp(e) {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    this.press = null;
    if (p.dragging) {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.press = p;
      this.applyDrag();
      this.press = null;
      const target = p.target;
      if (target) this.topElementOf(target).classList.remove('drop-target');
      this.endDragVisuals(p);
      if (!(target && this.h.onMove(p.pileId, p.index, target))) {
        this.render();
        if (!target) this.h.onDragInvalid?.();
      }
      return;
    }
    const pile = this.game.piles[p.pileId];
    if (pile.kind === 'stock') this.h.onStock();
    else if (p.index >= 0) this.h.onTap(p.pileId, p.index);
  }

  onCancel(e) {
    if (this.press?.id === e.pointerId) this.cancelDrag();
  }

  endDragVisuals(p) {
    // Stay on top while sliding to the drop spot or back home.
    p.cards.forEach((card, k) => {
      const el = this.cardEls.get(card.id);
      if (!el) return;
      el.classList.remove('dragging');
      this.raise(el, card.id, Number(el.style.zIndex) - 9000 + k);
    });
  }

  cancelDrag() {
    const p = this.press;
    this.press = null;
    if (p?.dragging) {
      if (p.target) this.topElementOf(p.target)?.classList.remove('drop-target');
      this.endDragVisuals(p);
      this.render();
    }
  }
}

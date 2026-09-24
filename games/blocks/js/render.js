// Canvas renderer for Blocks: the board, the hand, dragging with a ghost
// preview, and clears that ripple out from where the piece landed.
// Rules live in rules.js; this file only draws and handles pointer input.
import { Particles } from '../core/fx.js';
import { SIZE, PIECES, canPlace, fullLines, fitsAnywhere } from './rules.js';
import { drawBlock } from './themes.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const HAND_SCALE = 0.56;
const NEXT_SCALE = 0.26;

export class View {
  constructor(canvas, stage, { onPlace, onInvalid, onPickUp } = {}) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.onPlace = onPlace;
    this.onInvalid = onInvalid;
    this.onPickUp = onPickUp;
    this.board = new Array(SIZE * SIZE).fill(0);
    this.cells = Array.from({ length: SIZE * SIZE }, () => ({ pop: 0 }));
    this.dying = []; // clearing blocks: { i, color, t, delay }
    this.hand = [null, null, null]; // { id, x, y, scale, enter }
    this.next = [];
    this.drag = null;
    this.selected = -1;
    this.cursor = null; // keyboard cursor { row, col }
    this.fx = new Particles();
    this.options = { reduced: false, effects: true };
    this.shake = 0;
    this.time = 0;
    this.dirty = true;
    this.sprites = new Map();
    this.locked = false;

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => this.cancel());
    new ResizeObserver(() => this.resize()).observe(stage);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const loop = (ts) => {
      this.frame(ts);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setTheme(theme) {
    this.theme = theme;
    this.sprites.clear();
    this.dirty = true;
  }

  setOptions(o) {
    Object.assign(this.options, o);
    this.dirty = true;
  }

  // ---------- State from the game ----------

  setBoard(board) {
    this.board = board.slice();
    this.dying = [];
    this.dirty = true;
  }

  setHand(hand, next, { deal = false } = {}) {
    this.hand = hand.map((id, k) => (id == null ? null : { id, enter: deal ? -k * 0.08 : 1 }));
    this.next = next;
    this.selected = -1;
    this.layout();
    this.dirty = true;
  }

  // ---------- Layout ----------

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.dpr = dpr;
    this.layout();
    this.dirty = true;
  }

  layout() {
    const box = this.stage.getBoundingClientRect();
    this.box = box;
    this.side = box.width > box.height * 1.15;
    if (this.side) {
      const B = Math.min(box.height - 24, box.width * 0.56);
      this.cell = B / SIZE;
      this.bx = box.left + Math.max(12, (box.width * 0.6 - B) / 2);
      this.by = box.top + (box.height - B) / 2;
      const hx = this.bx + B + 24;
      const hw = box.right - hx - 12;
      const slotH = (B * 0.82) / 3;
      this.slots = [0, 1, 2].map((k) => ({ x: hx + hw / 2, y: this.by + slotH * (k + 0.5), w: hw, h: slotH }));
      this.nextY = this.by + B * 0.9;
      this.nextX = hx + hw / 2;
      this.nextW = hw;
    } else {
      const B = Math.min(box.width - 24, box.height * 0.64, 560);
      this.cell = B / SIZE;
      this.bx = box.left + (box.width - B) / 2;
      const handH = this.cell * HAND_SCALE * 5.4;
      const nextH = this.cell * 1.1;
      const free = box.height - B - handH - nextH;
      this.by = box.top + Math.max(6, free * 0.35);
      const hy = this.by + B + Math.max(8, free * 0.3) + handH / 2;
      const hw = Math.min(box.width, B + 40) / 3;
      const hx0 = box.left + (box.width - hw * 3) / 2;
      this.slots = [0, 1, 2].map((k) => ({ x: hx0 + hw * (k + 0.5), y: hy, w: hw, h: handH }));
      this.nextY = hy + handH / 2 + nextH / 2;
      this.nextX = box.left + box.width / 2;
      this.nextW = B;
    }
    this.B = this.cell * SIZE;
  }

  cellAt(x, y) {
    const c = Math.floor((x - this.bx) / this.cell);
    const r = Math.floor((y - this.by) / this.cell);
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? { r, c } : null;
  }

  slotAt(x, y) {
    return this.slots.findIndex((s) => Math.abs(x - s.x) < s.w / 2 && Math.abs(y - s.y) < s.h / 2 + 10);
  }

  // ---------- Pointer input ----------

  down(e) {
    if (this.locked) return;
    const k = this.slotAt(e.clientX, e.clientY);
    if (k >= 0 && this.hand[k]) {
      e.preventDefault();
      this.canvas.setPointerCapture?.(e.pointerId);
      const piece = PIECES[this.hand[k].id];
      // On touch, lift the piece above the finger so it stays visible.
      const lift = e.pointerType === 'touch' ? this.cell * (piece.h / 2 + 1.3) : 0;
      this.drag = { slot: k, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lift, grow: 0, moved: false, t0: performance.now() };
      this.cursor = null;
      this.onPickUp?.();
      this.updateGhost();
      return;
    }
    // Tap-to-place: with a piece selected, tap a board cell.
    const cell = this.cellAt(e.clientX, e.clientY);
    if (cell && this.selected >= 0 && this.hand[this.selected]) {
      e.preventDefault();
      const piece = PIECES[this.hand[this.selected].id];
      const row = clamp(cell.r - Math.floor(piece.h / 2), 0, SIZE - piece.h);
      const col = clamp(cell.c - Math.floor(piece.w / 2), 0, SIZE - piece.w);
      this.tryPlace(this.selected, row, col);
    }
  }

  move(e) {
    if (!this.drag) return;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 8) this.drag.moved = true;
    this.updateGhost();
    this.dirty = true;
  }

  up() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const quick = !d.moved && performance.now() - d.t0 < 350;
    if (quick) {
      // A tap selects the piece for tap-to-place.
      this.selected = this.selected === d.slot ? -1 : d.slot;
      this.ghost = null;
      this.dirty = true;
      return;
    }
    const g = this.ghost;
    this.ghost = null;
    if (g && g.valid) this.onPlace?.(d.slot, g.row, g.col);
    else if (d.moved) this.onInvalid?.();
    this.dirty = true;
  }

  cancel() {
    this.drag = null;
    this.ghost = null;
    this.dirty = true;
  }

  tryPlace(slot, row, col) {
    const piece = PIECES[this.hand[slot].id];
    if (canPlace(this.board, piece, row, col)) {
      this.selected = -1;
      this.onPlace?.(slot, row, col);
    } else {
      this.shake = 0.4;
      this.onInvalid?.();
    }
  }

  // Where the dragged piece would land, and which lines it would clear.
  updateGhost() {
    const d = this.drag;
    if (!d) return;
    const piece = PIECES[this.hand[d.slot].id];
    const left = d.x - (piece.w * this.cell) / 2;
    const top = d.y - d.lift - (piece.h * this.cell) / 2;
    const col = Math.round((left - this.bx) / this.cell);
    const row = Math.round((top - this.by) / this.cell);
    this.ghost = this.ghostAt(piece, row, col);
  }

  ghostAt(piece, row, col) {
    const valid = canPlace(this.board, piece, row, col);
    let lines = null;
    if (valid) {
      const b = this.board.slice();
      for (const [r, c] of piece.cells) b[(row + r) * SIZE + col + c] = piece.color + 1;
      lines = fullLines(b);
    }
    return { piece, row, col, valid, lines };
  }

  // Keyboard: move a cursor over the board for the selected piece.
  moveCursor(dr, dc) {
    if (this.selected < 0 || !this.hand[this.selected]) return;
    const piece = PIECES[this.hand[this.selected].id];
    const cur = this.cursor || { row: 0, col: 0 };
    cur.row = clamp(cur.row + dr, 0, SIZE - piece.h);
    cur.col = clamp(cur.col + dc, 0, SIZE - piece.w);
    this.cursor = cur;
    this.ghost = this.ghostAt(piece, cur.row, cur.col);
    this.dirty = true;
  }

  placeAtCursor() {
    if (this.selected < 0 || !this.cursor) return;
    this.ghost = null;
    this.tryPlace(this.selected, this.cursor.row, this.cursor.col);
  }

  select(k) {
    this.selected = this.hand[k] ? k : -1;
    if (this.cursor && this.selected >= 0) this.moveCursor(0, 0);
    this.dirty = true;
  }

  // ---------- Animations driven by the game ----------

  // The piece in `slot` lands at row/col; `result` comes from rules.place.
  placed(slot, piece, row, col, result) {
    this.hand[slot] = null;
    this.selected = -1;
    this.cursor = null;
    for (const [r, c] of piece.cells) {
      const i = (row + r) * SIZE + col + c;
      this.board[i] = piece.color + 1;
      this.cells[i].pop = 1;
    }
    if (!result.cleared.length) {
      this.board = result.board.slice();
      return;
    }
    // Clear in a ripple from the middle of the piece.
    const cr = row + piece.h / 2;
    const cc = col + piece.w / 2;
    const reduced = this.options.reduced;
    for (const i of result.cleared) {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      const dist = Math.hypot(r + 0.5 - cr, c + 0.5 - cc);
      this.dying.push({ i, color: this.board[i] - 1, t: 0, delay: reduced ? 0 : dist * 0.028 });
    }
    this.board = result.board.slice();
    const lines = result.lines;
    if (!this.options.effects || reduced) return;
    this.shake = Math.min(1, 0.15 + lines * 0.18);
    const x = this.bx + cc * this.cell;
    const y = this.by + cr * this.cell;
    const color = this.theme.colors[piece.color];
    this.fx.ring(x, y, color, this.cell * (2 + lines), 5);
    if (lines >= 2) this.fx.flash = this.theme.dark ? 0.35 : 0.25;
  }

  // Floating text over the board: points and callouts.
  float(text, { big = false, color } = {}) {
    if (!this.options.effects || this.options.reduced) return;
    const x = this.bx + this.B / 2;
    const y = this.by + this.B * (big ? 0.4 : 0.55);
    this.fx.text(x, y, text, color || (this.theme.dark ? '#fff27a' : '#e06a00'), big ? this.cell * 1.1 : this.cell * 0.75);
  }

  // Zen sweep: blocks in these cells pop away in a wave.
  clearCells(cells) {
    for (const [n, i] of cells.entries()) {
      if (!this.board[i]) continue;
      this.dying.push({ i, color: this.board[i] - 1, t: 0, delay: this.options.reduced ? 0 : n * 0.02 });
      this.board[i] = 0;
    }
  }

  // Game over: every block greys out, top-left to bottom-right.
  gameOver() {
    this.grey = 0;
  }

  reset() {
    this.grey = null;
    this.dying = [];
    this.ghost = null;
    this.drag = null;
  }

  celebrate({ onJackpot } = {}) {
    return new Promise((resolve) => {
      if (this.options.reduced || !this.options.effects) {
        onJackpot?.();
        resolve();
        return;
      }
      const palette = this.theme.colors;
      this.fx.fountain(this.width, this.height, palette, this.theme.particles, 1);
      this.fx.rain(this.width, palette, this.theme.particles);
      this.fx.flash = this.theme.dark ? 0.6 : 0.4;
      onJackpot?.();
      setTimeout(resolve, 1600);
    });
  }

  // ---------- Frame loop ----------

  frame(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.time += dt;
    let active = this.fx.active || this.dying.length > 0 || !!this.drag || this.shake > 0 || this.grey != null;
    this.fx.step(dt);
    for (const c of this.cells) {
      if (c.pop > 0) {
        c.pop = Math.max(0, c.pop - dt * 4);
        active = true;
      }
    }
    for (const h of this.hand) {
      if (h && h.enter < 1) {
        h.enter = Math.min(1, h.enter + dt / 0.35);
        active = true;
      }
    }
    if (this.drag) this.drag.grow = Math.min(1, this.drag.grow + dt / 0.12);
    const effects = this.options.effects && !this.options.reduced;
    for (const d of this.dying) {
      const before = d.t;
      d.t += dt;
      const local = d.t - d.delay;
      if (effects && before - d.delay < 0.08 && local >= 0.08) {
        const r = Math.floor(d.i / SIZE);
        const c = d.i % SIZE;
        this.fx.burst(this.bx + (c + 0.5) * this.cell, this.by + (r + 0.5) * this.cell, this.theme.colors[d.color], this.theme.particles, { count: 6, speed: 260 });
      }
    }
    this.dying = this.dying.filter((d) => d.t - d.delay < 0.45);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.grey != null && this.grey < 1) this.grey = Math.min(1, this.grey + dt / 0.9);
    if (active || this.dirty) {
      this.draw();
      this.dirty = false;
    }
  }

  // ---------- Drawing ----------

  sprite(color, size) {
    const key = `${color}:${Math.round(size * 4)}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const px = Math.ceil(size * this.dpr);
    c.width = c.height = px;
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    drawBlock(ctx, this.theme, this.theme.colors[color], size, color);
    this.sprites.set(key, c);
    return c;
  }

  block(color, x, y, size, { alpha = 1, scale = 1, glow = 0 } = {}) {
    const ctx = this.ctx;
    const sp = this.sprite(color, size);
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (glow && this.theme.glow) {
      ctx.shadowColor = this.theme.colors[color];
      ctx.shadowBlur = 14 * glow * this.theme.glow;
    }
    const s = size * scale;
    ctx.drawImage(sp, x + (size - s) / 2, y + (size - s) / 2, s, s);
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.theme) return;
    const cell = this.cell;
    const sx = this.shake ? (Math.random() - 0.5) * this.shake * 10 : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake * 10 : 0;
    ctx.save();
    ctx.translate(sx, sy);

    // Board.
    const pad = cell * 0.18;
    ctx.fillStyle = this.theme.board.bg;
    ctx.strokeStyle = this.theme.board.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(this.bx - pad, this.by - pad, this.B + pad * 2, this.B + pad * 2, cell * 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.theme.board.cell;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        ctx.beginPath();
        ctx.roundRect(this.bx + c * cell + cell * 0.05, this.by + r * cell + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.14);
        ctx.fill();
      }

    // Lines the ghost would clear light up.
    const g = this.ghost;
    const lit = new Set();
    if (g?.valid && g.lines) {
      for (const r of g.lines.rows) for (let j = 0; j < SIZE; j++) lit.add(r * SIZE + j);
      for (const c of g.lines.cols) for (let j = 0; j < SIZE; j++) lit.add(j * SIZE + c);
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 10);
    const greyed = this.grey != null;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = this.board[i];
      if (!v) continue;
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      const pop = this.cells[i].pop;
      const greyNow = greyed && (r + c) / (SIZE * 2) < this.grey;
      if (greyNow) ctx.filter = 'grayscale(1) brightness(0.7)';
      this.block(v - 1, this.bx + c * cell, this.by + r * cell, cell, { scale: 1 + pop * 0.18 * easeOutBack(1 - pop), glow: lit.has(i) ? 1 : 0 });
      ctx.filter = 'none';
      if (lit.has(i)) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.25 * pulse})`;
        ctx.beginPath();
        ctx.roundRect(this.bx + c * cell + cell * 0.05, this.by + r * cell + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.16);
        ctx.fill();
      }
    }
    // Clearing blocks: flash white, then pop and spin away.
    for (const d of this.dying) {
      const t = d.t - d.delay;
      const r = Math.floor(d.i / SIZE);
      const c = d.i % SIZE;
      const x = this.bx + c * cell;
      const y = this.by + r * cell;
      if (t < 0) {
        this.block(d.color, x, y, cell);
        continue;
      }
      if (t < 0.08) {
        this.block(d.color, x, y, cell, { glow: 1 });
        ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - t / 0.08)})`;
        ctx.beginPath();
        ctx.roundRect(x + cell * 0.05, y + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.16);
        ctx.fill();
        continue;
      }
      const k = clamp((t - 0.08) / 0.37);
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      ctx.rotate(k * (d.i % 2 ? 1.2 : -1.2));
      ctx.translate(-cell / 2, -cell / 2);
      this.block(d.color, 0, 0, cell, { scale: 1 + k * 0.4, alpha: 1 - k });
      ctx.restore();
    }
    // Ghost.
    if (g) {
      for (const [r, c] of g.piece.cells) {
        const x = this.bx + (g.col + c) * cell;
        const y = this.by + (g.row + r) * cell;
        if (g.valid) this.block(g.piece.color, x, y, cell, { alpha: 0.38 });
      }
    }
    ctx.restore();

    this.drawHand();
    this.drawNext();
    this.fx.draw(ctx, { additive: this.theme.additive, width: this.width, height: this.height, flashColor: this.theme.dark ? '#ffffff' : '#fff8e0' });
  }

  drawPiece(piece, cx, cy, size, opts = {}) {
    const x0 = cx - (piece.w * size) / 2;
    const y0 = cy - (piece.h * size) / 2;
    for (const [r, c] of piece.cells) this.block(piece.color, x0 + c * size, y0 + r * size, size, opts);
  }

  drawHand() {
    const ctx = this.ctx;
    for (let k = 0; k < 3; k++) {
      const h = this.hand[k];
      const s = this.slots[k];
      if (!h) continue;
      const piece = PIECES[h.id];
      if (this.drag && this.drag.slot === k) continue;
      const e = easeOutBack(clamp(h.enter));
      const fits = fitsAnywhere(this.board, piece);
      const selected = this.selected === k;
      if (selected) {
        ctx.save();
        ctx.strokeStyle = this.theme.dark ? 'rgba(255,242,122,0.9)' : 'rgba(224,106,0,0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.roundRect(s.x - s.w / 2 + 6, s.y - s.h / 2 + 4, s.w - 12, s.h - 8, 14);
        ctx.stroke();
        ctx.restore();
      }
      const size = this.cell * HAND_SCALE * (selected ? 1.08 : 1);
      this.drawPiece(piece, s.x + (1 - e) * s.w, s.y, size, { alpha: clamp(h.enter * 2) * (fits ? 1 : 0.3) });
    }
    // The dragged piece, growing to board size, with a soft shadow.
    const d = this.drag;
    if (d) {
      const piece = PIECES[this.hand[d.slot].id];
      const size = lerp(this.cell * HAND_SCALE, this.cell, easeOutBack(d.grow));
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 8;
      this.drawPiece(piece, d.x, d.y - d.lift * d.grow, size);
      ctx.restore();
    }
  }

  drawNext() {
    if (!this.next.length) return;
    const ctx = this.ctx;
    const size = this.cell * NEXT_SCALE;
    const gap = this.nextW / 3;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = this.theme.dark ? 'rgba(255,255,255,0.7)' : 'rgba(60,40,20,0.7)';
    ctx.font = `700 ${Math.max(10, size * 1.1)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const labelX = this.nextX - this.nextW / 2;
    ctx.fillText('NEXT', labelX, this.nextY);
    this.next.forEach((id, k) => {
      if (id == null) return;
      this.drawPiece(PIECES[id], this.nextX - this.nextW / 2 + gap * (k + 0.5) + gap * 0.25, this.nextY, size);
    });
    ctx.restore();
  }
}

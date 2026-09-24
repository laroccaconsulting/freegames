// Canvas renderer for Gems: a board of gems that swap, pop and fall in
// cascades. Rules live in rules.js; this file draws and handles input.
import { Particles } from '../core/fx.js';
import { COLS, ROWS, EMPTY, rowOf, colOf, adjacent } from './rules.js';
import { drawGem, gemColor } from './themes.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Board {
  constructor(canvas, stage, { onSwap, onSelect } = {}) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.onSwap = onSwap;
    this.onSelect = onSelect;
    this.gems = new Map(); // cell → { type, x, y, scale, alpha, enter }
    this.fx = new Particles();
    this.options = { reduced: false, effects: true, speed: 1 };
    this.selected = -1;
    this.hint = null;
    this.focus = -1;
    this.animating = 0;
    this.time = 0;
    this.dirty = true;
    this.sprites = new Map();
    this.press = null;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', () => (this.press = null));
    canvas.addEventListener('pointercancel', () => (this.press = null));
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

  get busy() {
    return this.animating > 0;
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
    for (const [i, g] of this.gems) Object.assign(g, this.pos(i));
    this.dirty = true;
  }

  layout() {
    const box = this.stage.getBoundingClientRect();
    const cell = Math.min((box.width - 24) / COLS, (box.height - 24) / ROWS, 76);
    this.cell = cell;
    this.bx = box.left + (box.width - cell * COLS) / 2;
    this.by = box.top + (box.height - cell * ROWS) / 2;
  }

  pos(i) {
    return { x: this.bx + (colOf(i) + 0.5) * this.cell, y: this.by + (rowOf(i) + 0.5) * this.cell };
  }

  cellAt(x, y) {
    const c = Math.floor((x - this.bx) / this.cell);
    const r = Math.floor((y - this.by) / this.cell);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS ? r * COLS + c : -1;
  }

  // ---------- Input ----------

  down(e) {
    if (this.busy) return;
    const i = this.cellAt(e.clientX, e.clientY);
    if (i < 0 || !this.gems.has(i)) {
      this.select(-1);
      return;
    }
    e.preventDefault();
    // Tap a neighbour of the selected gem to swap; otherwise select.
    if (this.selected >= 0 && adjacent(this.selected, i)) {
      const a = this.selected;
      this.select(-1);
      this.onSwap?.(a, i);
      return;
    }
    this.select(i);
    this.press = { i, x: e.clientX, y: e.clientY };
  }

  // Swipe: drag a gem towards a neighbour.
  move(e) {
    const p = this.press;
    if (!p || this.busy) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.cell * 0.35) return;
    const r = rowOf(p.i) + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0);
    const c = colOf(p.i) + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0);
    this.press = null;
    this.select(-1);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    this.onSwap?.(p.i, r * COLS + c);
  }

  select(i) {
    this.selected = i;
    this.hint = null;
    this.onSelect?.(i);
    this.dirty = true;
  }

  setFocus(i) {
    this.focus = i;
    this.dirty = true;
  }

  showHint(a, b) {
    this.hint = { a, b, t: 0 };
  }

  // ---------- Animations ----------

  // Lays out a whole board. `enter` drops gems in from above.
  setGrid(grid, { enter = true } = {}) {
    this.gems.clear();
    this.select(-1);
    grid.forEach((type, i) => {
      if (type === EMPTY) return;
      const p = this.pos(i);
      this.gems.set(i, { type, ...p, scale: 1, alpha: 1, enter: enter ? -(ROWS - rowOf(i)) * 0.05 - colOf(i) * 0.02 : 1 });
    });
    this.dirty = true;
  }

  tween(duration, step) {
    this.animating++;
    const ms = this.options.reduced ? 0 : (duration * 1000) / this.options.speed;
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        const t = ms ? clamp((performance.now() - start) / ms) : 1;
        step(t);
        this.dirty = true;
        if (t < 1) requestAnimationFrame(tick);
        else {
          this.animating--;
          resolve();
        }
      };
      tick();
    });
  }

  // A swap that doesn't match: slide over and back.
  async bounce(a, b) {
    const ga = this.gems.get(a);
    const gb = this.gems.get(b);
    if (!ga || !gb) return;
    const pa = this.pos(a);
    const pb = this.pos(b);
    await this.tween(0.12, (t) => {
      const k = easeInOut(t) * 0.45;
      Object.assign(ga, { x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) });
      Object.assign(gb, { x: lerp(pb.x, pa.x, k), y: lerp(pb.y, pa.y, k) });
    });
    await this.tween(0.16, (t) => {
      const k = (1 - easeInOut(t)) * 0.45;
      Object.assign(ga, { x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) });
      Object.assign(gb, { x: lerp(pb.x, pa.x, k), y: lerp(pb.y, pa.y, k) });
    });
  }

  // Plays a swap and its cascade. `steps` come from rules.resolve.
  // onStep(k, step) fires as each wave of lines clears.
  async play(a, b, steps, { onStep, onLand } = {}) {
    const ga = this.gems.get(a);
    const gb = this.gems.get(b);
    const pa = this.pos(a);
    const pb = this.pos(b);
    this.hint = null;
    await this.tween(0.16, (t) => {
      const k = easeInOut(t);
      Object.assign(ga, { x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) });
      Object.assign(gb, { x: lerp(pb.x, pa.x, k), y: lerp(pb.y, pa.y, k) });
    });
    this.gems.set(a, gb);
    this.gems.set(b, ga);
    for (const [k, step] of steps.entries()) {
      onStep?.(k, step);
      await this.pop(step.cleared, k);
      await this.fall(step.falls);
      onLand?.(k);
    }
  }

  async pop(cells, wave) {
    const popping = cells.map((i) => [i, this.gems.get(i)]).filter(([, g]) => g);
    const effects = this.options.effects && !this.options.reduced;
    if (effects) {
      const cx = popping.reduce((s, [, g]) => s + g.x, 0) / popping.length;
      const cy = popping.reduce((s, [, g]) => s + g.y, 0) / popping.length;
      for (const [, g] of popping) {
        const color = gemColor(this.theme, g.type);
        this.fx.burst(g.x, g.y, color, this.theme.particles, { count: 10 + wave * 3, speed: 300 + wave * 60 });
      }
      this.fx.ring(cx, cy, gemColor(this.theme, popping[0][1].type), this.cell * (1.2 + popping.length * 0.25), 4);
      if (popping.length >= 4 || wave >= 2) this.shake = Math.min(1, 0.3 + wave * 0.2);
    }
    await this.tween(0.24, (t) => {
      for (const [, g] of popping) {
        g.flash = t < 0.3 ? 1 - t / 0.3 : 0;
        g.scale = t < 0.3 ? 1 + t * 0.8 : Math.max(0, 1.24 * (1 - (t - 0.3) / 0.7));
        g.alpha = 1 - clamp((t - 0.6) / 0.4);
      }
    });
    for (const [i] of popping) this.gems.delete(i);
  }

  async fall(falls) {
    if (!falls.length) return;
    const moving = falls.map(({ from, to }) => ({ g: this.gems.get(from), from: this.pos(from), to: this.pos(to), cellTo: to }));
    for (const { from } of falls) this.gems.delete(from);
    for (const m of moving) this.gems.set(m.cellTo, m.g);
    const longest = Math.max(...falls.map(({ from, to }) => rowOf(to) - rowOf(from)));
    await this.tween(0.12 + 0.05 * longest, (t) => {
      for (const m of moving) {
        // Accelerate like gravity, then a little bounce.
        const k = t < 0.85 ? (t / 0.85) ** 2 : 1 - Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.04;
        m.g.y = lerp(m.from.y, m.to.y, k);
      }
    });
  }

  // The win: every cell lights up in a sweep, then the jackpot.
  celebrate({ onStep, onJackpot } = {}) {
    return new Promise((resolve) => {
      if (this.options.reduced || !this.options.effects) {
        onJackpot?.();
        resolve();
        return;
      }
      this.sweep = 0;
      let lastRow = -1;
      this.tween(0.7, (t) => {
        this.sweep = t;
        const row = Math.floor(t * ROWS);
        if (row !== lastRow && row < ROWS) {
          lastRow = row;
          onStep?.(row);
        }
      }).then(() => {
        this.sweep = null;
        const palette = [0, 1, 2, 3, 4, 5].map((k) => gemColor(this.theme, k));
        this.fx.fountain(this.width, this.height, palette, this.theme.particles, 1);
        this.fx.rain(this.width, palette, this.theme.particles);
        this.fx.flash = this.theme.dark ? 0.6 : 0.4;
        onJackpot?.();
        setTimeout(resolve, 1500);
      });
    });
  }

  float(text, { color } = {}) {
    if (!this.options.effects || this.options.reduced) return;
    this.fx.text(this.bx + (COLS * this.cell) / 2, this.by + ROWS * this.cell * 0.4, text, color || (this.theme.dark ? '#fff27a' : '#e0457b'), this.cell * 0.8);
  }

  // ---------- Frame loop ----------

  frame(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.time += dt;
    let active = this.fx.active || this.animating > 0 || this.selected >= 0 || !!this.hint || this.shake > 0 || this.sweep != null;
    this.fx.step(dt);
    for (const g of this.gems.values()) {
      if (g.enter < 1) {
        g.enter = Math.min(1, g.enter + dt / 0.4);
        active = true;
      }
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.hint) this.hint.t += dt;
    if (active || this.dirty) {
      this.draw();
      this.dirty = false;
    }
  }

  // ---------- Drawing ----------

  sprite(type, size) {
    const key = `${type}:${Math.round(size * 4)}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * this.dpr);
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(size / 2, size / 2);
    drawGem(ctx, this.theme, type, size * 0.4);
    this.sprites.set(key, c);
    return c;
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.theme) return;
    const cell = this.cell;
    const shake = this.shake ? (Math.random() - 0.5) * this.shake * 8 : 0;
    ctx.save();
    ctx.translate(shake, shake * 0.6);
    // Board.
    const pad = cell * 0.15;
    const w = COLS * cell;
    const h = ROWS * cell;
    ctx.fillStyle = this.theme.board.bg;
    ctx.strokeStyle = this.theme.board.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(this.bx - pad, this.by - pad, w + pad * 2, h + pad * 2, cell * 0.3);
    ctx.fill();
    ctx.stroke();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lit = this.sweep != null && Math.abs(r / ROWS - this.sweep) < 0.14;
        ctx.fillStyle = lit ? (this.theme.dark ? 'rgba(255,240,140,0.45)' : 'rgba(255,170,60,0.35)') : (r + c) % 2 ? this.theme.board.cell : 'rgba(0,0,0,0)';
        ctx.beginPath();
        ctx.roundRect(this.bx + c * cell + 2, this.by + r * cell + 2, cell - 4, cell - 4, cell * 0.18);
        ctx.fill();
      }
    }
    // Selection and hint rings.
    const ring = (i, color, pulse) => {
      const p = this.pos(i);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.roundRect(p.x - cell / 2 + 3, p.y - cell / 2 + 3, cell - 6, cell - 6, cell * 0.2);
      ctx.stroke();
      ctx.restore();
    };
    const accent = this.theme.dark ? '#fff27a' : '#e0457b';
    if (this.selected >= 0) ring(this.selected, accent, 1);
    if (this.focus >= 0) ring(this.focus, this.theme.dark ? '#ffffff' : '#333333', 0.7);
    if (this.hint) for (const i of [this.hint.a, this.hint.b]) ring(i, accent, 0.5 + 0.5 * Math.sin(this.hint.t * 8));
    // Gems.
    const size = cell;
    for (const [i, g] of this.gems) {
      if (g.enter <= 0) continue;
      const e = easeOutBack(clamp(g.enter));
      const sel = i === this.selected;
      const bob = sel ? Math.sin(this.time * 8) * cell * 0.04 : 0;
      const s = size * (g.scale ?? 1) * (sel ? 1.08 : 1);
      const y = g.y - (1 - e) * cell * 3 + bob;
      ctx.save();
      ctx.globalAlpha = (g.alpha ?? 1) * clamp(g.enter * 3);
      if (g.flash && this.theme.additive) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 20 * g.flash;
      }
      ctx.drawImage(this.sprite(g.type, size), g.x - s / 2, y - s / 2, s, s);
      if (g.flash) {
        ctx.globalCompositeOperation = this.theme.additive ? 'lighter' : 'source-over';
        ctx.globalAlpha *= g.flash * 0.8;
        ctx.drawImage(this.sprite(g.type, size), g.x - s / 2, y - s / 2, s, s);
      }
      ctx.restore();
    }
    ctx.restore();
    this.fx.draw(ctx, { additive: this.theme.additive, width: this.width, height: this.height, flashColor: this.theme.dark ? '#ffffff' : '#fff8e0' });
  }
}

export { wait };

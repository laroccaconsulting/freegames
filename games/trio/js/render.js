// Canvas renderer for Trio: stacked tiles with depth, a glass tray, tiles
// that fly into it, and triples that pop. Rules live in rules.js.
import { Particles } from '../core/fx.js';
import { drawIcon, iconColor } from './themes.js';

const TALL = 1.14; // tile height / width
const DEPTH = 0.1; // how far each layer is lifted, in tile widths
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

export class Board {
  constructor(canvas, stage, { onTap } = {}) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.onTap = onTap;
    this.tiles = [];
    this.covers = [];
    this.tray = []; // [{ type, x, y, s, pop }]
    this.dying = []; // tray tiles clearing
    this.flyers = [];
    this.capacity = 7;
    this.fx = new Particles();
    this.anims = new Set();
    this.options = { reduced: false, effects: true, xray: false };
    this.hint = null;
    this.time = 0;
    this.dirty = true;
    this.sprites = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      const i = this.hit(e.clientX, e.clientY);
      if (i >= 0) {
        e.preventDefault();
        this.onTap?.(i);
      }
    });
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

  setOptions(options) {
    Object.assign(this.options, options);
    this.dirty = true;
  }

  get busy() {
    return this.flyers.length > 0;
  }

  // New puzzle, restart or restore. `removed` and `tray` come from the rules.
  setPuzzle(tiles, covers, removed, tray, { enter = true, capacity = 7 } = {}) {
    this.covers = covers;
    this.capacity = capacity;
    this.flyers = [];
    this.dying = [];
    this.hint = null;
    this.tiles = tiles.map((t, i) => ({
      ...t,
      removed: !!removed[i],
      shake: 0,
      glow: 0,
      enter: enter ? -(t.z * 0.12 + ((t.x + t.y) % 7) * 0.025) : 1,
    }));
    this.layout();
    this.tray = tray.map((type, k) => ({ type, ...this.slot(k), pop: 0 }));
    this.dirty = true;
  }

  setCapacity(capacity) {
    this.capacity = capacity;
    this.layout();
    this.tray.forEach((t, k) => Object.assign(t, this.slot(k)));
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
    this.tray.forEach((t, k) => Object.assign(t, this.slot(k)));
    this.dirty = true;
  }

  layout() {
    const box = this.stage.getBoundingClientRect();
    this.box = box;
    // Tray along the bottom of the stage, or down the right side when wide.
    this.side = box.width > box.height * 1.25;
    let boardRight = box.right;
    let boardBottom;
    if (this.side) {
      const slot = Math.min(58, (box.height - 24) / (this.capacity * TALL + (this.capacity - 1) * 0.08 + 0.3));
      this.traySlot = slot;
      this.trayX = box.right - slot - 24;
      boardRight = this.trayX - 24;
      boardBottom = box.bottom - 8;
    } else {
      const slot = Math.min(58, (box.width - 32) / (this.capacity + 0.6));
      this.traySlot = slot;
      this.trayY = box.bottom - slot * TALL - 16;
      boardBottom = this.trayY - 22;
    }
    if (!this.tiles.length) return;
    const minX = Math.min(...this.tiles.map((t) => t.x));
    const maxX = Math.max(...this.tiles.map((t) => t.x)) + 2;
    const minY = Math.min(...this.tiles.map((t) => t.y));
    const maxY = Math.max(...this.tiles.map((t) => t.y)) + 2;
    const maxZ = Math.max(...this.tiles.map((t) => t.z));
    const cols = (maxX - minX) / 2 + maxZ * DEPTH;
    const rows = ((maxY - minY) / 2) * TALL + maxZ * DEPTH;
    const availH = boardBottom - box.top - 12;
    const availW = boardRight - box.left - 24;
    const s = Math.min(availW / (cols + 0.1), availH / (rows + 0.1), 74);
    this.s = s;
    const w = cols * s;
    const h = rows * s;
    this.originX = box.left + 12 + (availW - w) / 2 + maxZ * DEPTH * s - minX * (s / 2);
    this.originY = box.top + 8 + Math.max(0, (availH - h) / 2) + maxZ * DEPTH * s - minY * ((s * TALL) / 2);
  }

  tileRect(t) {
    const s = this.s;
    return {
      x: this.originX + t.x * (s / 2) - t.z * DEPTH * s,
      y: this.originY + t.y * ((s * TALL) / 2) - t.z * DEPTH * s,
      w: s,
      h: s * TALL,
    };
  }

  slot(k) {
    const n = this.capacity;
    const gap = this.traySlot * 0.08;
    if (this.side) {
      const total = n * this.traySlot * TALL + (n - 1) * gap;
      const y0 = this.box.top + (this.box.height - total) / 2;
      const y = y0 + k * (this.traySlot * TALL + gap);
      return { x: this.trayX, y, s: this.traySlot, tx: this.trayX, ty: y };
    }
    const total = n * this.traySlot + (n - 1) * gap;
    const x0 = this.box.left + (this.box.width - total) / 2;
    return { x: x0 + k * (this.traySlot + gap), y: this.trayY, s: this.traySlot, tx: x0 + k * (this.traySlot + gap), ty: this.trayY };
  }

  isFree(i) {
    return !this.tiles[i].removed && this.covers[i].every((j) => this.tiles[j].removed);
  }

  hit(cx, cy) {
    // Topmost tile under the point.
    let best = -1;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t.removed || t.pending) continue;
      const r = this.tileRect(t);
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h && (best < 0 || t.z >= this.tiles[best].z)) best = i;
    }
    return best;
  }

  // ---------- Animations ----------

  shake(i) {
    if (this.tiles[i]) this.tiles[i].shake = 1;
  }

  shakeTray() {
    this.trayShake = 1;
    this.fx.flash = this.options.reduced ? 0 : 0.5;
  }

  // A tapped tile waiting its turn to fly: lifted and see-through at once,
  // so a quick second tap reaches the tile beneath.
  queue(i) {
    if (this.tiles[i]) this.tiles[i].pending = true;
  }

  showHint(i) {
    this.hint = { i, t: 0 };
  }

  // Tile i flies into tray position `at`. If it makes a triple, the three pop.
  // Resolves when the tile has landed.
  pick(i, at, cleared, { onLanded } = {}) {
    const tile = this.tiles[i];
    const from = this.tileRect(tile);
    tile.removed = true;
    tile.pending = false;
    this.hint = null;
    const item = { type: tile.type, x: from.x, y: from.y, s: from.w, pop: 0 };
    // Make room: later tray tiles slide right.
    this.tray.splice(at, 0, item);
    this.tray.forEach((t, k) => Object.assign(t, { tx: this.slot(k).tx, ty: this.slot(k).ty }));
    const target = this.slot(at);
    const duration = this.options.reduced ? 0.08 : 0.26;
    let time = 0;
    this.flyers.push(item);
    return new Promise((resolve) => {
      this.anims.add((dt) => {
        time += dt;
        const k = easeInOut(clamp(time / duration));
        item.x = lerp(from.x, target.x, k);
        item.y = lerp(from.y, target.y, k) - Math.sin(k * Math.PI) * this.s * 0.9;
        item.s = lerp(from.w, target.s, k);
        item.spin = Math.sin(k * Math.PI) * 0.25;
        if (k < 1) return false;
        item.spin = 0;
        this.flyers.splice(this.flyers.indexOf(item), 1);
        if (cleared != null) this.clearTriple(cleared);
        onLanded?.();
        resolve();
        return true;
      });
    });
  }

  clearTriple(type) {
    const three = this.tray.filter((t) => t.type === type).slice(0, 3);
    this.tray = this.tray.filter((t) => !three.includes(t));
    this.tray.forEach((t, k) => Object.assign(t, { tx: this.slot(k).tx, ty: this.slot(k).ty }));
    const cx = three.reduce((s, t) => s + t.x, 0) / 3 + this.traySlot / 2;
    const cy = three.reduce((s, t) => s + t.y, 0) / 3 + (this.traySlot * TALL) / 2;
    for (const t of three) {
      t.die = 0;
      t.cx = cx - t.s / 2;
      t.cy = cy - (t.s * TALL) / 2;
      this.dying.push(t);
    }
    if (!this.options.effects || this.options.reduced) return;
    const color = iconColor(this.theme, type);
    this.fx.burst(cx, cy, color, this.theme.particles, { count: 40, speed: 480, spread: Math.PI * 1.2 });
    this.fx.ring(cx, cy, color, this.traySlot * 1.6, 5);
  }

  // Floating "×n" over the tray for a clean streak of triples.
  streak(n) {
    if (n < 1 || !this.options.effects || this.options.reduced) return;
    const mid = this.slot(Math.floor(this.capacity / 2));
    this.fx.text(this.side ? mid.x - this.traySlot * 0.6 : mid.x + mid.s / 2, this.side ? mid.y + mid.s / 2 : mid.y - this.traySlot * 0.5, `×${n + 1}`, this.theme.dark ? '#fff27a' : '#ff7a00', Math.max(24, this.traySlot * 0.6));
  }

  // Tiles fly back from the tray to the board (undo).
  unpick(i, trayAfter) {
    const tile = this.tiles[i];
    tile.removed = false;
    tile.pending = false;
    tile.enter = 0.3;
    this.tray = trayAfter.map((type, k) => {
      const existing = this.tray.find((t) => t.type === type && !t.used);
      const s = this.slot(k);
      if (existing) {
        existing.used = true;
        existing.tx = s.tx;
        existing.ty = s.ty;
        return existing;
      }
      return { type, ...s, pop: 1 };
    });
    this.tray.forEach((t) => delete t.used);
    this.hint = null;
  }

  // The win: every tray slot flashes in turn, then a jackpot fountain.
  celebrate({ onStep, onJackpot } = {}) {
    return new Promise((resolve) => {
      if (this.options.reduced || !this.options.effects) {
        onJackpot?.();
        resolve();
        return;
      }
      let time = 0;
      let next = 0;
      let jackpot = false;
      const step = 0.07;
      this.marquee = Array(this.capacity).fill(0);
      this.anims.add((dt) => {
        time += dt;
        while (next < this.capacity && time >= next * step) {
          this.marquee[next] = 1;
          const s = this.slot(next);
          this.fx.ring(s.x + s.s / 2, s.y + (s.s * TALL) / 2, this.theme.dark ? '#ffffff' : '#ffb300', s.s, 3);
          onStep?.(next);
          next++;
        }
        if (!jackpot && time >= this.capacity * step + 0.1) {
          jackpot = true;
          const palette = Array.from({ length: 8 }, (_, k) => iconColor(this.theme, k));
          this.fx.fountain(this.width, this.height, palette, this.theme.particles, 1);
          this.fx.rain(this.width, palette, this.theme.particles);
          this.fx.flash = this.theme.dark ? 0.7 : 0.45;
          onJackpot?.();
        }
        if (time >= this.capacity * step + 1.7) {
          resolve();
          return true;
        }
        return false;
      });
    });
  }

  // ---------- Frame loop ----------

  frame(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.time += dt;
    let active = this.anims.size > 0 || this.fx.active || this.dying.length > 0 || !!this.hint;
    for (const anim of [...this.anims]) if (anim(dt)) this.anims.delete(anim);
    this.fx.step(dt);
    for (const t of this.tiles) {
      if (t.enter < 1) {
        t.enter = Math.min(1, t.enter + dt / 0.45);
        active = true;
      }
      if (t.shake > 0) {
        t.shake = Math.max(0, t.shake - dt * 3);
        active = true;
      }
    }
    for (const t of this.tray) {
      if (t.tx != null && (Math.abs(t.tx - t.x) > 0.3 || Math.abs(t.ty - t.y) > 0.3) && !this.flyers.includes(t)) {
        t.x += (t.tx - t.x) * (1 - Math.exp(-dt * 18));
        t.y += (t.ty - t.y) * (1 - Math.exp(-dt * 18));
        active = true;
      }
      if (t.pop > 0) {
        t.pop = Math.max(0, t.pop - dt * 3);
        active = true;
      }
    }
    for (const t of this.dying) {
      t.die += dt / (this.options.reduced ? 0.1 : 0.32);
      t.x = lerp(t.x, t.cx, 1 - Math.exp(-dt * 16));
      t.y = lerp(t.y, t.cy, 1 - Math.exp(-dt * 16));
    }
    this.dying = this.dying.filter((t) => t.die < 1);
    if (this.trayShake > 0) {
      this.trayShake = Math.max(0, this.trayShake - dt * 2.2);
      active = true;
    }
    if (this.marquee) {
      this.marquee = this.marquee.map((m) => Math.max(0, m - dt * 1.5));
      if (this.marquee.every((m) => m === 0)) this.marquee = null;
      active = true;
    }
    if (this.hint) this.hint.t += dt;
    if (active || this.dirty) {
      this.draw();
      this.dirty = false;
    }
  }

  // ---------- Drawing ----------

  // Tile face with its picture, drawn once per size and cached.
  sprite(type, w) {
    const key = `${type}:${Math.round(w * 10)}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const dpr = this.dpr;
    const h = w * TALL;
    const side = w * 0.09;
    c = document.createElement('canvas');
    c.width = Math.ceil((w + side + 6) * dpr);
    c.height = Math.ceil((h + side + 8) * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.translate(2, 2);
    const tile = this.theme.tile;
    const r = w * tile.radius;
    // Shadow and side (the tile's thickness).
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.roundRect(side * 0.6, side * 1.4, w, h, r);
    ctx.fill();
    ctx.fillStyle = tile.side;
    ctx.beginPath();
    ctx.roundRect(side * 0.35, side * 0.8, w - side * 0.1, h, r);
    ctx.fill();
    // Face.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, tile.face);
    g.addColorStop(1, tile.face2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(0, 0, w - side * 0.1, h - side * 0.1, r);
    ctx.fill();
    ctx.strokeStyle = tile.edge;
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.stroke();
    // Gloss on the upper half.
    const gloss = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    gloss.addColorStop(0, 'rgba(255,255,255,0.7)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.roundRect(w * 0.06, h * 0.04, w * 0.84, h * 0.4, r * 0.8);
    ctx.fill();
    ctx.save();
    ctx.translate((w - side * 0.1) / 2, (h - side * 0.1) / 2);
    drawIcon(ctx, this.theme, type, w * 0.32);
    ctx.restore();
    c.w = w + side + 6;
    c.h = h + side + 8;
    this.sprites.set(key, c);
    return c;
  }

  drawTileAt(type, x, y, w, { dim = 0, alpha = 1, scale = 1, spin = 0, glow = 0 } = {}) {
    const ctx = this.ctx;
    const sp = this.sprite(type, Math.round(w));
    ctx.save();
    ctx.globalAlpha *= alpha;
    const h = w * TALL;
    ctx.translate(x + w / 2, y + h / 2);
    if (spin) ctx.rotate(spin);
    if (scale !== 1) ctx.scale(scale, scale);
    if (glow > 0) {
      ctx.shadowColor = this.theme.dark ? '#fff27a' : '#ff9d00';
      ctx.shadowBlur = 18 * glow;
    }
    ctx.drawImage(sp, -w / 2 - 2, -h / 2 - 2, sp.w, sp.h);
    ctx.shadowBlur = 0;
    if (dim > 0) {
      ctx.fillStyle = this.theme.dark ? `rgba(12,6,30,${0.5 * dim})` : `rgba(90,70,40,${0.32 * dim})`;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w * 0.99, h * 0.99, w * this.theme.tile.radius);
      ctx.fill();
    }
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.theme) return;
    this.drawTray();
    // Board: bottom layers first; each layer top to bottom, left to right.
    const order = this.tiles.map((_, i) => i).filter((i) => !this.tiles[i].removed);
    order.sort((a, b) => this.tiles[a].z - this.tiles[b].z || this.tiles[a].y - this.tiles[b].y || this.tiles[a].x - this.tiles[b].x);
    const xray = this.options.xray;
    for (const i of order) {
      const t = this.tiles[i];
      if (t.enter <= 0) continue;
      const r = this.tileRect(t);
      const e = easeOutBack(clamp(t.enter));
      const free = this.isFree(i);
      const hinted = this.hint && this.hint.i === i;
      const shake = t.shake ? Math.sin(t.shake * 30) * t.shake * this.s * 0.08 : 0;
      const covering = xray && this.tiles.some((u, j) => !u.removed && this.covers[j].includes(i));
      this.drawTileAt(t.type, r.x + shake, r.y - (1 - e) * this.s * 1.2 - (t.pending ? this.s * 0.15 : 0), r.w, {
        dim: free ? 0 : 1,
        alpha: clamp(t.enter * 2) * (covering || t.pending ? 0.35 : 1),
        glow: hinted ? 0.6 + 0.4 * Math.sin(this.hint.t * 7) : 0,
      });
    }
    // Tray tiles, clearing tiles, then tiles in flight on top.
    for (const t of this.tray) if (!this.flyers.includes(t)) this.drawTileAt(t.type, t.x, t.y, t.s, { scale: 1 + t.pop * 0.2 });
    for (const t of this.dying) {
      const k = t.die;
      this.drawTileAt(t.type, t.x, t.y - Math.sin(k * Math.PI) * t.s * 0.3, t.s, { scale: k < 0.4 ? 1 + k * 0.6 : Math.max(0, 1.24 * (1 - (k - 0.4) / 0.6)), alpha: 1 - clamp((k - 0.7) / 0.3) });
    }
    for (const t of this.flyers) this.drawTileAt(t.type, t.x, t.y, t.s, { spin: t.spin || 0, scale: 1.08 });
    this.fx.draw(ctx, { additive: this.theme.additive, width: this.width, height: this.height, flashColor: this.trayShake > 0 ? '#ff3355' : this.theme.dark ? '#ffffff' : '#fff8e0' });
  }

  drawTray() {
    const ctx = this.ctx;
    const first = this.slot(0);
    const last = this.slot(this.capacity - 1);
    const pad = this.traySlot * 0.18;
    const shake = this.trayShake ? Math.sin(this.trayShake * 40) * this.trayShake * 10 : 0;
    const x = first.x - pad + shake;
    const w = last.x + last.s - first.x + pad * 2;
    const h = last.y + last.s * TALL - first.y + pad * 2;
    const y = first.y - pad;
    const full = this.tray.length >= this.capacity - 1;
    ctx.save();
    ctx.fillStyle = this.theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = full ? (this.theme.dark ? 'rgba(255,90,120,0.8)' : 'rgba(220,50,60,0.7)') : this.theme.dark ? 'rgba(255,255,255,0.22)' : 'rgba(120,90,40,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, this.traySlot * 0.3);
    ctx.fill();
    ctx.stroke();
    for (let k = 0; k < this.capacity; k++) {
      const s = this.slot(k);
      const lit = this.marquee ? this.marquee[k] : 0;
      ctx.fillStyle = lit ? `rgba(255,236,120,${0.25 + lit * 0.6})` : this.theme.dark ? 'rgba(0,0,0,0.25)' : 'rgba(120,90,40,0.1)';
      ctx.beginPath();
      ctx.roundRect(s.x + shake, s.y, s.s, s.s * TALL, s.s * 0.18);
      ctx.fill();
    }
    ctx.restore();
  }
}

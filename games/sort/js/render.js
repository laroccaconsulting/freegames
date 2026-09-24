// Canvas renderer for Pour. Draws glass tubes whose liquid stays level while
// they tilt: each layer's surface is found by clipping the tube's outline
// against a horizontal line until the area matches the layer's volume.
// Game rules live in rules.js; this file only draws and animates.
import { CAPACITY } from './rules.js';
import { Particles, drawStar } from '../core/fx.js';

const UNIT = 1.1; // height of one unit of liquid, in tube widths
const NECK = 0.6; // empty headspace at the top of a tube, in units
const GAP = 0.62; // space between tubes, in tube widths
const TAU = Math.PI * 2;

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
function easeOutBounce(t) {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

export function mix(hex, other, t) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (v, s) => (v >> s) & 255;
  const c = (s) => Math.round(lerp(ch(a, s), ch(b, s), t));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
export function rgba(hex, alpha) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}
const luminance = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
};

// ---------- Geometry for tilted liquid ----------

// Keeps the part of a polygon below (y >= level) or above (y <= level) a line.
function clipY(poly, level, below) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const inA = below ? a.y >= level : a.y <= level;
    const inB = below ? b.y >= level : b.y <= level;
    if (inA) out.push(a);
    if (inA !== inB) {
      const t = (level - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y: level });
    }
  }
  return out;
}

function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// The horizontal line below which `poly` holds exactly `target` area.
function levelForArea(poly, target) {
  let lo = Math.min(...poly.map((p) => p.y));
  let hi = Math.max(...poly.map((p) => p.y));
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (area(clipY(poly, mid, true)) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function rotate(pts, angle, pivot, at) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => {
    const x = p.x - pivot.x;
    const y = p.y - pivot.y;
    return { x: at.x + x * c - y * s, y: at.y + x * s + y * c };
  });
}

// ---------- Symbols for colour-blind play ----------

const SYMBOLS = ['circle', 'triangle', 'square', 'diamond', 'star', 'plus', 'ring', 'cross', 'hex', 'bar', 'dots', 'chevron'];

function drawSymbol(ctx, kind, x, y, r) {
  ctx.beginPath();
  switch (kind) {
    case 'circle':
      ctx.arc(x, y, r * 0.8, 0, TAU);
      ctx.fill();
      break;
    case 'triangle':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.95, y + r * 0.7);
      ctx.lineTo(x - r * 0.95, y + r * 0.7);
      ctx.fill();
      break;
    case 'square':
      ctx.rect(x - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44);
      ctx.fill();
      break;
    case 'diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.8, y);
      ctx.fill();
      break;
    case 'star':
      drawStar(ctx, x, y, r * 1.15, -Math.PI / 2);
      break;
    case 'plus':
      ctx.rect(x - r, y - r * 0.3, r * 2, r * 0.6);
      ctx.rect(x - r * 0.3, y - r, r * 0.6, r * 2);
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = r * 0.42;
      ctx.arc(x, y, r * 0.7, 0, TAU);
      ctx.stroke();
      break;
    case 'cross':
      ctx.lineWidth = r * 0.5;
      ctx.moveTo(x - r * 0.75, y - r * 0.75);
      ctx.lineTo(x + r * 0.75, y + r * 0.75);
      ctx.moveTo(x + r * 0.75, y - r * 0.75);
      ctx.lineTo(x - r * 0.75, y + r * 0.75);
      ctx.stroke();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) ctx.lineTo(x + Math.cos((i * TAU) / 6) * r * 0.9, y + Math.sin((i * TAU) / 6) * r * 0.9);
      ctx.fill();
      break;
    case 'bar':
      ctx.rect(x - r, y - r * 0.32, r * 2, r * 0.64);
      ctx.fill();
      break;
    case 'dots':
      ctx.arc(x - r * 0.5, y, r * 0.36, 0, TAU);
      ctx.moveTo(x + r * 0.86, y);
      ctx.arc(x + r * 0.5, y, r * 0.36, 0, TAU);
      ctx.fill();
      break;
    case 'chevron':
      ctx.lineWidth = r * 0.45;
      ctx.moveTo(x - r * 0.8, y + r * 0.4);
      ctx.lineTo(x, y - r * 0.4);
      ctx.lineTo(x + r * 0.8, y + r * 0.4);
      ctx.stroke();
      break;
  }
}

// ---------- Renderer ----------

export class Renderer {
  constructor(canvas, stage, { onTap } = {}) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.onTap = onTap;
    this.tubes = [];
    this.fx = new Particles();
    this.anims = new Set();
    this.streams = [];
    this.options = { symbols: false, speed: 1, effects: true, reduced: false, vibrate: true };
    this.focus = -1;
    this.hintPair = null;
    this.time = 0;
    this.last = 0;
    this.dirty = true;
    this.m = { w: 40, uh: 44, H: 200 };

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
    this.shineCache = null;
    this.dirty = true;
  }

  setOptions(options) {
    Object.assign(this.options, options);
    this.dirty = true;
  }

  get busy() {
    return this.anims.size > 0;
  }

  isBusy(i) {
    return !!this.tubes[i]?.busy;
  }

  // Replaces every tube (new puzzle or restart). `enter` plays the deal-in.
  setTubes(tubes, { enter = true } = {}) {
    this.anims.clear();
    this.streams = [];
    this.hintPair = null;
    this.tubes = tubes.map((t, i) => this.makeTube(t, enter ? i : -1));
    this.layout(true);
    this.dirty = true;
  }

  makeTube(units, order = -1) {
    return {
      layers: toLayers(units),
      x: 0, y: 0, hx: 0, hy: 0,
      lift: 0, liftTo: 0,
      P: null, angle: 0, pivot: { x: 0, y: 0 },
      busy: false,
      wave: 0, flash: 0, shake: 0, glow: 0, cap: units.length === CAPACITY && new Set(units).size === 1 ? 1 : 0,
      sweep: 1,
      enter: order >= 0 ? -order * 0.16 : 1,
      bubbles: [],
    };
  }

  addTube() {
    const t = this.makeTube([], 0);
    t.enter = 0;
    this.tubes.push(t);
    this.layout(false);
    t.x = t.hx;
    t.y = t.hy;
  }

  // Takes the stopper off a tube (when a move into it is undone).
  uncap(i) {
    const t = this.tubes[i];
    if (t) t.cap = t.glow = 0;
  }

  select(index) {
    this.tubes.forEach((t, i) => (t.liftTo = i === index ? this.m.uh * 0.6 : 0));
    this.hintPair = null;
    this.dirty = true;
  }

  setFocus(i) {
    this.focus = i;
    this.dirty = true;
  }

  showHint(from, to) {
    this.hintPair = { from, to, t: 0 };
    this.dirty = true;
  }

  shake(i) {
    if (this.tubes[i]) this.tubes[i].shake = 1;
  }

  // ---------- Layout ----------

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.layout(true);
    this.dirty = true;
  }

  layout(snap) {
    const box = this.stage.getBoundingClientRect();
    const n = Math.max(1, this.tubes.length);
    const tall = CAPACITY * UNIT + NECK * UNIT;
    let best = null;
    for (const rows of [1, 2, 3]) {
      const perRow = Math.ceil(n / rows);
      const fromW = (box.width - Math.max(24, box.width * 0.08)) / (perRow + (perRow - 1) * GAP);
      // Room above the top row for a tube being tipped, and between rows.
      const fromH = box.height / (tall * (rows + (rows - 1) * 0.42 + 0.5));
      const w = Math.min(fromW, fromH, 64);
      if (!best || w > best.w * 1.08) best = { rows, perRow, w };
    }
    const { rows, w } = best;
    const uh = w * UNIT;
    const H = uh * (CAPACITY + NECK);
    this.m = { w, uh, H, gap: w * GAP, rowGap: H * 0.42 };
    this.shineCache = null;
    const blockH = rows * H + (rows - 1) * this.m.rowGap;
    // A little more space above than below: tipped tubes rise over the top row.
    const top = box.top + Math.max(0, box.height - blockH) * 0.62;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const count = Math.ceil((n - i) / (rows - r));
      const rowW = count * w + (count - 1) * this.m.gap;
      const x0 = box.left + (box.width - rowW) / 2 + w / 2;
      for (let k = 0; k < count && i < this.tubes.length; k++, i++) {
        const t = this.tubes[i];
        t.hx = x0 + k * (w + this.m.gap);
        t.hy = top + r * (H + this.m.rowGap);
        if (snap || !t.x) {
          t.x = t.hx;
          t.y = t.hy;
        }
      }
    }
  }

  hit(cx, cy) {
    const { w, gap, H, uh } = this.m;
    for (let i = 0; i < this.tubes.length; i++) {
      const t = this.tubes[i];
      if (Math.abs(cx - t.hx) <= w / 2 + gap / 2 && cy >= t.hy - uh * 1.3 && cy <= t.hy + H + gap / 2) return i;
    }
    return -1;
  }

  // ---------- Animations ----------

  // The angle (for a tube hanging from its lip) at which `volume` units just
  // reach the lip. Pouring follows this angle as the tube empties.
  pourAngle(volume, dir) {
    const { w, H, uh } = this.m;
    const pivot = { x: (dir * w) / 2, y: 0 };
    const rect = [{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }, { x: w / 2, y: H }, { x: -w / 2, y: H }];
    const target = volume * uh * w;
    let lo = 0;
    let hi = Math.PI / 2;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const poly = rotate(rect, dir * mid, pivot, { x: 0, y: 0 });
      if (area(clipY(poly, 0, true)) > target) lo = mid;
      else hi = mid;
    }
    return dir * ((lo + hi) / 2);
  }

  // Animates n units of `color` from tube `from` to tube `to`.
  // onLanded runs when the liquid has arrived; the promise resolves when the
  // pouring tube is back in place.
  pour(from, to, n, color, { onLanded, onStart } = {}) {
    const s = this.tubes[from];
    const t = this.tubes[to];
    const { w, H, uh } = this.m;
    const speed = this.options.speed;
    s.busy = t.busy = true;
    t.liftTo = 0;
    const reduced = this.options.reduced;

    let dir = t.hx > s.hx + 1 ? 1 : t.hx < s.hx - 1 ? -1 : t.hx > this.width / 2 ? -1 : 1;
    const volume = total(s.layers);
    const move = (reduced ? 0.12 : 0.24) / speed;
    const pourT = (reduced ? 0.15 : 0.22 + 0.11 * n) / speed;
    const back = (reduced ? 0.12 : 0.24) / speed;
    const lag = 0.06 / speed;
    const startAngle = this.pourAngle(volume, dir);
    const startLip = { x: s.x + (dir * w) / 2, y: s.y - s.lift };
    const endLip = { x: t.hx - dir * w * 0.14, y: t.hy - H * 0.36 };
    const fromLayers = s.layers.map((l) => ({ ...l }));
    const topFrom = fromLayers.at(-1);
    const toTop = t.layers.at(-1);
    const target = toTop && toTop.c === color ? toTop : { c: color, a: 0 };
    if (target !== toTop) t.layers.push(target);
    const targetStart = target.a;
    const targetBase = total(t.layers) - target.a;
    let landed = false;
    let time = 0;
    const stream = { color, x: 0, y0: 0, y1: 0, head: 0, tail: 0, width: w * 0.26, dir };
    onStart?.({ duration: pourT, fromLevel: targetBase + targetStart, toLevel: targetBase + targetStart + n });

    return new Promise((resolve) => {
      const anim = (dt) => {
        time += dt;
        s.pivot = { x: (dir * w) / 2, y: 0 };
        if (time < move) {
          const k = easeInOut(time / move);
          s.P = { x: lerp(startLip.x, endLip.x, k), y: lerp(startLip.y, endLip.y, k) - Math.sin(k * Math.PI) * uh * 0.4 };
          s.angle = startAngle * k;
        } else if (time < move + pourT + lag) {
          const q = clamp((time - move) / pourT);
          const poured = n * easeInOut(q);
          topFrom.a = Math.max(0, fromLayers.at(-1).a0 - poured);
          s.layers = fromLayers.filter((l) => l.a > 0.0001);
          s.P = endLip;
          s.angle = this.pourAngle(total(fromLayers), dir);
          const q2 = clamp((time - move - lag) / pourT);
          target.a = targetStart + n * easeInOut(q2);
          t.wave = Math.max(t.wave, 0.8);
          const surface = t.hy + H - total(t.layers) * uh;
          stream.x = s.P.x + dir * 1.5;
          stream.y0 = s.P.y;
          stream.y1 = surface;
          stream.head = clamp((time - move) / lag);
          stream.tail = q > 0.98 ? clamp((time - move - pourT) / lag) : 0;
          if (!this.streams.includes(stream)) this.streams.push(stream);
          if (this.options.effects && !reduced && Math.random() < 0.6) this.fx.splash(stream.x + (Math.random() - 0.5) * 4, surface, this.theme.colors[color], 1);
        } else {
          if (!landed) {
            landed = true;
            target.a = targetStart + n;
            s.layers = fromLayers.filter((l) => l.a > 0.0001);
            this.streams = this.streams.filter((x) => x !== stream);
            t.busy = false;
            if (this.options.effects && !reduced) this.bubbleBurst(t, 7);
            onLanded?.();
          }
          const k = easeInOut(clamp((time - move - pourT - lag) / back));
          const home = { x: s.x + (dir * w) / 2, y: s.y };
          s.P = { x: lerp(endLip.x, home.x, k), y: lerp(endLip.y, home.y, k) };
          s.angle = lerp(this.pourAngle(total(s.layers), dir), 0, easeOut(k));
          if (k >= 1) {
            s.P = null;
            s.angle = 0;
            s.lift = 0;
            s.liftTo = 0;
            s.busy = false;
            s.wave = 0.6;
            resolve();
            return true;
          }
        }
        return false;
      };
      fromLayers.forEach((l) => (l.a0 = l.a));
      this.anims.add(anim);
    });
  }

  // Seals a finished tube: stopper drops in, glow, shine and a burst.
  complete(i, combo = 0) {
    const t = this.tubes[i];
    if (!t) return;
    const { w, uh } = this.m;
    const color = this.theme.colors[t.layers[0]?.c ?? 0];
    t.cap = 0.0001;
    t.sweep = 0;
    t.flash = 0.8;
    if (!this.options.effects || this.options.reduced) {
      t.cap = 1;
      t.glow = 1;
      return;
    }
    const cx = t.hx;
    const cy = t.hy + uh;
    this.fx.burst(cx, t.hy, color, this.theme.particles, { count: 30 + combo * 12, speed: 320 + combo * 60, spread: 2.4 });
    this.fx.ring(cx, cy + uh, color, w * 1.6, 5);
    if (combo > 0) this.fx.text(cx, t.hy - uh * 0.9, `×${combo + 1}`, mix(this.theme.colors[t.layers[0]?.c ?? 0], '#ffffff', 0.35), Math.max(22, w * 0.6));
    if (this.options.vibrate && navigator.vibrate) {
      try {
        navigator.vibrate(combo ? [12, 40, 18] : 14);
      } catch {
        /* not allowed */
      }
    }
  }

  // The win: tubes light up one after another like marquee bulbs, then a
  // jackpot fountain. `onStep(i)` lets the caller play a note per tube.
  celebrate({ onStep, onJackpot } = {}) {
    const order = this.tubes.map((_, i) => i).filter((i) => this.tubes[i].layers.length);
    const step = this.options.reduced ? 0 : 0.085;
    let time = 0;
    let next = 0;
    let jackpot = false;
    return new Promise((resolve) => {
      if (this.options.reduced || !this.options.effects) {
        onJackpot?.();
        resolve();
        return;
      }
      this.anims.add((dt) => {
        time += dt;
        while (next < order.length && time >= next * step) {
          const t = this.tubes[order[next]];
          t.flash = 1;
          t.sweep = 0;
          t.liftTo = 0;
          t.bounce = 1;
          const color = this.theme.colors[t.layers[0].c];
          this.fx.ring(t.hx, t.hy + this.m.H / 2, color, this.m.w * 1.4, 4);
          onStep?.(next);
          next++;
        }
        if (!jackpot && time >= order.length * step + 0.12) {
          jackpot = true;
          const palette = this.theme.colors.slice(0, Math.max(6, order.length));
          this.fx.fountain(this.width, this.height, palette, this.theme.particles, 1);
          this.fx.rain(this.width, palette, this.theme.particles);
          this.fx.flash = this.theme.dark ? 0.7 : 0.45;
          onJackpot?.();
        }
        if (time >= order.length * step + 1.7) {
          resolve();
          return true;
        }
        return false;
      });
    });
  }

  bubbleBurst(t, count) {
    if (!this.theme.bubbles) return;
    const { w, H } = this.m;
    const top = H - total(t.layers) * this.m.uh;
    for (let i = 0; i < count; i++)
      t.bubbles.push({ x: (Math.random() - 0.5) * w * 0.6, y: top + 4 + Math.random() * this.m.uh, r: 1 + Math.random() * 2.2, vy: -(30 + Math.random() * 50) });
  }

  // ---------- Frame loop ----------

  frame(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.time += dt;
    let active = this.anims.size > 0 || this.fx.active || this.streams.length > 0;
    for (const anim of [...this.anims]) if (anim(dt)) this.anims.delete(anim);
    this.fx.step(dt);

    const ambient = this.options.effects && !this.options.reduced;
    for (const t of this.tubes) {
      if (t.enter < 1) {
        t.enter = Math.min(1, t.enter + dt / 0.55);
        active = true;
      }
      const dl = t.liftTo - t.lift;
      if (Math.abs(dl) > 0.1) {
        t.lift += dl * (1 - Math.exp(-dt * 22));
        active = true;
      } else t.lift = t.liftTo;
      if (Math.abs(t.hx - t.x) > 0.3 || Math.abs(t.hy - t.y) > 0.3) {
        t.x += (t.hx - t.x) * (1 - Math.exp(-dt * 10));
        t.y += (t.hy - t.y) * (1 - Math.exp(-dt * 10));
        active = true;
      } else {
        t.x = t.hx;
        t.y = t.hy;
      }
      for (const key of ['wave', 'flash', 'shake', 'bounce']) {
        if (t[key] > 0.001) {
          t[key] = Math.max(0, t[key] - dt * (key === 'wave' ? 1.1 : key === 'shake' ? 2.8 : 1.8));
          active = true;
        } else t[key] = 0;
      }
      if (t.cap > 0 && t.cap < 1) {
        t.cap = Math.min(1, t.cap + dt / (0.5 / this.options.speed));
        t.glow = t.cap;
        active = true;
      }
      if (t.sweep < 1) {
        t.sweep = Math.min(1, t.sweep + dt / 0.7);
        active = true;
      }
      if (ambient && this.theme.bubbles && !t.P && t.layers.length && t.cap < 1 && Math.random() < dt * 0.5) {
        const w = this.m.w;
        t.bubbles.push({ x: (Math.random() - 0.5) * w * 0.55, y: this.m.H - 3, r: 0.8 + Math.random() * 1.6, vy: -(14 + Math.random() * 22) });
      }
      if (t.bubbles.length) {
        const top = this.m.H - total(t.layers) * this.m.uh + 3;
        for (const b of t.bubbles) {
          b.y += b.vy * dt;
          b.x += Math.sin(this.time * 6 + b.r * 9) * dt * 6;
        }
        t.bubbles = t.bubbles.filter((b) => b.y > top && !t.P);
        active = true;
      }
      if (t.glow > 0 && this.theme.glass.glow > 0 && ambient) active = true;
    }
    if (this.hintPair) {
      this.hintPair.t += dt;
      active = true;
    }
    if (active || this.dirty) {
      this.draw();
      this.dirty = false;
    }
  }

  // ---------- Drawing ----------

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.theme) return;
    const moving = [];
    this.tubes.forEach((t, i) => {
      if (t.P) moving.push(i);
      else this.drawTube(t, i);
    });
    for (const s of this.streams) this.drawStream(s);
    for (const i of moving) this.drawTube(this.tubes[i], i);
    this.drawHint();
    this.fx.draw(ctx, { additive: this.theme.additive, width: this.width, height: this.height, flashColor: this.theme.dark ? '#ffffff' : '#fff8e0' });
  }

  shine() {
    if (this.shineCache) return this.shineCache;
    const { w } = this.m;
    const { shine, shade } = this.theme.glass;
    const g = this.ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, `rgba(0,0,0,${shade})`);
    g.addColorStop(0.1, `rgba(255,255,255,${shine * 0.25})`);
    g.addColorStop(0.22, `rgba(255,255,255,${shine})`);
    g.addColorStop(0.32, `rgba(255,255,255,${shine * 0.15})`);
    g.addColorStop(0.62, 'rgba(255,255,255,0)');
    g.addColorStop(0.84, `rgba(255,255,255,${shine * 0.2})`);
    g.addColorStop(1, `rgba(0,0,0,${shade * 0.9})`);
    this.shineCache = g;
    return g;
  }

  tubePath() {
    const { w, H } = this.m;
    const r = w * 0.46;
    const p = new Path2D();
    p.moveTo(-w / 2, 0);
    p.lineTo(-w / 2, H - r);
    p.arcTo(-w / 2, H, 0, H, r);
    p.arcTo(w / 2, H, w / 2, H - r, r);
    p.lineTo(w / 2, 0);
    p.closePath();
    return p;
  }

  applyTubeTransform(ctx, t) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (t.P) {
      ctx.translate(t.P.x, t.P.y);
      ctx.rotate(t.angle);
      ctx.translate(-t.pivot.x, -t.pivot.y);
      return;
    }
    const e = clamp(t.enter);
    const enterOffset = (1 - easeOutBack(e)) * this.m.H * 0.7;
    const shake = t.shake ? Math.sin(t.shake * 40) * t.shake * this.m.w * 0.18 : 0;
    const bounce = t.bounce ? -Math.sin((1 - t.bounce) * Math.PI) * this.m.uh * 0.35 : 0;
    ctx.translate(t.x + shake, t.y - t.lift + enterOffset + bounce);
  }

  drawTube(t, i) {
    const ctx = this.ctx;
    const { w, H, uh } = this.m;
    const theme = this.theme;
    const glass = theme.glass;
    if (t.enter <= 0) return;
    const path = this.tubePath();
    ctx.save();
    ctx.globalAlpha = clamp(t.enter * 2.5);
    this.applyTubeTransform(ctx, t);

    // Glow behind finished tubes (and a softer one for all tubes on glowing themes).
    const topColor = t.layers.length ? theme.colors[t.layers.at(-1).c] : null;
    if (glass.glow > 0 && topColor && this.options.effects) {
      const pulse = t.glow ? 0.55 + 0.25 * Math.sin(this.time * 2.4 + i) : 0.18;
      const g = ctx.createRadialGradient(0, H * 0.6, 0, 0, H * 0.6, w * 1.5);
      g.addColorStop(0, rgba(topColor, pulse * glass.glow * 0.55));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = theme.additive ? 'lighter' : 'source-over';
      ctx.fillStyle = g;
      ctx.fillRect(-w * 1.6, -H * 0.1, w * 3.2, H * 1.4);
      ctx.restore();
    }

    ctx.fillStyle = glass.fill;
    ctx.fill(path);

    // Liquid.
    ctx.save();
    ctx.clip(path);
    if (t.P) this.drawTiltedLiquid(t);
    else this.drawUprightLiquid(t);
    ctx.restore();

    // Glass shine and edges (in tube space).
    ctx.fillStyle = this.shine();
    ctx.fill(path);
    if (t.flash > 0) {
      ctx.save();
      ctx.globalAlpha *= t.flash * 0.75;
      ctx.globalCompositeOperation = theme.additive ? 'lighter' : 'source-over';
      ctx.fillStyle = '#ffffff';
      ctx.fill(path);
      ctx.restore();
    }
    if (t.sweep < 1) {
      // A diagonal glint that runs up a finished tube.
      ctx.save();
      ctx.clip(path);
      const y = lerp(H + w, -w * 2, easeInOut(t.sweep));
      const g = ctx.createLinearGradient(0, y - w, 0, y + w);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w, y - w * 0.6);
      ctx.lineTo(w, y - w * 1.4);
      ctx.lineTo(w, y + w * 0.2);
      ctx.lineTo(-w, y + w);
      ctx.fill();
      ctx.restore();
    }

    const lw = Math.max(1.5, w * 0.055);
    if (glass.glow > 0 && this.options.effects) {
      ctx.lineWidth = lw * 3.2;
      ctx.strokeStyle = glass.edge;
      ctx.globalAlpha *= 0.18 * glass.glow;
      ctx.stroke(path);
      ctx.globalAlpha = clamp(t.enter * 2.5);
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = glass.edge;
    ctx.stroke(path);

    // Lip.
    ctx.fillStyle = glass.rim;
    ctx.beginPath();
    ctx.roundRect(-w / 2 - lw * 1.6, -lw * 1.2, w + lw * 3.2, lw * 2.4, lw * 1.2);
    ctx.fill();

    // Selected or focused: a bright outline.
    const selected = t.liftTo > 0 && !t.P;
    const hinted = this.hintPair && (this.hintPair.from === i || this.hintPair.to === i);
    if (selected || i === this.focus || hinted) {
      const pulse = hinted ? 0.5 + 0.5 * Math.sin(this.hintPair.t * 8) : 1;
      ctx.save();
      ctx.lineWidth = lw * 1.6;
      ctx.strokeStyle = hinted ? (theme.dark ? '#ffe66b' : '#e8a400') : topColor && selected ? mix(topColor, '#ffffff', 0.35) : theme.dark ? '#ffffff' : '#333333';
      ctx.globalAlpha = pulse;
      if (i === this.focus && !selected && !hinted) ctx.setLineDash([lw * 2.5, lw * 2]);
      if (theme.dark && this.options.effects) {
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 14;
      }
      ctx.stroke(path);
      ctx.restore();
    }

    if (t.cap > 0 && t.layers.length) this.drawCap(t);
    ctx.restore();
  }

  drawUprightLiquid(t) {
    const ctx = this.ctx;
    const { w, H, uh } = this.m;
    const colors = this.theme.colors;
    let y = H;
    const wave = t.wave * uh * 0.12;
    t.layers.forEach((layer, k) => {
      const h = layer.a * uh;
      const top = y - h;
      const isTop = k === t.layers.length - 1;
      ctx.fillStyle = colors[layer.c];
      ctx.beginPath();
      if (isTop && wave > 0.05) {
        ctx.moveTo(-w, y + 1);
        ctx.lineTo(-w, top);
        for (let s = 0; s <= 8; s++) {
          const x = -w / 2 + (w * s) / 8;
          ctx.lineTo(x, top + Math.sin(this.time * 14 + s * 0.9) * wave * Math.sin((s / 8) * Math.PI + 0.3));
        }
        ctx.lineTo(w, top);
        ctx.lineTo(w, y + 1);
      } else ctx.rect(-w, top, w * 2, h + 1);
      ctx.fill();
      // A lighter band at each surface reads as a meniscus.
      ctx.fillStyle = isTop ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(-w, top, w * 2, Math.max(1.2, uh * 0.05));
      y = top;
    });
    for (const b of t.bubbles) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
    }
    if (this.options.symbols) {
      let unit = 0;
      for (const layer of t.layers) {
        for (let k = 0; k < Math.floor(layer.a + 0.001); k++, unit++) {
          const color = colors[layer.c];
          const light = luminance(color) > 0.6;
          ctx.fillStyle = ctx.strokeStyle = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)';
          drawSymbol(ctx, SYMBOLS[layer.c % SYMBOLS.length], 0, H - (unit + 0.5) * uh, w * 0.2);
        }
      }
    }
  }

  // Tilted tubes: find each layer's level in screen space so the surfaces
  // stay horizontal, then fill the bands between those levels.
  drawTiltedLiquid(t) {
    const ctx = this.ctx;
    const { w, H, uh } = this.m;
    const rect = [{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }, { x: w / 2, y: H }, { x: -w / 2, y: H }];
    const poly = rotate(rect, t.angle, t.pivot, t.P);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    let lower = Math.max(...poly.map((p) => p.y)) + 1;
    let cum = 0;
    t.layers.forEach((layer, k) => {
      cum += layer.a;
      const level = levelForArea(poly, cum * uh * w);
      const band = clipY(clipY(poly, level, true), lower, false);
      if (band.length > 2) {
        ctx.fillStyle = this.theme.colors[layer.c];
        ctx.beginPath();
        band.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.fill();
        ctx.fillStyle = k === t.layers.length - 1 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(Math.min(...band.map((p) => p.x)), level, w * 2 + H, Math.max(1.2, uh * 0.05));
      }
      lower = level;
    });
    this.applyTubeTransform(ctx, t);
  }

  drawCap(t) {
    const ctx = this.ctx;
    const { w } = this.m;
    const k = easeOutBounce(clamp(t.cap));
    const color = this.theme.cap || this.theme.colors[t.layers[0].c];
    const h = w * 0.34;
    const y = -h * 0.55 - (1 - k) * w * 1.4;
    ctx.save();
    ctx.globalAlpha *= clamp(t.cap * 4);
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, mix(color, '#000000', 0.25));
    g.addColorStop(0.3, mix(color, '#ffffff', 0.35));
    g.addColorStop(1, mix(color, '#000000', 0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w * 0.62, y, w * 1.24, h, h * 0.35);
    ctx.fill();
    ctx.fillStyle = mix(color, '#000000', 0.2);
    ctx.fillRect(-w * 0.42, y + h, w * 0.84, h * 0.45);
    ctx.restore();
  }

  drawStream(s) {
    const ctx = this.ctx;
    const len = s.y1 - s.y0;
    const a = s.y0 + len * s.tail;
    const b = s.y0 + len * s.head;
    if (b - a < 1) return;
    const color = this.theme.colors[s.color];
    const wobble = Math.sin(this.time * 30) * 0.6;
    ctx.save();
    ctx.lineCap = 'round';
    if (this.theme.glass.glow > 0 && this.options.effects) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 * this.theme.glass.glow;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = s.width * (1 - s.tail * 0.6);
    ctx.beginPath();
    ctx.moveTo(s.x, a);
    ctx.quadraticCurveTo(s.x + wobble, (a + b) / 2, s.x + wobble * 0.5, b);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, s.width * 0.25);
    ctx.beginPath();
    ctx.moveTo(s.x - s.width * 0.18, a + 2);
    ctx.lineTo(s.x - s.width * 0.18 + wobble * 0.5, b - 2);
    ctx.stroke();
    ctx.restore();
  }

  drawHint() {
    const h = this.hintPair;
    if (!h) return;
    const s = this.tubes[h.from];
    const t = this.tubes[h.to];
    if (!s || !t) return;
    const ctx = this.ctx;
    const { w, uh } = this.m;
    const bob = Math.sin(h.t * 7) * uh * 0.15;
    const x = t.hx;
    const y = t.hy - uh * 1.1 + bob;
    ctx.save();
    ctx.fillStyle = this.theme.dark ? '#ffe66b' : '#e8a400';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.32, y - w * 0.3);
    ctx.lineTo(x + w * 0.32, y - w * 0.3);
    ctx.lineTo(x, y + w * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// Runs of equal colour become layers: [{ c: colour, a: amount }], bottom first.
export function toLayers(units) {
  const layers = [];
  for (const c of units) {
    const top = layers.at(-1);
    if (top && top.c === c) top.a++;
    else layers.push({ c, a: 1 });
  }
  return layers;
}

const total = (layers) => layers.reduce((s, l) => s + l.a, 0);

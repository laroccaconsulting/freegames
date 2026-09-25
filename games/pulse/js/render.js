// Canvas renderer for Pulse: parallax background, glowing blocks, portals,
// the player in each of its forms, trails, particles and the beat pulse.
import { SOLIDS } from './engine.js';

const TAU = Math.PI * 2;
const CHUNK = 32; // columns per cached path

export const PORTAL_COLORS = {
  cube: '#4dff7a',
  ship: '#ff4fd8',
  ball: '#ff7a3a',
  wave: '#3ae8ff',
  up: '#ffd23a',
  down: '#3a8bff',
  s0: '#ffa94a',
  s1: '#56b6ff',
  s2: '#5dff8f',
  s3: '#ff5fd2',
};
const ORB_COLORS = { orb: '#ffe14a', porb: '#ff5fc8', borb: '#36d6ff' };
const PAD_COLORS = { pad: '#ffe14a', ppad: '#ff5fc8', bpad: '#36d6ff' };

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
// Hallows (autumn): each colour section of a level gets a night palette
// instead, in order: [background, ground, line].
const HALLOWS = [
  ['#2a1648', '#150a28', '#ffe3a8'],
  ['#6a2410', '#361006', '#ffd08a'],
  ['#163a2e', '#0a2018', '#e9ffd0'],
  ['#4a0f24', '#260612', '#ffd6e0'],
  ['#141b4a', '#0a0d2a', '#dfe3ff'],
];

const hash = (i, j) => {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
};

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.trail = [];
    this.fx = { effects: true, reduced: false, hitboxes: false };
    this.skin = { primary: '#ffd23a', secondary: '#3ae8ff', face: 0 };
    this.shake = 0;
    this.camX = 0;
    this.camY = -2;
    this.ceilShown = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = innerWidth;
    const h = innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
    this.W = w;
    this.H = h;
    // About 11 blocks tall in landscape; at least 12 across in portrait.
    this.unit = Math.min(h / 11.5, w / 12);
    this.viewW = w / this.unit;
    this.viewH = h / this.unit;
  }

  setLevel(lv) {
    this.lv = lv;
    this.particles = [];
    this.trail = [];
    this.setColors();
    // Cache solid and spike outlines per chunk of columns, in world units.
    const solid = new Set(lv.objects.filter((o) => o.t === 'block').map((o) => `${o.x},${o.y}`));
    this.chunks = new Map();
    const chunk = (x) => {
      const k = Math.floor(x / CHUNK);
      if (!this.chunks.has(k)) this.chunks.set(k, { fill: new Path2D(), edge: new Path2D(), spikes: new Path2D() });
      return this.chunks.get(k);
    };
    for (const o of lv.objects) {
      const c = chunk(o.x);
      const { x, y } = o;
      if (o.t === 'block') {
        c.fill.rect(x, y, 1, 1);
        const has = (dx, dy) => solid.has(`${x + dx},${y + dy}`);
        if (!has(0, 1)) (c.edge.moveTo(x, y + 1), c.edge.lineTo(x + 1, y + 1));
        if (!has(0, -1)) (c.edge.moveTo(x, y), c.edge.lineTo(x + 1, y));
        if (!has(-1, 0)) (c.edge.moveTo(x, y), c.edge.lineTo(x, y + 1));
        if (!has(1, 0)) (c.edge.moveTo(x + 1, y), c.edge.lineTo(x + 1, y + 1));
      } else if (o.t === 'slab') {
        const y0 = o.f ? y + 0.5 : y;
        c.fill.rect(x, y0, 1, 0.5);
        c.edge.rect(x, y0, 1, 0.5);
      } else if (o.t === 'spike' || o.t === 'mini') {
        const h = o.t === 'mini' ? 0.4 : 0.95;
        const w = o.t === 'mini' ? 0.36 : 0.46;
        const base = o.f ? y + 1 : y;
        const tip = o.f ? base - h : base + h;
        c.spikes.moveTo(x + 0.5 - w, base);
        c.spikes.lineTo(x + 0.5, tip);
        c.spikes.lineTo(x + 0.5 + w, base);
        c.spikes.closePath();
      }
    }
    this.dynamic = lv.objects.filter((o) => !SOLIDS.has(o.t) && o.t !== 'spike' && o.t !== 'mini');
  }

  // The level's colour sections, or the Hallows night palettes in their place.
  setColors() {
    if (!this.lv) return;
    const colors = [...(this.lv.colors || [])].sort((a, b) => a.x - b.x);
    if (!colors.length || colors[0].x > 0) colors.unshift({ x: -1e9, bg: '#1f47d6', ground: '#1233a8', line: '#dfe8ff' });
    this.colors = colors.map((c, i) => {
      const [bg, ground, line] = this.hallows ? HALLOWS[i % HALLOWS.length] : [c.bg, c.ground, c.line || '#ffffff'];
      return { x: c.x, bg: hex(bg), ground: hex(ground), line: hex(line) };
    });
  }

  setHallows(on) {
    if (this.hallows === on) return;
    this.hallows = on;
    this.setColors();
  }

  setSkin(skin) {
    this.skin = { ...this.skin, ...skin };
    this.pri = hex(this.skin.primary);
    this.sec = hex(this.skin.secondary);
  }

  // Colours at world x, fading between triggers over 8 blocks.
  palette(x) {
    const cs = this.colors;
    let i = 0;
    while (i + 1 < cs.length && cs[i + 1].x <= x) i++;
    const cur = cs[i];
    const prev = cs[i - 1];
    if (!prev) return cur;
    const t = Math.min(1, (x - cur.x) / 8);
    return { bg: mix(prev.bg, cur.bg, t), ground: mix(prev.ground, cur.ground, t), line: mix(prev.line, cur.line, t) };
  }

  reset() {
    this.particles = [];
    this.trail = [];
    this.shake = 0;
    this.snap = true;
    this.ceilShown = null;
  }

  // ---------- Effects ----------

  burst(x, y, { n = 26, colors, speed = 9, size = 0.22, life = 0.7, ring = true } = {}) {
    if (!this.fx.effects) n = Math.min(n, 8);
    const cs = colors || [this.skin.primary, this.skin.secondary, '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.3 + Math.random() * 0.9);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.5 + Math.random()), color: cs[i % cs.length], g: 6, kind: 'sq' });
    }
    if (ring) this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 2.4, color: cs[0], kind: 'ring' });
  }

  explode(s) {
    this.burst(s.x, s.y, { n: 34, speed: 11 });
    if (this.fx.effects && !this.fx.reduced) this.shake = 0.35;
  }

  ringAt(x, y, color, size = 1.6) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size, color, kind: 'ring' });
  }

  firework(x, y) {
    const palette = ['#ffe14a', '#ff5fc8', '#36d6ff', '#5dff8f', '#ffffff'];
    const c = palette[Math.floor(Math.random() * palette.length)];
    this.burst(x, y, { n: 40, speed: 7, size: 0.14, life: 1.1, colors: [c, '#ffffff'], ring: true });
  }

  // ---------- Frame ----------

  // info: { t, bpm, attempt, checkpoints, dt, showAttempt, ghost }
  draw(s, info) {
    const { ctx, unit, dpr } = this;
    const dt = Math.min(0.05, info.dt || 0.016);
    const lv = this.lv;

    // Camera.
    const tx = Math.min(s.x, lv.length) - this.viewW * (this.W < this.H ? 0.25 : 0.32);
    let ty;
    if (s.mode === 'cube') ty = Math.max(-this.viewH * (this.W < this.H ? 0.32 : 0.22), s.y - this.viewH * 0.55);
    else ty = (s.floor + s.ceil) / 2 - this.viewH / 2;
    if (this.snap) {
      this.camX = tx;
      this.camY = ty;
      this.snap = false;
    }
    this.camX = s.won ? this.camX : tx;
    this.camY += (ty - this.camY) * Math.min(1, dt * (s.mode === 'cube' ? 5 : 4));
    // The ceiling slides in and out with the flying modes.
    const ceilTarget = Number.isFinite(s.ceil) ? s.ceil : this.camY + this.viewH + 2;
    if (this.ceilShown == null || info.snapCeil) this.ceilShown = ceilTarget;
    this.ceilShown += (ceilTarget - this.ceilShown) * Math.min(1, dt * 6);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const m = this.shake * 0.5;
      sx = (Math.random() - 0.5) * m;
      sy = (Math.random() - 0.5) * m;
    }
    const camX = this.camX + sx;
    const camY = this.camY + sy;

    const beat = info.bpm ? ((info.t * info.bpm) / 60) % 1 : 0.5;
    const pulse = this.fx.effects && !this.fx.reduced ? Math.exp(-beat * 5) : 0;
    const pal = this.palette(camX + this.viewW * 0.5);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBackground(pal, camX, camY, pulse);

    // World transform: 1 unit = 1 block, y up.
    const world = () => ctx.setTransform(dpr * unit, 0, 0, -dpr * unit, -camX * dpr * unit, (this.H + camY * unit) * dpr);
    world();
    const x0 = camX - 2;
    const x1 = camX + this.viewW + 2;
    this.drawFinish(lv.length, pal, camY);
    this.drawStatic(x0, x1, pal, pulse);
    this.drawDynamic(s, x0, x1, pal, pulse, info.t);
    this.drawGround(pal, camX, camY, pulse);
    if (info.checkpoints) for (const c of info.checkpoints) this.diamond(c.x, c.y, '#5dff8f');
    if (info.showAttempt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawAttempt(info.attempt, (4 - camX) * unit, this.H - (5.2 - camY) * unit);
      world();
    }
    this.drawTrail(s, dt);
    if (!s.dead) this.drawPlayer(s, info);
    this.drawParticles(dt);
    if (this.fx.hitboxes) this.drawHitboxes(s, x0, x1);
  }

  drawBackground(pal, camX, camY, pulse) {
    const { ctx, W, H, unit } = this;
    const top = shade(pal.bg, 1.08 + pulse * 0.08);
    const bottom = shade(pal.bg, 0.55 + pulse * 0.05);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (this.hallows) {
      this.drawNight(pal, camX, camY, pulse);
      return;
    }
    // Big faint squares drifting slowly behind everything.
    const size = 3.4 * unit;
    const px = camX * unit * 0.12;
    const py = -camY * unit * 0.06;
    const i0 = Math.floor(px / size) - 1;
    const j0 = Math.floor(py / size) - 1;
    for (let i = i0; i < i0 + W / size + 3; i++) {
      for (let j = j0; j < j0 + H / size + 3; j++) {
        const a = hash(i, j);
        if (a < 0.35) continue;
        ctx.fillStyle = `rgba(255,255,255,${(a - 0.35) * 0.09 + pulse * 0.015})`;
        const x = i * size - px;
        const y = j * size - py;
        ctx.fillRect(x + 3, y + 3, size - 6, size - 6);
      }
    }
  }

  // Hallows backdrop: stars, a harvest moon, and pines and castles with lit
  // windows scrolling slowly along the horizon.
  drawNight(pal, camX, camY, pulse) {
    const { ctx, W, H, unit } = this;
    const star = unit * 1.7;
    const sx = camX * unit * 0.03;
    for (let i = Math.floor(sx / star) - 1; i < (sx + W) / star + 1; i++) {
      for (let j = 0; j < H / star; j++) {
        const a = hash(i, j + 91);
        if (a < 0.72) continue;
        ctx.fillStyle = `rgba(255,246,220,${0.25 + (a - 0.72) * 2.2})`;
        ctx.beginPath();
        ctx.arc(i * star - sx + hash(j, i) * star, j * star + hash(i + 7, j) * star, 0.6 + (a - 0.72) * 5, 0, TAU);
        ctx.fill();
      }
    }
    const mr = unit * 1.25;
    const mx = W * 0.8;
    const my = Math.min(H * 0.2, unit * 2.6);
    const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4);
    halo.addColorStop(0, `rgba(255,220,150,${0.2 + pulse * 0.08})`);
    halo.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, '#fffbea');
    mg.addColorStop(1, '#e3c982');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();

    // The horizon: one tile of skyline every 40 far-units, at 15% scroll speed.
    const u = unit * 0.5;
    const base = H + camY * unit * 0.5 - unit * 0.6;
    const tile = 40 * u;
    const off = camX * unit * 0.15;
    const dark = rgb(shade(pal.bg, 0.4));
    for (let k = Math.floor(off / tile) - 1; k <= (off + W) / tile; k++) {
      const x0 = k * tile - off;
      ctx.fillStyle = dark;
      ctx.beginPath();
      for (let n = 0; n < 16; n++) {
        const px = x0 + (n / 16) * tile + hash(k, n) * u;
        if (hash(k, n + 40) < 0.3) continue;
        const h = (2 + hash(n, k) * 2.5) * u;
        ctx.moveTo(px - 0.7 * u, base);
        ctx.lineTo(px, base - h);
        ctx.lineTo(px + 0.7 * u, base);
      }
      ctx.fill();
      if (hash(k, 99) < 0.45) continue;
      // A castle: towers with pointed roofs and a few lit windows.
      const cx = x0 + (14 + hash(k, 3) * 12) * u;
      const towers = [[-4, 3, 1.4], [-2.2, 5, 2], [0, 6.5, 3.2], [2.6, 8, 1.6], [4.4, 4.5, 1.8], [6.2, 3, 1.2]];
      ctx.beginPath();
      ctx.rect(cx - 4 * u, base - 2.2 * u, 11 * u, 2.2 * u);
      for (const [dx, h, w] of towers) {
        const tx = cx + dx * u;
        ctx.rect(tx - (w / 2) * u, base - h * u, w * u, h * u);
        ctx.moveTo(tx - (w / 2 + 0.25) * u, base - h * u);
        ctx.lineTo(tx, base - (h + w * 1.3) * u);
        ctx.lineTo(tx + (w / 2 + 0.25) * u, base - h * u);
      }
      ctx.fill();
      ctx.fillStyle = `rgba(255,214,120,${0.75 + pulse * 0.25})`;
      for (const [dx, h] of towers) {
        for (let f = 1.5; f < h - 0.5; f += 1.8) {
          if (hash(k * 7 + dx * 3, f * 5) < 0.4) continue;
          ctx.fillRect(cx + dx * u - 0.15 * u, base - f * u - 0.5 * u, 0.3 * u, 0.5 * u);
        }
      }
    }
  }

  drawStatic(x0, x1, pal, pulse) {
    const { ctx } = this;
    const lw = 1 / this.unit;
    const line = rgb(pal.line, 0.92);
    for (let k = Math.floor(x0 / CHUNK); k <= Math.floor(x1 / CHUNK); k++) {
      const c = this.chunks.get(k);
      if (!c) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fill(c.fill);
      ctx.lineWidth = 7 * lw;
      ctx.strokeStyle = rgb(pal.line, 0.12 + pulse * 0.08);
      ctx.stroke(c.edge);
      ctx.lineWidth = 2.2 * lw;
      ctx.strokeStyle = line;
      ctx.stroke(c.edge);
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fill(c.spikes);
      ctx.lineWidth = 2 * lw;
      ctx.lineJoin = 'round';
      ctx.stroke(c.spikes);
    }
  }

  drawDynamic(s, x0, x1, pal, pulse, t) {
    const { ctx } = this;
    for (const o of this.dynamic) {
      if (o.x < x0 || o.x > x1) continue;
      const cx = o.x + 0.5;
      const cy = o.y + 0.5;
      const used = s.used.includes(o.id);
      if (o.t in ORB_COLORS) {
        const col = ORB_COLORS[o.t];
        const r = 0.36 * (1 + pulse * 0.18) * (used ? 0.8 : 1);
        this.glow(cx, cy, 0.75, col, used ? 0.15 : 0.35);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fillStyle = col;
        ctx.globalAlpha = used ? 0.5 : 1;
        ctx.fill();
        ctx.lineWidth = 0.07;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r + 0.14, 0, TAU);
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.05;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (o.t in PAD_COLORS) {
        const col = PAD_COLORS[o.t];
        const base = o.f ? o.y + 1 : o.y;
        const dir = o.f ? -1 : 1;
        this.glow(cx, base + dir * 0.2, 0.6, col, 0.3 + pulse * 0.2);
        ctx.beginPath();
        ctx.ellipse(cx, base, 0.42, 0.22, 0, o.f ? Math.PI : 0, o.f ? TAU : Math.PI);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        if (this.fx.effects && Math.random() < 0.15) {
          this.particles.push({ x: cx + (Math.random() - 0.5) * 0.7, y: base, vx: 0, vy: dir * (1.5 + Math.random() * 2), life: 0.5, max: 0.5, size: 0.08, color: col, g: 0, kind: 'sq' });
        }
      } else if (o.t === 'portal') {
        const col = PORTAL_COLORS[o.v] || '#ffffff';
        const [, y0, , y1] = o.box;
        if (/^s\d$/.test(o.v)) this.speedPortal(o, col, (y0 + y1) / 2, t);
        else this.portal(cx, (y0 + y1) / 2, (y1 - y0) / 2, col, pulse);
      } else if (o.t === 'coin') {
        if (used) continue;
        const sx = Math.abs(Math.cos(t * 3 + o.x));
        this.glow(cx, cy, 0.8, '#ffd23a', 0.35);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(Math.max(0.15, sx), 1);
        ctx.beginPath();
        ctx.arc(0, 0, 0.42, 0, TAU);
        ctx.fillStyle = '#ffcc2a';
        ctx.fill();
        ctx.lineWidth = 0.08;
        ctx.strokeStyle = '#fff5c2';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 0.24, 0, TAU);
        ctx.strokeStyle = '#b87f00';
        ctx.lineWidth = 0.06;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  glow(x, y, r, color, alpha) {
    if (!this.fx.effects) return;
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = hex(color);
    g.addColorStop(0, rgb(c, alpha));
    g.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  portal(cx, cy, ry, col, pulse) {
    const { ctx } = this;
    const rx = Math.min(0.55, ry * 0.36);
    if (this.fx.effects) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / 0.8);
      this.glow(0, 0, 1.1, col, 0.28 + pulse * 0.15);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.lineWidth = 0.34;
    ctx.strokeStyle = rgb(hex(col), 0.35);
    ctx.stroke();
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  speedPortal(o, col, cy, t) {
    const { ctx } = this;
    const n = Number(o.v[1]) + 1;
    const x = o.x + 0.2;
    ctx.lineWidth = 0.14;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col;
    for (const yy of [cy - 1.2, cy, cy + 1.2]) {
      for (let k = 0; k < n; k++) {
        const off = x + k * 0.3 + ((t * 2) % 1) * 0.05;
        ctx.beginPath();
        ctx.moveTo(off, yy + 0.4);
        ctx.lineTo(off + 0.3, yy);
        ctx.lineTo(off, yy - 0.4);
        ctx.stroke();
      }
    }
  }

  diamond(x, y, col) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.4);
    ctx.lineTo(x + 0.28, y);
    ctx.lineTo(x, y - 0.4);
    ctx.lineTo(x - 0.28, y);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  drawFinish(length, pal, camY) {
    const { ctx } = this;
    if (length > this.camX + this.viewW + 4) return;
    const g = ctx.createLinearGradient(length - 3, 0, length + 1, 0);
    g.addColorStop(0, rgb(pal.line, 0));
    g.addColorStop(1, rgb(pal.line, 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(length - 3, camY - 1, 4, this.viewH + 2);
    ctx.fillStyle = rgb(pal.line, 0.9);
    ctx.fillRect(length + 1, camY - 1, 0.08, this.viewH + 2);
  }

  drawGround(pal, camX, camY, pulse) {
    const { ctx } = this;
    const left = camX - 1;
    const w = this.viewW + 2;
    const band = (yTop, down) => {
      const h = this.viewH + 2;
      const y = down ? yTop - h : yTop;
      ctx.fillStyle = rgb(pal.ground);
      ctx.fillRect(left, y, w, h);
      // Tiles scroll with the world.
      ctx.fillStyle = rgb(shade(pal.ground, 1.18), 0.55);
      const size = 2;
      for (let i = Math.floor(left / size); i < (left + w) / size; i++) {
        if (i % 2) continue;
        const ty = down ? yTop - size : yTop;
        ctx.fillRect(i * size + 0.08, ty + 0.08, size - 0.16, size - 0.16);
      }
      const g = ctx.createLinearGradient(left, 0, left + w, 0);
      const c = pal.line;
      g.addColorStop(0, rgb(c, 0));
      g.addColorStop(0.3, rgb(c, 0.95));
      g.addColorStop(0.7, rgb(c, 0.95));
      g.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(left, yTop - 0.03, w, 0.06);
      if (this.fx.effects) {
        ctx.fillStyle = rgb(c, 0.12 + pulse * 0.15);
        ctx.fillRect(left, yTop - (down ? 0.35 : 0), w, 0.35);
      }
    };
    band(0, true);
    if (this.ceilShown < camY + this.viewH + 1) band(this.ceilShown, false);
  }

  // "Attempt 12", written into the level at the start (screen coordinates).
  drawAttempt(n, x, y) {
    const { ctx } = this;
    if (x < -this.W) return;
    ctx.font = `800 ${Math.round(this.unit * 1.1)}px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(2, this.unit * 0.12);
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    ctx.strokeText(`Attempt ${n}`, x, y);
    ctx.fillText(`Attempt ${n}`, x, y);
  }

  drawTrail(s, dt) {
    const { ctx } = this;
    if (s.dead || s.won) {
      this.trail.length = Math.max(0, this.trail.length - 2);
    } else if (s.mode === 'wave' || s.mode === 'ship') {
      this.trail.push({ x: s.x - (s.mode === 'ship' ? 0.45 : 0), y: s.y - (s.mode === 'ship' ? 0.05 * s.grav : 0), mode: s.mode });
      if (this.trail.length > 70) this.trail.shift();
    } else this.trail.length = 0;
    const tr = this.trail.filter((p) => p.mode === 'wave');
    if (tr.length > 1) {
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      ctx.beginPath();
      tr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = rgb(this.sec, 0.35);
      ctx.lineWidth = 0.34;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.1;
      ctx.stroke();
    }
    // Ship exhaust and the dust a cube kicks up.
    if (!s.dead && !s.won && this.fx.effects) {
      if (s.mode === 'ship' && Math.random() < 0.8) {
        this.particles.push({ x: s.x - 0.55, y: s.y - 0.05 * s.grav, vx: -3 - Math.random() * 2, vy: (Math.random() - 0.5) * 1.5, life: 0.35, max: 0.35, size: 0.16, color: s.hold ? '#ffb13a' : this.skin.secondary, g: 0, kind: 'sq' });
      } else if ((s.mode === 'cube' || s.mode === 'ball') && s.grounded && Math.random() < 0.5) {
        const foot = s.y - 0.5 * s.grav;
        this.particles.push({ x: s.x - 0.4, y: foot, vx: -2 - Math.random() * 2, vy: s.grav * (0.5 + Math.random() * 1.5), life: 0.3, max: 0.3, size: 0.1, color: this.skin.secondary, g: 0, kind: 'sq' });
      }
    }
  }

  drawPlayer(s, info) {
    const { ctx } = this;
    let x = s.x;
    let y = s.y;
    if (s.won && info.winT != null) {
      // Fly off into the finish.
      const k = info.winT;
      x = s.x + k * 12;
      y = s.y + k * k * 6;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-s.rot * Math.PI) / 180);
    if (s.grav < 0 && s.mode !== 'cube' && s.mode !== 'ball') ctx.scale(1, -1);
    const P = this.skin.primary;
    const S = this.skin.secondary;
    ctx.lineJoin = 'round';
    if (s.mode === 'cube') this.cube(P, S, 1);
    else if (s.mode === 'ship') {
      // A low wedge with the cube riding in it.
      ctx.save();
      ctx.translate(-0.05, 0.22);
      this.cube(P, S, 0.5);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-0.62, 0.12);
      ctx.lineTo(0.62, -0.02);
      ctx.lineTo(0.48, -0.3);
      ctx.lineTo(-0.5, -0.36);
      ctx.closePath();
      ctx.fillStyle = P;
      ctx.fill();
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.45, -0.12);
      ctx.lineTo(0.5, -0.16);
      ctx.strokeStyle = S;
      ctx.lineWidth = 0.1;
      ctx.stroke();
    } else if (s.mode === 'ball') {
      ctx.beginPath();
      ctx.arc(0, 0, 0.5, 0, TAU);
      ctx.fillStyle = P;
      ctx.fill();
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = S;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 0.38, k * Math.PI, k * Math.PI + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 0.14, 0, TAU);
      ctx.fillStyle = '#000';
      ctx.fill();
    } else if (s.mode === 'wave') {
      ctx.beginPath();
      ctx.moveTo(0.42, 0);
      ctx.lineTo(-0.34, 0.3);
      ctx.lineTo(-0.2, 0);
      ctx.lineTo(-0.34, -0.3);
      ctx.closePath();
      ctx.fillStyle = P;
      ctx.fill();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.2, 0);
      ctx.lineTo(-0.16, 0.12);
      ctx.lineTo(-0.1, 0);
      ctx.lineTo(-0.16, -0.12);
      ctx.closePath();
      ctx.fillStyle = S;
      ctx.fill();
    }
    ctx.restore();
  }

  // The player's cube, drawn at the origin, `k` blocks wide.
  cube(P, S, k) {
    drawCube(this.ctx, P, S, this.skin.face, k, false);
  }

  drawParticles(dt) {
    const { ctx } = this;
    const out = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= (p.g || 0) * dt;
      p.vx *= 0.985;
      out.push(p);
      const a = p.life / p.max;
      ctx.globalAlpha = Math.min(1, a * 1.4);
      if (p.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - a) + 0.2, 0, TAU);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.12 * a + 0.02;
        ctx.stroke();
      } else {
        const sz = p.size * (0.4 + a * 0.6);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
    this.particles = out.length > 600 ? out.slice(-600) : out;
  }

  drawHitboxes(s, x0, x1) {
    const { ctx } = this;
    ctx.lineWidth = 0.04;
    for (const o of this.lv.objects) {
      if (o.x < s.x - 4 || o.x > s.x + 8) continue;
      const [a, b, c, d] = o.box;
      ctx.strokeStyle = SOLIDS.has(o.t) ? '#3aa0ff' : o.t === 'spike' || o.t === 'mini' ? '#ff3030' : '#5dff8f';
      ctx.strokeRect(a, b, c - a, d - b);
    }
    const hw = s.mode === 'wave' ? 0.2 : 0.5;
    const hh = s.mode === 'ship' ? 0.36 : hw;
    ctx.strokeStyle = '#ff3030';
    ctx.strokeRect(s.x - hw, s.y - hh, hw * 2, hh * 2);
    ctx.strokeStyle = '#3aa0ff';
    const ih = s.mode === 'wave' ? 0.2 : 0.15;
    ctx.strokeRect(s.x - ih, s.y - ih, ih * 2, ih * 2);
  }
}

// ---------- Player icons (also used by the menu previews) ----------

export const FACES = ['Smile', 'Visor', 'Grin', 'Dots', 'Bolt', 'Target'];

// Draws the cube centred on the origin in a y-up space of `k` units.
// flipY: true when drawing in a normal y-down canvas.
export function drawCube(ctx, P, S, face, k, flipY) {
  const h = k / 2;
  ctx.save();
  if (flipY) ctx.scale(1, -1);
  ctx.fillStyle = P;
  ctx.fillRect(-h, -h, k, k);
  ctx.lineWidth = k * 0.08;
  ctx.strokeStyle = '#000';
  ctx.strokeRect(-h, -h, k, k);
  const u = k / 10;
  ctx.fillStyle = S;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = u * 0.5;
  const rect = (x, y, w, hh, color = S) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * u, y * u, w * u, hh * u);
    ctx.strokeRect(x * u, y * u, w * u, hh * u);
  };
  switch (face) {
    case 1: // visor
      rect(-3.6, 0.2, 7.2, 2.4);
      rect(-2.4, -3.2, 4.8, 1.4, '#000');
      break;
    case 2: // grin
      rect(-3, 0.6, 2, 2.4);
      rect(1, 0.6, 2, 2.4);
      rect(-3, -3, 6, 1.6);
      break;
    case 3: // dots
      for (const [x, y] of [[-3, 1], [1, 1], [-3, -3], [1, -3]]) rect(x, y, 2, 2);
      break;
    case 4: // bolt
      ctx.beginPath();
      ctx.moveTo(1 * u, 4 * u);
      ctx.lineTo(-2.5 * u, -0.5 * u);
      ctx.lineTo(0, -0.5 * u);
      ctx.lineTo(-1 * u, -4 * u);
      ctx.lineTo(2.5 * u, 0.8 * u);
      ctx.lineTo(0, 0.8 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 5: // target
      rect(-3.5, -3.5, 7, 7);
      rect(-1.8, -1.8, 3.6, 3.6, P);
      rect(-0.7, -0.7, 1.4, 1.4, '#000');
      break;
    default: // smile: two tall eyes over a curved mouth
      ctx.fillStyle = S;
      ctx.lineWidth = u * 0.6;
      for (const x of [-2.2, 2.2]) {
        ctx.beginPath();
        ctx.ellipse(x * u, 1.4 * u, 1.1 * u, 1.9 * u, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, -0.6 * u, 3 * u, Math.PI * 1.2, Math.PI * 1.8);
      ctx.lineWidth = u * 1.1;
      ctx.strokeStyle = S;
      ctx.stroke();
  }
  ctx.restore();
}

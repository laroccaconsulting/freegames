// Drawing, in ink on paper. Built for reflective and grayscale screens
// (e-paper, "live paper", phones in the sun): nothing depends on colour,
// every material has its own pattern, strokes are thick and crisp, and the
// play path (front layer) is drawn heavier than the drive train behind it.

import { leverEnds, cupWalls, DRUM_R, GEAR_TEETH, ITEM_INFO } from './geom.js';

export const PALETTES = {
  paper: { paper: '#ffffff', ink: '#111111', mid: '#5c5c5c', back: '#6e6e6e', faint: '#d4d4d4', peg: '#a8a8a8', wall: '#ffffff', flag: '#111111', glow: null },
  ink: { paper: '#121212', ink: '#f2f2f2', mid: '#a8a8a8', back: '#9a9a9a', faint: '#3a3a3a', peg: '#5a5a5a', wall: '#121212', flag: '#f2f2f2', glow: null },
  hallows: { paper: '#170f26', ink: '#f6e3b4', mid: '#b49a74', back: '#a08a6a', faint: '#3b2b52', peg: '#5e4a78', wall: '#170f26', flag: '#f08a24', glow: '#f08a24' },
};

const TAU = Math.PI * 2;

/** World-to-screen view: s pixels per cell, then offset. */
export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.s = 30;
    this.ox = 0;
    this.oy = 0;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }
  /** Fit a w×h board into the rect (CSS pixels) with a margin. */
  fit(bw, bh, rect, margin = 8) {
    const s = Math.min((rect.w - margin * 2) / bw, (rect.h - margin * 2) / bh);
    this.s = Math.max(4, s);
    this.ox = rect.x + (rect.w - bw * this.s) / 2;
    this.oy = rect.y + (rect.h - bh * this.s) / 2;
  }
  toScreen(x, y) {
    return [this.ox + x * this.s, this.oy + y * this.s];
  }
  toWorld(px, py) {
    return [(px - this.ox) / this.s, (py - this.oy) / this.s];
  }
  begin(pal) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, this.dpr * this.ox, this.dpr * this.oy);
  }
  /** Line width in cells for a width in CSS pixels, never thinner than min px. */
  px(n, min = 1.2) {
    return Math.max(n, min) / this.s;
  }
}

// ---------- helpers ----------

function rectPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

function polyPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function zonePath(ctx, z) {
  if (Array.isArray(z)) rectPath(ctx, ...z);
  else if (z.poly) polyPath(ctx, z.poly);
  else rectPath(ctx, ...z.rect);
}

function zoneBox(z) {
  if (Array.isArray(z)) return z;
  const pts = z.poly;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

function hatch(ctx, box, gap, width, color) {
  const [x, y, w, h] = box;
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let d = -h; d < w + h; d += gap) {
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

function capsulePath(ctx, ax, ay, bx, by, r) {
  const a = Math.atan2(by - ay, bx - ax);
  ctx.beginPath();
  ctx.arc(ax, ay, r, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(bx, by, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}

// ---------- level pieces ----------

export function drawPegs(ctx, view, level, pal) {
  ctx.fillStyle = pal.peg;
  const r = Math.max(1.3, view.s * 0.06) / view.s;
  for (let y = 1; y < level.h; y++) {
    for (let x = 1; x < level.w; x++) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }
}

export function drawBorder(ctx, view, level, pal) {
  ctx.strokeStyle = pal.faint;
  ctx.lineWidth = view.px(1.5);
  ctx.strokeRect(0, 0, level.w, level.h);
}

export function drawZones(ctx, view, level, pal) {
  // no-build: sparse light stripes and a dashed edge
  for (const z of level.noBuild || []) {
    zonePath(ctx, z);
    hatch(ctx, zoneBox(z), 0.5, view.px(1.4), pal.faint);
    zonePath(ctx, z);
    ctx.setLineDash([0.3, 0.22]);
    ctx.strokeStyle = pal.mid;
    ctx.lineWidth = view.px(1.4);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function drawWalls(ctx, view, level, pal) {
  for (const z of level.walls || []) {
    zonePath(ctx, z);
    ctx.fillStyle = pal.wall;
    ctx.fill();
    zonePath(ctx, z);
    hatch(ctx, zoneBox(z), 0.34, view.px(1.3), pal.ink);
    zonePath(ctx, z);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.4);
    ctx.stroke();
  }
}

export function drawDanger(ctx, view, level, pal) {
  for (const z of level.danger || []) {
    const [x, y, w, h] = zoneBox(z);
    ctx.fillStyle = pal.ink;
    zonePath(ctx, z);
    ctx.fill();
    // paper spikes along the top edge
    const n = Math.max(1, Math.round(w / 0.5));
    const sw = w / n;
    ctx.fillStyle = pal.paper;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      ctx.moveTo(x + i * sw + sw * 0.15, y + h * 0.85);
      ctx.lineTo(x + i * sw + sw / 2, y + h * 0.18);
      ctx.lineTo(x + i * sw + sw * 0.85, y + h * 0.85);
    }
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    zonePath(ctx, z);
    ctx.stroke();
  }
}

export function drawGoal(ctx, view, level, pal, t = 0, glow = 0) {
  const g = level.goal;
  if (!g) return;
  // the target area: bold dashes
  ctx.setLineDash([0.32, 0.2]);
  ctx.lineDashOffset = -t * 0.4;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = view.px(2.2);
  ctx.strokeRect(g.x + 0.12, g.y + 0.12, g.w - 0.24, g.h - 0.24);
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  if (glow) {
    ctx.fillStyle = pal.faint;
    ctx.globalAlpha = Math.min(1, glow);
    ctx.fillRect(g.x + 0.12, g.y + 0.12, g.w - 0.24, g.h - 0.24);
    ctx.globalAlpha = 1;
  }
  for (const r of cupWalls(g)) {
    ctx.fillStyle = pal.ink;
    ctx.fillRect(...r);
  }
  // a flag on a pole at the cup's right rim
  const fx = g.x + g.w + (g.cup ? 0.12 : 0);
  const fy = g.y;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = view.px(2);
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx, fy - 1.3);
  ctx.stroke();
  ctx.fillStyle = pal.flag;
  ctx.beginPath();
  const wave = Math.sin(t * 3) * 0.06;
  ctx.moveTo(fx, fy - 1.3);
  ctx.lineTo(fx + 0.75, fy - 1.1 + wave);
  ctx.lineTo(fx, fy - 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ---------- parts ----------

function gearPath(ctx, r, teeth) {
  const inner = r - 0.18;
  const outer = r + 0.14;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU;
    const a1 = ((i + 0.25) / teeth) * TAU;
    const a2 = ((i + 0.5) / teeth) * TAU;
    const a3 = ((i + 0.75) / teeth) * TAU;
    const pt = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
    const p = [pt(a0, inner), pt(a1, outer), pt(a2, outer), pt(a3, inner)];
    p.forEach(([x, y], k) => (i === 0 && k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  }
  ctx.closePath();
}

export function drawGear(ctx, view, pal, x, y, size, angle, faded = false) {
  const teeth = GEAR_TEETH[size] || 10;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  gearPath(ctx, size, teeth);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.strokeStyle = faded ? pal.faint : pal.back;
  ctx.lineWidth = view.px(1.8);
  ctx.stroke();
  // spokes so the turning is visible
  ctx.beginPath();
  const spokes = size === 1 ? 3 : size === 2 ? 4 : 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    ctx.moveTo(Math.cos(a) * 0.22, Math.sin(a) * 0.22);
    ctx.lineTo(Math.cos(a) * (size - 0.32), Math.sin(a) * (size - 0.32));
  }
  ctx.lineWidth = view.px(2.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, size - 0.3, 0, TAU);
  ctx.lineWidth = view.px(1.2);
  ctx.stroke();
  ctx.restore();
}

export function drawAxle(ctx, view, pal, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 0.16, 0, TAU);
  ctx.fillStyle = pal.ink;
  ctx.fill();
}

export function drawMotor(ctx, view, pal, x, y, dir, angle, delay, running) {
  ctx.save();
  ctx.translate(x, y);
  // square housing
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-0.42, -0.42, 0.84, 0.84, 0.12) : ctx.rect(-0.42, -0.42, 0.84, 0.84);
  ctx.fill();
  // a turning arrow in paper
  ctx.rotate(angle);
  ctx.strokeStyle = pal.paper;
  ctx.fillStyle = pal.paper;
  ctx.lineWidth = Math.max(0.07, view.px(2));
  ctx.beginPath();
  const a0 = dir > 0 ? -2.4 : 2.4;
  const a1 = dir > 0 ? 1.2 : -1.2;
  ctx.arc(0, 0, 0.24, Math.min(a0, a1), Math.max(a0, a1));
  ctx.stroke();
  const tip = a1;
  const tx = Math.cos(tip) * 0.24;
  const ty = Math.sin(tip) * 0.24;
  const tang = tip + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(tx + Math.cos(tang) * 0.16, ty + Math.sin(tang) * 0.16);
  ctx.lineTo(tx + Math.cos(tip) * 0.12, ty + Math.sin(tip) * 0.12);
  ctx.lineTo(tx - Math.cos(tip) * 0.12, ty - Math.sin(tip) * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (delay && !running) {
    ctx.fillStyle = pal.ink;
    ctx.font = `700 ${0.42}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${delay}s`, x, y + 0.5);
  }
}

/** Belt around two drums; offset is how far the belt surface has travelled. */
export function drawConveyor(ctx, view, pal, a, b, offset = 0, drumAngle = 0) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const r = DRUM_R;
  capsulePath(ctx, ax, ay, bx, by, r);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = view.px(2.6);
  ctx.stroke();
  // chevrons on the top run, moving with the belt
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = uy;
  const ny = -ux;
  const step = 0.6;
  ctx.save();
  capsulePath(ctx, ax, ay, bx, by, r - 0.06);
  ctx.clip();
  ctx.lineWidth = view.px(1.8);
  ctx.strokeStyle = pal.ink;
  ctx.beginPath();
  const off = ((offset % step) + step) % step;
  for (let s = -step + off; s < len + step; s += step) {
    const cx = ax + ux * s + nx * r * 0.55;
    const cy = ay + uy * s + ny * r * 0.55;
    ctx.moveTo(cx - ux * 0.12 + nx * 0.14, cy - uy * 0.12 + ny * 0.14);
    ctx.lineTo(cx + ux * 0.08, cy + uy * 0.08);
    ctx.lineTo(cx - ux * 0.12 - nx * 0.14, cy - uy * 0.12 - ny * 0.14);
  }
  ctx.stroke();
  ctx.restore();
  // drums with a mark that turns
  for (const [x, y] of [a, b]) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, TAU);
    ctx.lineWidth = view.px(1.6);
    ctx.strokeStyle = pal.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(drumAngle) * r * 0.55, y + Math.sin(drumAngle) * r * 0.55);
    ctx.stroke();
    drawAxle(ctx, view, pal, x, y);
  }
}

export function drawRamp(ctx, view, pal, a, b) {
  capsulePath(ctx, a[0], a[1], b[0], b[1], 0.15);
  ctx.fillStyle = pal.ink;
  ctx.fill();
  for (const [x, y] of [a, b]) {
    ctx.beginPath();
    ctx.arc(x, y, 0.07, 0, TAU);
    ctx.fillStyle = pal.paper;
    ctx.fill();
  }
}

export function drawBouncer(ctx, view, pal, a, b, squash = 0) {
  const [ax, ay] = a;
  const [bx, by] = b;
  capsulePath(ctx, ax, ay, bx, by, 0.2);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = view.px(2.4);
  ctx.stroke();
  // a spring zigzag inside
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const nx = -uy;
  const ny = ux;
  const n = Math.max(3, Math.round(len * 3));
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len;
    const k = (i % 2 ? 1 : -1) * (0.1 - squash * 0.05);
    const x = ax + ux * s + nx * k;
    const y = ay + uy * s + ny * k;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.lineWidth = view.px(1.6);
  ctx.stroke();
}

export function drawLever(ctx, view, pal, part, angle) {
  const a = angle ?? ((part.angle || 0) * Math.PI) / 180;
  const [x, y] = part.p;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const e1 = [x - c * part.l1, y - s * part.l1];
  const e2 = [x + c * part.l2, y + s * part.l2];
  // fulcrum triangle behind
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 0.35, y + 0.6);
  ctx.lineTo(x + 0.35, y + 0.6);
  ctx.closePath();
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.strokeStyle = pal.back;
  ctx.lineWidth = view.px(1.8);
  ctx.stroke();
  capsulePath(ctx, e1[0], e1[1], e2[0], e2[1], 0.14);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = view.px(2.4);
  ctx.stroke();
  // wood grain line
  ctx.beginPath();
  ctx.moveTo(e1[0] + c * 0.15, e1[1] + s * 0.15);
  ctx.lineTo(e2[0] - c * 0.15, e2[1] - s * 0.15);
  ctx.lineWidth = view.px(1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 0.12, 0, TAU);
  ctx.fillStyle = pal.ink;
  ctx.fill();
}

export function drawWeight(ctx, view, pal, x, y, angle = 0, waiting = false) {
  if (waiting) dropArrow(ctx, view, pal, x, y);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.moveTo(-0.32, -0.45);
  ctx.lineTo(0.32, -0.45);
  ctx.lineTo(0.45, 0.45);
  ctx.lineTo(-0.45, 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.paper;
  ctx.font = `800 0.36px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('kg', 0, 0.08);
  ctx.restore();
}

/** Chain: a band around two sprockets, dots travel with it. */
export function drawChain(ctx, view, pal, a, ra, b, rb, travel = 0) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const d = Math.hypot(bx - ax, by - ay);
  if (d <= Math.abs(ra - rb)) return;
  const base = Math.atan2(by - ay, bx - ax);
  const phi = Math.acos((ra - rb) / d);
  const t1a = [ax + Math.cos(base + phi) * ra, ay + Math.sin(base + phi) * ra];
  const t1b = [bx + Math.cos(base + phi) * rb, by + Math.sin(base + phi) * rb];
  const t2a = [ax + Math.cos(base - phi) * ra, ay + Math.sin(base - phi) * ra];
  const t2b = [bx + Math.cos(base - phi) * rb, by + Math.sin(base - phi) * rb];
  ctx.beginPath();
  ctx.moveTo(...t1a);
  ctx.lineTo(...t1b);
  ctx.arc(bx, by, rb, base + phi, base - phi, true);
  ctx.lineTo(...t2a);
  ctx.arc(ax, ay, ra, base - phi, base + phi, true);
  ctx.closePath();
  ctx.setLineDash([0.12, 0.12]);
  ctx.lineDashOffset = -travel;
  ctx.strokeStyle = pal.back;
  ctx.lineWidth = view.px(3.2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

// ---------- items and movers ----------

export function drawItem(ctx, view, pal, item, x, y, angle, opts = {}) {
  const info = ITEM_INFO[item.type];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (info.r) {
    const r = info.r;
    ctx.beginPath();
    if (item.type === 'egg') ctx.ellipse(0, 0, r * 0.88, r, 0, 0, TAU);
    else ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = item.type === 'steel' ? pal.ink : pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.6);
    ctx.stroke();
    // seam so rolling shows
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, 0);
    ctx.quadraticCurveTo(0, r * 0.55, r * 0.75, 0);
    ctx.strokeStyle = item.type === 'steel' ? pal.paper : pal.ink;
    ctx.lineWidth = view.px(1.6);
    ctx.stroke();
    if (item.type === 'steel') {
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.35, r * 0.16, 0, TAU);
      ctx.fillStyle = pal.paper;
      ctx.fill();
    }
  } else {
    const w = info.w;
    const h = info.h;
    ctx.fillStyle = item.type === 'heavy' ? pal.ink : pal.paper;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.4);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = view.px(1.4);
    ctx.strokeStyle = item.type === 'heavy' ? pal.paper : pal.ink;
    ctx.beginPath();
    if (item.type === 'can') {
      for (const k of [-0.25, 0.25]) {
        ctx.moveTo(-w / 2, k * h);
        ctx.lineTo(w / 2, k * h);
      }
    } else {
      // planks and a brace
      const i = 0.12;
      ctx.rect(-w / 2 + i, -h / 2 + i, w - 2 * i, h - 2 * i);
      ctx.moveTo(-w / 2 + i, h / 2 - i);
      ctx.lineTo(w / 2 - i, -h / 2 + i);
    }
    ctx.stroke();
  }
  ctx.restore();
  if (opts.lost) {
    // a burst of ink lines
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.2);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      ctx.moveTo(x + Math.cos(a) * 0.65, y + Math.sin(a) * 0.65);
      ctx.lineTo(x + Math.cos(a) * 1.05, y + Math.sin(a) * 1.05);
    }
    ctx.stroke();
  }
}

export function drawMover(ctx, view, pal, m, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (m.shape === 'bar') {
    const L = m.length / 2;
    const r = m.r ?? 0.2;
    capsulePath(ctx, -L, 0, L, 0, r);
    ctx.fillStyle = m.danger ? pal.ink : pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.2);
    ctx.stroke();
    if (m.danger) {
      // teeth along both edges
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      for (let s = -L; s < L; s += 0.4) {
        for (const side of [-1, 1]) {
          ctx.moveTo(s, side * r);
          ctx.lineTo(s + 0.2, side * (r + 0.2));
          ctx.lineTo(s + 0.4, side * r);
        }
      }
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.14, 0, TAU);
    ctx.fillStyle = pal.paper;
    ctx.fill();
  } else {
    const w = m.w ?? 1;
    const h = m.h ?? 1;
    ctx.fillStyle = pal.paper;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.save();
    rectPath(ctx, -w / 2, -h / 2, w, h);
    hatch(ctx, [-w / 2, -h / 2, w, h], 0.22, view.px(1.2), pal.ink);
    ctx.restore();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.6);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

export function drawPath(ctx, view, pal, path) {
  if (!path || path.length < 2) return;
  ctx.fillStyle = pal.mid;
  const r = Math.max(1.4, view.s * 0.05) / view.s;
  let last = null;
  for (const [x, y] of path) {
    if (last && Math.hypot(x - last[0], y - last[1]) < 0.35) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    last = [x, y];
  }
}

/** Dashed outline around a part (selection, ghost, problem). */
export function outline(ctx, view, pal, shape, { dash = true, width = 2, color } = {}) {
  if (!shape) return;
  const pad = 0.18;
  ctx.save();
  ctx.strokeStyle = color || pal.ink;
  ctx.lineWidth = view.px(width);
  if (dash) ctx.setLineDash([4 / view.s, 3 / view.s]);
  const { verts, radius } = shape;
  const r = radius + pad;
  if (verts.length === 1) {
    ctx.beginPath();
    ctx.arc(verts[0][0], verts[0][1], r, 0, TAU);
  } else if (verts.length === 2) capsulePath(ctx, verts[0][0], verts[0][1], verts[1][0], verts[1][1], r);
  else {
    // inflate a polygon roughly: use its bounding box
    const xs = verts.map((v) => v[0]);
    const ys = verts.map((v) => v[1]);
    rectPath(ctx, Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawHandle(ctx, view, pal, x, y, active = false) {
  const r = Math.max(9, view.s * 0.32) / view.s;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = active ? pal.ink : pal.paper;
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = view.px(2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, TAU);
  ctx.fillStyle = active ? pal.paper : pal.ink;
  ctx.fill();
}

export function label(ctx, view, pal, text, x, y, { size = 13, bold = true, align = 'center', box = true } = {}) {
  const fs = size / view.s;
  ctx.font = `${bold ? 700 : 500} ${fs}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (box) {
    const w = ctx.measureText(text).width + 8 / view.s;
    const h = fs * 1.35;
    const x0 = align === 'center' ? x - w / 2 : align === 'left' ? x - 4 / view.s : x - w + 4 / view.s;
    ctx.fillStyle = pal.paper;
    ctx.fillRect(x0, y - h / 2, w, h);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(1.2);
    ctx.strokeRect(x0, y - h / 2, w, h);
  }
  ctx.fillStyle = pal.ink;
  ctx.fillText(text, x, y + fs * 0.05);
}

export { leverEnds };

// A weight waits until Run: a dashed arrow says where it will fall.
function dropArrow(ctx, view, pal, x, y) {
  ctx.save();
  ctx.strokeStyle = pal.mid;
  ctx.fillStyle = pal.mid;
  ctx.lineWidth = view.px(1.6);
  ctx.setLineDash([0.15, 0.12]);
  ctx.beginPath();
  ctx.moveTo(x, y + 0.55);
  ctx.lineTo(x, y + 1.55);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x - 0.2, y + 1.45);
  ctx.lineTo(x + 0.2, y + 1.45);
  ctx.lineTo(x, y + 1.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

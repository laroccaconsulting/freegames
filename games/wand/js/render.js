// Everything drawn on the canvas: the chamber in perspective, the things in
// it, the wand in your hand and the light it leaves behind.
//
// The camera stands at the origin at eye height looking down +z, so the
// projection is the textbook one: divide by depth. One `scale` per object
// (focal / z) sizes its sprite, so a crate shoved backwards really does get
// smaller.

import { EYE, FAR } from './scene.js';

const TAU = Math.PI * 2;

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.hallows = true;
    this.handed = 'right';
    this.reduced = false;
    this.resize();
  }

  // Hallows lights the chamber with candle gold; Classic with cold blue
  // witch-light. Either way it is night: the wand has to be the brightest
  // thing on screen.
  setHallows(on) {
    this.hallows = !!on;
  }

  get palette() {
    return this.hallows ? HALLOWS : CLASSIC;
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // A horizontal field of view of about 85°, never so tall that the room
  // spills off a wide desktop window.
  get focal() {
    return Math.min(this.w * 0.546, this.h * 0.7);
  }
  get cx() {
    return this.w / 2;
  }
  get horizon() {
    return this.h * 0.42;
  }

  project(x, y, z) {
    const f = this.focal;
    const d = Math.max(0.35, z);
    return { x: this.cx + (x / d) * f, y: this.horizon - ((y - EYE) / d) * f, scale: f / d };
  }
}

// Where an object looks like it is on screen: sprites stand on their base, so
// the middle of the picture is half a sprite above the point we project.
export function centreOf(view, o) {
  const p = view.project(o.x, o.y, o.z);
  const s = p.scale * o.size * o.scale;
  return { x: p.x, y: p.y - s * 0.45, scale: p.scale, size: s };
}

// Which thing the player drew over: the nearest one to the middle of the
// stroke, so you aim by drawing across what you want to hit.
export function rankTargets(world, view, stroke, { slack = 2.1 } = {}) {
  const points = Array.isArray(stroke) ? stroke : [stroke];
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x / points.length;
    cy += p.y / points.length;
  }
  const hits = [];
  for (const o of world.objects) {
    const p = centreOf(view, o);
    const r = Math.max(18, p.size * 0.5) * slack;
    // A long thin thing (the rope) is hit anywhere along its length, not just
    // at its middle, so measure to a vertical span rather than to a point.
    const half = ((o.span || 0) * p.scale) / 2;
    const near = (q) => Math.hypot(p.x - q.x, Math.max(0, Math.abs(p.y - q.y) - half));
    let nearest = Infinity;
    for (const q of points) nearest = Math.min(nearest, near(q));
    // Either the stroke was centred on it (a circle drawn *around* a candle
    // never touches the candle) or the stroke swept over it (a slash across a
    // darting pixie). Whichever reads better, measured against the thing's own
    // size so a big crate in front cannot swallow a small brazier behind it.
    const d = Math.min(near({ x: cx, y: cy }), nearest * 1.5);
    const score = d / r;
    if (score < 1) hits.push({ o, score });
  }
  return hits.sort((a, b) => a.score - b.score).map((h) => h.o);
}

// The single best guess at what the stroke was drawn over.
export function targetAt(world, view, stroke, opts) {
  return rankTargets(world, view, stroke, opts)[0] || null;
}

// ---------- the chamber ----------

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// The chamber is a box: floor, ceiling, two side walls and a back wall. It is
// drawn a good deal wider than the view so the walls always run off the edges
// instead of floating in the dark.
const ROOM = { half: 2.6, top: 2.6, near: 0.6 };

const HALLOWS = {
  void: '#070510',
  ceiling: '#150e28',
  left: '#221839',
  right: '#281c42',
  back: '#332552',
  floor: '#0e0a1c',
  beamDark: '#0a0616',
  beamFace: '#1a1230',
  ledge: '#2e2250',
  ledgeFace: '#241a42',
  ledgeEdge: 'rgba(232, 176, 74, 0.2)',
  course: 'rgba(255, 240, 210, 0.05)',
  tile: 'rgba(210, 190, 255, 0.07)',
  plinth: '#231a3c',
  plinthTop: '#332752',
  warm: '255, 190, 110',
  tip: '#ffd98a',
  trail: '#ffe6a8',
};

const CLASSIC = {
  void: '#04070e',
  ceiling: '#0c1424',
  left: '#142136',
  right: '#182742',
  back: '#1f3152',
  floor: '#080e1a',
  beamDark: '#060b16',
  beamFace: '#101c2e',
  ledge: '#1c2c49',
  ledgeFace: '#16243c',
  ledgeEdge: 'rgba(120, 200, 255, 0.22)',
  course: 'rgba(220, 240, 255, 0.05)',
  tile: 'rgba(150, 200, 255, 0.08)',
  plinth: '#16243c',
  plinthTop: '#22344f',
  warm: '120, 190, 255',
  tip: '#bfe4ff',
  trail: '#d8f0ff',
};

function quad(ctx, view, corners, fill, stroke) {
  ctx.beginPath();
  corners.forEach(([x, y, z], i) => {
    const p = view.project(x, y, z);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function grid(ctx, view, line, along, across) {
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  for (const [a, b] of [...along, ...across]) {
    const p = view.project(...a);
    const q = view.project(...b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
}

function drawRoom(ctx, view, world) {
  const { w, h } = view;
  const { half, top, near } = ROOM;
  const c = view.palette;
  const lit = world.objects.reduce((n, o) => n + (o.lit ? 1 : 0), 0);

  ctx.fillStyle = c.void;
  ctx.fillRect(0, 0, w, h);

  // Ceiling, then the two side walls, then the back wall: painting them
  // far-to-near means the near edges overlap cleanly.
  quad(ctx, view, [[-half, top, near], [half, top, near], [half, top, FAR], [-half, top, FAR]], c.ceiling);
  quad(ctx, view, [[-half, 0, near], [-half, top, near], [-half, top, FAR], [-half, 0, FAR]], c.left);
  quad(ctx, view, [[half, 0, near], [half, top, near], [half, top, FAR], [half, 0, FAR]], c.right);
  quad(ctx, view, [[-half, 0, FAR], [-half, top, FAR], [half, top, FAR], [half, 0, FAR]], c.back);
  quad(ctx, view, [[-half, 0, near], [half, 0, near], [half, 0, FAR], [-half, 0, FAR]], c.floor);

  // Stone courses. The floor gets both directions; the walls only need the
  // horizontal ones to read as blocks.
  const courses = [];
  for (let y = 0.42; y < top; y += 0.42) {
    courses.push([[-half, y, FAR], [half, y, FAR]]);
    courses.push([[-half, y, near], [-half, y, FAR]]);
    courses.push([[half, y, near], [half, y, FAR]]);
  }
  const floor = [];
  for (let x = -half; x <= half + 0.01; x += 0.65) floor.push([[x, 0, near], [x, 0, FAR]]);
  for (let z = near; z <= FAR + 0.01; z += 0.65) floor.push([[-half, 0, z], [half, 0, z]]);
  grid(ctx, view, c.course, courses, []);
  grid(ctx, view, c.tile, floor, []);

  // Beams across the ceiling: without them the top of the frame is a blank slab.
  for (let z = 1.2; z <= FAR; z += 0.95) {
    quad(ctx, view, [[-half, top, z], [half, top, z], [half, top - 0.16, z + 0.02], [-half, top - 0.16, z + 0.02]], c.beamDark);
    quad(ctx, view, [[-half, top - 0.16, z + 0.02], [half, top - 0.16, z + 0.02], [half, top - 0.16, z + 0.2], [-half, top - 0.16, z + 0.2]], c.beamFace);
  }

  // The ledge the vine is meant to reach, jutting off the right-hand wall.
  quad(ctx, view, [[0.45, 1.95, 2.5], [half, 1.95, 2.5], [half, 1.95, 3.6], [0.45, 1.95, 3.6]], c.ledge);
  quad(ctx, view, [[0.45, 1.82, 2.5], [half, 1.82, 2.5], [half, 1.95, 2.5], [0.45, 1.95, 2.5]], c.ledgeFace, c.ledgeEdge);

  // Everything alight warms the room, and the dark closes in at the edges.
  if (lit) {
    const g = ctx.createRadialGradient(view.cx, view.horizon, 0, view.cx, view.horizon, Math.max(w, h) * 0.85);
    g.addColorStop(0, `rgba(${c.warm}, ${Math.min(0.18, 0.07 * lit)})`);
    g.addColorStop(1, `rgba(${c.warm}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const vig = ctx.createRadialGradient(view.cx, view.horizon, Math.min(w, h) * 0.25, view.cx, view.horizon, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

// ---------- the things in it ----------

function flame(ctx, x, y, s, t, seed = 0) {
  const flick = 1 + Math.sin(t * 9 + seed) * 0.12 + Math.sin(t * 23 + seed) * 0.05;
  const g = ctx.createRadialGradient(x, y - s * 0.4, 0, x, y - s * 0.4, s * 2.6);
  g.addColorStop(0, 'rgba(255, 240, 190, 0.95)');
  g.addColorStop(0.35, 'rgba(255, 170, 60, 0.55)');
  g.addColorStop(1, 'rgba(255, 120, 30, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.4, s * 2.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.9 * flick);
  ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.5, x, y);
  ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.5, x, y - s * 1.9 * flick);
  ctx.fill();
}

const box = (ctx, x, y, w, h, fill, stroke) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h, w, h);
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.stroke();
  }
};

// Each sprite is drawn around (x, y) where y is the object's base on screen
// and `s` is its size in pixels.
const SPRITES = {
  candle(ctx, o, x, y, s, t) {
    box(ctx, x, y, s * 0.3, s * 0.9, '#efe3c8', 'rgba(0,0,0,0.25)');
    box(ctx, x, y - s * 0.9, s * 0.5, s * 0.12, '#6b5a3a');
    if (o.lit) flame(ctx, x, y - s * 0.95, s * 0.22, t, o.phase);
  },
  brazier(ctx, o, x, y, s, t) {
    ctx.fillStyle = '#4a4053';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.55, s * 0.5, s * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y - s * 0.55);
    ctx.lineTo(x - s * 0.22, y);
    ctx.lineTo(x + s * 0.22, y);
    ctx.lineTo(x + s * 0.5, y - s * 0.55);
    ctx.fill();
    if (o.lit) {
      flame(ctx, x, y - s * 0.6, s * 0.32, t, o.phase);
      flame(ctx, x - s * 0.18, y - s * 0.58, s * 0.2, t * 1.3, o.phase + 2);
      flame(ctx, x + s * 0.2, y - s * 0.58, s * 0.2, t * 0.8, o.phase + 4);
    } else {
      ctx.fillStyle = '#231a33';
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.57, s * 0.4, s * 0.13, 0, 0, TAU);
      ctx.fill();
    }
  },
  crate(ctx, o, x, y, s) {
    box(ctx, x, y, s, s * 0.92, '#6a4c2e', 'rgba(0,0,0,0.35)');
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(x - s / 2, y - s * 0.92);
    ctx.lineTo(x + s / 2, y);
    ctx.moveTo(x + s / 2, y - s * 0.92);
    ctx.lineTo(x - s / 2, y);
    ctx.stroke();
  },
  chest(ctx, o, x, y, s) {
    box(ctx, x, y, s, s * 0.62, '#5a3f26', 'rgba(0,0,0,0.4)');
    ctx.save();
    ctx.translate(x - s / 2, y - s * 0.62);
    ctx.rotate(o.open ? -0.95 : 0);
    ctx.fillStyle = '#6d4d2f';
    ctx.beginPath();
    ctx.rect(0, -s * 0.26, s, s * 0.26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = o.locked ? '#d8b25e' : '#8fd8a0';
    ctx.beginPath();
    ctx.rect(x - s * 0.09, y - s * 0.42, s * 0.18, s * 0.2);
    ctx.fill();
  },
  urn(ctx, o, x, y, s) {
    ctx.fillStyle = '#8a6f56';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, y - s * 0.95);
    ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.55, x - s * 0.3, y);
    ctx.lineTo(x + s * 0.3, y);
    ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.55, x + s * 0.18, y - s * 0.95);
    ctx.closePath();
    ctx.fill();
    if (o.broken) {
      ctx.strokeStyle = 'rgba(20, 10, 0, 0.75)';
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.05, y - s * 0.9);
      ctx.lineTo(x + s * 0.12, y - s * 0.55);
      ctx.lineTo(x - s * 0.1, y - s * 0.3);
      ctx.lineTo(x + s * 0.05, y - s * 0.05);
      ctx.stroke();
    }
  },
  vine(ctx, o, x, y, s) {
    box(ctx, x, y, s * 0.6, s * 0.38, '#7a4b34', 'rgba(0,0,0,0.3)');
    ctx.fillStyle = o.wet > 0.05 ? '#3b2a1c' : '#5a4432';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.38, s * 0.28, s * 0.07, 0, 0, TAU);
    ctx.fill();
    const grown = (o.height ?? 0) * (s / 0.5) * 1.0;
    if (grown <= 0.5) return;
    ctx.strokeStyle = '#6fbf54';
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.4);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      ctx.lineTo(x + Math.sin(t * 6) * s * 0.16, y - s * 0.4 - grown * t);
    }
    ctx.stroke();
    ctx.fillStyle = '#8ede6a';
    for (let i = 1; i <= 4; i++) {
      const t = i / 4.5;
      const lx = x + Math.sin(t * 6) * s * 0.16;
      const ly = y - s * 0.4 - grown * t;
      ctx.beginPath();
      ctx.ellipse(lx + (i % 2 ? s * 0.16 : -s * 0.16), ly, s * 0.15, s * 0.07, i % 2 ? -0.5 : 0.5, 0, TAU);
      ctx.fill();
    }
  },
  pixie(ctx, o, x, y, s, t) {
    const g = ctx.createRadialGradient(x, y - s * 0.5, 0, x, y - s * 0.5, s * 1.6);
    g.addColorStop(0, 'rgba(190, 255, 235, 0.95)');
    g.addColorStop(1, 'rgba(120, 255, 210, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.5, s * 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(220, 255, 250, 0.85)';
    const flap = Math.sin(t * 22 + o.phase) * 0.5 + 0.7;
    ctx.beginPath();
    ctx.ellipse(x - s * 0.34, y - s * 0.62, s * 0.3, s * 0.16 * flap, -0.6, 0, TAU);
    ctx.ellipse(x + s * 0.34, y - s * 0.62, s * 0.3, s * 0.16 * flap, 0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#eafff8';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.5, s * 0.22, 0, TAU);
    ctx.fill();
  },
  lantern(ctx, o, x, y, s, t) {
    const w = s * 0.58;
    const hgt = s * 0.72;
    ctx.fillStyle = o.lit ? 'rgba(255, 210, 130, 0.22)' : 'rgba(40, 32, 58, 0.75)';
    ctx.beginPath();
    ctx.rect(x - w / 2, y - hgt, w, hgt);
    ctx.fill();
    if (o.lit) flame(ctx, x, y - s * 0.22, s * 0.18, t, o.phase);
    ctx.strokeStyle = '#b08c4a';
    ctx.lineWidth = Math.max(1, s * 0.055);
    ctx.lineJoin = 'round';
    ctx.strokeRect(x - w / 2, y - hgt, w, hgt);
    ctx.beginPath();
    for (const dx of [-w / 2, 0, w / 2]) {
      ctx.moveTo(x + dx, y - hgt);
      ctx.lineTo(x + dx, y);
    }
    // Cap and handle.
    ctx.moveTo(x - w * 0.62, y - hgt);
    ctx.lineTo(x, y - hgt - s * 0.16);
    ctx.lineTo(x + w * 0.62, y - hgt);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - hgt - s * 0.2, s * 0.13, Math.PI, 0);
    ctx.stroke();
  },
  rope(ctx, o, x, y, s, t, view) {
    const top = view.project(o.x, ROOM.top, o.z);
    ctx.strokeStyle = '#8c7856';
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    if (o.cut) {
      ctx.lineTo(x, y - s * 0.5);
      ctx.stroke();
      return;
    }
    ctx.lineTo(x, y);
    ctx.stroke();
  },
  basin(ctx, o, x, y, s) {
    const rim = y - s * 0.62;
    // The bowl: an outer wall down to a rounded bottom.
    ctx.fillStyle = '#5a5270';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, rim);
    ctx.quadraticCurveTo(x, y + s * 0.18, x + s * 0.6, rim);
    ctx.closePath();
    ctx.fill();
    // The hollow, dark or full of water.
    ctx.fillStyle = o.wet > 0.05 ? 'rgba(92, 200, 255, 0.8)' : '#221c33';
    ctx.beginPath();
    ctx.ellipse(x, rim, s * 0.52, s * 0.19, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7b7194';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(x, rim, s * 0.6, s * 0.21, 0, 0, TAU);
    ctx.stroke();
  },
  rune(ctx, o, x, y, s, t) {
    const pulse = 0.65 + Math.sin(t * 2) * 0.2;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#d7b6ff';
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.shadowColor = '#d7b6ff';
    ctx.shadowBlur = s * 0.6;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.5, s * 0.45, 0, TAU);
    ctx.moveTo(x - s * 0.3, y - s * 0.2);
    ctx.lineTo(x, y - s * 0.95);
    ctx.lineTo(x + s * 0.3, y - s * 0.2);
    ctx.moveTo(x - s * 0.18, y - s * 0.5);
    ctx.lineTo(x + s * 0.18, y - s * 0.5);
    ctx.stroke();
    ctx.restore();
  },
  vane(ctx, o, x, y, s, t) {
    const spin = o.spun * TAU + (o.spun ? Math.sin(t * 3) * 0.3 : 0);
    ctx.save();
    ctx.translate(x, y - s * 0.5);
    ctx.rotate(spin);
    ctx.fillStyle = '#c8b36a';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.5, -s * 0.16);
      ctx.lineTo(s * 0.5, s * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
};

function overlays(ctx, o, x, y, s, t) {
  if (o.frozen > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, o.frozen / 2) * 0.55;
    ctx.fillStyle = '#a7ecff';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.45, s * 0.62, s * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#eaffff';
    ctx.lineWidth = Math.max(1, s * 0.04);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.45);
      ctx.lineTo(x + Math.cos(a) * s * 0.6, y - s * 0.45 + Math.sin(a) * s * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (o.caged) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 176, 224, 0.85)';
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.shadowColor = '#ffb0e0';
    ctx.shadowBlur = s * 0.4;
    const r = s * 0.75;
    ctx.strokeRect(x - r, y - s * 0.45 - r, r * 2, r * 2);
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - r + (r * 2 * i) / 4, y - s * 0.45 - r);
      ctx.lineTo(x - r + (r * 2 * i) / 4, y - s * 0.45 + r);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (o.slowed > 0) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#8fe3d8';
    ctx.lineWidth = Math.max(1, s * 0.035);
    for (let i = 0; i < 2; i++) {
      const p = ((t * 0.4 + i * 0.5) % 1);
      ctx.globalAlpha = 0.45 * (1 - p);
      ctx.beginPath();
      ctx.arc(x, y - s * 0.45, s * (0.4 + p * 0.8), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (o.wet > 0.05 && !o.fillable) {
    ctx.save();
    ctx.globalAlpha = 0.5 * o.wet;
    ctx.fillStyle = '#5cc8ff';
    for (let i = 0; i < 3; i++) {
      const dx = ((i * 0.37 + t * 0.2) % 1 - 0.5) * s;
      ctx.beginPath();
      ctx.ellipse(x + dx, y - s * 0.05, s * 0.05, s * 0.09, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawObjects(ctx, view, world, t, highlight) {
  const list = world.objects.filter((o) => o.seen).sort((a, b) => b.z - a.z);
  for (const o of list) {
    const p = view.project(o.x, o.y, o.z);
    const s = p.scale * o.size * o.scale;
    if (s < 2 || p.x < -300 || p.x > view.w + 300) continue;
    const base = p.y; // every sprite is drawn upwards from where it stands

    // Things that sit at head height need something to sit on.
    if (o.plinth) {
      const foot = view.project(o.x, 0, o.z);
      ctx.fillStyle = view.palette.plinth;
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.42, base);
      ctx.lineTo(p.x + s * 0.42, base);
      ctx.lineTo(p.x + s * 0.3, foot.y);
      ctx.lineTo(p.x - s * 0.3, foot.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = view.palette.plinthTop;
      ctx.beginPath();
      ctx.ellipse(p.x, base, s * 0.42, s * 0.12, 0, 0, TAU);
      ctx.fill();
    }

    // Soft shadow for anything with floor under it.
    if (o.mass !== 'fixed' && o.y > 0.02) {
      const g = view.project(o.x, 0, o.z);
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, 0.3 - (o.y - o.baseY) * 0.15);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, s * 0.5, s * 0.16, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (highlight === o.id) {
      ctx.save();
      ctx.strokeStyle = 'rgba(232, 176, 74, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(p.x, base - s * 0.45, s * 0.9, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    const sprite = SPRITES[o.kind];
    if (sprite) sprite(ctx, o, p.x, base, s, t, view);
    overlays(ctx, o, p.x, base, s, t);
  }
}

// ---------- the wand ----------

// The grip sits below the bottom edge so the wand always reads as "in hand".
function grip(view) {
  const side = view.handed === 'left' ? -1 : 1;
  return { x: view.cx + side * view.w * 0.26, y: view.h + view.h * 0.16 };
}

function drawWand(ctx, view, tip, glow, color, t) {
  const g = grip(view);
  const len = Math.hypot(tip.x - g.x, tip.y - g.y) || 1;
  const nx = (tip.x - g.x) / len;
  const ny = (tip.y - g.y) / len;
  const px = -ny;
  const py = nx;
  // A gentle bow, so it looks like a carved stick rather than a ruler.
  const bow = Math.min(18, len * 0.04);
  const mid = { x: (g.x + tip.x) / 2 + px * bow, y: (g.y + tip.y) / 2 + py * bow };
  const buttW = Math.max(14, view.w * 0.058);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Taper: draw the wand as a filled shape from a wide handle to a fine tip.
  ctx.beginPath();
  ctx.moveTo(g.x + px * buttW, g.y + py * buttW);
  ctx.quadraticCurveTo(mid.x + px * buttW * 0.35, mid.y + py * buttW * 0.35, tip.x, tip.y);
  ctx.quadraticCurveTo(mid.x - px * buttW * 0.35, mid.y - py * buttW * 0.35, g.x - px * buttW, g.y - py * buttW);
  ctx.closePath();
  const wood = ctx.createLinearGradient(g.x, g.y, tip.x, tip.y);
  wood.addColorStop(0, '#3b2a1c');
  wood.addColorStop(0.55, '#6b4c30');
  wood.addColorStop(1, '#a8845a');
  ctx.fillStyle = wood;
  ctx.fill();

  // Highlight down one side.
  ctx.strokeStyle = 'rgba(255, 226, 180, 0.28)';
  ctx.lineWidth = Math.max(1, buttW * 0.16);
  ctx.beginPath();
  ctx.moveTo(g.x + px * buttW * 0.45, g.y + py * buttW * 0.45);
  ctx.quadraticCurveTo(mid.x + px * buttW * 0.18, mid.y + py * buttW * 0.18, tip.x, tip.y);
  ctx.stroke();

  // The light at the tip.
  const r = (14 + glow * 40) * (view.w / 420);
  const halo = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r);
  halo.addColorStop(0, rgba(color, 0.95));
  halo.addColorStop(0.35, rgba(color, 0.35));
  halo.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 2.2 + glow * 2.5 + Math.sin(t * 10) * 0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------- the stroke and the sigil ----------

// The line of light the tip leaves. Older points are thinner and dimmer, so
// the trail burns away behind you.
function drawTrail(ctx, points, now, color, { life = 0.85, width = 7 } = {}) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  for (let i = 1; i < points.length; i++) {
    const age = (now - points[i].t) / life;
    if (age >= 1) continue;
    const a = (1 - age) ** 1.5;
    ctx.globalAlpha = a * 0.85;
    ctx.shadowBlur = 14 * a;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (0.35 + a * 0.65);
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

// Draw part of a polyline: `from` and `to` are 0–1 along its length.
function drawPath(ctx, pts, from, to) {
  const n = pts.length;
  const a = Math.max(0, Math.min(1, from)) * (n - 1);
  const b = Math.max(0, Math.min(1, to)) * (n - 1);
  if (b <= a) return;
  ctx.beginPath();
  const lerp = (i) => {
    const k = Math.floor(i);
    const f = i - k;
    const p = pts[Math.min(n - 1, k)];
    const q = pts[Math.min(n - 1, k + 1)];
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
  };
  const start = lerp(a);
  ctx.moveTo(start.x, start.y);
  for (let i = Math.ceil(a); i <= Math.floor(b); i++) ctx.lineTo(pts[i].x, pts[i].y);
  const end = lerp(b);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

/**
 * The payoff: the scrawl the player drew is replaced by the clean glyph, which
 * draws itself in, flares, and then flies to whatever it was aimed at.
 * `age` is seconds since the spell landed.
 */
export function drawSigil(ctx, sigil, age) {
  const { points, color, target } = sigil;
  const DRAW = 0.3;
  const HOLD = 0.35;
  const FLY = 0.45;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.strokeStyle = color;

  if (age < DRAW) {
    const t = age / DRAW;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 6;
    drawPath(ctx, points, 0, t);
  } else if (age < DRAW + HOLD) {
    const t = (age - DRAW) / HOLD;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 18 + 26 * Math.sin(t * Math.PI);
    ctx.lineWidth = 6 + 4 * Math.sin(t * Math.PI);
    drawPath(ctx, points, 0, 1);
  } else if (target) {
    // Shrink the whole sigil towards the thing it was cast at.
    const t = Math.min(1, (age - DRAW - HOLD) / FLY);
    const e = t * t;
    ctx.globalAlpha = 1 - e;
    ctx.shadowBlur = 24;
    ctx.lineWidth = 6 * (1 - e * 0.8);
    const moved = points.map((p) => ({ x: p.x + (target.x - p.x) * e, y: p.y + (target.y - p.y) * e }));
    drawPath(ctx, moved, 0, 1);
  } else {
    const t = Math.min(1, (age - DRAW - HOLD) / FLY);
    ctx.globalAlpha = 1 - t;
    ctx.shadowBlur = 24;
    ctx.lineWidth = 6 * (1 + t);
    drawPath(ctx, points, 0, 1);
  }
  ctx.restore();
}

export const SIGIL_SECONDS = 1.1;

/** Draw one glyph fitted into a box — used by the spellbook and the hints. */
export function drawGlyph(ctx, points, cx, cy, size, { color = '#e8b04a', width = 3, progress = 1, arrow = true } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const k = size / Math.max(maxX - minX, maxY - minY, 0.001);
  const ox = cx - ((minX + maxX) / 2) * k;
  const oy = cy - ((minY + maxY) / 2) * k;
  const pts = points.map((p) => ({ x: ox + p.x * k, y: oy + p.y * k }));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 2.5;
  // The whole shape stays faintly visible while the stroke retraces it, so
  // the card reads at a glance and still shows which way round to draw.
  if (progress < 0.999) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.shadowBlur = 0;
    drawPath(ctx, pts, 0, 1);
    ctx.restore();
  }
  drawPath(ctx, pts, 0, progress);
  // A dot where the stroke starts and a head where it ends: the glyph is
  // useless if you do not know which way round to draw it.
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, width * 1.1, 0, TAU);
  ctx.fill();
  if (arrow && progress >= 0.999) {
    const a = pts[pts.length - 1];
    const b = pts[Math.max(0, pts.length - 4)];
    const ang = Math.atan2(a.y - b.y, a.x - b.x);
    ctx.translate(a.x, a.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(width * 2.2, 0);
    ctx.lineTo(-width * 1.4, -width * 1.5);
    ctx.lineTo(-width * 1.4, width * 1.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export { drawRoom, drawObjects, drawWand, drawTrail, grip };

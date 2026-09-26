// Everything drawn on the canvas: the chamber in perspective, the things in
// it, the wand in your hand and the light it leaves behind.
//
// The camera stands at the origin at eye height looking down +z, so the
// projection is the textbook one: divide by depth. One `scale` per object
// (focal / z) sizes its sprite, so a crate shoved backwards really does get
// smaller.

import { EYE } from './scene.js';

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

  // The palette depends on both the place and the look the player chose.
  paletteFor(world) {
    return paletteFor(world, this.hallows);
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
const channels = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
// Positive t lightens towards white, negative darkens towards black.
const shade = (hex, t) => toHex(channels(hex).map((v) => (t < 0 ? v * (1 + t) : v + (255 - v) * t)));

// A room's whole palette comes from a base stone colour plus an accent, so a
// new place needs four colours rather than twenty. Anything can be pinned by
// naming it directly.
function palette({ base, accent, warm, tip, trail, ...pinned }) {
  return {
    void: shade(base, -0.74),
    ceiling: shade(base, -0.45),
    left: shade(base, -0.12),
    right: base,
    back: shade(base, 0.12),
    floor: shade(base, -0.6),
    beamDark: shade(base, -0.66),
    beamFace: shade(base, -0.3),
    ledge: shade(base, 0.05),
    ledgeFace: shade(base, -0.2),
    ledgeEdge: rgba(accent, 0.2),
    course: 'rgba(255, 245, 220, 0.05)',
    tile: rgba(accent, 0.09),
    plinth: shade(base, -0.26),
    plinthTop: shade(base, -0.04),
    glass: rgba(accent, 0.1),
    accent,
    warm: channels(warm).join(', '),
    tip,
    trail,
    ...pinned,
  };
}

// Each place in two lights: Hallows is candle gold, Classic is cold blue
// witch-light. Both are night — the wand has to be the brightest thing here.
const PALETTES = {
  crypt: {
    hallows: palette({ base: '#281c42', accent: '#e8b04a', warm: '#ffbe6e', tip: '#ffd98a', trail: '#ffe6a8', void: '#070510', back: '#332552' }),
    classic: palette({ base: '#182742', accent: '#78c8ff', warm: '#78beff', tip: '#bfe4ff', trail: '#d8f0ff', void: '#04070e', back: '#1f3152' }),
  },
  soot: {
    hallows: palette({ base: '#2e2434', accent: '#e8a04a', warm: '#ffb066', tip: '#ffd08a', trail: '#ffe2ab' }),
    classic: palette({ base: '#22303c', accent: '#8ecfe8', warm: '#8fc8ff', tip: '#c6e8ff', trail: '#dcf2ff' }),
  },
  oak: {
    hallows: palette({ base: '#3a2b44', accent: '#e8c05a', warm: '#ffc878', tip: '#ffdf9a', trail: '#ffeec0' }),
    classic: palette({ base: '#26374e', accent: '#9fd8ff', warm: '#8fc4ff', tip: '#c9e9ff', trail: '#e0f4ff' }),
  },
  vellum: {
    hallows: palette({ base: '#34283c', accent: '#d8b46a', warm: '#f0c886', tip: '#ffe0a8', trail: '#ffeeca' }),
    classic: palette({ base: '#243144', accent: '#a8cfe8', warm: '#96c4e8', tip: '#cfe9fa', trail: '#e4f4ff' }),
  },
  moss: {
    hallows: palette({ base: '#26362e', accent: '#9ad06a', warm: '#c6ff8a', tip: '#d8ffa8', trail: '#e8ffc8' }),
    classic: palette({ base: '#1e3040', accent: '#7fd8c8', warm: '#86d8e8', tip: '#c0f2ee', trail: '#d8faf6' }),
  },
};

export function paletteFor(world, hallows) {
  const set = PALETTES[world?.room?.palette] || PALETTES.crypt;
  return hallows ? set.hallows : set.classic;
}

const roomOf = (world) => world?.room || { half: 2.6, top: 2.6, near: 0.6, far: 5.5 };

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

function lines(ctx, view, colour, segments, width = 1) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  for (const [a, b] of segments) {
    const p = view.project(...a);
    const q = view.project(...b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
}

// A field of stars, seeded so they do not crawl between frames.
function starfield(ctx, view, { half, top }, z0, z1, count, t) {
  let seed = 9871;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const x = (rnd() * 2 - 1) * half * 1.4;
    const z = z0 + rnd() * (z1 - z0);
    const p = view.project(x, top, z);
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.7 + i));
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = i % 9 === 0 ? '#ffe6a8' : '#e8f0ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.6, p.scale * 0.006), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- the backdrops ----------
//
// Every place is a box of floor, ceiling and walls; a backdrop adds the
// handful of shapes that make it that place rather than any other.

const BACKDROPS = {
  chamber(ctx, view, world, c) {
    const { half, top, near, far } = roomOf(world);
    for (let z = 1.2; z <= far; z += 0.95) {
      quad(ctx, view, [[-half, top, z], [half, top, z], [half, top - 0.16, z + 0.02], [-half, top - 0.16, z + 0.02]], c.beamDark);
      quad(ctx, view, [[-half, top - 0.16, z + 0.02], [half, top - 0.16, z + 0.02], [half, top - 0.16, z + 0.2], [-half, top - 0.16, z + 0.2]], c.beamFace);
    }
    // The ledge the vine is meant to reach.
    quad(ctx, view, [[0.45, 1.95, 2.5], [half, 1.95, 2.5], [half, 1.95, 3.6], [0.45, 1.95, 3.6]], c.ledge);
    quad(ctx, view, [[0.45, 1.82, 2.5], [half, 1.82, 2.5], [half, 1.95, 2.5], [0.45, 1.95, 2.5]], c.ledgeFace, c.ledgeEdge);
    void near;
  },

  // A station: brick wall and canopy on the left, the track and a long dark
  // train on the right, running away into the fog.
  platform(ctx, view, world, c, t) {
    const { half, top, far } = roomOf(world);
    // Canopy posts and rafters.
    for (let z = 1.6; z <= far - 0.5; z += 1.6) {
      quad(ctx, view, [[-half + 0.3, 0, z], [-half + 0.45, 0, z], [-half + 0.45, top, z], [-half + 0.3, top, z]], c.beamDark);
      quad(ctx, view, [[-half, top - 0.12, z], [half, top - 0.12, z], [half, top - 0.12, z + 0.22], [-half, top - 0.12, z + 0.22]], c.beamFace);
    }
    // The platform edge, and the track below it.
    const edge = half - 1.35;
    quad(ctx, view, [[edge, 0, 0.6], [half, -0.5, 0.6], [half, -0.5, far], [edge, 0, far]], shade(c.floor, -0.3));
    lines(ctx, view, rgba(c.accent, 0.35), [[[edge, 0.015, 0.6], [edge, 0.015, far]]], 2);
    for (let z = 1.0; z < far; z += 0.5) lines(ctx, view, 'rgba(255,255,255,0.05)', [[[edge + 0.15, -0.12, z], [half, -0.12, z + 0.1]]], 1);

    // The train: a long body with lit windows, from halfway back to the fog.
    const body = [[edge + 0.35, 0.35, 2.4], [half, 0.35, 2.4], [half, 2.35, 2.4], [edge + 0.35, 2.35, 2.4]];
    quad(ctx, view, [[edge + 0.35, 0.35, 2.4], [edge + 0.35, 2.35, 2.4], [edge + 0.35, 2.35, far], [edge + 0.35, 0.35, far]], shade(c.base || c.right, -0.35));
    quad(ctx, view, body, shade(c.right, -0.2));
    for (let z = 2.6; z < far - 0.4; z += 0.85) {
      const glow = 0.28 + 0.1 * Math.sin(t * 0.6 + z);
      quad(ctx, view, [[edge + 0.34, 1.15, z], [edge + 0.34, 1.85, z], [edge + 0.34, 1.85, z + 0.5], [edge + 0.34, 1.15, z + 0.5]], `rgba(255, 214, 150, ${glow})`);
    }
    // A stripe along the carriage, and the roof line.
    quad(ctx, view, [[edge + 0.33, 0.78, 2.4], [edge + 0.33, 0.94, 2.4], [edge + 0.33, 0.94, far], [edge + 0.33, 0.78, far]], rgba(c.accent, 0.5));
    quad(ctx, view, [[edge + 0.35, 2.35, 2.4], [half, 2.35, 2.4], [half, 2.5, far], [edge + 0.35, 2.5, far]], shade(c.ceiling, 0.06));

    // Steam drifting up between the platform and the train.
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const z = 2.6 + ((i * 1.7 + t * 0.35) % (far - 3));
      const p = view.project(edge + 0.1, 0.3 + ((t * 0.5 + i) % 2) * 0.7, z);
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#e8e2f0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.scale * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },

  // A very long, very tall hall: two refectory tables, arched windows, and a
  // ceiling that turns into weather once someone reveals it.
  hall(ctx, view, world, c, t) {
    const { half, top, far } = roomOf(world);
    const sky = world.objects?.find((o) => o.id === 'sky');
    if (sky?.seen) {
      quad(ctx, view, [[-half, top, 1.0], [half, top, 1.0], [half, top, far], [-half, top, far]], '#060a1c');
      starfield(ctx, view, { half, top }, 1.2, far, 90, t);
    } else {
      // Ribbed vaulting.
      for (let z = 1.4; z <= far; z += 1.3) {
        quad(ctx, view, [[-half, top, z], [half, top, z], [half, top - 0.2, z + 0.03], [-half, top - 0.2, z + 0.03]], c.beamDark);
      }
    }
    // Tall arched windows down both walls.
    for (let z = 2.0; z < far - 1; z += 1.8) {
      for (const side of [-1, 1]) {
        const x = side * (half - 0.02);
        quad(ctx, view, [[x, 1.6, z], [x, 3.9, z], [x, 3.9, z + 0.9], [x, 1.6, z + 0.9]], rgba(c.accent, 0.08));
        lines(ctx, view, rgba(c.accent, 0.22), [[[x, 1.6, z + 0.45], [x, 3.9, z + 0.45]]], 1);
      }
    }
    // Two long tables with benches, running away from you.
    for (const side of [-1, 1]) {
      const x0 = side * 0.85;
      const x1 = side * 2.35;
      quad(ctx, view, [[x0, 0.78, 2.2], [x1, 0.78, 2.2], [x1, 0.78, far - 1.4], [x0, 0.78, far - 1.4]], shade(c.ledge, 0.1));
      quad(ctx, view, [[x0, 0.66, 2.2], [x1, 0.66, 2.2], [x1, 0.78, 2.2], [x0, 0.78, 2.2]], shade(c.ledge, -0.2), c.ledgeEdge);
      quad(ctx, view, [[side * 2.7, 0.42, 2.4], [side * 3.1, 0.42, 2.4], [side * 3.1, 0.42, far - 1.6], [side * 2.7, 0.42, far - 1.6]], shade(c.ledge, -0.1));
    }
    // A raised dais at the far end, under the hearth.
    quad(ctx, view, [[-half, 0.3, far - 1.1], [half, 0.3, far - 1.1], [half, 0.3, far], [-half, 0.3, far]], shade(c.floor, 0.14));
    quad(ctx, view, [[-half, 0, far - 1.1], [half, 0, far - 1.1], [half, 0.3, far - 1.1], [-half, 0.3, far - 1.1]], shade(c.floor, 0.05), c.ledgeEdge);
  },

  // Bookcases to the ceiling on both sides, and a floor of old boards.
  stacks(ctx, view, world, c) {
    const { half, top, far } = roomOf(world);
    for (const side of [-1, 1]) {
      const x = side * (half - 0.05);
      for (let shelf = 0.5; shelf < top - 0.3; shelf += 0.62) {
        quad(ctx, view, [[x, shelf, 1.0], [x, shelf + 0.06, 1.0], [x, shelf + 0.06, far], [x, shelf, far]], shade(c.ledge, -0.12));
        // Spines: a run of narrow bands of slightly different colours.
        for (let z = 1.1; z < far - 0.2; z += 0.14) {
          const k = (Math.sin(z * 31.7 + shelf * 13.3 + side) + 1) / 2;
          quad(ctx, view, [[x, shelf + 0.06, z], [x, shelf + 0.06 + 0.42 * (0.7 + k * 0.3), z], [x, shelf + 0.06 + 0.42 * (0.7 + k * 0.3), z + 0.1], [x, shelf + 0.06, z + 0.1]], shade(k > 0.6 ? c.accent : c.ledgeFace, -0.45 + k * 0.3));
        }
      }
      quad(ctx, view, [[x, 0, 1.0], [x, 0.5, 1.0], [x, 0.5, far], [x, 0, far]], shade(c.left, -0.2));
    }
    // Floorboards running away, and a dark beamed ceiling.
    for (let x = -half; x <= half; x += 0.42) lines(ctx, view, 'rgba(0,0,0,0.18)', [[[x, 0.01, 1.0], [x, 0.01, far]]], 1);
    quad(ctx, view, [[-half, top, 1.0], [half, top, 1.0], [half, top, far], [-half, top, far]], shade(c.void, 0.04));
  },

  // A glasshouse: brick to waist height, glass all the way over, and a cold
  // clear night on the other side of it.
  glasshouse(ctx, view, world, c, t) {
    const { half, top, far } = roomOf(world);
    // Night through the glass roof.
    quad(ctx, view, [[-half, top, 1.0], [half, top, 1.0], [half, top, far], [-half, top, far]], '#070c18');
    starfield(ctx, view, { half, top }, 1.2, far, 70, t);
    const moon = view.project(-1.3, top, far - 1.2);
    const g = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.scale * 0.55);
    g.addColorStop(0, 'rgba(255, 250, 230, 0.9)');
    g.addColorStop(0.35, 'rgba(230, 240, 255, 0.35)');
    g.addColorStop(1, 'rgba(200, 220, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.scale * 0.55, 0, TAU);
    ctx.fill();
    // Glazing bars across the roof and up the walls.
    const bars = [];
    for (let z = 1.0; z <= far; z += 0.7) {
      bars.push([[-half, top, z], [half, top, z]]);
      bars.push([[-half, 1.0, z], [-half, top, z]]);
      bars.push([[half, 1.0, z], [half, top, z]]);
    }
    for (const x of [-half * 0.5, 0, half * 0.5]) bars.push([[x, top, 1.0], [x, top, far]]);
    lines(ctx, view, rgba(c.accent, 0.3), bars, 1.5);
    // Glass walls above the brick, brick below.
    for (const side of [-1, 1]) {
      const x = side * (half - 0.02);
      quad(ctx, view, [[x, 1.0, 1.0], [x, top, 1.0], [x, top, far], [x, 1.0, far]], c.glass);
      quad(ctx, view, [[x, 0, 1.0], [x, 1.0, 1.0], [x, 1.0, far], [x, 0, far]], shade(c.left, -0.12));
    }
    // Planting benches down both sides.
    for (const side of [-1, 1]) {
      quad(ctx, view, [[side * 1.35, 0.72, 1.8], [side * (half - 0.1), 0.72, 1.8], [side * (half - 0.1), 0.72, far - 0.6], [side * 1.35, 0.72, far - 0.6]], shade(c.ledge, -0.05));
      quad(ctx, view, [[side * 1.35, 0.6, 1.8], [side * (half - 0.1), 0.6, 1.8], [side * (half - 0.1), 0.72, 1.8], [side * 1.35, 0.72, 1.8]], shade(c.ledge, -0.28), c.ledgeEdge);
    }
  },
};

function drawRoom(ctx, view, world) {
  const { w, h } = view;
  const { half, top, near, far } = roomOf(world);
  const c = view.paletteFor(world);
  const lit = world.objects.reduce((n, o) => n + (o.lit ? 1 : 0), 0);

  ctx.fillStyle = c.void;
  ctx.fillRect(0, 0, w, h);

  // Ceiling, then the two side walls, then the back wall, then the floor:
  // painting them far-to-near means the near edges overlap cleanly.
  quad(ctx, view, [[-half, top, near], [half, top, near], [half, top, far], [-half, top, far]], c.ceiling);
  quad(ctx, view, [[-half, 0, near], [-half, top, near], [-half, top, far], [-half, 0, far]], c.left);
  quad(ctx, view, [[half, 0, near], [half, top, near], [half, top, far], [half, 0, far]], c.right);
  quad(ctx, view, [[-half, 0, far], [-half, top, far], [half, top, far], [half, 0, far]], c.back);
  quad(ctx, view, [[-half, 0, near], [half, 0, near], [half, 0, far], [-half, 0, far]], c.floor);

  // Stone courses on the walls, flags on the floor.
  const courses = [];
  for (let y = 0.42; y < top; y += 0.42) {
    courses.push([[-half, y, far], [half, y, far]]);
    courses.push([[-half, y, near], [-half, y, far]]);
    courses.push([[half, y, near], [half, y, far]]);
  }
  const floor = [];
  const step = Math.max(0.5, half / 4);
  for (let x = -half; x <= half + 0.01; x += step) floor.push([[x, 0, near], [x, 0, far]]);
  for (let z = near; z <= far + 0.01; z += 0.65) floor.push([[-half, 0, z], [half, 0, z]]);
  lines(ctx, view, c.course, courses);
  lines(ctx, view, c.tile, floor);

  (BACKDROPS[roomOf(world).backdrop] || BACKDROPS.chamber)(ctx, view, world, c, world.time);

  // Everything alight warms the room, and the dark closes in at the edges.
  if (lit) {
    const g = ctx.createRadialGradient(view.cx, view.horizon, 0, view.cx, view.horizon, Math.max(w, h) * 0.85);
    g.addColorStop(0, `rgba(${c.warm}, ${Math.min(0.15, 0.05 * lit)})`);
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
  rope(ctx, o, x, y, s, t, view, world) {
    const top = view.project(o.x, (world?.room?.top ?? 2.6), o.z);
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

  // ---------- the hidden platform ----------

  stationlamp(ctx, o, x, y, s, t) {
    // A lamp on a curved iron bracket off the wall.
    ctx.strokeStyle = '#4a4053';
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.lineCap = 'round';
    // A post up from the platform, and a curved bracket off the top of it.
    ctx.beginPath();
    ctx.moveTo(x - s * 0.85, y + s * 3.6);
    ctx.lineTo(x - s * 0.85, y - s * 1.25);
    ctx.quadraticCurveTo(x - s * 0.55, y - s * 1.45, x, y - s * 1.0);
    ctx.stroke();
    // The glass: a tapered lantern hanging off the end.
    ctx.fillStyle = o.lit ? 'rgba(255, 216, 150, 0.3)' : 'rgba(40, 36, 52, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.34, y - s * 0.9);
    ctx.lineTo(x + s * 0.34, y - s * 0.9);
    ctx.lineTo(x + s * 0.22, y);
    ctx.lineTo(x - s * 0.22, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6d6278';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#4a4053';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.93, s * 0.42, s * 0.1, 0, 0, TAU);
    ctx.fill();
    if (o.lit) {
      flame(ctx, x, y - s * 0.32, s * 0.24, t, o.phase);
      const g = ctx.createRadialGradient(x, y - s * 0.45, 0, x, y - s * 0.45, s * 3.4);
      g.addColorStop(0, 'rgba(255, 210, 140, 0.3)');
      g.addColorStop(1, 'rgba(255, 210, 140, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.45, s * 3.4, 0, TAU);
      ctx.fill();
    }
  },

  brickwall(ctx, o, x, y, s, t, view, world, c) {
    // A patch of wall, drawn a shade proud of the one behind it so there is
    // somewhere obvious to aim.
    const h = s * 1.5;
    ctx.fillStyle = shade(c.left, 0.05);
    ctx.fillRect(x - s * 0.6, y - h, s * 1.2, h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    for (let i = 1; i < 8; i++) {
      const by = y - (h * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, by);
      ctx.lineTo(x + s * 0.6, by);
      ctx.stroke();
      const offset = i % 2 ? s * 0.2 : -s * 0.2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(x + offset + k * s * 0.4, by);
        ctx.lineTo(x + offset + k * s * 0.4, by + h / 8);
        ctx.stroke();
      }
    }
  },

  archway(ctx, o, x, y, s, t, view, world, c) {
    const h = s * 1.55;
    const w = s * 0.62;
    ctx.save();
    // The dark on the other side, and a cold draught of light from it.
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w, y - h * 0.55);
    ctx.quadraticCurveTo(x, y - h * 1.15, x + w, y - h * 0.55);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fillStyle = o.open ? '#05060c' : shade(c.left, -0.25);
    ctx.fill();
    if (o.open) {
      const g = ctx.createRadialGradient(x, y - h * 0.5, 0, x, y - h * 0.5, w * 2.4);
      g.addColorStop(0, 'rgba(150, 190, 255, 0.28)');
      g.addColorStop(1, 'rgba(150, 190, 255, 0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.strokeStyle = o.locked ? rgba(c.accent, 0.5) : rgba(c.accent, 0.9);
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.stroke();
    // A keystone, with a keyhole in it while it is still sealed.
    ctx.fillStyle = shade(c.accent, -0.3);
    ctx.beginPath();
    ctx.ellipse(x, y - h * 1.02, w * 0.22, w * 0.3, 0, 0, TAU);
    ctx.fill();
    if (o.locked) {
      ctx.fillStyle = '#12101c';
      ctx.beginPath();
      ctx.arc(x, y - h * 1.02, w * 0.1, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },

  trunk(ctx, o, x, y, s) {
    const h = s * 0.7;
    box(ctx, x, y, s, h, '#5b3b28', 'rgba(0,0,0,0.45)');
    // Lid, straps and corner brasses.
    ctx.fillStyle = '#6d4830';
    ctx.fillRect(x - s / 2, y - h - s * 0.16, s, s * 0.18);
    ctx.fillStyle = '#c8a45e';
    for (const dx of [-s * 0.28, s * 0.28]) ctx.fillRect(x + dx - s * 0.05, y - h - s * 0.16, s * 0.1, h + s * 0.16);
    ctx.fillRect(x - s * 0.08, y - h * 0.62, s * 0.16, s * 0.18);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.strokeRect(x - s / 2, y - h - s * 0.16, s, s * 0.18);
  },

  trolley(ctx, o, x, y, s) {
    ctx.strokeStyle = '#7d7488';
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.lineCap = 'round';
    // Deck, uprights and handle.
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y - s * 0.28);
    ctx.lineTo(x + s * 0.55, y - s * 0.28);
    ctx.moveTo(x - s * 0.5, y - s * 0.28);
    ctx.lineTo(x - s * 0.5, y - s * 1.0);
    ctx.moveTo(x - s * 0.5, y - s * 1.0);
    ctx.lineTo(x - s * 0.1, y - s * 1.0);
    ctx.stroke();
    ctx.fillStyle = '#4e4658';
    ctx.fillRect(x - s * 0.55, y - s * 0.3, s * 1.1, s * 0.1);
    ctx.fillStyle = '#2a2434';
    for (const dx of [-s * 0.38, s * 0.38]) {
      ctx.beginPath();
      ctx.arc(x + dx, y - s * 0.12, s * 0.15, 0, TAU);
      ctx.fill();
    }
  },

  owlcage(ctx, o, x, y, s, t, view, world, c) {
    const h = s * 1.0;
    ctx.strokeStyle = shade(c.accent, -0.1);
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.fillStyle = 'rgba(20, 16, 30, 0.6)';
    ctx.beginPath();
    ctx.rect(x - s * 0.45, y - h, s * 0.9, h);
    ctx.fill();
    ctx.stroke();
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.45 + (s * 0.9 * i) / 5, y - h);
      ctx.lineTo(x - s * 0.45 + (s * 0.9 * i) / 5, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y - h, s * 0.2, Math.PI, 0);
    ctx.stroke();
    // The owl: two round eyes and a hunched body. It steps out once unlatched.
    const ox = o.locked ? x : x + s * 0.62;
    const oy = o.locked ? y - s * 0.3 : y - h * 1.15;
    ctx.fillStyle = '#b9a78c';
    ctx.beginPath();
    ctx.ellipse(ox, oy, s * 0.24, s * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff6dd';
    for (const dx of [-s * 0.1, s * 0.1]) {
      ctx.beginPath();
      ctx.arc(ox + dx, oy - s * 0.08, s * 0.08, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#2a2230';
    for (const dx of [-s * 0.1, s * 0.1]) {
      ctx.beginPath();
      ctx.arc(ox + dx, oy - s * 0.08, s * 0.04 * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + o.phase))), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#d8a24a';
    ctx.beginPath();
    ctx.moveTo(ox, oy + s * 0.02);
    ctx.lineTo(ox - s * 0.05, oy + s * 0.1);
    ctx.lineTo(ox + s * 0.05, oy + s * 0.1);
    ctx.fill();
  },

  whistle(ctx, o, x, y, s, t, view, world, c) {
    ctx.fillStyle = shade(c.accent, 0.1);
    ctx.beginPath();
    ctx.roundRect?.(x - s * 0.5, y - s * 0.28, s * 1.0, s * 0.3, s * 0.12);
    if (!ctx.roundRect) ctx.rect(x - s * 0.5, y - s * 0.28, s * 1.0, s * 0.3);
    ctx.fill();
    ctx.fillStyle = shade(c.accent, -0.25);
    ctx.fillRect(x - s * 0.18, y - s * 0.28, s * 0.1, s * 0.3);
    if (o.spun > 0) {
      // Three widening rings of sound.
      ctx.save();
      ctx.strokeStyle = rgba(c.accent, 0.8);
      ctx.lineWidth = Math.max(1, s * 0.06);
      for (let i = 0; i < 3; i++) {
        const k = (t * 1.6 + i * 0.33) % 1;
        ctx.globalAlpha = 0.7 * (1 - k);
        ctx.beginPath();
        ctx.arc(x + s * 0.6, y - s * 0.13, s * (0.3 + k * 1.6), -0.9, 0.9);
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  clock(ctx, o, x, y, s, t, view, world, c) {
    const r = s * 0.5;
    const cy = y - r;
    ctx.fillStyle = '#efe6d2';
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = shade(c.accent, -0.2);
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.stroke();
    ctx.strokeStyle = '#2a2230';
    ctx.lineWidth = Math.max(1, s * 0.03);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
      ctx.lineTo(x + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }
    // Hands. Slowed time really does slow them down.
    const rate = o.slowed > 0 ? 0.08 : 1;
    const minute = -Math.PI / 2 + t * 0.9 * rate;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, s * 0.055);
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + Math.cos(minute) * r * 0.78, cy + Math.sin(minute) * r * 0.78);
    ctx.moveTo(x, cy);
    ctx.lineTo(x + Math.cos(minute / 12 - 1.2) * r * 0.5, cy + Math.sin(minute / 12 - 1.2) * r * 0.5);
    ctx.stroke();
    // The bracket it hangs from.
    ctx.strokeStyle = shade(c.accent, -0.4);
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, cy - r);
    ctx.lineTo(x, cy - r * 1.7);
    ctx.stroke();
  },

  // ---------- the banquet hall ----------

  hearth(ctx, o, x, y, s, t, view, world, c) {
    const w = s * 1.1;
    const h = s * 1.35;
    // The stone surround, and the black of the chimney behind it.
    ctx.fillStyle = shade(c.ledge, 0.08);
    ctx.fillRect(x - w, y - h - s * 0.2, w * 2, h + s * 0.2);
    ctx.fillStyle = '#0a0710';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.7, y);
    ctx.lineTo(x - w * 0.7, y - h * 0.55);
    ctx.quadraticCurveTo(x, y - h * 1.05, x + w * 0.7, y - h * 0.55);
    ctx.lineTo(x + w * 0.7, y);
    ctx.closePath();
    ctx.fill();
    // Logs.
    ctx.fillStyle = '#4a3423';
    for (const dx of [-w * 0.3, 0, w * 0.3]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y - s * 0.1, w * 0.22, s * 0.08, 0.2, 0, TAU);
      ctx.fill();
    }
    if (o.lit) {
      flame(ctx, x, y - s * 0.08, s * 0.62, t, o.phase);
      flame(ctx, x - w * 0.34, y - s * 0.06, s * 0.38, t * 1.3, o.phase + 2);
      flame(ctx, x + w * 0.34, y - s * 0.06, s * 0.4, t * 0.85, o.phase + 4);
      const g = ctx.createRadialGradient(x, y - h * 0.4, 0, x, y - h * 0.4, s * 5);
      g.addColorStop(0, 'rgba(255, 180, 90, 0.26)');
      g.addColorStop(1, 'rgba(255, 180, 90, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - h * 0.4, s * 5, 0, TAU);
      ctx.fill();
    }
  },

  floatcandle(ctx, o, x, y, s, t) {
    // A tall taper. Floating ones drip wax that never lands.
    box(ctx, x, y, s * 0.26, s * 1.05, '#f2e8d2', 'rgba(0,0,0,0.2)');
    if (o.lit) flame(ctx, x, y - s * 1.08, s * 0.24, t, o.phase);
    if (o.held) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#f2e8d2';
      const drip = ((t * 0.5 + o.phase) % 1.6) / 1.6;
      ctx.beginPath();
      ctx.ellipse(x + s * 0.1, y + drip * s * 0.9, s * 0.05, s * 0.08, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  },

  chandelier(ctx, o, x, y, s, t, view, world, c) {
    const r = s * 0.75;
    const cy = y - s * 0.35;
    ctx.strokeStyle = shade(c.accent, -0.35);
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    // Chain up to the dark, then two iron hoops.
    ctx.beginPath();
    ctx.moveTo(x, cy - r * 1.4);
    ctx.lineTo(x, cy - r * 3.2);
    ctx.stroke();
    for (const [rr, yy] of [[r, cy], [r * 0.6, cy - r * 0.55]]) {
      ctx.beginPath();
      ctx.ellipse(x, yy, rr, rr * 0.3, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - r, cy);
    ctx.lineTo(x, cy - r * 1.4);
    ctx.lineTo(x + r, cy);
    ctx.stroke();
    // Candles round the rim.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = x + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.3;
      ctx.fillStyle = '#f2e8d2';
      ctx.fillRect(px - s * 0.05, py - s * 0.3, s * 0.1, s * 0.3);
      if (o.lit) flame(ctx, px, py - s * 0.32, s * 0.12, t * (1 + i * 0.07), o.phase + i);
    }
    if (o.lit) {
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, s * 4);
      g.addColorStop(0, 'rgba(255, 210, 140, 0.24)');
      g.addColorStop(1, 'rgba(255, 210, 140, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, cy, s * 4, 0, TAU);
      ctx.fill();
    }
  },

  goblet(ctx, o, x, y, s) {
    ctx.fillStyle = '#9aa0ac';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.34, y - s * 1.0);
    ctx.quadraticCurveTo(x, y - s * 0.35, x + s * 0.34, y - s * 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - s * 0.06, y - s * 0.42, s * 0.12, s * 0.32);
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.08, s * 0.26, s * 0.08, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = o.wet > 0.05 ? 'rgba(92, 200, 255, 0.85)' : '#2c2a36';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 1.0, s * 0.31, s * 0.1, 0, 0, TAU);
    ctx.fill();
  },

  armour(ctx, o, x, y, s, t, view, world, c) {
    const col = shade(c.ledge, 0.22);
    ctx.fillStyle = col;
    // Legs, body, pauldrons, helm.
    ctx.fillRect(x - s * 0.2, y - s * 0.5, s * 0.14, s * 0.5);
    ctx.fillRect(x + s * 0.06, y - s * 0.5, s * 0.14, s * 0.5);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.28, y - s * 0.5);
    ctx.lineTo(x - s * 0.34, y - s * 1.0);
    ctx.lineTo(x + s * 0.34, y - s * 1.0);
    ctx.lineTo(x + s * 0.28, y - s * 0.5);
    ctx.closePath();
    ctx.fill();
    for (const dx of [-s * 0.42, s * 0.42]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y - s * 1.0, s * 0.16, s * 0.12, 0, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(x, y - s * 1.2, s * 0.17, s * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0d0b14';
    ctx.fillRect(x - s * 0.12, y - s * 1.24, s * 0.24, s * 0.05);
    if (o.broken) {
      // A dent, and one pauldron hanging off.
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.2, y - s * 0.9);
      ctx.lineTo(x + s * 0.05, y - s * 0.72);
      ctx.lineTo(x - s * 0.12, y - s * 0.6);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x + s * 0.5, y - s * 0.12, s * 0.15, s * 0.1, 0.6, 0, TAU);
      ctx.fill();
    }
  },

  skyceiling(ctx, o, x, y, s, t) {
    // Only drawn once revealed: a soft hole in the stone with snow in it.
    ctx.save();
    ctx.globalAlpha = 0.5;
    const g = ctx.createRadialGradient(x, y - s * 0.3, 0, x, y - s * 0.3, s * 1.6);
    g.addColorStop(0, 'rgba(180, 210, 255, 0.35)');
    g.addColorStop(1, 'rgba(180, 210, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.3, s * 1.6, s * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 26; i++) {
      const k = (t * 0.18 + i * 0.137) % 1;
      const sx = x + Math.sin(i * 12.9 + t * 0.3) * s * 1.4;
      const sy = y - s * 0.9 + k * s * 2.4;
      ctx.globalAlpha = 0.8 * (1 - k);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.7, s * 0.022), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },

  // ---------- the shut stacks ----------

  bell(ctx, o, x, y, s, t, view, world, c) {
    const swing = o.ringing ? Math.sin(t * 13) * 0.28 : 0;
    ctx.save();
    ctx.translate(x, y - s * 1.1);
    ctx.rotate(swing);
    ctx.fillStyle = shade(c.accent, -0.05);
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, 0);
    ctx.lineTo(-s * 0.05, s * 0.2);
    ctx.quadraticCurveTo(-s * 0.55, s * 0.55, -s * 0.55, s * 0.95);
    ctx.lineTo(s * 0.55, s * 0.95);
    ctx.quadraticCurveTo(s * 0.55, s * 0.55, s * 0.05, s * 0.2);
    ctx.lineTo(s * 0.05, 0);
    ctx.fill();
    ctx.fillStyle = shade(c.accent, -0.4);
    ctx.beginPath();
    ctx.ellipse(0, s * 0.95, s * 0.55, s * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, s * 1.05, s * 0.1, 0, TAU);
    ctx.fill();
    ctx.restore();
    // The bracket, and the noise coming off it.
    ctx.strokeStyle = shade(c.accent, -0.5);
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.1);
    ctx.lineTo(x, y - s * 1.6);
    ctx.stroke();
    if (o.ringing) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 120, 110, 0.85)';
      ctx.lineWidth = Math.max(1, s * 0.07);
      for (let i = 0; i < 3; i++) {
        const k = (t * 2.4 + i * 0.33) % 1;
        ctx.globalAlpha = 0.8 * (1 - k);
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(x + dir * s * 0.6, y - s * 0.5, s * (0.3 + k * 1.3), dir > 0 ? -0.8 : Math.PI - 0.8, dir > 0 ? 0.8 : Math.PI + 0.8);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  },

  readlamp(ctx, o, x, y, s, t, view, world, c) {
    // A banker's lamp: a green shade on a brass stem.
    ctx.fillStyle = shade(c.accent, -0.2);
    ctx.fillRect(x - s * 0.05, y - s * 0.8, s * 0.1, s * 0.8);
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.3, s * 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = o.lit ? '#4fa06a' : '#2f5c44';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y - s * 0.78);
    ctx.quadraticCurveTo(x, y - s * 1.15, x + s * 0.55, y - s * 0.78);
    ctx.closePath();
    ctx.fill();
    if (o.lit) {
      const g = ctx.createRadialGradient(x, y - s * 0.7, 0, x, y - s * 0.7, s * 3.2);
      g.addColorStop(0, 'rgba(255, 226, 160, 0.35)');
      g.addColorStop(1, 'rgba(255, 226, 160, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.7, s * 3.2, 0, TAU);
      ctx.fill();
    }
  },

  desk(ctx, o, x, y, s, t, view, world, c) {
    ctx.fillStyle = shade(c.ledge, 0.05);
    ctx.fillRect(x - s * 0.7, y - s * 0.78, s * 1.4, s * 0.1);
    ctx.fillStyle = shade(c.ledge, -0.25);
    ctx.fillRect(x - s * 0.62, y - s * 0.68, s * 0.1, s * 0.68);
    ctx.fillRect(x + s * 0.52, y - s * 0.68, s * 0.1, s * 0.68);
    ctx.strokeStyle = c.ledgeEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - s * 0.7, y - s * 0.78, s * 1.4, s * 0.1);
  },

  grille(ctx, o, x, y, s, t, view, world, c) {
    const w = s * 0.62;
    const h = s * 0.95;
    ctx.save();
    // Swings up from its top edge when opened.
    ctx.translate(x, y - h);
    ctx.rotate(o.open ? -1.05 : 0);
    ctx.strokeStyle = shade(c.accent, -0.3);
    ctx.lineWidth = Math.max(1.5, s * 0.055);
    ctx.strokeRect(-w, 0, w * 2, h);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-w + (w * 2 * i) / 5, 0);
      ctx.lineTo(-w + (w * 2 * i) / 5, h);
      ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-w, (h * i) / 3);
      ctx.lineTo(w, (h * i) / 3);
      ctx.stroke();
    }
    ctx.fillStyle = o.locked ? shade(c.accent, 0) : '#8fd8a0';
    ctx.beginPath();
    ctx.arc(0, h * 0.5, s * 0.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  },

  book(ctx, o, x, y, s, t, view, world, c) {
    if (o.onDesk) {
      // Lying open on the desk, one page catching the lamp.
      ctx.fillStyle = '#e9e0c8';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.9, y);
      ctx.lineTo(x - s * 0.05, y - s * 0.16);
      ctx.lineTo(x + s * 0.9, y);
      ctx.lineTo(x + s * 0.05, y + s * 0.1);
      ctx.closePath();
      ctx.fill();
      if (o.read) {
        ctx.strokeStyle = 'rgba(80, 45, 20, 0.8)';
        ctx.lineWidth = Math.max(0.8, s * 0.025);
        for (let i = 0; i < 5; i++) {
          const ly = y - s * 0.1 + i * s * 0.05;
          ctx.beginPath();
          ctx.moveTo(x - s * 0.7 + i * s * 0.02, ly);
          ctx.lineTo(x - s * 0.15, ly - s * 0.03);
          ctx.moveTo(x + s * 0.15, ly - s * 0.03);
          ctx.lineTo(x + s * 0.7 - i * s * 0.02, ly);
          ctx.stroke();
        }
      }
      return;
    }
    // Standing on the shelf, spine out.
    box(ctx, x, y, s * 0.42, s * 0.85, '#6d2f2f', 'rgba(0,0,0,0.5)');
    ctx.fillStyle = shade(c.accent, 0.1);
    ctx.fillRect(x - s * 0.21, y - s * 0.66, s * 0.42, s * 0.05);
    ctx.fillRect(x - s * 0.21, y - s * 0.24, s * 0.42, s * 0.05);
    ctx.fillStyle = '#e9e0c8';
    ctx.fillRect(x + s * 0.21, y - s * 0.82, s * 0.06, s * 0.79);
  },

  chain(ctx, o, x, y, s, t, view, world) {
    const anchor = view.project(o.x, o.y + 0.55, o.z);
    ctx.strokeStyle = '#8d8798';
    ctx.lineWidth = Math.max(1.5, s * 0.16);
    ctx.setLineDash([Math.max(2, s * 0.22), Math.max(1.4, s * 0.12)]);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    if (o.cut) {
      ctx.lineTo((anchor.x + x) / 2, (anchor.y + y) / 2 - s * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.3);
      ctx.lineTo(x + s * 0.1, y - s * 0.2);
    } else {
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  },

  ladder(ctx, o, x, y, s, t, view, world, c) {
    const h = s * 2.1;
    ctx.strokeStyle = shade(c.ledge, 0.08);
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.28, y);
    ctx.lineTo(x - s * 0.16, y - h);
    ctx.moveTo(x + s * 0.28, y);
    ctx.lineTo(x + s * 0.16, y - h);
    ctx.stroke();
    for (let i = 1; i < 8; i++) {
      const k = i / 8;
      const ly = y - h * k;
      const w = s * (0.28 - 0.12 * k);
      ctx.beginPath();
      ctx.moveTo(x - w, ly);
      ctx.lineTo(x + w, ly);
      ctx.stroke();
    }
  },

  // ---------- the cold glasshouse ----------

  pane(ctx, o, x, y, s, t, view, world, c) {
    ctx.save();
    if (o.broken) {
      // A hole with a cold draught pouring through it.
      ctx.fillStyle = 'rgba(190, 220, 255, 0.16)';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, y - s * 0.4);
      ctx.lineTo(x + s * 0.1, y - s * 0.55);
      ctx.lineTo(x + s * 0.5, y + s * 0.1);
      ctx.lineTo(x - s * 0.2, y + s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 240, 255, 0.75)';
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.55, y - s * 0.45);
      ctx.lineTo(x + s * 0.05, y - s * 0.05);
      ctx.lineTo(x - s * 0.15, y + s * 0.35);
      ctx.moveTo(x + s * 0.05, y - s * 0.05);
      ctx.lineTo(x + s * 0.55, y + s * 0.15);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#cfe6ff';
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.6 + i * 0.17) % 1;
        ctx.beginPath();
        ctx.arc(x + Math.sin(i * 7 + t) * s * 0.3, y + k * s * 1.6, s * 0.06, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = rgba(c.accent, 0.14);
      ctx.fillRect(x - s * 0.55, y - s * 0.5, s * 1.1, s * 0.9);
      ctx.strokeStyle = rgba(c.accent, 0.5);
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.strokeRect(x - s * 0.55, y - s * 0.5, s * 1.1, s * 0.9);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.4, y + s * 0.3);
      ctx.lineTo(x + s * 0.2, y - s * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  },

  soilbed(ctx, o, x, y, s, t, view, world, c) {
    const w = s * 0.8;
    ctx.fillStyle = shade(c.ledge, -0.2);
    ctx.beginPath();
    ctx.moveTo(x - w, y - s * 0.45);
    ctx.lineTo(x + w, y - s * 0.45);
    ctx.lineTo(x + w * 0.88, y);
    ctx.lineTo(x - w * 0.88, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = o.iced ? '#b8dcea' : o.wet > 0.05 ? '#2e2016' : '#4a3626';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.45, w * 0.92, s * 0.16, 0, 0, TAU);
    ctx.fill();
    if (o.iced) {
      ctx.strokeStyle = '#eafcff';
      ctx.lineWidth = Math.max(1, s * 0.028);
      for (let i = 0; i < 7; i++) {
        const px = x - w * 0.8 + (i * w * 1.6) / 6;
        ctx.beginPath();
        ctx.moveTo(px, y - s * 0.55);
        ctx.lineTo(px + s * 0.06, y - s * 0.38);
        ctx.moveTo(px - s * 0.05, y - s * 0.45);
        ctx.lineTo(px + s * 0.05, y - s * 0.47);
        ctx.stroke();
      }
    } else {
      // Little green shoots once it is thawed and watered.
      ctx.strokeStyle = o.wet > 0.05 ? '#7fd36a' : '#6b7a4a';
      ctx.lineWidth = Math.max(1, s * 0.04);
      for (let i = 0; i < 5; i++) {
        const px = x - w * 0.6 + (i * w * 1.2) / 4;
        ctx.beginPath();
        ctx.moveTo(px, y - s * 0.45);
        ctx.quadraticCurveTo(px + s * 0.06, y - s * 0.62, px + s * 0.02, y - s * 0.75);
        ctx.stroke();
      }
    }
  },

  snapper(ctx, o, x, y, s, t) {
    const open = o.caged || o.frozen > 0 ? 0.05 : 0.35 + Math.sin(t * 3 + o.phase) * 0.3;
    // A pot, a stalk, and a head that opens and shuts.
    ctx.fillStyle = '#7a4b34';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.32, y - s * 0.4);
    ctx.lineTo(x + s * 0.32, y - s * 0.4);
    ctx.lineTo(x + s * 0.24, y);
    ctx.lineTo(x - s * 0.24, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4f9d46';
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.lineCap = 'round';
    const sway = (o.caged || o.frozen > 0 ? 0 : Math.sin(t * 1.6 + o.phase) * 0.18) * s;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.4);
    ctx.quadraticCurveTo(x + sway, y - s * 0.9, x + sway * 1.4, y - s * 1.25);
    ctx.stroke();
    const hx = x + sway * 1.4;
    const hy = y - s * 1.25;
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(dir * open);
      ctx.fillStyle = dir > 0 ? '#8fd45a' : '#6fb845';
      ctx.beginPath();
      ctx.ellipse(s * 0.22, 0, s * 0.3, s * 0.16, 0, 0, TAU);
      ctx.fill();
      // Teeth.
      ctx.fillStyle = '#f2ffe0';
      for (let i = 0; i < 5; i++) {
        const tx = s * (0.02 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(tx, dir * s * 0.02);
        ctx.lineTo(tx + s * 0.04, dir * s * 0.13);
        ctx.lineTo(tx + s * 0.08, dir * s * 0.02);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  climber(ctx, o, x, y, s) {
    ctx.fillStyle = '#6f4632';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y - s * 0.4);
    ctx.lineTo(x + s * 0.3, y - s * 0.4);
    ctx.lineTo(x + s * 0.22, y);
    ctx.lineTo(x - s * 0.22, y);
    ctx.closePath();
    ctx.fill();
    const grown = (o.height ?? 0) * (s / 0.7) * 1.9;
    if (grown <= 1) return;
    // A twining stem with paired leaves, climbing a cane.
    ctx.strokeStyle = 'rgba(210, 200, 170, 0.5)';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.12, y - s * 0.4);
    ctx.lineTo(x + s * 0.12, y - s * 0.4 - grown * 1.05);
    ctx.stroke();
    ctx.strokeStyle = '#6fbf54';
    ctx.lineWidth = Math.max(2, s * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.4);
    for (let i = 1; i <= 16; i++) {
      const k = i / 16;
      ctx.lineTo(x + Math.sin(k * 9) * s * 0.2, y - s * 0.4 - grown * k);
    }
    ctx.stroke();
    ctx.fillStyle = '#8ede6a';
    for (let i = 1; i <= 5; i++) {
      const k = i / 5.5;
      const lx = x + Math.sin(k * 9) * s * 0.2;
      const ly = y - s * 0.4 - grown * k;
      ctx.beginPath();
      ctx.ellipse(lx + (i % 2 ? s * 0.2 : -s * 0.2), ly, s * 0.19, s * 0.09, i % 2 ? -0.5 : 0.5, 0, TAU);
      ctx.fill();
    }
  },

  latch(ctx, o, x, y, s, t, view, world, c) {
    ctx.save();
    // The vent itself, hinged at the top.
    ctx.translate(x, y - s * 0.9);
    ctx.rotate(o.open ? -0.85 : 0);
    ctx.fillStyle = o.open ? 'rgba(10, 16, 30, 0.7)' : rgba(c.accent, 0.14);
    ctx.fillRect(-s * 0.7, 0, s * 1.4, s * 0.9);
    ctx.strokeStyle = rgba(c.accent, 0.6);
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.strokeRect(-s * 0.7, 0, s * 1.4, s * 0.9);
    ctx.restore();
    // The catch, brass and obvious.
    ctx.fillStyle = o.locked ? shade(c.accent, -0.1) : '#8fd8a0';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.08, s * 0.16, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.25);
  },

  tap(ctx, o, x, y, s, t, view, world, c) {
    ctx.strokeStyle = shade(c.accent, 0.05);
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y - s * 0.7);
    ctx.lineTo(x + s * 0.1, y - s * 0.7);
    ctx.lineTo(x + s * 0.1, y - s * 0.3);
    ctx.stroke();
    ctx.fillStyle = shade(c.accent, -0.15);
    ctx.beginPath();
    ctx.ellipse(x - s * 0.2, y - s * 0.86, s * 0.2, s * 0.08, 0, 0, TAU);
    ctx.fill();
    if (o.wet > 0.05) {
      ctx.strokeStyle = 'rgba(92, 200, 255, 0.8)';
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.1, y - s * 0.28);
      ctx.lineTo(x + s * 0.1, y + s * 0.4);
      ctx.stroke();
    }
  },

  pot(ctx, o, x, y, s) {
    ctx.fillStyle = '#7a4b34';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.36, y - s * 0.45);
    ctx.lineTo(x + s * 0.36, y - s * 0.45);
    ctx.lineTo(x + s * 0.26, y);
    ctx.lineTo(x - s * 0.26, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8f5b40';
    ctx.fillRect(x - s * 0.4, y - s * 0.52, s * 0.8, s * 0.09);
    const perk = 0.3 + (o.grown || 0) * 0.32;
    ctx.strokeStyle = o.grown > 0 ? '#6fbf54' : '#7d7a48';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.5);
      ctx.quadraticCurveTo(x + i * s * 0.2, y - s * (0.5 + perk * 0.8), x + i * s * 0.34, y - s * (0.5 + perk * (o.grown > 0 ? 1.1 : 0.2)));
      ctx.stroke();
    }
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
  const c = view.paletteFor(world);
  const list = world.objects.filter((o) => o.seen).sort((a, b) => b.z - a.z);
  for (const o of list) {
    const p = view.project(o.x, o.y, o.z);
    const s = p.scale * o.size * o.scale;
    if (s < 2 || p.x < -300 || p.x > view.w + 300) continue;
    const base = p.y; // every sprite is drawn upwards from where it stands

    // Things that sit at head height need something to sit on.
    if (o.plinth) {
      const foot = view.project(o.x, 0, o.z);
      ctx.fillStyle = c.plinth;
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.42, base);
      ctx.lineTo(p.x + s * 0.42, base);
      ctx.lineTo(p.x + s * 0.3, foot.y);
      ctx.lineTo(p.x - s * 0.3, foot.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.plinthTop;
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
    if (sprite) sprite(ctx, o, p.x, base, s, t, view, world, c);
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

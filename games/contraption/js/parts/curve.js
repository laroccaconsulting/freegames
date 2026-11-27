import { addBody, capsule, makeShape, placeShape } from '../physics.js';
import { twoPeg } from './_two-peg.js';

// A curved track between two pegs: a circular arc whose bend is set in
// half cells, positive sagging below the line between the pegs (a dip,
// a quarter-pipe, a funnel), negative arching above it (a hump). Built
// from short straight pieces, so a ball rolls along it smoothly.
const BENDS = [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3];
const R = 0.15;
const N = 12;

/** Points along the arc from a to b. */
export function arcPoints(part) {
  const [ax, ay] = part.a;
  const [bx, by] = part.b;
  const s = part.bend ?? 1;
  const dx = bx - ax;
  const dy = by - ay;
  const c = Math.hypot(dx, dy) || 1;
  if (Math.abs(s) < 1e-6) return [part.a, part.b];
  // normal: for a left-to-right chord it points down
  const nx = -dy / c;
  const ny = dx / c;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const rad = (c * c) / 4 / (2 * Math.abs(s)) + Math.abs(s) / 2;
  const cx = mx + nx * (s - Math.sign(s) * rad);
  const cy = my + ny * (s - Math.sign(s) * rad);
  const a0 = Math.atan2(ay - cy, ax - cx);
  let a1 = Math.atan2(by - cy, bx - cx);
  const am = Math.atan2(my + ny * s - cy, mx + nx * s - cx);
  // go round the side the apex is on
  const between = (x, lo, hi) => ((x - lo) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) <= ((hi - lo) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  let sweep = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (!between(am, a0, a1)) sweep -= 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = a0 + (sweep * i) / N;
    pts.push([cx + Math.cos(t) * rad, cy + Math.sin(t) * rad]);
  }
  pts[0] = [...part.a];
  pts[N] = [...part.b];
  return pts;
}

const base = twoPeg({ radius: R, limits: [2, 10], offsets: [[4, 0], [-4, 0], [3, 3], [-3, 3], [4, 2], [-4, 2]] });

export default {
  type: 'curve',
  name: 'Curve',
  blurb: 'A curved track between two pegs. Tap it to bend it more or less, down into a dip or up into a hump.',
  physics: 'A curve turns a fall into a roll without a bump: the track pushes the ball round instead of stopping it, so it keeps its speed.',
  tip: 'From the top of a drop to a point beside it, bent down, it makes a quarter-pipe: straight down in, sideways out.',
  layer: 2,
  front: true,
  ...base,
  shape: (part) => placeShape(makeShape(arcPoints(part), R)),
  distance: (part, wx, wy) => {
    const pts = arcPoints(part);
    let d = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const L = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / L));
      d = Math.min(d, Math.hypot(wx - x1 - t * (x2 - x1), wy - y1 - t * (y2 - y1)));
    }
    return d - R;
  },
  check: (level, part) => {
    for (const [x, y] of arcPoints(part)) if (x < 0 || y < 0 || x > level.w || y > level.h) return 'Off the board';
    return null;
  },
  body: (world, part) => {
    const pts = arcPoints(part);
    let first = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const b = addBody(world, { kind: 'static', shape: capsule(...pts[i], ...pts[i + 1], R), friction: 0.4, restitution: 0.1, tag: 'ramp' });
      first ||= b;
    }
    return first;
  },
  draw: (view, pal, part) => {
    const ctx = view.ctx;
    const pts = arcPoints(part);
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 2 * R;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    for (const [x, y] of [part.a, part.b]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.07, 0, Math.PI * 2);
      ctx.fillStyle = pal.paper;
      ctx.fill();
    }
    ctx.restore();
  },
  defaults: function ([x, y]) {
    return base.defaults.call(this, [x, y]).map((p) => ({ ...p, bend: 1 }));
  },
  controls: (part) => [{ kind: 'stepper', field: 'bend', value: part.bend ?? 1, step: 0.5, min: BENDS[0], max: BENDS[BENDS.length - 1], label: (v) => (v > 0 ? `dip ${v}` : v < 0 ? `hump ${-v}` : 'straight'), aria: ['Bend up', 'Bend down'] }],
  hint: () => 'Drag the round ends to pegs; tap it to change the bend.',
};

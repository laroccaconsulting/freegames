import { addBody, capsule, placeShape } from '../physics.js';
import { drawConveyor } from '../render.js';
import { DRUM_R } from '../geom.js';

// Cleats: ribs on the belt that push things up slopes too steep for
// friction (a ball rolls back down a smooth belt). They ride the belt loop:
// along the top, round a drum, back along the bottom and round the other.
const CLEAT = { h: 0.45, gap: 2 };

/** Where a point s along the belt loop is, and which way is out from the belt. */
export function beltPoint(part, s) {
  const [ax, ay] = part.a;
  const [bx, by] = part.b;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const nx = uy;
  const ny = -ux;
  const r = DRUM_R;
  const P = 2 * len + 2 * Math.PI * r;
  const lap = Math.floor(s / P);
  let t = s - lap * P;
  const base = Math.atan2(ny, nx) + lap * 2 * Math.PI;
  let dx;
  let dy;
  let px;
  let py;
  let turn;
  if (t < len) {
    [dx, dy, px, py, turn] = [nx, ny, ax + ux * t, ay + uy * t, 0];
  } else if ((t -= len) < Math.PI * r) {
    const f = t / r;
    [dx, dy, px, py, turn] = [nx * Math.cos(f) + ux * Math.sin(f), ny * Math.cos(f) + uy * Math.sin(f), bx, by, f];
  } else if ((t -= Math.PI * r) < len) {
    [dx, dy, px, py, turn] = [-nx, -ny, bx - ux * t, by - uy * t, Math.PI];
  } else {
    const f = (t - len) / r;
    [dx, dy, px, py, turn] = [-nx * Math.cos(f) - ux * Math.sin(f), -ny * Math.cos(f) - uy * Math.sin(f), ax, ay, Math.PI + f];
  }
  return { x: px + dx * r, y: py + dy * r, dx, dy, angle: base + turn, P };
}

export const cleatCount = (part) => Math.max(2, Math.round(beltPoint(part, 0).P / CLEAT.gap));
import { twoPeg } from './_two-peg.js';

export default {
  type: 'conveyor',
  name: 'Conveyor',
  blurb: 'A belt around two drums. Idle until something turns a drum.',
  physics: 'Friction carries flat things along the belt. A ball rolls back down a sloped belt: rolling needs no grip.',
  tip: 'Put a motor on either drum peg.',
  layer: 2,
  front: true,
  ...twoPeg({ radius: DRUM_R, limits: [2, 12], offsets: [[5, 0], [-5, 0], [4, 0], [-4, 0], [3, 0], [-3, 0], [2, 0], [-2, 0]] }),
  // both drums are axles, joined by the belt at 1:1
  axles: (part, axle) => {
    axle(part.a).drums.push(part);
    axle(part.b).drums.push(part);
  },
  links: (part, axles, link) => link(axles.get(`${part.a}`), axles.get(`${part.b}`), 1, 'belt'),
  inertia: () => 0.01,
  body: (world, part, ctx) => {
    const A = ctx.axle(part.a);
    const belt = addBody(world, { kind: 'static', shape: capsule(...part.a, ...part.b, DRUM_R), friction: 1.2, restitution: 0.05, belt: { train: A.train, k: A.k, r: DRUM_R }, tag: 'conveyor' });
    if (part.cleats) {
      // each cleat is moved by the belt: kinematic, placed from the drum's turn
      const n = cleatCount(part);
      const P = beltPoint(part, 0).P;
      for (let i = 0; i < n; i++) {
        const s0 = (i / n) * P;
        const motion = (t) => {
          const s = s0 + (A.train.theta + (t - world.time) * A.train.v) * A.k * DRUM_R;
          const q = beltPoint(part, ((s % P) + P) % P + Math.floor(s / P) * P);
          return { x: q.x, y: q.y, angle: q.angle };
        };
        addBody(world, { kind: 'kinematic', shape: capsule(0, 0, CLEAT.h, 0, 0.07), motion, friction: 0.6, restitution: 0.05, tag: 'cleat' });
      }
    }
    return belt;
  },
  draw: (view, pal, part, live) => {
    const t = live.turn(part.a);
    drawConveyor(view.ctx, view, pal, part.a, part.b, t * DRUM_R, t);
    if (part.cleats) {
      const ctx = view.ctx;
      const n = cleatCount(part);
      const P = beltPoint(part, 0).P;
      ctx.save();
      ctx.strokeStyle = pal.ink;
      ctx.lineCap = 'round';
      ctx.lineWidth = view.px(3);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = (((i / n) * P + t * DRUM_R) % P + P) % P;
        const q = beltPoint(part, s);
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + q.dx * CLEAT.h, q.y + q.dy * CLEAT.h);
      }
      ctx.stroke();
      ctx.restore();
    }
  },
  controls: (part) => [{ kind: 'choice', field: 'cleats', value: !!part.cleats, options: [[false, 'Smooth', 'Smooth belt'], [true, 'Cleats', 'Cleats: ribs that push things up steep slopes']] }],
  hint: (part) => (part.cleats ? 'Cleats push balls and crates up slopes too steep for friction. Turn a drum to run it.' : 'Put a motor on either drum peg. Tap Cleats to carry things up steep slopes.'),
};

import { placeShape, circle } from '../physics.js';
import { drawGear } from '../render.js';
import { dist } from '../geom.js';
import { onePeg } from './_two-peg.js';

const DENSITY = 0.005;

export default {
  type: 'gear',
  name: 'Gear',
  blurb: 'Small, medium or large (radius 1, 2 or 3). Gears whose rims touch mesh.',
  physics: 'Meshed gears turn opposite ways. Small driving large: half the speed, twice the torque.',
  tip: 'Gears sit behind the board, so items pass in front of them.',
  layer: 0,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(circle(part.size), part.p[0], part.p[1]),
  check: (level, part, others) => {
    for (const o of others) {
      if (o === part || o.id === part.id || o.type !== 'gear') continue;
      const d = dist(part.p, o.p);
      if (d < 1e-9) return 'A peg holds one gear';
      if (d < part.size + o.size - 1e-6) return 'Overlaps another gear';
    }
    return null;
  },
  axles: (part, axle) => (axle(part.p).gear = part),
  inertia: (part) => 0.5 * DENSITY * Math.PI * part.size ** 4,
  draw: (view, pal, part, live) => drawGear(view.ctx, view, pal, part.p[0], part.p[1], part.size, live.phase + live.turn(part.p)),
  defaults: ([x, y]) => [1, 2, 3].map((size) => ({ type: 'gear', p: [x, y], size })),
  distance: (part, wx, wy) => Math.hypot(wx - part.p[0], wy - part.p[1]) - part.size * 0.75 + 0.3,
  controls: (part) => [{ kind: 'choice', field: 'size', value: part.size, options: [[1, 'S', 'Small'], [2, 'M', 'Medium'], [3, 'L', 'Large']] }],
  hint: (part, ctx) => {
    const A = ctx.layout?.axles.get(`${part.p}`);
    const t = A && ctx.layout.trains[A.train];
    if (t?.jammed) return 'Jammed: these gears fight each other.';
    if (t?.motors.length) return `Turns at ${Math.abs(A.k).toFixed(A.k % 1 ? 2 : 0)}× the motor.`;
    return 'Drag to move. Rims that touch mesh.';
  },
};

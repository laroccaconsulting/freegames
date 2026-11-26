import { placeShape, circle } from '../physics.js';
import { drawGear } from '../render.js';
import { dist, gearR, TEETH } from '../geom.js';
import { onePeg } from './_two-peg.js';

const DENSITY = 0.005;

// Gears sit behind the board on two layers, back and front. Gears in the
// same layer mesh when their rims touch; two gears on one peg (one per
// layer) turn together, which is how a compound train multiplies ratios.
export default {
  type: 'gear',
  name: 'Gear',
  blurb: 'From 10 to 40 teeth. Gears in the same layer mesh when their rims touch.',
  physics: 'Meshed gears turn opposite ways, at the inverse ratio of their teeth: 10 driving 30 turns a third as fast with three times the torque.',
  tip: 'Put a small and a large gear on one peg, one in each layer, to multiply ratios.',
  layer: 0,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(circle(gearR(part)), part.p[0], part.p[1]),
  check: (level, part, others) => {
    const plane = part.plane || 0;
    for (const o of others) {
      if (o === part || o.id === part.id || o.type !== 'gear') continue;
      const d = dist(part.p, o.p);
      if (d < 1e-9 && (o.plane || 0) === plane) return 'One gear per layer on a peg';
      if (d > 1e-9 && (o.plane || 0) === plane && d < gearR(part) + gearR(o) - 1e-6) return 'Overlaps another gear in this layer';
    }
    return null;
  },
  axles: (part, axle) => {
    const A = axle(part.p);
    A.gears.push(part);
    A.gear ||= part;
  },
  inertia: (part) => 0.5 * DENSITY * Math.PI * gearR(part) ** 4,
  draw: (view, pal, part, live) => drawGear(view.ctx, view, pal, part.p[0], part.p[1], gearR(part), live.phase + live.turn(part.p), part.teeth ?? 10, part.plane || 0),
  // back layer first; on a peg that already has a gear, the front layer
  defaults: ([x, y]) => [0, 1].flatMap((plane) => [10, 20, 30].map((teeth) => ({ type: 'gear', p: [x, y], teeth, plane }))),
  distance: (part, wx, wy) => Math.hypot(wx - part.p[0], wy - part.p[1]) - gearR(part) * 0.75 + 0.3 - (part.plane ? 0.05 : 0),
  controls: (part) => [
    { kind: 'choice', field: 'teeth', value: part.teeth ?? 10, options: TEETH.map((t) => [t, String(t), `${t} teeth`]) },
    { kind: 'choice', field: 'plane', value: part.plane || 0, options: [[0, 'Back', 'Back layer'], [1, 'Front', 'Front layer']] },
  ],
  hint: (part, ctx) => {
    const A = ctx.layout?.axles.get(`${part.p}`);
    const t = A && ctx.layout.trains[A.train];
    if (t?.jammed) return 'Jammed: these gears fight each other.';
    if (t?.motors.length) return `${part.teeth ?? 10} teeth, turns at ${Math.abs(A.k).toFixed(A.k % 1 ? 2 : 0)}× the motor.`;
    return `${part.teeth ?? 10} teeth. Rims that touch in a layer mesh.`;
  },
};

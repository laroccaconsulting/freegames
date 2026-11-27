import { addBody, capsule, placeShape } from '../physics.js';
import { drawLever } from '../render.js';
import { leverEnds, rad, segDist } from '../geom.js';
import { onePeg } from './_two-peg.js';

const ARM = [0.5, 6];

export default {
  type: 'lever',
  name: 'Lever',
  blurb: 'A bar on a fulcrum peg. It stays as you set it until something touches it, then turns freely.',
  physics: 'A lever trades distance for force: the long arm moves farther and faster, the short arm pushes harder.',
  tip: 'Drop something heavy on the short arm to throw something light off the long one.',
  layer: 3,
  front: true,
  ...onePeg,
  shape: (part) => {
    const [e1, e2] = leverEnds(part);
    return placeShape(capsule(e1[0], e1[1], e2[0], e2[1], 0.14));
  },
  check: (level, part) => {
    for (const l of [part.l1, part.l2]) if (l < ARM[0] - 1e-9 || l > ARM[1] + 1e-9) return 'Arm length must be ½ to 6';
    for (const e of leverEnds(part)) if (e[0] < 0 || e[1] < 0 || e[0] > level.w || e[1] > level.h) return 'Off the board';
    return null;
  },
  // on a driven peg it becomes a crank arm; alone it pivots freely
  axles: (part, axle) => axle(part.p).levers.push(part),
  body: (world, part, ctx) => {
    const A = ctx.axle(part.p);
    return addBody(world, { kind: 'rotor', shape: capsule(-part.l1, 0, part.l2, 0, 0.14), x: part.p[0], y: part.p[1], base: rad(part.angle || 0), train: A.train, k: A.k, density: 0.4, friction: 0.6, restitution: 0.1, tag: 'lever' });
  },
  draw: (view, pal, part, live) => drawLever(view.ctx, view, pal, part, live.body ? live.body.angle : undefined),
  defaults: ([x, y]) => [[2, 2], [1.5, 1.5], [1, 1], [2, 1], [1, 2], [0.5, 0.5]].map(([l1, l2]) => ({ type: 'lever', p: [x, y], angle: 0, l1, l2 })),
  distance: (part, wx, wy) => {
    const [e1, e2] = leverEnds(part);
    return segDist(wx, wy, ...e1, ...e2) - 0.15;
  },
  handles: (part) => {
    const [e1, e2] = leverEnds(part);
    return [
      { which: 'e1', at: e1 },
      { which: 'e2', at: e2 },
    ];
  },
  // an end: angle in 15° steps, length in half cells, the other arm stays in line
  drag: (part, which, [wx, wy]) => {
    let ang = Math.atan2(wy - part.p[1], wx - part.p[0]);
    if (which === 'e1') ang += Math.PI;
    let deg = Math.round((ang * 180) / Math.PI / 15) * 15;
    deg = ((deg + 540) % 360) - 180;
    const len = Math.max(ARM[0], Math.min(ARM[1], Math.round(Math.hypot(wx - part.p[0], wy - part.p[1]) * 2) / 2));
    const field = which === 'e1' ? 'l1' : 'l2';
    if (deg === part.angle && len === part[field]) return false;
    part.angle = deg;
    part[field] = len;
    return true;
  },
  controls: (part) => [
    { kind: 'stepper', field: 'l1', value: part.l1, step: 0.5, min: ARM[0], max: ARM[1], label: (v) => `left ${v}`, aria: ['Shorter left arm', 'Longer left arm'] },
    { kind: 'stepper', field: 'l2', value: part.l2, step: 0.5, min: ARM[0], max: ARM[1], label: (v) => `right ${v}`, aria: ['Shorter right arm', 'Longer right arm'] },
    { kind: 'stepper', field: 'angle', value: part.angle || 0, step: 15, min: -75, max: 75, label: (v) => `${v}°`, aria: ['Tilt left end down', 'Tilt right end down'] },
  ],
  hint: (part) => `Holds this angle until something touches it. The long arm moves farther and faster.`,
};

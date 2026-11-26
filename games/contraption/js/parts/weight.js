import { addBody, box, placeShape } from '../physics.js';
import { drawWeight } from '../render.js';
import { key } from '../geom.js';
import { onePeg } from './_two-peg.js';

export default {
  type: 'weight',
  name: 'Weight',
  blurb: 'A heavy iron block that falls when the machine starts.',
  physics: 'Weight is force: a block six times heavier than a crate lands six times harder.',
  tip: 'Put it above a lever to make a catapult.',
  layer: 3,
  front: true,
  ...onePeg,
  shape: (part) => placeShape(box(0.9, 0.9), part.p[0], part.p[1]),
  check: (level, part, others) => (others.some((o) => o !== part && o.id !== part.id && o.type === 'weight' && key(o.p) === key(part.p)) ? 'Already a weight here' : null),
  body: (world, part) => addBody(world, { kind: 'dynamic', shape: box(0.9, 0.9), x: part.p[0], y: part.p[1], density: 6, friction: 0.6, restitution: 0.02, tag: 'weight' }),
  draw: (view, pal, part, live) => {
    const b = live.body;
    drawWeight(view.ctx, view, pal, b ? b.x : part.p[0], b ? b.y : part.p[1], b ? b.angle : 0, !b);
  },
  defaults: ([x, y]) => [{ type: 'weight', p: [x, y] }],
  distance: (part, wx, wy) => Math.max(Math.abs(wx - part.p[0]), Math.abs(wy - part.p[1])) - 0.45,
  hint: () => 'Hangs here until you press Run, then falls.',
};

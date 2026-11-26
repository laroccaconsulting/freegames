import { addBody, capsule } from '../physics.js';
import { drawConveyor } from '../render.js';
import { DRUM_R } from '../geom.js';
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
    return addBody(world, { kind: 'static', shape: capsule(...part.a, ...part.b, DRUM_R), friction: 1.2, restitution: 0.05, belt: { train: A.train, k: A.k, r: DRUM_R }, tag: 'conveyor' });
  },
  draw: (view, pal, part, live) => {
    const t = live.turn(part.a);
    drawConveyor(view.ctx, view, pal, part.a, part.b, t * DRUM_R, t);
  },
};

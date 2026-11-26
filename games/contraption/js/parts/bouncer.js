import { addBody, capsule } from '../physics.js';
import { drawBouncer } from '../render.js';
import { twoPeg } from './_two-peg.js';

export default {
  type: 'bouncer',
  name: 'Bouncer',
  blurb: 'A springy pad between two pegs.',
  physics: 'Hits it hard and it gives back almost all of the speed, mirrored across the pad.',
  tip: 'Angle it to turn a fall into a throw.',
  layer: 2,
  front: true,
  ...twoPeg({ radius: 0.2, limits: [1, 4], offsets: [[2, 1], [-2, 1], [2, 0], [-2, 0], [1, 1], [-1, 1]] }),
  body: (world, part) => addBody(world, { kind: 'static', shape: capsule(...part.a, ...part.b, 0.2), friction: 0.3, restitution: 0.85, tag: 'bouncer' }),
  draw: (view, pal, part) => drawBouncer(view.ctx, view, pal, part.a, part.b),
};

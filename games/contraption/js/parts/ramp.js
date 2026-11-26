import { addBody, capsule } from '../physics.js';
import { drawRamp } from '../render.js';
import { twoPeg } from './_two-peg.js';

export default {
  type: 'ramp',
  name: 'Ramp',
  blurb: 'A fixed plank between two pegs.',
  physics: 'An inclined plane: the steeper it is, the faster things roll or slide down it.',
  tip: 'Leave the bottom end pointing up a little and a ball leaves it like a ski jump.',
  layer: 2,
  front: true,
  ...twoPeg({ radius: 0.15, limits: [1, 10], offsets: [[3, 1], [-3, 1], [3, 2], [-3, 2], [2, 1], [-2, 1], [3, -1], [-3, -1]] }),
  body: (world, part) => addBody(world, { kind: 'static', shape: capsule(...part.a, ...part.b, 0.15), friction: 0.4, restitution: 0.1, tag: 'ramp' }),
  draw: (view, pal, part) => drawRamp(view.ctx, view, pal, part.a, part.b),
};

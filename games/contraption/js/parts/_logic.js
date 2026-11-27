// Shared bits for signal-only parts that sit on one peg behind the board.
import { placeShape, circle } from '../physics.js';
import { key } from '../geom.js';
import { onePeg } from './_two-peg.js';

export const logicPart = {
  layer: 5,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(circle(0.45), part.p[0], part.p[1]),
  output: (part) => part.p,
  input: (part) => part.p,
  check: (level, part, others) => (others.some((o) => o !== part && o.id !== part.id && o.type !== 'wire' && o.p && key(o.p) === key(part.p) && (o.type === 'nand' || o.type === 'delay' || o.type === 'pixel')) ? 'One logic part per peg' : null),
  distance: (part, wx, wy) => Math.hypot(wx - part.p[0], wy - part.p[1]) - 0.45,
};

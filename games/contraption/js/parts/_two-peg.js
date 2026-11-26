// Helpers for parts that span two pegs (ramp, bouncer, conveyor).
import { placeShape, capsule } from '../physics.js';
import { segDist, dragEnd } from '../geom.js';

export function twoPeg({ radius, limits, offsets }) {
  return {
    ends: true,
    limits,
    pegs: (part) => [part.a, part.b],
    shape: (part) => placeShape(capsule(part.a[0], part.a[1], part.b[0], part.b[1], radius)),
    distance: (part, wx, wy) => segDist(wx, wy, ...part.a, ...part.b) - radius,
    handles: (part) => [
      { which: 'a', at: part.a },
      { which: 'b', at: part.b },
    ],
    drag: (part, which, w) => dragEnd(part, which, w),
    defaults: function ([x, y]) {
      return offsets.map(([dx, dy]) => ({ type: this.type, a: [x, y], b: [x + dx, y + dy] }));
    },
    move: (part, o, dx, dy) => {
      part.a = [o.a[0] + dx, o.a[1] + dy];
      part.b = [o.b[0] + dx, o.b[1] + dy];
    },
    hint: () => 'Drag the round ends to pegs.',
  };
}

/** For parts that sit on one peg. */
export const onePeg = {
  pegs: (part) => [part.p],
  move: (part, o, dx, dy) => {
    part.p = [o.p[0] + dx, o.p[1] + dy];
  },
  handles: () => [],
  drag: () => false,
};

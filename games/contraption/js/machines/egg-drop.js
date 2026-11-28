import { withIds } from './kit.js';

// Down is the hard way for an egg: rolled down 7 cells of track it would
// arrive at three times the speed that cracks it. A cleated belt running
// downwards, geared 4 to 1, lowers it instead, resting on the cleat below.
export default {
  id: 'egg-drop',
  title: 'Egg drop',
  category: 'lifts',
  since: '2026-12-16',
  note: 'An egg cracks if it hits anything faster than nine cells a second, and any track from up here would have it arriving three times faster. So a cleated belt runs downhill, geared down four to one: the egg rests on the cleat below it and is lowered, steadily, then slides off onto the shelf without a crack.',
  board: {w: 18, h: 16, walls: [[0, 15, 18, 1], [1.25, 11, 4.15, 0.5]], goal: {x: 1.5, y: 9, w: 4, h: 2}, items: [{type: 'egg', x: 8.5, y: 4.95}]},
  parts: withIds([
    {type: 'conveyor', a: [6, 11], b: [10, 4], cleats: true},
    {type: 'gear', p: [10, 4], teeth: 40, plane: 0},
    {type: 'gear', p: [15, 4], teeth: 10, plane: 0},
    {type: 'motor', p: [15, 4], dir: 1},
  ]),
  seconds: 15,
  verify: (run) => (run.status === 'win' ? null : `not delivered: ${run.reason || run.status}`),
};

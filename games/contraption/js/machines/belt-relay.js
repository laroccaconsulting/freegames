import { withIds } from './kit.js';

// Three belts, one motor. Chains carry the drive from belt to belt, each
// from a 30-tooth gear to a 20, so every belt runs half as fast again as the
// one before: the crate speeds up at each hand-over and flies off the last.
export default {
  id: 'belt-relay',
  category: 'gears',
  since: '2026-12-13',
  title: 'Belt relay',
  note: 'One motor drives three belts. A chain from a 30-tooth gear to a 20 makes the second belt run half as fast again as the first, and another the third half as fast again as that. The crate drops from belt to belt, quicker each time, and the last one throws it into the cup.',
  board: {w: 27, h: 16, walls: [[0, 15, 27, 1]], items: [{type: 'crate', x: 4, y: 3.0}], goal: {x: 22.5, y: 12, w: 4, h: 3, cup: true}},
  parts: withIds([
    {type: 'conveyor', a: [3, 4], b: [10, 4]},
    {type: 'motor', p: [3, 4], dir: 1},
    {type: 'gear', p: [3, 4], teeth: 30, plane: 0},
    {type: 'conveyor', a: [8, 7], b: [15, 7]},
    {type: 'gear', p: [8, 7], teeth: 20, plane: 0},
    {type: 'chain', a: [3, 4], b: [8, 7], pa: 0, pb: 0},
    {type: 'gear', p: [8, 7], teeth: 30, plane: 1},
    {type: 'conveyor', a: [13, 10], b: [20, 10]},
    {type: 'gear', p: [13, 10], teeth: 20, plane: 1},
    {type: 'chain', a: [8, 7], b: [13, 10], pa: 1, pb: 1},
  ]),
  seconds: 10,
  verify: (run) => (run.status === 'win' ? null : `not delivered: ${run.reason || run.status}`),
};

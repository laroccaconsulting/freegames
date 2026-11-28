import { withIds, toggle, wire } from './kit.js';

// Three proven stages chained: a pusher kicks the first ball through a
// curve; it rolls through a beam that fires a spring under the second ball;
// an upside-down curve turns that shot into a lob into the cup, and a beam
// across the cup's mouth sets the "breakfast is ready" light.
const parts = withIds([
  // 1. kick and curve
  { type: 'pusher', p: [3, 5], dir: 0, r: 1 },
  { type: 'motor', p: [3, 5], dir: 1, delay: 1 },
  { type: 'curve', a: [7, 8], b: [11, 12], bend: 1 },
  // 2. the rolling ball trips the spring
  { type: 'beam', a: [19, 12], b: [19, 14] },
  { type: 'spring', p: [25, 14], dir: 270, power: 3 },
  wire([19, 12], [25, 14]),
  // 3. up, over and in; the light comes on
  { type: 'curve', a: [24, 7], b: [28, 3], bend: -0.5 },
  { type: 'beam', a: [31, 9], b: [33, 9] },
  toggle([33, 2]),
  wire([31, 9], [33, 2]),
]);
const LIGHT = parts.find((p) => p.type === 'pixel').id;

export default {
  id: 'breakfast',
  title: 'Breakfast machine',
  note: 'A proper Rube Goldberg chain. A second in, the motor\'s crank kicks the first ball off its shelf; a curve turns its fall into a dash across the floor, through a beam that fires a spring under the second ball; an upside-down curve bends that shot into a lob, into the cup, through the last beam, and the light comes on: breakfast is ready.',
  board: { w: 36, h: 16, walls: [[0, 15, 36, 1], [2, 6, 4.5, 0.5], [29.75, 11, 4.5, 0.5], [35, 12, 0.5, 3]], goal: { x: 30, y: 8.5, w: 4, h: 2.5, cup: true },
    items: [{ type: 'ball', x: 5, y: 5.6, deliver: false }, { type: 'ball', x: 25, y: 13 }] },
  parts,
  seconds: 10,
  watch: (run, s) => {
    if (run.signals.get(LIGHT) && s.lit == null) s.lit = run.time;
  },
  verify: (run, s) => {
    if (run.status !== 'win') return `not delivered: ${run.reason || run.status}`;
    return s.lit != null ? null : 'the light never came on';
  },
};

import { withIds, wire } from './kit.js';

// Clockwork that does something twenty-odd seconds in. The escape wheel turns
// once a minute; a gear passes that to an arm on its own peg, which sweeps
// round and through a beam about 20 seconds in; the beam fires a spring, and
// the cuckoo pops up and over into its nest.
const parts = withIds([
  { type: 'escape', p: [4, 6] },
  { type: 'pendulum', p: [4, 3], l: 4 },
  { type: 'gear', p: [4, 6], teeth: 20, plane: 0 },
  { type: 'gear', p: [8, 6], teeth: 20, plane: 0 },
  { type: 'lever', p: [8, 6], angle: 150, l1: 3, l2: 3 }, // balanced, so its weight does not drive the clock
  { type: 'beam', a: [11, 5], b: [11, 7] },
  { type: 'spring', p: [15, 14], dir: 270, power: 3 },
  wire([11, 5], [15, 14]),
  { type: 'curve', a: [14, 7], b: [18, 3], bend: -0.5 },
]);

export default {
  id: 'cuckoo',
  title: 'Cuckoo clock',
  note: 'Clockwork with a surprise. The pendulum lets the escape wheel turn once a minute, and a gear turns an arm on its own peg just as slowly. About twenty seconds in (150 degrees of a slow turn), the arm sweeps through the beam: the spring fires and the cuckoo shoots up, bends over the curve and lands in its nest.',
  board: { w: 24, h: 16, walls: [[0, 15, 24, 1], [19.75, 11, 4, 0.5]], goal: { x: 20, y: 8.5, w: 3.75, h: 2.5, cup: true }, items: [{ type: 'ball', x: 15, y: 13 }] },
  parts,
  seconds: 45,
  verify: (run) => {
    if (run.status !== 'win') return `not delivered: ${run.reason || run.status}`;
    return run.time > 18 ? null : `the cuckoo came out at ${run.time.toFixed(1)} s, too soon`;
  },
};

import { ESCALATOR } from '../showcase.js';
import { withIds, toggle, wire, edges } from './kit.js';

// The escalator, made to tick. A pendulum swings through a beam once a
// second; the beam flips a toggle on, and a delay clears it 0.3 s later (a
// pulse stretcher), so the belt's motor runs in short steps, one per swing,
// and the ball climbs the way a clock hand moves.
const MOTOR = [10, 4];
const parts = withIds([
  // the escalator's belt and feed, its motor straight on the top drum (the steps keep it slow); no exit ramp: the cup is right at the top
  ...ESCALATOR.parts.filter((p) => p.type === 'conveyor' || (p.type === 'ramp' && p.a[0] !== 11)),
  { type: 'motor', p: [10, 4], dir: 1 },
  { type: 'pendulum', p: [22, 2], l: 4 },
  { type: 'beam', a: [22, 3], b: [22, 4] },
  toggle([17, 9]),
  wire([22, 3], [17, 9]),
  { type: 'delay', p: [17, 12], wait: 0.3 },
  wire([17, 9], [17, 12]),
  wire([17, 12], [17, 10]), // into the toggle's clear pin
  wire([17, 9], MOTOR),
]);
const STEP = parts.find((p) => p.type === 'pixel').id;

export default {
  id: 'stepping-escalator',
  title: 'Stepping escalator',
  category: 'lifts',
  since: '2026-12-16',
  note: 'The escalator, made to tick like a clock. Each swing of the pendulum flashes the beam; that flips a toggle on, and a delay clears it 0.3 s later, a pulse stretcher. So the motor runs in short steps, one per swing, and the ball climbs in jerks, a cleat at a time.',
  board: { ...ESCALATOR.board, walls: [[0, 15, 24, 1], [10.75, 7, 6.5, 0.5]], goal: { x: 11, y: 4.5, w: 6, h: 2.5, cup: true } },
  parts,
  seconds: 60,
  watch: (run, s) => edges(run, s, 'steps', STEP),
  verify: (run, s) => {
    if (run.status !== 'win') return `not delivered: ${run.reason || run.status}`;
    return s.steps >= 6 ? null : `only ${s.steps} steps`;
  },
};

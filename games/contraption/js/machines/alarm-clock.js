import { withIds, heartbeat, toggle, lamp, wire, edges } from './kit.js';

// Clockwork as a timer: the escape wheel (held to one tooth a swing by the
// pendulum) turns once a minute; a gear passes that to a pusher, whose paddle
// creeps out and, about half a minute in, nudges the ball off its shelf.
// The ball drops through a beam; a toggle remembers it, and NAND-ed with a
// heartbeat (then NOT) it rings the lamp.
const parts = withIds([
  { type: 'escape', p: [5, 7] },
  { type: 'pendulum', p: [5, 4], l: 4 },
  { type: 'gear', p: [5, 7], teeth: 20, plane: 0 },
  { type: 'gear', p: [9, 7], teeth: 20, plane: 0 },
  { type: 'pusher', p: [9, 7], dir: 0, r: 1.5 },
  { type: 'beam', a: [11, 11], b: [14, 11] },
  toggle([16, 3]), wire([11, 11], [16, 3]),
  ...heartbeat([20, 3], 0.3),
  { type: 'nand', p: [18, 6] }, wire([16, 3], [18, 6]), wire([20, 3], [18, 6]),
  { type: 'nand', p: [20, 8] }, wire([18, 6], [20, 8]),
  lamp([22, 8]), wire([20, 8], [22, 8]),
]);
const LAMP = parts.find((p) => p.type === 'pixel' && p.mode === 'lamp').id;

export default {
  id: 'alarm-clock',
  category: 'time',
  since: '2026-12-13',
  title: 'Alarm clock',
  note: 'Clockwork as a timer. The pendulum lets the escape wheel turn once a minute; a gear passes that to a pusher whose paddle creeps out, and about half a minute in it nudges the ball off its shelf. The ball falls through a beam, a toggle remembers, and a heartbeat rings the lamp until you stop it.',
  board: { w: 24, h: 16, walls: [[0, 15, 24, 1], [11.1, 7.4, 1.6, 0.5]], items: [{ type: 'ball', x: 11.75, y: 7 }] },
  parts,
  seconds: 45,
  watch: (run, s) => {
    const on = !!run.signals.get(LAMP);
    if (on && s.first == null) s.first = run.time;
    edges(run, s, 'rings', LAMP);
  },
  verify: (run, s) => {
    if (s.first == null) return 'never rang';
    if (s.first < 15) return `rang too soon, at ${s.first.toFixed(1)} s`;
    return s.rings >= 5 ? null : `rang only ${s.rings} times`;
  },
};

import { withIds, on, wire } from './kit.js';

// A pendulum keeps time; each time its rod passes the beam by its peg, the
// gate lets one ball go. Four balls, one per swing, into the cup.
const RAMP = [[2, 4], [12, 6]]; // the slope the gate is tuned for: two ramps, meeting under the gate
const parts = withIds([
  { type: 'ramp', a: RAMP[0], b: [7, 5] },
  { type: 'ramp', a: [7, 5], b: RAMP[1] },
  { type: 'gate', p: [7, 5], side: 1 },
  { type: 'pendulum', p: [18, 1], l: 4 },
  { type: 'beam', a: [18, 2], b: [18, 3] },
  wire([18, 2], [7, 5]),
]);

export default {
  id: 'dispenser',
  category: 'time',
  since: '2026-12-13',
  title: 'Ball dispenser',
  note: 'A pendulum is the metronome. Every time its rod passes the beam by its peg, the gate on the ramp opens: its front pin drops to let one ball go while the back pin holds the rest. One ball a swing, about a second apart, however long the queue.',
  board: { w: 22, h: 16, walls: [[0, 15, 22, 1]], goal: { x: 12.75, y: 12, w: 4.5, h: 3, cup: true },
    items: [on(...RAMP, 3.3), on(...RAMP, 4.15), on(...RAMP, 5), on(...RAMP, 5.85)] },
  parts,
  seconds: 15,
  watch: (run, s) => {
    s.past ??= [];
    run.items.forEach((b, i) => {
      if (b.x > 8 && s.past[i] == null) s.past[i] = run.time;
    });
  },
  verify: (run, s) => {
    if (run.status !== 'win') return `not all delivered: ${run.reason || run.status}`;
    const t = [...s.past].sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] < 0.7) return `two balls went ${(t[i] - t[i - 1]).toFixed(2)} s apart`;
    return null;
  },
};

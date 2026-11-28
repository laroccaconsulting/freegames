import { withIds, lamp, wire, edges } from './kit.js';

// Five pendulums, from 3 to 5 cells long, set going together. Each swings
// through a beam near its peg that blinks its own lamp. The short ones beat
// faster, so the row of lamps runs in and out of step: a pendulum wave.
const LENGTHS = [3, 3.5, 4, 4.5, 5];
const xs = LENGTHS.map((_, i) => 3 + i * 4);
const raw = [];
LENGTHS.forEach((l, i) => {
  const x = xs[i];
  raw.push({ type: 'pendulum', p: [x, 2], l }, { type: 'beam', a: [x, 3], b: [x, 4] }, lamp([x, 11]), wire([x, 3], [x, 11]));
});
const parts = withIds(raw);
const beams = parts.filter((p) => p.type === 'beam').map((p) => p.id);

export default {
  id: 'pendulum-wave',
  category: 'time',
  since: '2026-12-13',
  title: 'Pendulum wave',
  note: 'Five pendulums, three to five cells long, all let go together. Each one blinks its lamp as it swings through the beam by its peg. A pendulum\'s beat depends only on its length, so the short ones run ahead and the lamps drift in and out of step, then line up again.',
  board: { w: 22, h: 13 },
  parts,
  seconds: 20,
  watch: (run, s) => beams.forEach((id) => edges(run, s, id, id)),
  verify: (run, s) => {
    const n = beams.map((id) => s[id] || 0);
    for (let i = 1; i < n.length; i++) if (n[i] > n[i - 1]) return `longer pendulums should blink less: ${n.join(' ')}`;
    if (n[n.length - 1] < 15) return `the longest blinked only ${n[n.length - 1]} times`;
    if (n[0] - n[n.length - 1] < 4) return `not enough spread: ${n.join(' ')}`;
    return null;
  },
};

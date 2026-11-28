import { counterChip } from '../clock.js';
import { withIds, heartbeat, lamp, wire } from './kit.js';

// A binary clock, the kind with columns of lights: each decimal digit of
// MM:SS is a counter chip, and its bits light a column, 1 at the bottom.
// A one-second heartbeat clocks the seconds; each counter's carry clocks
// the next digit.
const COLS = [
  { x: 4, mod: 6 }, // tens of minutes
  { x: 8, mod: 10 }, // minutes
  { x: 14, mod: 6 }, // tens of seconds
  { x: 18, mod: 10 }, // seconds
];
const raw = [...heartbeat([2, 18], 58 / 120)]; // 58 steps plus the gate steps: one beat a second
const cols = [];
let from = [2, 18];
for (const c of [...COLS].reverse()) {
  const chip = { type: 'chip', p: [c.x - 1, 12], def: counterChip(c.mod) };
  raw.push(chip, wire(from, [c.x - 1, 13]));
  const bits = chip.def.outputs.length - 1;
  const lamps = [];
  for (let i = 0; i < bits; i++) {
    const p = [c.x + 1, 9 - i * 2];
    raw.push(lamp(p), wire([c.x + 2, 13 + i], p));
    lamps.push(p);
  }
  cols.unshift({ ...c, lamps });
  from = [c.x + 2, 13 + bits];
}
const parts = withIds(raw);
const at = (p) => parts.find((q) => q.type === 'pixel' && q.p[0] === p[0] && q.p[1] === p[1]).id;
const read = (run) => cols.map((c) => c.lamps.reduce((v, p, i) => v + (run.signals.get(at(p)) ? 1 << i : 0), 0));

export default {
  id: 'binary-clock',
  title: 'Binary clock',
  category: 'logic',
  since: '2026-12-16',
  note: 'Minutes and seconds in columns of lights: each column is one decimal digit, written in binary, 1 at the bottom, then 2, 4, 8. A heartbeat clocks the seconds column; each counter chip passes its carry to the column on its left. The lit lights in a column add up to its digit.',
  board: { w: 23, h: 22 },
  parts,
  seconds: 75,
  watch: (run, s) => {
    const d = read(run);
    const secs = ((d[0] * 10 + d[1]) * 60) + d[2] * 10 + d[3];
    s.max = Math.max(s.max || 0, secs);
    s.last = secs;
  },
  verify: (run, s) => {
    const want = Math.floor(run.time);
    return Math.abs(s.last - want) <= 2 && s.max >= 70 ? null : `shows ${s.last} s at ${run.time.toFixed(1)} s`;
  },
};

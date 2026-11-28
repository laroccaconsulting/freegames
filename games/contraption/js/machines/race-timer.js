import { withIds, heartbeat, toggle, wire, digit, readDigitAt } from './kit.js';

// A stopwatch made of logic, timing a ball. The beam at the start sets a
// toggle; the beam at the finish clears it (its clear pin is the peg below).
// While it is set, a tenth-of-a-second heartbeat clocks two digits:
// tenths, and seconds from the tenths' carry.
const course = [
  { type: 'ramp', a: [2, 3], b: [11, 5] },
  { type: 'ramp', a: [12, 7], b: [3, 9] },
  { type: 'ramp', a: [2, 11], b: [11, 13] },
];
const START = [4, 1];
const FINISH = [12, 12];
const tenths = digit(26, 2, [7, 19]);
const secs = digit(15, 2, tenths.carry);
const parts = withIds([
  ...course,
  { type: 'beam', a: START, b: [4, 3] },
  { type: 'beam', a: FINISH, b: [12, 14] },
  toggle([4, 16]), wire(START, [4, 16]), wire(FINISH, [4, 17]),
  ...heartbeat([10, 16], 4 / 120), // plus two steps of gate delay: 6 steps, 0.05 s each half beat
  { type: 'nand', p: [7, 16] }, wire([4, 16], [7, 16]), wire([10, 16], [7, 16]),
  { type: 'nand', p: [7, 19] }, wire([7, 16], [7, 19]),
  ...tenths.parts,
  ...secs.parts,
]);
const beams = parts.filter((p) => p.type === 'beam').map((p) => p.id);

export default {
  id: 'race-timer',
  title: 'Race timer',
  note: 'A stopwatch built from logic, timing a ball down three ramps. The beam at the start sets a toggle and the beam at the finish clears it. While it is set, a heartbeat ticking ten times a second clocks the tenths digit, whose carry clocks the seconds.',
  board: { w: 36, h: 23, walls: [[0, 22, 36, 1], [12.6, 2, 0.4, 6], [1.2, 8, 0.4, 3.5]], items: [{ type: 'ball', x: 2.6, y: 2.4 }] },
  parts,
  seconds: 12,
  watch: (run, s) => {
    const [a, b] = beams.map((id) => !!run.signals.get(id));
    if (a && s.start == null) s.start = run.time;
    if (b && s.stop == null) s.stop = run.time;
  },
  verify: (run, s) => {
    if (s.start == null || s.stop == null) return 'the ball did not pass both beams';
    const shown = readDigitAt(run, parts, secs.seg) + readDigitAt(run, parts, tenths.seg) / 10;
    const real = s.stop - s.start;
    return Math.abs(shown - real) <= 0.25 ? null : `shows ${shown.toFixed(1)} s, the run took ${real.toFixed(2)} s`;
  },
};

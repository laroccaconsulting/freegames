import { withIds } from './kit.js';

// One motor, three dials: a 10-tooth gear drives a 40 (a quarter the speed),
// whose own 10-tooth gear drives another 40 (a sixteenth). Each pair turns
// the other way, and each step down multiplies the turning force by four.
const parts = withIds([
  { type: 'motor', p: [4, 8], dir: 1 },
  { type: 'gear', p: [4, 8], teeth: 10, plane: 0 },
  { type: 'dial', p: [4, 8], r: 1.25 },
  { type: 'gear', p: [9, 8], teeth: 40, plane: 0 },
  { type: 'gear', p: [9, 8], teeth: 10, plane: 1 },
  { type: 'dial', p: [9, 8], r: 2.5 },
  { type: 'gear', p: [14, 8], teeth: 40, plane: 1 },
  { type: 'dial', p: [14, 8], r: 2.5 },
]);
const turns = (run, peg) => {
  const A = run.axles.get(peg);
  return (run.trains[A.train].theta * A.k) / (2 * Math.PI);
};

export default {
  id: 'gearbox',
  category: 'gears',
  since: '2026-12-13',
  title: 'Gearbox',
  note: 'One motor and three dials. The first turns with the motor; a 10-tooth gear driving a 40 turns the second a quarter as fast, the other way; another 10 and 40 turn the third a sixteenth as fast. Slower, but four times as strong at every step.',
  board: { w: 19, h: 14 },
  parts,
  seconds: 20,
  verify: (run) => {
    const a = turns(run, '4,8');
    const b = turns(run, '9,8');
    const c = turns(run, '14,8');
    if (a < 10) return `the motor dial only turned ${a.toFixed(1)} times`;
    if (Math.abs(b / a + 1 / 4) > 1e-6 || Math.abs(c / a - 1 / 16) > 1e-6) return `ratios ${(b / a).toFixed(4)} and ${(c / a).toFixed(4)}`;
    return null;
  },
};

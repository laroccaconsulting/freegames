import { MARBLE_MACHINE } from '../showcase.js';
import { digit, readDigitAt, withIds, edges } from './kit.js';

// The marble machine, counting its laps in decimal on a two-digit display
// below the floor: the beam at the top of the lift clocks the units
// counter chip, whose carry clocks the tens.
const BEAM = [11, 3];
const loop = MARBLE_MACHINE.parts.filter((p) => !(p.type === 'pixel' || p.type === 'nand' || (p.type === 'wire' && !(p.a[0] === 11 && p.a[1] === 3 && p.b[0] === 14))));
const units = digit(13, 18, BEAM);
const tens = digit(2, 18, units.carry);
const parts = withIds([...loop, ...units.parts, ...tens.parts]);
const beamId = parts.find((p) => p.type === 'beam').id;

export default {
  id: 'lap-counter',
  title: 'Lap counter',
  note: 'The marble machine again, now counting in decimal. The beam at the top of the lift clocks a counter chip; when it wraps from 9 to 0 its carry clocks the tens. Each digit is a decoder chip of 21 NANDs lighting fifteen pixels. Open the chips to see the toggles inside.',
  board: { ...MARBLE_MACHINE.board, h: 31 },
  parts,
  seconds: 150,
  watch: (run, s) => edges(run, s, 'laps', beamId),
  verify: (run, s) => {
    const shown = 10 * readDigitAt(run, parts, tens.seg) + readDigitAt(run, parts, units.seg);
    if (s.laps < 12) return `only ${s.laps} laps`;
    return shown === s.laps % 100 ? null : `display shows ${shown}, beam counted ${s.laps}`;
  },
};

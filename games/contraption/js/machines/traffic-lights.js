import { counterChip } from '../clock.js';
import { withIds, heartbeat, lamp, wire } from './kit.js';

// A heartbeat clocks a counter chip that counts 0, 1, 2, 0… Red is "neither
// bit on" (two NOTs, a NAND for OR, a NOT), amber is bit 0, green is bit 1.
// The green light also runs the belt: the crate only moves on green.
const raw = [
  ...heartbeat([2, 2], 1),
  { type: 'chip', p: [6, 2], def: counterChip(3) },
  wire([2, 2], [6, 3]),
  { type: 'nand', p: [12, 3] }, wire([9, 3], [12, 3]),
  { type: 'nand', p: [12, 6] }, wire([9, 4], [12, 6]),
  { type: 'nand', p: [14, 4] }, wire([12, 3], [14, 4]), wire([12, 6], [14, 4]),
  { type: 'nand', p: [16, 4] }, wire([14, 4], [16, 4]),
  lamp([20, 2]), wire([16, 4], [20, 2]),
  lamp([20, 3]), wire([9, 3], [20, 3]),
  lamp([20, 4]), wire([9, 4], [20, 4]),
  { type: 'conveyor', a: [5, 11], b: [17, 11] },
  { type: 'gear', p: [5, 11], teeth: 20, plane: 0 },
  { type: 'gear', p: [5, 8], teeth: 10, plane: 0 },
  { type: 'motor', p: [5, 8], dir: -1 },
  wire([20, 4], [5, 8]),
];
const parts = withIds(raw);
const id = (x, y) => parts.find((p) => p.type === 'pixel' && p.p[0] === x && p.p[1] === y).id;
const [RED, AMBER, GREEN] = [id(20, 2), id(20, 3), id(20, 4)];

export default {
  id: 'traffic-lights',
  category: 'logic',
  since: '2026-12-13',
  title: 'Traffic lights',
  note: 'A heartbeat clocks a counter chip that counts 0, 1, 2 and round again. Amber is its first bit, green its second, and red is neither: two NOTs and a NAND make OR, and one more NOT turns it round. The green light also drives the belt (geared down, so it coasts a little as it stops): the crate goes on green and waits on red.',
  board: { w: 22, h: 16, walls: [[0, 15, 22, 1]], goal: { x: 17.75, y: 10.8, w: 4, h: 4.2, cup: true }, items: [{ type: 'crate', x: 6, y: 10 }] },
  parts,
  seconds: 30,
  watch: (run, s) => {
    const now = [RED, AMBER, GREEN].map((i) => !!run.signals.get(i));
    const which = now.indexOf(true);
    // a gate answers one step late, so for a few steps at a change two lights can show
    s.both = now.filter(Boolean).length > 1 ? (s.both || 0) + 1 : 0;
    if (s.both > 12) s.bad = `two lights at once at ${run.time.toFixed(2)} s`;
    // a light counts once it has stayed on 0.2 s (the wrap from 2 to 0 flickers through 3)
    if (which !== s.cand) [s.cand, s.candT] = [which, run.time];
    if (which >= 0 && which !== s.last && run.time - s.candT > 0.2) {
      s.seq = (s.seq || '') + 'RAG'[which];
      s.last = which;
    }
    const crate = run.items[0];
    // the belt coasts a moment as the gears spin down; after that, nothing moves on red
    if (now[0]) s.redSince ??= run.time;
    else s.redSince = null;
    if (now[0] && run.time - s.redSince > 1.5 && Math.abs(crate.vx) > 0.2 && !run.delivered[0]) s.bad = `the crate moved on red at ${run.time.toFixed(2)} s`;
  },
  verify: (run, s) => {
    if (s.bad) return s.bad;
    if (run.status !== 'win') return `not delivered: ${run.reason || run.status}`;
    return /RAGRAG/.test(s.seq) ? null : `lights went ${s.seq}`;
  },
};

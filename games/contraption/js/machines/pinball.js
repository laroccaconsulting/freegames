import { withIds, toggle, wire, edges } from './kit.js';

// Pinball: the spring launches the ball up the lane; a curve turns it into
// the playfield; it bounces off the bumpers through two scoring beams and
// drains into the cup. Each pass through a beam adds one to a 3-bit score.
const field = [
  {type: 'spring', p: [18, 22], dir: 270, power: 3, delay: 1},
  {type: 'curve', a: [19, 16], b: [15, 11], bend: 1},
  {type: 'bouncer', a: [5, 9], b: [7, 10]},
  {type: 'bouncer', a: [10, 12], b: [12, 11]},
  {type: 'bouncer', a: [3, 15], b: [5, 16]},
  {type: 'bouncer', a: [12, 17], b: [14, 16]},
];
const parts = withIds([
  ...field,
  { type: 'beam', a: [10, 14], b: [10, 18] },
  { type: 'beam', a: [6, 16], b: [6, 20] },
  toggle([4, 2]), toggle([3, 2]), toggle([2, 2]),
  { type: 'nand', p: [4, 5] }, { type: 'nand', p: [3, 5] },
  wire([10, 14], [4, 2]), wire([6, 16], [4, 2]),
  wire([4, 2], [4, 5]), wire([4, 5], [3, 2]),
  wire([3, 2], [3, 5]), wire([3, 5], [2, 2]),
]);
const beams = parts.filter((p) => p.type === 'beam').map((p) => p.id);
const bits = [[4, 2], [3, 2], [2, 2]].map(([x, y]) => parts.find((p) => p.type === 'pixel' && p.p[0] === x && p.p[1] === y).id);

export default {
  id: 'pinball',
  title: 'Pinball',
  category: 'chains',
  since: '2026-12-16',
  note: 'A second in, the spring launches the ball up the lane. A curve turns it into the playfield, where it ricochets off the bumpers through two scoring beams and drains into the cup. Each pass through a beam adds one to the score, kept in binary on the three lights at the top.',
  board: {w: 20, h: 24, walls: [[0, 23, 20, 1], [16, 17, 0.4, 6], [19.6, 0, 0.4, 23], [0, 0, 0.4, 23]], items: [{type: 'ball', x: 18, y: 20.95}], goal: {x: 0.5, y: 20, w: 4.5, h: 3, cup: true}},
  parts,
  seconds: 12,
  watch: (run, s) => beams.forEach((id) => edges(run, s, id, id)),
  verify: (run, s) => {
    if (run.status !== 'win') return `did not drain into the cup: ${run.reason || run.status}`;
    const hits = beams.reduce((n, id) => n + (s[id] || 0), 0);
    const score = bits.reduce((v, id, i) => v + (run.signals.get(id) ? 1 << i : 0), 0);
    if (hits < 2) return `only ${hits} scoring passes`;
    return score === hits % 8 ? null : `score shows ${score} for ${hits} passes`;
  },
};

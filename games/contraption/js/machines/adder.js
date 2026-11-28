import { counterChip } from '../clock.js';
import { withIds, heartbeat, lamp, wire } from './kit.js';

/**
 * A full adder from NANDs, as a chip: inputs a, b, carry in; outputs sum
 * and carry out. A chip input feeds one gate, so each input comes in
 * through two NOTs (a buffer) before it fans out to the gates that need it.
 */
export function fullAdderChip() {
  const N = (id) => ({ id, type: 'nand' });
  const parts = ['ia', 'a', 'ib', 'b', 'ic', 'c', 'n1', 'n2', 'n3', 'x', 'n5', 'n6', 'n7', 's', 'co'].map(N);
  const links = [
    ['ia', 'a'], ['ib', 'b'], ['ic', 'c'],
    ['a', 'n1'], ['b', 'n1'], // n1 = NAND(a, b)
    ['a', 'n2'], ['n1', 'n2'], ['b', 'n3'], ['n1', 'n3'],
    ['n2', 'x'], ['n3', 'x'], // x = a XOR b
    ['x', 'n5'], ['c', 'n5'],
    ['x', 'n6'], ['n5', 'n6'], ['c', 'n7'], ['n5', 'n7'],
    ['n6', 's'], ['n7', 's'], // s = x XOR c
    ['n1', 'co'], ['n5', 'co'], // carry = a·b + x·c
  ];
  return { name: 'ADD', parts, links, inputs: ['ia', 'ib', 'ic'], outputs: ['s', 'co'] };
}

// Two counters tick at different speeds; three full adders add their 3-bit
// counts; the lamps show A, B and the 4-bit sum.
const A_OUT = [[8, 3], [8, 4], [8, 5]];
const B_OUT = [[8, 11], [8, 12], [8, 13]];
const FA = [2, 7, 12].map((y) => ({ type: 'chip', p: [14, y], def: fullAdderChip() }));
const raw = [
  ...heartbeat([2, 2], 1),
  { type: 'chip', p: [5, 2], def: counterChip(8) }, wire([2, 2], [5, 3]),
  ...heartbeat([2, 10], 0.3),
  { type: 'chip', p: [5, 10], def: counterChip(8) }, wire([2, 10], [5, 11]),
  ...FA,
];
FA.forEach((fa, i) => {
  const [x, y] = fa.p;
  raw.push(wire(A_OUT[i], [x, y + 1]), wire(B_OUT[i], [x, y + 2]));
  if (i > 0) raw.push(wire([x + 3, FA[i - 1].p[1] + 2], [x, y + 3])); // carry from the adder before
});
const SUM = [[27, 3], [26, 3], [25, 3], [24, 3]];
FA.forEach((fa, i) => raw.push(lamp(SUM[i]), wire([fa.p[0] + 3, fa.p[1] + 1], SUM[i])));
raw.push(lamp(SUM[3]), wire([17, FA[2].p[1] + 2], SUM[3]));
[A_OUT, B_OUT].forEach((outs, row) => outs.forEach((o, i) => raw.push(lamp([27 - i, 6 + 2 * row]), wire(o, [27 - i, 6 + 2 * row]))));
const parts = withIds(raw);
const at = (x, y) => parts.find((p) => p.type === 'pixel' && p.p[0] === x && p.p[1] === y).id;
const value = (run, pegs) => pegs.reduce((v, [x, y], i) => v + (run.signals.get(at(x, y)) ? 1 << i : 0), 0);
const rowPegs = (row) => [0, 1, 2].map((i) => [27 - i, 6 + 2 * row]);

export default {
  id: 'adder',
  title: 'Adder',
  note: 'A computer\'s first trick, in NANDs. Two counters tick at different speeds; their bits feed three full-adder chips (open one: fifteen NANDs, two of them XORs), each passing its carry to the next. The top row of lamps is always the sum of the two rows below.',
  board: { w: 30, h: 18 },
  parts,
  seconds: 20,
  watch: (run, s) => {
    const a = value(run, rowPegs(0));
    const b = value(run, rowPegs(1));
    const key = a * 8 + b;
    if (key !== s.key) [s.key, s.since] = [key, run.time];
    // once the inputs have been still a moment, the sum must be right
    if (run.time - s.since > 0.15 && s.checked !== key) {
      s.checked = key;
      s.n = (s.n || 0) + 1;
      const sum = value(run, SUM);
      if (sum !== a + b) s.bad ??= `${a} + ${b} showed ${sum} at ${run.time.toFixed(2)} s`;
    }
  },
  verify: (run, s) => s.bad ?? (s.n >= 25 ? null : `only ${s.n} sums checked`),
};

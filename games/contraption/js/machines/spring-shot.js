import { withIds } from './kit.js';

// A spring fires the ball straight up into an upside-down curve, which bends
// the climb into a sideways throw onto a high shelf.
const parts = withIds([
  { type: 'spring', p: [5, 14], dir: 270, power: 3, delay: 1 },
  { type: 'curve', a: [4, 7], b: [8, 3], bend: -0.5 },
]);

export default {
  id: 'spring-shot',
  category: 'chains',
  since: '2026-12-13',
  title: 'Spring shot',
  note: 'After a second the spring lets go and the ball shoots straight up. An upside-down curve catches the climb and bends it sideways, still fast, so the ball arcs over onto the shelf: up, over and in, from two parts.',
  board: { w: 18, h: 16, walls: [[0, 15, 18, 1], [9.75, 11, 4.5, 0.5]], goal: { x: 10, y: 8.5, w: 4, h: 2.5, cup: true }, items: [{ type: 'ball', x: 5, y: 13 }] },
  parts,
  seconds: 8,
  verify: (run) => (run.status === 'win' ? null : `not delivered: ${run.reason || run.status}`),
};

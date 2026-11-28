import { withIds } from './kit.js';

// Five balls, four seesaws. Each seesaw is latched: a ball can sit on it
// without tipping it, until something lands on it hard. Then it tips onto
// its stop and its own ball rolls off the end, down onto the next one.
const SEESAWS = [[3, 4], [7, 7], [11, 10], [15, 13]];

export default {
  id: 'seesaw-cascade',
  title: 'Seesaw cascade',
  category: 'chains',
  since: '2026-12-17',
  note: 'Four latched seesaws, each with a ball waiting on it. A latched lever only lets go when something hits it hard, so a ball can rest on it. The first ball rolls off the shelf and lands on the first seesaw: it tips onto its stop, its own ball rolls off the end and lands on the next. Five balls, one after another, into the cup.',
  board: {
    w: 24,
    h: 18,
    walls: [[0, 17, 24, 1], [23.6, 0, 0.4, 17], ...SEESAWS.map(([x, y]) => [x + 1.8, y + 0.9, 0.6, 0.4])],
    goal: { x: 17.5, y: 14.5, w: 6, h: 2.5, cup: true },
    items: [{ type: 'ball', x: 2, y: 0.5 }, ...SEESAWS.map(([x, y]) => ({ type: 'ball', x: x + 2.55, y: y - 0.56 }))],
  },
  parts: withIds([
    { type: 'ramp', a: [1, 1], b: [4, 2] },
    ...SEESAWS.map(([x, y]) => ({ type: 'lever', p: [x, y], angle: 0, l1: 1, l2: 3, latch: true })),
  ]),
  seconds: 15,
  // each seesaw lets go in turn, top to bottom, and every ball ends in the cup
  watch: (run, s) => {
    s.order ??= [];
    run.trains.forEach((t, i) => { if (!t.held && !s.order.includes(i)) s.order.push(i); });
  },
  verify: (run, s) => {
    if (run.status !== 'win') return `not delivered: ${run.reason || run.status}`;
    const want = run.trains.map((_, i) => i).join();
    return s.order?.join() === want ? null : `seesaws let go out of order: ${s.order}`;
  },
};

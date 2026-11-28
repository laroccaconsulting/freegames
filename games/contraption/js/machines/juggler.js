import { withIds, wire } from './kit.js';

// A spring can keep a ball in the air for ever: a beam just above its head
// sees the ball coming down and fires it, and the spring has re-cocked by
// then. Each bounce gives back what the fall took. Two jugglers, dropped
// from different heights, so they keep different time.
const juggler = (x) => [
  { type: 'spring', p: [x, 14], dir: 270, power: 2 },
  { type: 'beam', a: [x - 1, 12], b: [x + 1, 12] },
  wire([x - 1, 12], [x, 14]),
];
const parts = withIds([...juggler(4), ...juggler(10)]);

export default {
  id: 'juggler',
  title: 'Juggler',
  category: 'lifts',
  since: '2026-12-16',
  note: 'Two springs keep two balls in the air for ever. A beam just above each spring sees its ball coming down and fires the spring under it; the spring has re-cocked by then. Each kick gives back what the fall took, so every bounce reaches the same height. Dropped from different heights, the two never quite keep step.',
  board: { w: 14, h: 16, walls: [[0, 15, 14, 1]], items: [{ type: 'ball', x: 4, y: 6, deliver: false }, { type: 'ball', x: 10, y: 2, deliver: false }] },
  parts,
  seconds: 60,
  watch: (run, s) => {
    run.items.forEach((b, i) => {
      const k = `up${i}`;
      if (s[`vy${i}`] < 0 && b.vy >= 0) s[k] = (s[k] || 0) + 1;
      s[`vy${i}`] = b.vy;
      if (b.gone || b.y > 14) s.dropped = `ball ${i} came down to stay at ${run.time.toFixed(1)} s`;
    });
  },
  verify: (run, s) => s.dropped ?? (s.up0 >= 25 && s.up1 >= 25 ? null : `bounces ${s.up0} and ${s.up1}`),
};

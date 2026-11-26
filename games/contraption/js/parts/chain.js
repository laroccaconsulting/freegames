import { drawChain } from '../render.js';
import { key, dist, segDist, gearR, gearOn } from '../geom.js';

const MAX = 20;

// A chain runs behind the board between two gears, wherever they are.
// pa / pb say which layer's gear it runs on at each end (back if unset).
export default {
  type: 'chain',
  name: 'Chain',
  blurb: 'Links two gears that are apart.',
  physics: 'A chain keeps the direction; the speed changes by the ratio of the two gears\' teeth.',
  tip: 'Tap one gear, then the other.',
  layer: 1,
  back: true,
  free: true, // placed by tapping two gears, not on a peg
  pegs: (part) => [part.a, part.b],
  shape: (part) => ({ verts: [part.a, part.b], radius: 0.3 }),
  check: (level, part, others) => {
    const ga = gearOn(others, part.a, part.pa ?? 0);
    const gb = gearOn(others, part.b, part.pb ?? 0);
    if (!ga || !gb) return 'A chain needs a gear at each end';
    if (key(part.a) === key(part.b)) return 'Pick two different gears';
    if (dist(part.a, part.b) < gearR(ga) + gearR(gb) + 0.5) return 'Too close: those gears mesh or touch';
    if (dist(part.a, part.b) > MAX) return 'Too long';
    const same = (o) => (key(o.a) === key(part.a) && key(o.b) === key(part.b)) || (key(o.a) === key(part.b) && key(o.b) === key(part.a));
    if (others.some((o) => o !== part && o.id !== part.id && o.type === 'chain' && same(o))) return 'Already chained';
    return null;
  },
  links: (part, axles, link) => {
    const A = axles.get(key(part.a));
    const B = axles.get(key(part.b));
    const ga = A && gearOn(A.gears, part.a, part.pa ?? 0);
    const gb = B && gearOn(B.gears, part.b, part.pb ?? 0);
    if (ga && gb && A !== B) link(A, B, gearR(ga) / gearR(gb), 'chain');
  },
  draw: (view, pal, part, live) => {
    const ga = gearOn(live.all, part.a, part.pa ?? 0);
    const gb = gearOn(live.all, part.b, part.pb ?? 0);
    if (ga && gb) drawChain(view.ctx, view, pal, part.a, gearR(ga) + 0.05, part.b, gearR(gb) + 0.05, live.turn(part.a) * gearR(ga));
  },
  move: (part, o, dx, dy) => {
    part.a = [o.a[0] + dx, o.a[1] + dy];
    part.b = [o.b[0] + dx, o.b[1] + dy];
  },
  defaults: () => [],
  handles: () => [],
  drag: () => false,
  distance: (part, wx, wy) => segDist(wx, wy, ...part.a, ...part.b) + 0.15,
  hint: () => 'Delete it to unhook the gears.',
};

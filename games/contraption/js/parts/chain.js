import { drawChain } from '../render.js';
import { key, dist, segDist } from '../geom.js';

const MAX = 20;
const gearAt = (others, p) => others.find((o) => o.type === 'gear' && key(o.p) === key(p));

// A chain runs behind the board between two gears, wherever they are.
export default {
  type: 'chain',
  name: 'Chain',
  blurb: 'Links two gears that are apart.',
  physics: 'A chain keeps the direction and the same ratio as meshing: sizes set the speed.',
  tip: 'Tap one gear, then the other.',
  layer: 1,
  back: true,
  free: true, // placed by tapping two gears, not on a peg
  pegs: (part) => [part.a, part.b],
  shape: (part) => ({ verts: [part.a, part.b], radius: 0.3 }),
  check: (level, part, others) => {
    const ga = gearAt(others, part.a);
    const gb = gearAt(others, part.b);
    if (!ga || !gb) return 'A chain needs a gear at each end';
    if (key(part.a) === key(part.b)) return 'Pick two different gears';
    if (dist(part.a, part.b) < ga.size + gb.size + 0.5) return 'Too close: those gears mesh or touch';
    if (dist(part.a, part.b) > MAX) return 'Too long';
    const same = (o) => (key(o.a) === key(part.a) && key(o.b) === key(part.b)) || (key(o.a) === key(part.b) && key(o.b) === key(part.a));
    if (others.some((o) => o !== part && o.id !== part.id && o.type === 'chain' && same(o))) return 'Already chained';
    return null;
  },
  links: (part, axles, link) => {
    const A = axles.get(key(part.a));
    const B = axles.get(key(part.b));
    if (A?.gear && B?.gear && A !== B) link(A, B, A.gear.size / B.gear.size, 'chain');
  },
  draw: (view, pal, part, live) => {
    const ga = gearAt(live.all, part.a);
    const gb = gearAt(live.all, part.b);
    if (ga && gb) drawChain(view.ctx, view, pal, part.a, ga.size + 0.05, part.b, gb.size + 0.05, live.turn(part.a) * ga.size);
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

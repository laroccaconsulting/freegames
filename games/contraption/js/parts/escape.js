import { addBody, placeShape, circle } from '../physics.js';
import { dist } from '../geom.js';
import { onePeg } from './_two-peg.js';
import { R, ROOT, TEETH, PHASE, SPRING, toothShape, wheelOutline } from '../escapement.js';

// The escape wheel: thirty real teeth (one body each) on a spring that
// always pulls the wheel clockwise. On its own it just spins; with a
// pendulum three pegs above, the pallets let it go one tooth per swing.
// It turns its peg, so gears on the same peg turn with it.
const OUTLINE = wheelOutline();

export default {
  type: 'escape',
  name: 'Escape wheel',
  blurb: 'Thirty teeth and a spring that always pulls them round. A pendulum three pegs above lets it turn one tooth per swing.',
  physics: 'The heart of a clock. The pendulum keeps the beat, the teeth give it a small push each swing to keep it going, and the wheel can only move as fast as the swings allow.',
  tip: 'Put a pendulum three pegs straight above it, and gears on its peg to turn hands.',
  layer: 1,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(circle(R), part.p[0], part.p[1]),
  check: (level, part, others) => {
    for (const o of others) {
      if (o === part || o.id === part.id || o.type !== 'escape') continue;
      if (dist(o.p, part.p) < 2 * R) return 'Too close to another escape wheel';
    }
    return null;
  },
  axles: (part, axle) => axle(part.p).extra.push(part),
  inertia: () => 0.05,
  motor: () => ({ stall: SPRING.stall, speed: SPRING.speed, dir: 1, spring: true }),
  body: (world, part, ctx) => {
    const A = ctx.axle(part.p);
    let first = null;
    for (let i = 0; i < TEETH; i++) {
      // teeth only ever touch pallets
      const b = addBody(world, { kind: 'rotor', shape: toothShape(i), x: part.p[0], y: part.p[1], base: PHASE, train: A.train, k: A.k, density: 0.2, friction: 0.05, restitution: 0.05, tag: 'tooth', mask: (o) => o.tag === 'pallet' });
      first ||= b;
    }
    return first;
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(part.p[0], part.p[1]);
    ctx.rotate(PHASE + live.turn(part.p));
    ctx.beginPath();
    OUTLINE.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(1.6);
    ctx.lineJoin = 'round';
    ctx.stroke();
    // four spokes so the turning shows
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.moveTo(Math.cos(a) * 0.25, Math.sin(a) * 0.25);
      ctx.lineTo(Math.cos(a) * (ROOT - 0.15), Math.sin(a) * (ROOT - 0.15));
    }
    ctx.moveTo(ROOT - 0.15, 0);
    ctx.arc(0, 0, ROOT - 0.15, 0, Math.PI * 2);
    ctx.lineWidth = view.px(1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.16, 0, Math.PI * 2);
    ctx.fillStyle = pal.ink;
    ctx.fill();
    ctx.restore();
  },
  defaults: ([x, y]) => [{ type: 'escape', p: [x, y] }],
  distance: (part, wx, wy) => Math.hypot(wx - part.p[0], wy - part.p[1]) - R * 0.6,
  hint: () => 'Spins on its spring unless a pendulum three pegs straight above holds it to one tooth per swing.',
};

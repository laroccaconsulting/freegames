import { addBody, box, placeShape, capsule } from '../physics.js';
import { onePeg } from './_two-peg.js';

// A pusher: a crank on its peg works a paddle back and forth along a short
// slide (a Scotch yoke: the paddle's travel follows the crank exactly, out
// and back once a turn). Whatever turns the peg turns the crank: a motor,
// gears, a chain, an escape wheel. The paddle moves with the peg, like a
// belt's cleats, so it never stalls. Point it up and it lifts a ball a step.
const DIRS = [0, 90, 180, 270];
export const PUSH = { gap: 0.6, w: 0.25, h: 1.4 };

const unit = (part) => {
  const a = ((part.dir ?? 0) * Math.PI) / 180;
  return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
};
/** Paddle centre for a crank angle θ (0 = drawn back). */
export function paddleAt(part, theta) {
  const [ux, uy] = unit(part);
  const r = part.r ?? 1;
  const d = PUSH.gap + r * (1 - Math.cos(theta));
  return [part.p[0] + ux * d, part.p[1] + uy * d];
}

export default {
  type: 'pusher',
  name: 'Pusher',
  blurb: 'A crank on its peg works a paddle out and back along a slide. Turn the peg and it shoves, once a turn.',
  physics: 'A crank turns going round into going back and forth: the paddle is fastest mid-stroke and pauses at each end.',
  tip: 'Put it on a motor\'s peg, or gear it down for a slow, strong shove. Point it up to lift a ball onto a ledge.',
  layer: 3,
  front: false,
  back: true,
  ...onePeg,
  shape: (part) => {
    const [x1, y1] = paddleAt(part, 0);
    const [x2, y2] = paddleAt(part, Math.PI);
    return placeShape(capsule(x1, y1, x2, y2, 0.3));
  },
  check: (level, part) => {
    const [x, y] = paddleAt(part, Math.PI);
    if (x < 0 || y < 0 || x > level.w || y > level.h) return 'Off the board';
    return null;
  },
  axles: (part, axle) => axle(part.p).extra.push(part),
  inertia: () => 0.02,
  body: (world, part, ctx) => {
    const A = ctx.axle(part.p);
    const [ux, uy] = unit(part);
    const motion = (t) => {
      const th = (A.train.theta + (t - world.time) * A.train.v) * A.k;
      const [x, y] = paddleAt(part, th);
      return { x, y, angle: Math.atan2(uy, ux) };
    };
    return addBody(world, { kind: 'kinematic', shape: box(PUSH.w, PUSH.h), motion, friction: 0.5, restitution: 0.1, tag: 'pusher' });
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const th = live.turn(part.p);
    const [ux, uy] = unit(part);
    const [px, py] = paddleAt(part, th);
    const r = part.r ?? 1;
    ctx.save();
    // the slide
    const [sx1, sy1] = paddleAt(part, 0);
    const [sx2, sy2] = paddleAt(part, Math.PI);
    ctx.strokeStyle = pal.mid;
    ctx.lineWidth = view.px(1.4);
    ctx.setLineDash([0.18, 0.12]);
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.setLineDash([]);
    // crank disc and pin
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(1.8);
    ctx.beginPath();
    ctx.arc(part.p[0], part.p[1], Math.min(0.45, r * 0.45), 0, Math.PI * 2);
    ctx.stroke();
    // the rod from the peg to the paddle
    ctx.lineWidth = view.px(2.4);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(part.p[0], part.p[1]);
    ctx.lineTo(px, py);
    ctx.stroke();
    // the paddle
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = pal.ink;
    ctx.fillRect(-PUSH.w / 2, -PUSH.h / 2, PUSH.w, PUSH.h);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(part.p[0], part.p[1], 0.12, 0, Math.PI * 2);
    ctx.fillStyle = pal.ink;
    ctx.fill();
  },
  defaults: ([x, y]) => DIRS.map((dir) => ({ type: 'pusher', p: [x, y], dir, r: 1 })),
  distance: (part, wx, wy) => {
    const [x, y] = paddleAt(part, 0);
    return Math.min(Math.hypot(wx - part.p[0], wy - part.p[1]), Math.hypot(wx - x, wy - y)) - 0.35;
  },
  controls: (part) => [
    { kind: 'choice', field: 'dir', value: part.dir ?? 0, options: [[0, '→', 'Push right'], [90, '↓', 'Push down'], [180, '←', 'Push left'], [270, '↑', 'Push up']] },
    { kind: 'stepper', field: 'r', value: part.r ?? 1, step: 0.5, min: 0.5, max: 2, label: (v) => `stroke ${v * 2}`, aria: ['Shorter stroke', 'Longer stroke'] },
  ],
  hint: () => 'Turn its peg (a motor, gears) and the paddle shoves out and back once a turn.',
};

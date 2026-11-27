import { addBody, capsule, placeShape } from '../physics.js';
import { onePeg } from './_two-peg.js';

// A winch: a drum on a peg winds a rope that hangs a bucket. Turn the peg
// clockwise and the rope winds in, lifting the bucket; at the top it tips
// and empties to one side. Turn it back and the bucket comes down. Like a
// belt's cleats it moves with its peg exactly (it does not slow the motor).
export const WINCH = { drum: 0.5, top: 1.2, tip: 1.2, tipAngle: 1.9, w: 1.3, wall: 0.7, chute: [0.75, 1.0, 2.3, 1.35] };

/** The chute the bucket pours onto at the top, beside the bucket's path. */
export function chuteOf(part) {
  const sd = part.side ?? 1;
  const [x0, y0, x1, y1] = WINCH.chute;
  return [[part.p[0] + x0 * sd, part.p[1] + WINCH.top + y0], [part.p[0] + x1 * sd, part.p[1] + WINCH.top + y1]];
}

/** Bucket pose (rope length, tilt) for a peg turn θ. */
export function bucketAt(part, theta) {
  const l = part.l ?? 6;
  const wound = theta * WINCH.drum;
  const len = Math.max(WINCH.top, Math.min(l, l - wound));
  const over = Math.max(0, wound - (l - WINCH.top));
  const sd = part.side ?? 1;
  const tilt = Math.min(1, over / WINCH.tip) * WINCH.tipAngle * sd;
  // the bucket tips over its pouring lip (the top corner on its side), like a skip
  return { x: part.p[0] + (WINCH.w / 2) * sd, y: part.p[1] + len + 0.1, angle: tilt, len };
}

// the bucket in its own frame: origin at the pouring lip, open at the top
const shapes = (sd) => {
  const { w, wall } = WINCH;
  const L = (x) => x - (w / 2) * sd;
  return [capsule(L(-w / 2), wall - 0.1, L(w / 2), wall - 0.1, 0.08), capsule(L(-w / 2), wall - 0.1, L(-w / 2), 0, 0.08), capsule(L(w / 2), wall - 0.1, L(w / 2), 0, 0.08)];
};

export default {
  type: 'winch',
  name: 'Winch',
  blurb: 'A drum winds a rope that lifts a bucket. At the top the bucket tips out to one side.',
  physics: 'A wheel and axle: the drum is small, so a motor that turns it gently lifts a heavy load steadily.',
  tip: 'Hang the bucket where a ball can roll in, and put a motor on the drum\'s peg. Set which way it tips.',
  layer: 3,
  front: false,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(capsule(part.p[0], part.p[1], part.p[0], part.p[1] + (part.l ?? 6), 0.3)),
  check: (level, part) => {
    const l = part.l ?? 6;
    if (l < 2 || l > 12) return 'The rope must be 2 to 12 long';
    if (part.p[1] + l + WINCH.wall > level.h) return 'Off the board';
    return null;
  },
  axles: (part, axle) => axle(part.p).extra.push(part),
  inertia: () => 0.03,
  body: (world, part, ctx) => {
    const A = ctx.axle(part.p);
    const theta = (t) => (A.train.theta + (t - world.time) * A.train.v) * A.k;
    const [c0, c1] = chuteOf(part);
    addBody(world, { kind: 'static', shape: capsule(...c0, ...c1, 0.1), friction: 0.4, restitution: 0.1, tag: 'chute' });
    let first = null;
    for (const s of shapes(part.side ?? 1)) {
      const b = addBody(world, { kind: 'kinematic', shape: s, motion: (t) => bucketAt(part, theta(t)), friction: 0.5, restitution: 0.05, tag: 'bucket' });
      first ||= b;
    }
    return first;
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const b = bucketAt(part, live.turn(part.p));
    ctx.save();
    // drum
    ctx.beginPath();
    ctx.arc(part.p[0], part.p[1], WINCH.drum, 0, Math.PI * 2);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.stroke();
    const a = live.turn(part.p);
    ctx.beginPath();
    ctx.moveTo(part.p[0], part.p[1]);
    ctx.lineTo(part.p[0] + Math.cos(a) * WINCH.drum, part.p[1] + Math.sin(a) * WINCH.drum);
    ctx.stroke();
    // chute
    const [c0, c1] = chuteOf(part);
    ctx.beginPath();
    ctx.moveTo(...c0);
    ctx.lineTo(...c1);
    ctx.lineWidth = view.px(3.2);
    ctx.lineCap = 'round';
    ctx.stroke();
    // rope
    ctx.beginPath();
    ctx.moveTo(part.p[0] + WINCH.drum * (part.side ?? 1) * 0, part.p[1]);
    ctx.lineTo(part.p[0], part.p[1] + b.len);
    ctx.lineWidth = view.px(1.4);
    ctx.setLineDash([0.12, 0.08]);
    ctx.stroke();
    ctx.setLineDash([]);
    // bucket (drawn about its pouring lip)
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    const { w, wall } = WINCH;
    const L = (x) => x - (w / 2) * (part.side ?? 1);
    ctx.beginPath();
    ctx.moveTo(L(-w / 2), 0);
    ctx.lineTo(L(-w / 2), wall - 0.1);
    ctx.lineTo(L(w / 2), wall - 0.1);
    ctx.lineTo(L(w / 2), 0);
    ctx.lineWidth = view.px(3);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  },
  defaults: ([x, y]) => [6, 4, 8, 3].map((l) => ({ type: 'winch', p: [x, y], l, side: 1 })),
  distance: (part, wx, wy) => Math.abs(wx - part.p[0]) - 0.6 + (wy < part.p[1] - 0.6 || wy > part.p[1] + (part.l ?? 6) + 1 ? 9 : 0),
  controls: (part) => [
    { kind: 'stepper', field: 'l', value: part.l ?? 6, step: 1, min: 2, max: 12, label: (v) => `rope ${v}`, aria: ['Shorter rope', 'Longer rope'] },
    { kind: 'choice', field: 'side', value: part.side ?? 1, options: [[-1, '↶', 'Tips out to the left'], [1, '↷', 'Tips out to the right']] },
  ],
  hint: () => 'Turn its peg clockwise to wind the bucket up; at the top it tips out.',
};

import { addBody, placeShape, capsule } from '../physics.js';
import { rad, segDist } from '../geom.js';
import { onePeg } from './_two-peg.js';

// A trapdoor: a flap hinged on a peg, latched shut. Whatever sits on it
// stays put until a signal reaches the hinge; then the latch lets go for
// good and the flap swings down under its load. The trigger for a weight
// waiting to fall, a ball waiting to roll, a whole second machine.
const LEN = [1, 4];
const end = (part) => {
  const a = rad(part.angle || 0) ;
  const l = part.l ?? 2;
  return [part.p[0] + Math.cos(a) * l * (part.side ?? 1), part.p[1] + Math.sin(a) * l * (part.side ?? 1)];
};

export default {
  type: 'trapdoor',
  name: 'Trapdoor',
  blurb: 'A flap on a hinge, latched shut. A signal at the hinge unlatches it and it drops open.',
  physics: 'Potential energy, waiting: a weight sitting on a trapdoor is a fall held back until the moment you choose.',
  tip: 'Set a steel ball on it, wire a plate or beam to the hinge, and put a lever under the drop.',
  layer: 3,
  front: true,
  carries: true,
  ...onePeg,
  shape: (part) => placeShape(capsule(...part.p, ...end(part), 0.14)),
  check: (level, part) => {
    const l = part.l ?? 2;
    if (l < LEN[0] - 1e-9 || l > LEN[1] + 1e-9) return 'The flap must be 1 to 4 long';
    const e = end(part);
    if (e[0] < 0 || e[1] < 0 || e[0] > level.w || e[1] > level.h) return 'Off the board';
    return null;
  },
  axles: (part, axle) => axle(part.p).extra.push(part),
  input: (part) => part.p,
  body: (world, part, ctx) => {
    const A = ctx.axle(part.p);
    const l = (part.l ?? 2) * (part.side ?? 1);
    // latched: its train cannot turn until released
    A.train.jammed = true;
    A.train.latched = true;
    return addBody(world, { kind: 'rotor', shape: capsule(0, 0, l, 0, 0.14), x: part.p[0], y: part.p[1], base: rad(part.angle || 0), train: A.train, k: A.k, density: 0.4, friction: 0.6, restitution: 0.1, tag: 'trapdoor' });
  },
  /** A signal at the hinge: unlatch, for good. */
  release: (run, part) => {
    const b = run.partBodies.get(part.id);
    const t = b?.train;
    if (!t || !t.latched) return;
    t.latched = false;
    t.jammed = false;
    t.held = false;
    t.invI = 1 / t.I;
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const l = (part.l ?? 2) * (part.side ?? 1);
    const open = live.body && !live.body.train.latched;
    ctx.save();
    ctx.translate(part.p[0], part.p[1]);
    ctx.rotate(live.body ? live.body.angle : rad(part.angle || 0));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(l, 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = Math.max(0.28, view.px(3));
    ctx.stroke();
    // planks
    ctx.strokeStyle = pal.paper;
    ctx.lineWidth = view.px(1.2);
    ctx.beginPath();
    for (let x = 0.5; x < Math.abs(l) - 0.2; x += 0.5) {
      const sx = x * Math.sign(l);
      ctx.moveTo(sx, -0.1);
      ctx.lineTo(sx, 0.1);
    }
    ctx.stroke();
    // the latch at the free end: a hook while shut
    if (!open) {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = view.px(2);
      ctx.beginPath();
      ctx.moveTo(l, 0.1);
      ctx.lineTo(l, 0.38);
      ctx.lineTo(l - 0.2 * Math.sign(l), 0.38);
      ctx.stroke();
    }
    ctx.restore();
    // the hinge, with its signal socket
    ctx.beginPath();
    ctx.arc(part.p[0], part.p[1], 0.2, 0, Math.PI * 2);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(part.p[0], part.p[1], 0.08, 0, Math.PI * 2);
    ctx.fillStyle = live.signal?.(part) || open ? pal.ink : pal.paper;
    ctx.fill();
  },
  defaults: ([x, y]) => [
    { type: 'trapdoor', p: [x, y], l: 2, angle: 0, side: 1 },
    { type: 'trapdoor', p: [x, y], l: 2, angle: 0, side: -1 },
    { type: 'trapdoor', p: [x, y], l: 1, angle: 0, side: 1 },
  ],
  distance: (part, wx, wy) => segDist(wx, wy, ...part.p, ...end(part)) - 0.15,
  controls: (part) => [
    { kind: 'stepper', field: 'l', value: part.l ?? 2, step: 0.5, min: LEN[0], max: LEN[1], label: (v) => `flap ${v}`, aria: ['Shorter flap', 'Longer flap'] },
    { kind: 'choice', field: 'side', value: part.side ?? 1, options: [[-1, '◁', 'Hinge on the right'], [1, '▷', 'Hinge on the left']] },
    { kind: 'stepper', field: 'angle', value: part.angle || 0, step: 15, min: -45, max: 45, label: (v) => `${v}°`, aria: ['Tilt up', 'Tilt down'] },
  ],
  hint: () => 'Latched shut. Wire a signal to the hinge and it drops open, for good.',
};

import { addBody, box, placeShape, capsule } from '../physics.js';
import { onePeg } from './_two-peg.js';

// A spring launcher: a plunger cocked behind a latch. It fires when a
// signal reaches its peg (again each time the signal comes back on, once
// it has re-cocked), or, with no wire, after its delay. The plunger snaps
// out at a speed set by its power, holds a moment, and draws back. Point
// it up to throw a ball into the air, sideways to shoot it along a track.
export const SPRING = { rest: 0.45, stroke: 0.9, w: 0.25, h: 1.2, speeds: [0, 10, 15, 21], hold: 0.15, back: 0.6 };

const unit = (part) => {
  const a = ((part.dir ?? 270) * Math.PI) / 180;
  return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
};
const headAt = (part, u) => {
  const [ux, uy] = unit(part);
  const d = SPRING.rest + SPRING.stroke * u;
  return [part.p[0] + ux * d, part.p[1] + uy * d];
};

export default {
  type: 'spring',
  name: 'Spring',
  blurb: 'A plunger on a cocked spring. A signal at its peg (or, unwired, its delay) lets it fly out, then it re-cocks.',
  physics: 'A spring stores the work it took to compress it and gives it back all at once: a short push, very fast.',
  tip: 'Point it up under a ball to throw it onto a high shelf. More power, higher throw.',
  layer: 3,
  front: false,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(capsule(...headAt(part, 0), ...headAt(part, 1), 0.3)),
  check: (level, part) => {
    const [x, y] = headAt(part, 1);
    if (x < 0 || y < 0 || x > level.w || y > level.h) return 'Off the board';
    return null;
  },
  input: (part) => part.p,
  body: (world, part) => {
    const [ux, uy] = unit(part);
    const speed = SPRING.speeds[part.power ?? 2];
    const out = SPRING.stroke / speed;
    // st.fired: when it last fired (null: cocked)
    const st = { fired: null };
    const u = (t) => {
      if (st.fired == null) return 0;
      const s = t - st.fired;
      if (s < 0) return 0;
      if (s < out) return s / out;
      if (s < out + SPRING.hold) return 1;
      return Math.max(0, 1 - (s - out - SPRING.hold) / SPRING.back);
    };
    const motion = (t) => {
      const [x, y] = headAt(part, u(t));
      return { x, y, angle: Math.atan2(uy, ux) };
    };
    const b = addBody(world, { kind: 'kinematic', shape: box(SPRING.w, SPRING.h), motion, friction: 0.4, restitution: 0.1, tag: 'spring' });
    b.spring = { st, u, world, cycle: out + SPRING.hold + SPRING.back };
    return b;
  },
  follow: (run, part, on) => {
    const s = run.partBodies.get(part.id)?.spring;
    if (!s) return;
    const now = s.world.time;
    s.wired ??= run.wires.some((w) => w.to === part);
    const ready = s.st.fired == null || now - s.st.fired > s.cycle;
    const fire = s.wired ? on && !s.was : now >= (part.delay ?? 0) && s.st.fired == null;
    s.was = on;
    if (fire && ready) s.st.fired = now;
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const s = live.body?.spring;
    const u = s ? s.u(s.world.time) : 0;
    const [ux, uy] = unit(part);
    const [hx, hy] = headAt(part, u);
    ctx.save();
    // the coil, from the peg to the head
    const n = 6;
    const len = Math.hypot(hx - part.p[0], hy - part.p[1]);
    ctx.translate(part.p[0], part.p[1]);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(1.8);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i <= n; i++) ctx.lineTo(((i - 0.5) / n) * len, i % 2 ? -0.28 : 0.28);
    ctx.lineTo(len, 0);
    ctx.stroke();
    // the head
    ctx.fillStyle = pal.ink;
    ctx.fillRect(len - SPRING.w / 2, -SPRING.h / 2, SPRING.w, SPRING.h);
    ctx.restore();
    // base plate and socket
    ctx.beginPath();
    ctx.arc(part.p[0], part.p[1], 0.18, 0, Math.PI * 2);
    ctx.fillStyle = live.signal?.(part) ? pal.ink : pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.stroke();
  },
  defaults: ([x, y]) => [270, 0, 180, 90].map((dir) => ({ type: 'spring', p: [x, y], dir, power: 2, delay: 0 })),
  distance: (part, wx, wy) => {
    const [x, y] = headAt(part, 0);
    return Math.min(Math.hypot(wx - part.p[0], wy - part.p[1]), Math.hypot(wx - x, wy - y)) - 0.35;
  },
  controls: (part) => [
    { kind: 'choice', field: 'dir', value: part.dir ?? 270, options: [[270, '↑', 'Fire up'], [0, '→', 'Fire right'], [180, '←', 'Fire left'], [90, '↓', 'Fire down']] },
    { kind: 'stepper', field: 'power', value: part.power ?? 2, step: 1, min: 1, max: 3, label: (v) => `power ${v}`, aria: ['Less power', 'More power'] },
    { kind: 'stepper', field: 'delay', value: part.delay ?? 0, step: 0.5, min: 0, max: 10, label: (v) => `wait ${v}s`, aria: ['Fire sooner', 'Fire later'] },
  ],
  hint: () => 'Fires on a signal at its peg; with no wire, after its wait. Then it re-cocks.',
};

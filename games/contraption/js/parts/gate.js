import { addBody, placeShape, capsule, circle } from '../physics.js';
import { onePeg } from './_two-peg.js';

// A gate that lets balls go one at a time: two pins that pop up through
// the track, one ball apart. With no signal the front pin is up and holds
// the queue. When the signal comes on the front pin drops (the first ball
// rolls away) and the back pin rises (the rest wait behind it); when it
// goes off they swap back and the next ball rolls up to the front pin.
// One ball per signal, however long the signal lasts. Sit it on a ramp.
export const GATE = { gap: 1, up: 0.55, down: 0.35, rate: 8, r: 0.08, hold: 0.4 };

/** The pins' x along the track: the front pin on the peg, the back one upstream. */
const pinsX = (part) => [part.p[0], part.p[0] - (part.side ?? 1) * GATE.gap];

export default {
  type: 'gate',
  name: 'Gate',
  blurb: 'Two pins one ball apart. Each signal lets exactly one ball through; the rest wait their turn.',
  physics: 'An escapement for balls: while one pin opens, the other closes, so the queue can never run through.',
  tip: 'Put it on a ramp where balls queue. The arrow is the way they roll. Wire a beam or a heartbeat to its peg.',
  layer: 3,
  front: false,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(circle(0.3), part.p[0], part.p[1]),
  check: (level, part) => {
    const [, x2] = pinsX(part);
    if (x2 < 0 || x2 > level.w) return 'Off the board';
    return null;
  },
  input: (part) => part.p,
  body: (world, part) => {
    // each pin slides between up (blocking) and down (below the track); 0 = front up, 1 = front down
    const st = { pos: 0, t0: 0, dir: 0 };
    const at = (t) => Math.max(0, Math.min(1, st.pos + st.dir * GATE.rate * (t - st.t0)));
    let first = null;
    pinsX(part).forEach((x, i) => {
      // front pin is up when at = 0; back pin is up when at = 1
      const lift = (u) => (i === 0 ? 1 - u : u);
      const motion = (t) => ({ x, y: part.p[1] + GATE.down - (GATE.up + GATE.down) * lift(at(t)), angle: 0 });
      const b = addBody(world, { kind: 'kinematic', shape: capsule(0, 0, 0, 0.6, GATE.r), motion, friction: 0.2, restitution: 0.05, tag: 'gate' });
      first ||= b;
    });
    first.gate = { st, at, world };
    return first;
  },
  follow: (run, part, on) => {
    const g = run.partBodies.get(part.id)?.gate;
    if (!g) return;
    const now = g.world.time;
    g.st.pos = g.at(now);
    g.st.t0 = now;
    // once opened it stays open a moment, so even a ball flashing through a beam lets one go
    if (on && !g.wasOn) g.until = now + GATE.hold;
    g.wasOn = on;
    const target = on || now < (g.until ?? 0) ? 1 : 0;
    g.st.dir = Math.abs(target - g.st.pos) < 1e-6 ? 0 : Math.sign(target - g.st.pos);
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const u = live.body?.gate ? live.body.gate.at(live.body.gate.world.time) : 0;
    const side = part.side ?? 1;
    ctx.save();
    ctx.strokeStyle = pal.ink;
    ctx.lineCap = 'round';
    pinsX(part).forEach((x, i) => {
      const lift = i === 0 ? 1 - u : u;
      const top = part.p[1] + GATE.down - (GATE.up + GATE.down) * lift;
      ctx.lineWidth = view.px(3.2);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + 0.6);
      ctx.stroke();
    });
    // the way balls roll
    ctx.lineWidth = view.px(1.6);
    ctx.strokeStyle = pal.mid;
    const y = part.p[1] + 0.75;
    const x0 = part.p[0] - side * 0.9;
    const x1 = part.p[0] + side * 0.4;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.lineTo(x1 - side * 0.18, y - 0.14);
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 - side * 0.18, y + 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(part.p[0], part.p[1], 0.09, 0, Math.PI * 2);
    ctx.fillStyle = live.signal?.(part) ? pal.ink : pal.paper;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },
  defaults: ([x, y]) => [1, -1].map((side) => ({ type: 'gate', p: [x, y], side })),
  distance: (part, wx, wy) => Math.hypot(wx - part.p[0] + (part.side ?? 1) * 0.45, wy - part.p[1]) - 0.6,
  controls: (part) => [{ kind: 'choice', field: 'side', value: part.side ?? 1, options: [[-1, '◁', 'Balls roll left'], [1, '▷', 'Balls roll right']] }],
  hint: () => 'Holds the queue. Each signal lets one ball through.',
};

import { placeShape, circle } from '../physics.js';
import { key } from '../geom.js';
import { onePeg } from './_two-peg.js';

// A clock face on a peg: its hand shows how far the peg has turned (one
// turn, once round). It touches nothing. On an escape wheel's peg it is a
// seconds hand; geared down 60 to 1, a minute hand.
const SIZES = [1, 1.25, 1.5, 2, 2.5, 3];

export default {
  type: 'dial',
  name: 'Dial',
  blurb: 'A clock face. Its hand shows how far its peg has turned.',
  physics: 'It touches nothing and weighs almost nothing: it only shows the turning.',
  tip: 'Put it on a peg that turns once a minute, or gear one down to turn once an hour.',
  layer: 2,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(circle(part.r ?? 1.5), part.p[0], part.p[1]),
  check: (level, part, others) => (others.some((o) => o !== part && o.id !== part.id && o.type === 'dial' && key(o.p) === key(part.p)) ? 'One dial per peg' : null),
  axles: (part, axle) => axle(part.p).extra.push(part),
  inertia: () => 0.001,
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const r = part.r ?? 1.5;
    ctx.save();
    ctx.translate(part.p[0], part.p[1]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.stroke();
    // 60 ticks, every fifth long
    ctx.beginPath();
    const ticks = r * view.s < 30 ? 12 : 60;
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      const big = ticks === 12 || i % 5 === 0;
      const r0 = r * (big ? 0.78 : 0.88);
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    }
    ctx.lineWidth = view.px(1);
    ctx.stroke();
    // the hand: straight up at the start, clockwise as the peg turns clockwise
    const a = live.turn(part.p) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(a) * r * 0.15, -Math.sin(a) * r * 0.15);
    ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    ctx.lineCap = 'round';
    ctx.lineWidth = view.px(Math.max(2, r * view.s * 0.07));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.12, r * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = pal.ink;
    ctx.fill();
    ctx.restore();
  },
  defaults: ([x, y]) => [1.5, 1, 1.25].map((r) => ({ type: 'dial', p: [x, y], r })),
  distance: (part, wx, wy) => Math.hypot(wx - part.p[0], wy - part.p[1]) - (part.r ?? 1.5) * 0.5,
  controls: (part) => [{ kind: 'choice', field: 'r', value: part.r ?? 1.5, options: SIZES.map((v) => [v, String(v), `Radius ${v}`]) }],
  hint: () => 'Shows how far its peg turns. Once round is one turn.',
};

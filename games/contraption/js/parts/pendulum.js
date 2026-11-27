import { addBody, placeShape, capsule, circle } from '../physics.js';
import { onePeg } from './_two-peg.js';
import { palletShapes, PUSH, DROP } from '../escapement.js';

// A pendulum on a free peg: a rod and a heavy bob, with the anchor's two
// pallets at the top. It starts with a small swing and keeps swinging on
// its own (very little friction). Three pegs above an escape wheel, its
// pallets catch the teeth: the clock's escapement.
const ROD = [2, 8];
const BOB = 0.45;
const PALLETS = palletShapes();
// where the anchor's bridge meets each pallet: the middle of its outer end
const TIPS = PALLETS.map((s) => {
  const far = [...s.verts].sort((a, b) => Math.hypot(b[0], b[1] - DROP) - Math.hypot(a[0], a[1] - DROP)).slice(0, 2);
  return [(far[0][0] + far[1][0]) / 2, (far[0][1] + far[1][1]) / 2];
});

export default {
  type: 'pendulum',
  name: 'Pendulum',
  blurb: 'A rod and a heavy bob on a free peg. It starts with a small swing and keeps time: a longer rod swings slower.',
  physics: 'A swing takes about the same time however wide it is, which is why clocks use pendulums. Four and a quarter cells long, each swing takes one second.',
  tip: 'Three pegs above an escape wheel, its pallets catch the teeth.',
  layer: 3,
  front: true,
  free: true,
  ...onePeg,
  shape: (part) => placeShape(capsule(0, 0, 0, part.l ?? 4.25, BOB), part.p[0], part.p[1]),
  check: (level, part) => {
    const l = part.l ?? 4.25;
    if (l < ROD[0] - 1e-9 || l > ROD[1] + 1e-9) return 'The rod must be 2 to 8 cells';
    if (part.p[1] + l + BOB > level.h) return 'Off the board';
    return null;
  },
  axles: (part, axle) => axle(part.p).extra.push(part),
  body: (world, part, ctx) => {
    const A = ctx.axle(part.p);
    const l = part.l ?? 4.25;
    const common = { kind: 'rotor', x: part.p[0], y: part.p[1], train: A.train, k: A.k };
    // pallets touch only teeth; the rod and bob touch anything but teeth
    for (const s of PALLETS) addBody(world, { ...common, shape: s, density: 0.2, friction: 0.05, restitution: 0.05, tag: 'pallet', mask: (o) => o.tag === 'tooth' });
    addBody(world, { ...common, shape: capsule(0, 0, 0, l, 0.08), density: 0.05, friction: 0.3, restitution: 0.1, tag: 'rod', mask: (o) => o.tag !== 'tooth' });
    const bob = addBody(world, { ...common, shape: circle(BOB, 0, l), density: 3, friction: 0.3, restitution: 0.1, tag: 'bob', mask: (o) => o.tag !== 'tooth' });
    // a pendulum alone on its peg starts with a small swing
    if (A.k === 1 && !A.train.motors.length) A.train.v = PUSH;
    return bob;
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const l = part.l ?? 4.25;
    ctx.save();
    ctx.translate(part.p[0], part.p[1]);
    ctx.rotate(live.body ? live.body.angle : 0);
    // the anchor: a bridge across to both pallets
    ctx.strokeStyle = pal.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = view.px(2.4);
    const tips = TIPS;
    ctx.beginPath();
    ctx.moveTo(tips[0][0], tips[0][1]);
    ctx.quadraticCurveTo(0, -0.2, tips[1][0], tips[1][1]);
    ctx.stroke();
    for (const s of PALLETS) {
      ctx.beginPath();
      s.verts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = pal.ink;
      ctx.fill();
    }
    // rod and bob
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, l);
    ctx.lineWidth = view.px(2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, l, BOB, 0, Math.PI * 2);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.lineWidth = view.px(2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, l, BOB * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = pal.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.18, 0, Math.PI * 2);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.lineWidth = view.px(2);
    ctx.stroke();
    ctx.restore();
  },
  defaults: ([x, y]) => [4.25, 3, 2].map((l) => ({ type: 'pendulum', p: [x, y], l })),
  distance: (part, wx, wy) => {
    const l = part.l ?? 4.25;
    const t = Math.max(0, Math.min(l, wy - part.p[1]));
    return Math.hypot(wx - part.p[0], wy - part.p[1] - t) - (t > l - BOB ? BOB : 0.2);
  },
  controls: (part) => [{ kind: 'stepper', field: 'l', value: part.l ?? 4.25, step: 0.25, min: ROD[0], max: ROD[1], label: (v) => `rod ${v}`, aria: ['Shorter rod: faster swings', 'Longer rod: slower swings'] }],
  hint: (part) => `Swings by itself, about ${(Math.PI * Math.sqrt((part.l ?? 4.25) / 40) * 0.97).toFixed(2)} s a swing. ${DROP} pegs above an escape wheel it lets one tooth go per swing.`,
};

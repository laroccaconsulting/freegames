import { key, segDist } from '../geom.js';
import { PARTS_REF } from './ref.js';

// A wire carries a signal from a sensor's peg to a motor's peg. A motor
// with a wire runs only while one of its wires is on.
// The part (and pin number, for chips) whose pin sits on peg p.
const pinsOf = (o, pin) => {
  const def = PARTS_REF[o.type];
  if (def?.[`${pin}s`]) return def[`${pin}s`](o);
  return def?.[pin] ? [def[pin](o)] : [];
};
const find = (others, p, pin) => {
  for (const o of others) {
    const i = pinsOf(o, pin).findIndex((q) => key(q) === key(p));
    if (i >= 0) return { part: o, pin: i };
  }
  return null;
};
const at = (others, p, pin) => find(others, p, pin)?.part;

export default {
  type: 'wire',
  name: 'Wire',
  blurb: 'Carries a signal from a sensor or gate to a motor, gate or pixel.',
  physics: 'Signals are on or off. A wired motor runs only while a wire into it is on.',
  tip: 'Tap the sensor, then the motor.',
  layer: 4.5, // under gates and pixels, so wire ends do not dot a display
  back: true,
  free: true,
  link: { first: 'output', second: 'input', words: ['where the signal comes from', 'where it goes'] },
  pegs: (part) => [part.a, part.b],
  shape: (part) => ({ verts: [part.a, part.b], radius: 0.25 }),
  check: (level, part, others) => {
    if (!at(others, part.a, 'output')) return 'A wire starts at a sensor or a gate';
    if (!at(others, part.b, 'input')) return 'A wire ends at a motor, gate or pixel';
    if (key(part.a) === key(part.b)) return 'Pick two different parts';
    const same = (o) => key(o.a) === key(part.a) && key(o.b) === key(part.b);
    if (others.some((o) => o !== part && o.id !== part.id && o.type === 'wire' && same(o))) return 'Already wired';
    return null;
  },
  source: (part, others) => find(others, part.a, 'output'),
  target: (part, others) => find(others, part.b, 'input'),
  pinsOf,
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const hit = find(live.all, part.a, 'output');
    const on = hit && (hit.part.type === 'chip' ? live.signalId?.(`${hit.part.id}/${hit.part.def.outputs[hit.pin]}`) : live.signal?.(hit.part));
    const [ax, ay] = part.a;
    const [bx, by] = part.b;
    // a gentle sag so wires read apart from belts and chains
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 + Math.min(1.5, Math.hypot(bx - ax, by - ay) * 0.15);
    ctx.save();
    ctx.strokeStyle = on ? pal.ink : pal.mid;
    ctx.lineWidth = view.px(on ? 3 : 1.8);
    ctx.setLineDash(on ? [] : [0.12, 0.1]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.restore();
    for (const [x, y] of [part.a, part.b]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.12, 0, Math.PI * 2);
      ctx.fillStyle = pal.ink;
      ctx.fill();
    }
  },
  move: (part, o, dx, dy) => {
    part.a = [o.a[0] + dx, o.a[1] + dy];
    part.b = [o.b[0] + dx, o.b[1] + dy];
  },
  defaults: () => [],
  handles: () => [],
  drag: () => false,
  distance: (part, wx, wy) => segDist(wx, wy, ...part.a, ...part.b) + 0.2,
  hint: () => 'Solid while the signal is on. Delete it to unwire.',
};

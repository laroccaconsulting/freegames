import { addBody, box, placeShape } from '../physics.js';
import { onePeg } from './_two-peg.js';

// A pressure plate: on while anything rests on or hits it. Its signal
// leaves through a wire from its peg.
export default {
  type: 'plate',
  name: 'Plate',
  blurb: 'A pressure plate. It is on while something presses it.',
  physics: 'Anything heavy enough to touch it switches it on: a ball, a crate, a weight.',
  tip: 'Wire it to a motor: the motor runs only while the plate is pressed.',
  layer: 2,
  front: true,
  ...onePeg,
  shape: (part) => placeShape(box(1.6, 0.3), part.p[0], part.p[1]),
  body: (world, part) => addBody(world, { kind: 'static', shape: box(1.6, 0.3), x: part.p[0], y: part.p[1], friction: 0.6, restitution: 0.05, tag: 'plate' }),
  output: (part) => part.p,
  // pressed: any contact that pushed this step
  sense: (part, run, body) => run.contacts.some((c) => (c.a === body || c.b === body) && c.maxJn > 0),
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const [x, y] = part.p;
    const on = live.signal?.(part);
    ctx.fillStyle = on ? pal.ink : pal.paper;
    ctx.fillRect(x - 0.8, y - 0.15, 1.6, 0.3);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.2);
    ctx.strokeRect(x - 0.8, y - 0.15, 1.6, 0.3);
    // springs underneath
    ctx.beginPath();
    for (const dx of [-0.5, 0, 0.5]) {
      ctx.moveTo(x + dx, y + 0.15);
      ctx.lineTo(x + dx - 0.08, y + 0.25);
      ctx.lineTo(x + dx + 0.08, y + 0.33);
    }
    ctx.lineWidth = view.px(1.4);
    ctx.stroke();
  },
  defaults: ([x, y]) => [{ type: 'plate', p: [x, y] }],
  distance: (part, wx, wy) => Math.max(Math.abs(wx - part.p[0]) - 0.8, Math.abs(wy - part.p[1]) - 0.15),
  hint: () => 'On while something presses it. Wire it to a motor.',
};

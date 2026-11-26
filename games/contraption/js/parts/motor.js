import { placeShape, circle } from '../physics.js';
import { drawMotor } from '../render.js';
import { key, MOTOR } from '../geom.js';
import { onePeg } from './_two-peg.js';

export default {
  type: 'motor',
  name: 'Motor',
  blurb: 'Turns whatever shares its peg: a drum, a gear or a lever. Wired, it runs only while its signal is on.',
  physics: 'Strongest when stalled, weakest at top speed (one and a half turns a second). Gear it down for more push.',
  tip: 'Tap it to change direction or set a start delay.',
  layer: 4,
  back: true,
  ...onePeg,
  shape: (part) => placeShape(circle(0.45), part.p[0], part.p[1]),
  check: (level, part, others) => (others.some((o) => o !== part && o.id !== part.id && o.type === 'motor' && key(o.p) === key(part.p)) ? 'A peg holds one motor' : null),
  axles: (part, axle) => (axle(part.p).motor = part),
  inertia: () => 0.05,
  motor: (part) => ({ stall: MOTOR.stall, speed: MOTOR.speed, dir: part.dir || 1, delay: part.delay || 0, part }),
  input: (part) => part.p,
  draw: (view, pal, part, live) => {
    drawMotor(view.ctx, view, pal, part.p[0], part.p[1], part.dir || 1, live.turn(part.p), part.delay, live.running);
    if (part.switched) {
      // a socket: this motor waits for a wire
      const ctx = view.ctx;
      ctx.beginPath();
      ctx.arc(part.p[0] + 0.42, part.p[1] - 0.42, 0.16, 0, Math.PI * 2);
      ctx.fillStyle = pal.paper;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = view.px(1.8);
      ctx.stroke();
    }
  },
  defaults: ([x, y]) => [{ type: 'motor', p: [x, y], dir: 1, delay: 0 }],
  distance: (part, wx, wy) => Math.hypot(wx - part.p[0], wy - part.p[1]) - 0.35,
  controls: (part) => [
    { kind: 'choice', field: 'dir', value: part.dir || 1, options: [[1, '↻', 'Clockwise'], [-1, '↺', 'Counter-clockwise']] },
    { kind: 'stepper', field: 'delay', value: part.delay || 0, step: 0.5, min: 0, max: 5, label: (v) => `wait ${v}s`, aria: ['Start sooner', 'Start later'] },
  ],
  hint: (part) => `${part.switched ? 'Waits for a signal. ' : ''}${(part.dir || 1) > 0 ? 'Turns clockwise.' : 'Turns counter-clockwise.'}`,
};

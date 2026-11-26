import { placeShape, capsule, overlap } from '../physics.js';
import { twoPeg } from './_two-peg.js';

// A light beam between two pegs: on while anything crosses it. Things pass
// straight through; it only watches. The signal leaves from the first end.
const base = twoPeg({ radius: 0.08, limits: [1, 16], offsets: [[0, 3], [3, 0], [0, -3], [-3, 0], [0, 2], [2, 0]] });

export default {
  type: 'beam',
  name: 'Beam',
  blurb: 'A light beam between two pegs. It is on while something crosses it.',
  physics: 'It feels nothing and stops nothing: it only sees. The signal leaves from the end with the lamp.',
  tip: 'Put it where the ball will pass, and wire the lamp end to a motor.',
  layer: 2,
  back: true,
  ...base,
  output: (part) => part.a,
  sense: (part, run) => {
    const beam = placeShape(capsule(part.a[0], part.a[1], part.b[0], part.b[1], 0.05));
    return run.world.bodies.some((b) => b.kind === 'dynamic' && !b.gone && b.world.maxX >= beam.minX && b.world.minX <= beam.maxX && b.world.maxY >= beam.minY && b.world.minY <= beam.maxY && overlap(b.world, beam) < 0);
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const on = live.signal?.(part);
    const [ax, ay] = part.a;
    const [bx, by] = part.b;
    ctx.save();
    ctx.strokeStyle = on ? pal.ink : pal.mid;
    ctx.lineWidth = view.px(on ? 2.4 : 1.6);
    ctx.setLineDash(on ? [] : [0.25, 0.15]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
    // lamp (output end) and target
    ctx.fillStyle = pal.ink;
    ctx.fillRect(ax - 0.22, ay - 0.22, 0.44, 0.44);
    ctx.fillStyle = on ? pal.paper : pal.ink;
    ctx.beginPath();
    ctx.arc(ax, ay, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.beginPath();
    ctx.arc(bx, by, 0.2, 0, Math.PI * 2);
    ctx.stroke();
  },
  hint: () => 'Things pass through; it switches on while they do. The square end is the lamp.',
};

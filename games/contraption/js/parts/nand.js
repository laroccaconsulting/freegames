import { logicPart } from './_logic.js';

// NAND: on unless every wire into it is on. The one gate the others are
// made from: one wire in makes NOT; NAND into NOT makes AND; two crossed
// make a memory latch.
export default {
  type: 'nand',
  name: 'NAND',
  blurb: 'A logic gate: on unless every wire into it is on.',
  physics: 'With one wire in it is NOT. Every other gate, and memory, can be built from NANDs.',
  tip: 'Wire a sensor into it to turn the sensor upside down: on while nothing is there.',
  ...logicPart,
  logic: (part, inputs) => !(inputs.length && inputs.every(Boolean)),
  defaults: ([x, y]) => [{ type: 'nand', p: [x, y] }],
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const [x, y] = part.p;
    const on = live.signal?.(part);
    ctx.beginPath();
    ctx.moveTo(x - 0.4, y - 0.35);
    ctx.lineTo(x - 0.05, y - 0.35);
    ctx.arc(x - 0.05, y, 0.35, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x - 0.4, y + 0.35);
    ctx.closePath();
    ctx.fillStyle = on ? pal.ink : pal.paper;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 0.4, y, 0.09, 0, Math.PI * 2);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.stroke();
  },
  hint: () => 'On unless every wire into it is on. One wire in: NOT.',
};

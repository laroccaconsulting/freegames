import { logicPart } from './_logic.js';

// Pixel: a black-or-white cell. As a lamp it shows its input. As a toggle
// it flips on every rising edge, so it remembers one bit, and a row of
// them, each feeding the next, counts in binary.
export default {
  type: 'pixel',
  name: 'Pixel',
  blurb: 'A cell that shows black or white. A lamp shows its signal; a toggle flips each time its signal comes on.',
  physics: 'A toggle remembers: it is one bit of memory. Chain toggles and they count in binary.',
  tip: 'Tap it to switch between lamp and toggle.',
  ...logicPart,
  // a toggle has a second pin, clear, on the peg below it: while it is on
  // the toggle is held off and ignores its main input
  inputs: (part) => (part.mode === 'toggle' ? [part.p, [part.p[0], part.p[1] + 1]] : [part.p]),
  logic: (part, inputs, st, settle, pins = []) => {
    const any = inputs.some(Boolean);
    if (part.mode === 'toggle') {
      if ((pins[1] || []).some(Boolean)) {
        st.on = false;
        st.last = any;
        return false;
      }
      if (any && !st.last && !settle) st.on = !st.on;
      st.last = any;
      return !!st.on;
    }
    return any;
  },
  defaults: ([x, y]) => [{ type: 'pixel', p: [x, y], mode: 'lamp' }],
  controls: (part) => [{ kind: 'choice', field: 'mode', value: part.mode || 'lamp', options: [['lamp', 'Lamp', 'Lamp: shows its signal'], ['toggle', 'Toggle', 'Toggle: flips on each signal']] }],
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const [x, y] = part.p;
    const on = live.signal?.(part);
    ctx.fillStyle = on ? pal.ink : pal.paper;
    ctx.fillRect(x - 0.45, y - 0.45, 0.9, 0.9);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2.2);
    ctx.strokeRect(x - 0.45, y - 0.45, 0.9, 0.9);
    if (part.mode === 'toggle') {
      // the clear pin, below
      ctx.beginPath();
      ctx.arc(x, y + 1, 0.13, 0, Math.PI * 2);
      ctx.fillStyle = pal.paper;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = view.px(1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + 0.45);
      ctx.lineTo(x, y + 0.87);
      ctx.stroke();
      // a folded corner marks memory
      ctx.beginPath();
      ctx.moveTo(x + 0.15, y - 0.45);
      ctx.lineTo(x + 0.45, y - 0.15);
      ctx.lineTo(x + 0.45, y - 0.45);
      ctx.closePath();
      ctx.fillStyle = on ? pal.paper : pal.ink;
      ctx.fill();
    }
  },
  hint: (part) => (part.mode === 'toggle' ? 'Flips each time its signal comes on: one bit of memory. Wire into the dot below it to clear it.' : 'Black while its signal is on.'),
};

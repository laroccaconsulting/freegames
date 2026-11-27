import { DT } from '../physics.js';
import { logicPart } from './_logic.js';

// Delay: passes its input on after a set time. Wired back into a NAND it
// makes a heartbeat that ticks for ever.
export default {
  type: 'delay',
  name: 'Delay',
  blurb: 'Passes its signal on after a wait you set.',
  physics: 'A NAND whose output comes back through a delay flips on and off for ever: a clock tick.',
  tip: 'Tap it to set the wait.',
  ...logicPart,
  logic: (part, inputs, st, settle) => {
    if (settle) return false;
    const n = Math.max(1, Math.round((part.wait ?? 1) / DT));
    st.buf ||= new Array(n).fill(false);
    st.i ??= 0;
    const out = st.buf[st.i];
    st.buf[st.i] = inputs.some(Boolean);
    st.i = (st.i + 1) % n;
    return out;
  },
  defaults: ([x, y]) => [{ type: 'delay', p: [x, y], wait: 1 }],
  controls: (part) => [{ kind: 'stepper', field: 'wait', value: part.wait ?? 1, step: 0.25, min: 0.25, max: 5, label: (v) => `${v}s`, aria: ['Shorter', 'Longer'] }],
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const [x, y] = part.p;
    const on = live.signal?.(part);
    ctx.fillStyle = on ? pal.ink : pal.paper;
    ctx.fillRect(x - 0.4, y - 0.32, 0.8, 0.64);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.strokeRect(x - 0.4, y - 0.32, 0.8, 0.64);
    // an hourglass
    ctx.strokeStyle = on ? pal.paper : pal.ink;
    ctx.lineWidth = view.px(1.6);
    ctx.beginPath();
    ctx.moveTo(x - 0.17, y - 0.2);
    ctx.lineTo(x + 0.17, y - 0.2);
    ctx.lineTo(x - 0.17, y + 0.2);
    ctx.lineTo(x + 0.17, y + 0.2);
    ctx.closePath();
    ctx.stroke();
    if (!live.running) {
      ctx.fillStyle = pal.ink;
      ctx.font = `700 0.36px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${part.wait ?? 1}s`, x, y + 0.4);
    }
  },
  hint: (part) => `Passes its signal on after ${part.wait ?? 1} s.`,
};

import { box, placeShape } from '../physics.js';
import { onePeg } from './_two-peg.js';

// A chip: a piece of logic wrapped up as one part. Its definition travels
// inside the part, so saves and share links carry it:
//   def: { name, parts: [{ id, type, ... }], links: [[fromId, toId]],
//          inputs: [innerId], outputs: [innerId] }
// Input pins sit down its left edge, outputs down its right edge, one per
// peg. When a machine runs, the chip is unpacked back into its gates.
export const W = 3;
export const pinsHigh = (def) => Math.max(def.inputs.length, def.outputs.length, 1) + 1;
export const inPins = (part) => part.def.inputs.map((_, i) => [part.p[0], part.p[1] + 1 + i]);
export const outPins = (part) => part.def.outputs.map((_, i) => [part.p[0] + W, part.p[1] + 1 + i]);

export default {
  type: 'chip',
  name: 'Chip',
  blurb: 'Logic you built, wrapped up as one part with pins.',
  physics: 'Inside it is the same NANDs, delays and pixels, wired the same way: wrap a counter once, use it many times.',
  tip: 'In the sandbox or the Gallery, open the menu and choose Make a chip. Tap a chip and choose Unwrap to see inside it.',
  layer: 5,
  back: true,
  ...onePeg,
  shape: (part) => {
    const h = pinsHigh(part.def);
    return placeShape(box(W - 0.4, h - 0.4), part.p[0] + W / 2, part.p[1] + h / 2);
  },
  outputs: (part) => outPins(part),
  inputs: (part) => inPins(part),
  defaults: () => [],
  distance: (part, wx, wy) => {
    const h = pinsHigh(part.def);
    const dx = Math.max(part.p[0] - wx, 0, wx - part.p[0] - W);
    const dy = Math.max(part.p[1] - wy, 0, wy - part.p[1] - h);
    return Math.hypot(dx, dy) - 0.2;
  },
  draw: (view, pal, part, live) => {
    const ctx = view.ctx;
    const [x, y] = part.p;
    const h = pinsHigh(part.def);
    ctx.fillStyle = pal.ink;
    ctx.fillRect(x + 0.2, y + 0.2, W - 0.4, h - 0.4);
    // little legs top and bottom
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = view.px(2);
    ctx.beginPath();
    for (let i = 0.6; i < W - 0.4; i += 0.6) {
      ctx.moveTo(x + i, y + 0.2);
      ctx.lineTo(x + i, y);
      ctx.moveTo(x + i, y + h - 0.2);
      ctx.lineTo(x + i, y + h);
    }
    ctx.stroke();
    ctx.fillStyle = pal.paper;
    ctx.font = `800 ${Math.min(0.5, 2.2 / Math.max(4, part.def.name.length) * 1.4)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(part.def.name, x + W / 2, y + h / 2);
    const pin = ([px, py], on) => {
      ctx.beginPath();
      ctx.arc(px, py, 0.18, 0, Math.PI * 2);
      ctx.fillStyle = on ? pal.ink : pal.paper;
      ctx.fill();
      ctx.lineWidth = view.px(2);
      ctx.strokeStyle = pal.ink;
      ctx.stroke();
    };
    inPins(part).forEach((q) => pin(q, false));
    outPins(part).forEach((q, i) => pin(q, live.signalId?.(`${part.id}/${part.def.outputs[i]}`)));
  },
  hint: (part) => `${part.def.inputs.length} in, ${part.def.outputs.length} out. Wire to the round pins. Unwrap to see or change what is inside.`,
};

/**
 * Unpack chips into their gates for a run. Returns the extra logic parts
 * and the wires (as { from, to } part pairs) inside every chip, plus a
 * resolver from a chip pin to the inner part behind it.
 */
export function unpack(parts) {
  const inner = [];
  const links = [];
  const pin = new Map(); // `${chipId}:in:${i}` / `:out:` → inner part
  for (const c of parts) {
    if (c.type !== 'chip') continue;
    const byId = new Map();
    for (const q of c.def.parts) {
      const clone = { ...q, id: `${c.id}/${q.id}`, inner: true };
      byId.set(q.id, clone);
      inner.push(clone);
    }
    // links [from, to, toPin?]; inputs id or [id, pin]
    for (const [a, b, p = 0] of c.def.links) if (byId.has(a) && byId.has(b)) links.push({ from: byId.get(a), to: byId.get(b), toPin: p });
    c.def.inputs.forEach((ref, i) => {
      const [id, p = 0] = Array.isArray(ref) ? ref : [ref];
      pin.set(`${c.id}:in:${i}`, { part: byId.get(id), pin: p });
    });
    c.def.outputs.forEach((id, i) => pin.set(`${c.id}:out:${i}`, { part: byId.get(id), pin: 0 }));
  }
  return { inner, links, pin };
}

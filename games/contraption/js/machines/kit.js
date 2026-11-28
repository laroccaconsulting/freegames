// Building blocks for showpiece machines: pieces that come up again and
// again, so each machine file says what it does, not how to wire a NAND.
import { counterChip, decoderChip, SEGMENTS, SEGMENT_PIXELS, readDigit } from '../clock.js';

/** An item resting on the ramp from a to b, at x (its centre just above the surface). */
export function on(a, b, x, type = 'ball', extra = {}) {
  const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  const r = type === 'crate' ? 0.45 : type === 'egg' ? 0.35 : 0.4;
  const slope = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return { type, x, y: +(y - (0.15 + r) / Math.cos(slope) - 0.02).toFixed(3), ...extra };
}

export const wire = (a, b) => ({ type: 'wire', a, b });
export const lamp = (p) => ({ type: 'pixel', p, mode: 'lamp' });
export const toggle = (p) => ({ type: 'pixel', p, mode: 'toggle' });

/** A NAND-and-delay heartbeat: the NAND at p flips every `wait` seconds. Its output is p. */
export function heartbeat(p, wait = 0.5) {
  const d = [p[0], p[1] + 3];
  return [{ type: 'nand', p }, { type: 'delay', p: d, wait }, wire(p, d), wire(d, p)];
}

/**
 * A decimal (or mod-n) digit: a counter chip at (x, y + 9), its decoder to
 * the right, and a 3×5 pixel digit above at (x + 1, y). Counts rising edges
 * at `from`; its carry comes out at the returned `carry` peg.
 */
export function digit(x, y, from, mod = 10) {
  const parts = [];
  const counter = { type: 'chip', p: [x, y + 9], def: counterChip(mod) };
  const decoder = { type: 'chip', p: [x + 5, y + 9], def: decoderChip() };
  parts.push(counter, decoder, wire(from, [x, y + 10]));
  const bits = counter.def.outputs.length - 1;
  for (let i = 0; i < bits; i++) parts.push(wire([x + 3, y + 10 + i], [x + 5, y + 10 + i]));
  const seg = {};
  Object.keys(SEGMENTS).forEach((s, i) => {
    seg[s] = [];
    for (const [px, py] of SEGMENT_PIXELS[s]) {
      const p = [x + 1 + px, y + py];
      parts.push(lamp(p), wire([x + 8, y + 10 + i], p));
      seg[s].push(p);
    }
  });
  return { parts, seg, carry: [x + 3, y + 10 + bits] };
}

/** Read a digit from a run, given the part ids of its first pixel per segment. */
export function readDigitAt(run, parts, seg) {
  const idAt = (p) => parts.find((q) => q.type === 'pixel' && q.p[0] === p[0] && q.p[1] === p[1])?.id;
  return readDigit(Object.fromEntries(Object.entries(seg).map(([s, ps]) => [s, run.signals.get(idAt(ps[0]))])));
}

/** Give every part an id (g0, g1…), as the Gallery does, so checks can find them. */
export const withIds = (parts) => parts.map((p, i) => ({ id: `g${i}`, ...p }));

/** Count rising edges of a part's signal (call from watch). */
export function edges(run, s, key, id) {
  const on = !!run.signals.get(id);
  s[key] ??= 0;
  if (on && !s[`${key}Was`]) s[key]++;
  s[`${key}Was`] = on;
}

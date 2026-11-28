// Chips the player keeps: unwrapping a placed chip back into its gates.
// Pure (no DOM), so the tests can check that the logic survives the trip.
import { PARTS } from './parts/index.js';
import { inPins, outPins } from './parts/chip.js';
import { key } from './geom.js';

/** Where an inner part sits, relative to the chip's peg: saved when it was made, or laid out in columns. */
export function layoutOf(def, gap = 2) {
  if (def.at && def.parts.every((q) => def.at[q.id])) return Object.fromEntries(def.parts.map((q) => [q.id, def.at[q.id]]));
  // columns by depth from the inputs (feedback loops just go one column on)
  const depth = new Map(def.inputs.map((ref) => [Array.isArray(ref) ? ref[0] : ref, 0]));
  for (const q of def.parts) if (!depth.has(q.id) && !def.links.some(([, b]) => b === q.id)) depth.set(q.id, 0);
  for (let pass = 0; pass < def.parts.length; pass++) {
    for (const [a, b] of def.links) if (depth.has(a) && !depth.has(b)) depth.set(b, depth.get(a) + 1);
  }
  const cols = [];
  for (const q of def.parts) {
    const d = depth.get(q.id) ?? 0;
    (cols[d] ||= []).push(q);
  }
  const at = {};
  cols.forEach((col, c) => col?.forEach((q, r) => (at[q.id] = [c * gap, r * gap])));
  return at;
}

/** Every peg an inner part would use (a toggle pixel has a second input below). */
const pegsOf = (q, p) => (q.type === 'pixel' && q.mode === 'toggle' ? [p, [p[0], p[1] + 1]] : [p]);

/**
 * Unwrap a chip: its gates back on the board, wired as they were, with the
 * wires to its pins moved to the gates behind them. Returns the new parts
 * list, or null if there is no room. `uid` makes ids for the new parts.
 */
export function unwrap(level, parts, chipId, uid) {
  const chip = parts.find((p) => p.id === chipId);
  if (!chip || chip.type !== 'chip') return null;
  const { def } = chip;
  let at, origin = null;
  // pegs already used: every part's own pegs, all of a back part's area
  // (another chip, a gear), both ends of every wire, and walls
  const taken = new Set();
  for (const o of [...(level.fixed || []), ...parts]) {
    if (o === chip) continue;
    const def = PARTS[o.type];
    for (const q of def.pegs?.(o) || []) taken.add(key(q));
    const sh = def.back && def.shape?.(o);
    if (sh) for (let x = Math.ceil(sh.minX - 0.5); x <= sh.maxX + 0.5; x++) for (let y = Math.ceil(sh.minY - 0.5); y <= sh.maxY + 0.5; y++) taken.add(key([x, y]));
  }
  const inWall = (x, y) => (level.walls || []).some(([wx, wy, ww, wh]) => x > wx - 0.5 && x < wx + ww + 0.5 && y > wy - 0.5 && y < wy + wh + 0.5);
  // find room: the chip's own spot first, then nearby
  const fits = (ox, oy) => {
    const mine = new Set();
    return def.parts.every((q) =>
      pegsOf(q, [ox + at[q.id][0], oy + at[q.id][1]]).every(([x, y]) => {
        const k = key([x, y]);
        if (mine.has(k)) return false;
        mine.add(k);
        return x >= 1 && y >= 1 && x <= level.w - 1 && y <= level.h - 1 && !taken.has(k) && !inWall(x, y);
      }),
    );
  };
  // the saved layout, or columns two pegs apart, or packed tight if that is all there is room for
  for (const gap of def.at ? [0, 2, 1] : [2, 1]) {
    at = gap ? layoutOf(def, gap) : layoutOf(def);
    for (let r = 0; r <= Math.max(level.w, level.h) && !origin; r++) {
      for (let dy = -r; dy <= r && !origin; dy++) {
        for (let dx = -r; dx <= r && !origin; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (fits(chip.p[0] + dx, chip.p[1] + dy)) origin = [chip.p[0] + dx, chip.p[1] + dy];
        }
      }
    }
    if (origin) break;
  }
  if (!origin) return null;
  const byId = new Map();
  const added = def.parts.map((q) => {
    const { id, inner, ...rest } = q;
    const part = { ...rest, id: uid(), p: [origin[0] + at[id][0], origin[1] + at[id][1]] };
    byId.set(id, part);
    return part;
  });
  const inputPeg = (part, pin = 0) => [...((PARTS[part.type].inputs?.(part) || [PARTS[part.type].input(part)])[pin] || part.p)];
  const wires = [];
  for (const [a, b, pin = 0] of def.links) {
    if (byId.has(a) && byId.has(b)) wires.push({ id: uid(), type: 'wire', a: [...byId.get(a).p], b: inputPeg(byId.get(b), pin) });
  }
  // wires to and from the chip's pins now go to the gates behind them
  const pinsIn = inPins(chip).map(key);
  const pinsOut = outPins(chip).map(key);
  const rest = parts
    .filter((p) => p !== chip)
    .map((p) => {
      if (p.type !== 'wire') return p;
      const w = { ...p };
      const i = pinsIn.indexOf(key(w.b));
      if (i >= 0) {
        const [id, pin = 0] = Array.isArray(def.inputs[i]) ? def.inputs[i] : [def.inputs[i]];
        if (byId.has(id)) w.b = inputPeg(byId.get(id), pin);
      }
      const o = pinsOut.indexOf(key(w.a));
      if (o >= 0 && byId.has(def.outputs[o])) w.a = [...byId.get(def.outputs[o]).p];
      return w;
    });
  return [...rest, ...added, ...wires];
}

/** Rename a chip in the library (names are its key, so no two alike). */
export function renameIn(lib, from, to) {
  const name = to.trim().toUpperCase().slice(0, 6);
  if (!name || lib.some((d) => d.name === name && d.name !== from)) return null;
  return lib.map((d) => (d.name === from ? { ...d, name } : d));
}

// The level editor's model: a draft level and the edits the tools make,
// plus level links (#lv=…). Pure, so the tests can check it. Every edit
// returns a new draft (the machine model caches per level object) and
// marks it unsolved: a level is shared only once its maker has solved it.
import { b64url, unb64url, pipe } from './share.js';
import { simulate, problems } from './machine.js';

export const TOOLS = ['wall', 'nobuild', 'danger', 'cup', 'lamp', 'ball', 'crate', 'steel', 'egg', 'mover', 'machine', 'erase'];
export const RECT_TOOLS = new Set(['wall', 'nobuild', 'danger']);
export const ITEM_TOOLS = new Set(['ball', 'crate', 'steel', 'egg']);
const MAX_ITEMS = 4;
export const MAX_MOVERS = 4;
export const MAX_FIXED = 200;
export const LAMP = 'lamp';
/** Mover shapes the editor offers: [w, h] for sliders, or a spinning arm. */
export const MOVER_SHAPES = { platform: [3, 0.5], gate: [1, 4], block: [2, 2] };

export function newDraft() {
  return {
    id: 'draft',
    custom: true,
    name: 'My level',
    goalText: 'Get the ball into the cup.',
    w: 24,
    h: 16,
    items: [{ type: 'ball', x: 3, y: 2 }],
    walls: [[0, 12, 15, 4], [19, 12, 5, 4]],
    noBuild: [],
    danger: [],
    goal: { x: 15, y: 12, w: 4, h: 2.5, cup: true },
    fixed: [],
    movers: [],
    parts: { ramp: 3 },
    stars: { parts: 99, time: 99 },
    timeLimit: 20,
    solution: [],
    solved: false,
  };
}

const edited = (d, changes) => ({ ...d, ...changes, solved: false, solution: [], stars: { parts: 99, time: 99 } });
const clampRect = (d, [x, y, w, h]) => [Math.max(0, x), Math.max(0, y), Math.min(w, d.w - Math.max(0, x)), Math.min(h, d.h - Math.max(0, y))];

/** Drag a box with a zone tool: whole cells, at least one cell. */
export function addRect(d, tool, a, b) {
  const x0 = Math.floor(Math.min(a[0], b[0]));
  const y0 = Math.floor(Math.min(a[1], b[1]));
  const x1 = Math.max(x0 + 1, Math.ceil(Math.max(a[0], b[0])));
  const y1 = Math.max(y0 + 1, Math.ceil(Math.max(a[1], b[1])));
  const r = clampRect(d, [x0, y0, x1 - x0, y1 - y0]);
  const field = tool === 'wall' ? 'walls' : tool === 'nobuild' ? 'noBuild' : 'danger';
  return edited(d, { [field]: [...(d[field] || []), r] });
}

const half = (v) => Math.round(v * 2) / 2;
const withoutLamp = (d) => (d.fixed || []).filter((p) => p.id !== LAMP);
/** The first item is the one to deliver; the rest are helpers. A lamp level delivers nothing. */
const delivering = (items, lamp) => items.map((it, i) => ({ ...it, deliver: !lamp && i === 0 ? true : false }));

/** Tap with the cup, the lamp or an item tool. The cup and the lamp are the two kinds of goal. */
export function placeAt(d, tool, [x, y]) {
  if (tool === 'cup') {
    const gx = Math.max(0.5, Math.min(d.w - 4.5, Math.round(x - 2)));
    const gy = Math.max(1, Math.min(d.h - 3.5, Math.round(y - 1.5)));
    return edited(d, { goal: { x: gx, y: gy, w: 4, h: 3, cup: true }, signalGoal: undefined, fixed: withoutLamp(d), items: delivering(d.items, false) });
  }
  if (tool === 'lamp') {
    const p = [Math.max(1, Math.min(d.w - 1, Math.round(x))), Math.max(1, Math.min(d.h - 1, Math.round(y)))];
    const lamp = { id: LAMP, type: 'pixel', p, mode: 'lamp', fixed: true };
    return edited(d, { goal: null, signalGoal: d.signalGoal || { lamp: LAMP, hold: 1 }, fixed: [...withoutLamp(d), lamp], items: delivering(d.items, true), timeLimit: d.signalGoal ? d.timeLimit : 12 });
  }
  if (!ITEM_TOOLS.has(tool)) return d;
  const item = { type: tool, x: half(x), y: half(y) };
  if (d.signalGoal || d.items.some((it) => it.deliver !== false)) item.deliver = false;
  return edited(d, { items: [...d.items, item].slice(-MAX_ITEMS) });
}

/**
 * Drag with the mover tool: a platform that slides from where the drag
 * starts to where it ends and back. A tap makes a spinning arm.
 */
export function addMover(d, a, b) {
  const from = [half(a[0]), half(a[1])];
  const to = [half(b[0]), half(b[1])];
  const m = Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.75 ? { shape: 'bar', length: 4, r: 0.25, spin: { at: from, speed: 1, phase: 0 } } : { w: 3, h: 0.5, path: { from, to, period: 4, hold: 0.15, phase: 0 } };
  return edited(d, { movers: [...(d.movers || []), m].slice(-MAX_MOVERS) });
}

/** Which mover is under a point, as the editor shows them (at time 0), or -1. */
export function moverAt(d, [x, y]) {
  const ms = d.movers || [];
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i];
    if (m.spin) {
      if (Math.hypot(x - m.spin.at[0], y - m.spin.at[1]) <= m.length / 2 + 0.3) return i;
    } else if (m.path) {
      const [cx, cy] = m.path.from;
      if (Math.abs(x - cx) <= (m.w ?? 1) / 2 + 0.3 && Math.abs(y - cy) <= (m.h ?? 1) / 2 + 0.3) return i;
    }
  }
  return -1;
}

/**
 * Change a mover from its settings: shape (platform, gate, block or arm),
 * period or speed, wait at the ends, spikes.
 */
export function setMover(d, i, s) {
  const old = d.movers[i];
  if (!old) return d;
  const at = old.spin ? old.spin.at : old.path.from;
  let m;
  if (s.shape === 'arm') {
    m = { shape: 'bar', length: Math.max(2, Math.min(10, s.length ?? old.length ?? 4)), r: 0.25, spin: { at, speed: Math.max(-4, Math.min(4, s.speed ?? old.spin?.speed ?? 1)), phase: 0 } };
  } else {
    const [w, h] = MOVER_SHAPES[s.shape] || [old.w ?? 3, old.h ?? 0.5];
    const to = old.path ? old.path.to : [at[0] + 4, at[1]];
    m = { w, h, path: { from: at, to, period: Math.max(1, Math.min(20, s.period ?? old.path?.period ?? 4)), hold: Math.max(0, Math.min(0.4, s.hold ?? old.path?.hold ?? 0.15)), phase: Math.max(0, Math.min(0.99, s.phase ?? old.path?.phase ?? 0)) } };
  }
  if (s.danger ?? old.danger) m.danger = true;
  return edited(d, { movers: d.movers.map((o, k) => (k === i ? m : o)) });
}

export const removeMover = (d, i) => edited(d, { movers: (d.movers || []).filter((_, k) => k !== i) });

export function moverShapeOf(m) {
  if (m.spin) return 'arm';
  return Object.entries(MOVER_SHAPES).find(([, [w, h]]) => w === m.w && h === m.h)?.[0] || 'platform';
}

/** The machine parts the maker placed become the level's fixed parts (the lamp stays). */
export function setFixed(d, parts) {
  const lamp = (d.fixed || []).filter((p) => p.id === LAMP);
  const fixed = parts.slice(0, MAX_FIXED).map(({ id, ...p }, i) => ({ id: `f${i + 1}`, ...p, fixed: true }));
  return edited(d, { fixed: [...lamp, ...fixed] });
}

/** The fixed parts as an editable machine (the lamp left out: it is the goal). */
export const fixedMachine = (d) => withoutLamp(d).map(({ fixed, ...p }) => p);

/** Lamp goal settings: kind 'lit' (stay lit), 'blink' or 'pulse' (light, then go dark). */
export function setLampGoal(d, { kind = 'lit', hold = 1, blinks = 3, darkUntil = 0, darkHold = 2 }) {
  if (!d.signalGoal) return d;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) * 10) / 10 || 0));
  const sg = { lamp: LAMP };
  if (kind === 'blink') sg.blinks = Math.max(1, Math.round(clamp(blinks, 1, 20)));
  else sg.hold = clamp(hold, 0.1, 30) || 1;
  if (kind === 'pulse') sg.darkHold = clamp(darkHold, 0.1, 30) || 2;
  if (clamp(darkUntil, 0, 60) > 0) sg.darkUntil = clamp(darkUntil, 0, 60);
  return edited(d, { signalGoal: sg });
}

export function lampGoalOf(sg) {
  if (!sg) return null;
  return { kind: sg.blinks ? 'blink' : sg.darkHold ? 'pulse' : 'lit', hold: sg.hold ?? 1, blinks: sg.blinks ?? 3, darkUntil: sg.darkUntil ?? 0, darkHold: sg.darkHold ?? 2 };
}

export const setTimeLimit = (d, t) => edited(d, { timeLimit: Math.max(3, Math.min(120, Math.round(Number(t)) || 20)) });

const inRect = ([x, y], [rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;

/** Tap with the eraser: the item, then the zone, under the finger. */
export function eraseAt(d, p) {
  const i = d.items.findIndex((it) => Math.hypot(it.x - p[0], it.y - p[1]) < 0.7);
  if (i >= 0) {
    const items = d.items.filter((_, k) => k !== i);
    // keep one item to deliver
    if (!d.signalGoal && items.length && !items.some((it) => it.deliver !== false)) items[0] = { ...items[0], deliver: true };
    return edited(d, { items });
  }
  const lamp = (d.fixed || []).find((q) => q.id === LAMP);
  if (lamp && Math.hypot(lamp.p[0] - p[0], lamp.p[1] - p[1]) < 0.7) return edited(d, { fixed: withoutLamp(d), signalGoal: undefined, items: delivering(d.items, false) });
  const m = moverAt(d, p);
  if (m >= 0) return edited(d, { movers: d.movers.filter((_, k) => k !== m) });
  for (const field of ['danger', 'noBuild', 'walls']) {
    const list = d[field] || [];
    const k = list.findLastIndex((r) => inRect(p, r));
    if (k >= 0) return edited(d, { [field]: list.filter((_, j) => j !== k) });
  }
  return d;
}

export const setParts = (d, parts) => edited(d, { parts: Object.fromEntries(Object.entries(parts).filter(([, n]) => n > 0)) });
export const setText = (d, { name, goalText }) => ({ ...d, name: (name || 'My level').slice(0, 40), goalText: (goalText || '').slice(0, 140) });

/** What still stops the draft being playable, or null. */
export function draftProblem(d) {
  if (d.signalGoal) {
    if (!(d.fixed || []).some((q) => q.id === LAMP)) return 'Add a lamp, or a cup';
  } else {
    if (!d.items.some((it) => it.deliver !== false)) return 'Add a ball, crate or egg to deliver';
    if (!d.goal) return 'Add a cup or a lamp';
  }
  if (!Object.keys(d.parts).length) return 'Offer at least one part (Level settings)';
  return null;
}

/**
 * The maker solved it: keep the solution and set the star targets from it
 * (their parts count, and their time with a little room).
 */
export function solvedWith(d, parts, time) {
  return { ...d, solved: true, solution: parts.map(({ id, ...p }, i) => ({ id: `s${i}`, ...p })), stars: { parts: parts.length, time: Math.ceil(time * 1.2 * 10) / 10 } };
}

const FIELDS = ['name', 'goalText', 'w', 'h', 'items', 'walls', 'noBuild', 'danger', 'goal', 'parts', 'stars', 'timeLimit', 'solution', 'fixed', 'movers', 'signalGoal'];

/** A solved level, packed into a short string for #lv=. */
export async function encodeLevel(d) {
  const data = Object.fromEntries(FIELDS.map((k) => [k, d[k]]));
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'undefined') return `j${b64url(json)}`;
  return `z${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

/** A level from a link, checked: its solution must still win here. */
export async function decodeLevel(str) {
  try {
    let bytes = unb64url(str.slice(1));
    if (str[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (str[0] !== 'j') return null;
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const level = { ...newDraft(), ...Object.fromEntries(FIELDS.filter((k) => k in data).map((k) => [k, data[k]])), id: `custom:${str.slice(1, 13)}`, custom: true, solved: true };
    // a link is untrusted: keep the lists to the sizes the editor makes
    level.fixed = (Array.isArray(level.fixed) ? level.fixed : []).slice(0, MAX_FIXED + 1).map((p) => ({ ...p, fixed: true }));
    level.movers = (Array.isArray(level.movers) ? level.movers : []).slice(0, MAX_MOVERS);
    level.items = (Array.isArray(level.items) ? level.items : []).slice(0, MAX_ITEMS);
    if (!level.signalGoal) delete level.signalGoal;
    level.hint = 'Made by a player. Show a part to see one piece of how they solved it.';
    if (problems(level, level.solution).size || simulate(level, level.solution).status !== 'win') level.unverified = true;
    return level;
  } catch {
    return null;
  }
}

export const levelFromHash = (hash) => /[#&]lv=([A-Za-z0-9_-]+)/.exec(hash)?.[1] ?? null;

// The level editor's model: a draft level and the edits the tools make,
// plus level links (#lv=…). Pure, so the tests can check it. Every edit
// returns a new draft (the machine model caches per level object) and
// marks it unsolved: a level is shared only once its maker has solved it.
import { b64url, unb64url, pipe } from './share.js';
import { simulate, problems } from './machine.js';

export const TOOLS = ['wall', 'nobuild', 'danger', 'cup', 'ball', 'crate', 'steel', 'egg', 'erase'];
export const RECT_TOOLS = new Set(['wall', 'nobuild', 'danger']);
export const ITEM_TOOLS = new Set(['ball', 'crate', 'steel', 'egg']);
const MAX_ITEMS = 4;

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

/** Tap with the cup or an item tool. */
export function placeAt(d, tool, [x, y]) {
  if (tool === 'cup') {
    const gx = Math.max(0.5, Math.min(d.w - 4.5, Math.round(x - 2)));
    const gy = Math.max(1, Math.min(d.h - 3.5, Math.round(y - 1.5)));
    return edited(d, { goal: { x: gx, y: gy, w: 4, h: 3, cup: true } });
  }
  if (!ITEM_TOOLS.has(tool)) return d;
  const item = { type: tool, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
  // the first item is the one to deliver; later ones are helpers (hammers, weights)
  if (d.items.some((it) => it.deliver !== false)) item.deliver = false;
  return edited(d, { items: [...d.items, item].slice(-MAX_ITEMS) });
}

const inRect = ([x, y], [rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;

/** Tap with the eraser: the item, then the zone, under the finger. */
export function eraseAt(d, p) {
  const i = d.items.findIndex((it) => Math.hypot(it.x - p[0], it.y - p[1]) < 0.7);
  if (i >= 0) {
    const items = d.items.filter((_, k) => k !== i);
    // keep one item to deliver
    if (items.length && !items.some((it) => it.deliver !== false)) items[0] = { ...items[0], deliver: true };
    return edited(d, { items });
  }
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
  if (!d.items.some((it) => it.deliver !== false)) return 'Add a ball, crate or egg to deliver';
  if (!d.goal) return 'Add a cup';
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

const FIELDS = ['name', 'goalText', 'w', 'h', 'items', 'walls', 'noBuild', 'danger', 'goal', 'parts', 'stars', 'timeLimit', 'solution'];

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
    level.hint = 'Made by a player. Show a part to see one piece of how they solved it.';
    if (problems(level, level.solution).size || simulate(level, level.solution).status !== 'win') level.unverified = true;
    return level;
  } catch {
    return null;
  }
}

export const levelFromHash = (hash) => /[#&]lv=([A-Za-z0-9_-]+)/.exec(hash)?.[1] ?? null;

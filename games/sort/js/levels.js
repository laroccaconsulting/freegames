// Puzzle generation. A puzzle comes from a seed and a size; the solver
// checks it and sets par. Attempts are seeded too, so a given seed always
// gives the same puzzle and par on every device.
import { mulberry32, shuffle } from '../core/rng.js';
import { hashSeed } from '../core/golf.js';
import { CAPACITY, colorOf, topRun } from './rules.js';
import { solve } from './solver.js';

export const MAX_COLORS = 12;
export const DAILY_COLORS = 9;
export const LAUNCH_DAY = '2026-09-24';

// Levels ramp from 3 colours up to 12, then stay at 10–12 for variety.
export function levelColors(level) {
  if (level <= 2) return 3;
  if (level <= 5) return 4;
  if (level <= 9) return 5;
  if (level <= 14) return 6;
  if (level <= 20) return 7;
  if (level <= 28) return 8;
  if (level <= 38) return 9;
  if (level <= 50) return 10;
  if (level <= 65) return 11;
  if (level <= 80) return 12;
  return 10 + (hashSeed(`level-size:${level}`) % 3);
}

export const levelSeed = (level) => hashSeed(`pour:level:${level}`);

// A deal is "too easy" when a tube starts finished or nearly all units sit
// on matching neighbours; those are skipped.
function acceptable(tubes, colors, size = CAPACITY) {
  if (tubes.some((t) => t.length === size && t.every((u) => colorOf(u) === colorOf(t[0])))) return false;
  const runs = tubes.filter((t) => t.length && topRun(t) >= size - 1).length;
  return runs <= Math.floor(colors / 4);
}

export function deal(seed, colors, empties = 2) {
  const random = mulberry32(seed);
  for (;;) {
    const units = shuffle(Array.from({ length: colors * CAPACITY }, (_, i) => i % colors), random);
    const tubes = Array.from({ length: colors }, (_, i) => units.slice(i * CAPACITY, (i + 1) * CAPACITY));
    for (let i = 0; i < empties; i++) tubes.push([]);
    if (acceptable(tubes, colors)) return tubes;
  }
}

// Returns { tubes, par, solution, seed, colors }. Tries follow-on seeds when a
// deal has no solution or the solver hits its budget.
export function generate(seed, colors) {
  for (let attempt = 0; ; attempt++) {
    const s = attempt ? hashSeed(`${seed}:${attempt}`) : seed;
    const tubes = deal(s, colors);
    const result = solve(tubes, { maxNodes: 250000 });
    if (result.moves) return { tubes, par: result.moves.length, solution: result.moves, seed, colors };
  }
}

// ---------- Advanced ----------
//
// A separate track that brings in one twist per band, then mixes them:
//   1–10   one spare tube plus a small one (3, then 2, then 1 unit)
//   11–20  hidden layers: lower units show as "?" until they reach the top
//   21–30  locked tubes: open once a tube of the key colour is finished
//   31–40  frozen tubes: thaw after a number of pours
//   41–50  taller tubes (5, then 6 units of each colour)
//   51+    a seeded mix of everything
// Each level is the hardest of a few solvable deals, measured by how much
// the solver had to search.

export const ADVANCED_TRIES = 4;

const pick = (level, salt, options) => options[hashSeed(`adv:${salt}:${level}`) % options.length];

export function advancedSpec(level) {
  const spec = { colors: 6, size: CAPACITY, empties: 1, small: 1, smallCap: 2, hidden: 0, locks: 0, ice: 0, thaw: 0 };
  if (level <= 10) {
    spec.colors = [5, 5, 6, 6, 6, 7, 7, 7, 8, 8][level - 1];
    spec.smallCap = level <= 3 ? 3 : level <= 7 ? 2 : 1;
  } else if (level <= 20) {
    spec.colors = level <= 13 ? 6 : level <= 17 ? 7 : 8;
    spec.smallCap = level <= 15 ? 3 : 2;
    spec.hidden = level <= 13 ? 1 : level <= 17 ? 2 : 3;
  } else if (level <= 30) {
    spec.colors = level <= 25 ? 7 : 8;
    spec.smallCap = level <= 25 ? 3 : 2;
    spec.locks = 1;
    spec.hidden = level <= 25 ? 0 : 1;
  } else if (level <= 40) {
    spec.colors = level <= 35 ? 7 : 8;
    spec.smallCap = level <= 35 ? 3 : 2;
    spec.ice = level <= 35 ? 1 : 2;
    spec.thaw = level <= 35 ? 4 : 6;
    spec.hidden = level <= 35 ? 0 : 1;
  } else if (level <= 50) {
    spec.size = level <= 45 ? 5 : 6;
    spec.colors = level <= 45 ? 6 : 5;
    spec.smallCap = spec.size - 1;
  } else {
    spec.size = pick(level, 'size', [4, 4, 4, 5]);
    spec.colors = spec.size === 4 ? pick(level, 'colors', [7, 8, 8, 9]) : pick(level, 'colors', [6, 7]);
    spec.smallCap = pick(level, 'small', [1, 2, 2, 3, 3]);
    spec.hidden = pick(level, 'hidden', [0, 1, 1, 2, 3]);
    spec.locks = pick(level, 'locks', [0, 0, 1]);
    spec.ice = pick(level, 'ice', [0, 0, 1, 2]);
    spec.thaw = spec.ice ? pick(level, 'thaw', [4, 5, 6]) : 0;
  }
  return spec;
}

export const advancedSeed = (level) => hashSeed(`pour:advanced:${level}`);

// Deals an Advanced puzzle: { tubes, layout }. The spare tubes go last.
export function dealAdvanced(seed, spec) {
  const { colors, size } = spec;
  const random = mulberry32(seed);
  for (;;) {
    const units = shuffle(Array.from({ length: colors * size }, (_, i) => i % colors), random);
    const tubes = Array.from({ length: colors }, (_, i) => units.slice(i * size, (i + 1) * size));
    if (!acceptable(tubes, colors, size)) continue;
    for (const t of tubes) for (let k = 0; k < Math.min(spec.hidden, size - 1); k++) t[k] = ~t[k];
    const kinds = tubes.map(() => null);
    const order = shuffle(tubes.map((_, i) => i), random);
    for (let k = 0; k < spec.locks; k++) {
      const i = order.pop();
      const others = [...new Set(tubes.flatMap((t, j) => (j === i ? [] : t.map(colorOf))))];
      kinds[i] = { key: others[Math.floor(random() * others.length)] };
    }
    for (let k = 0; k < spec.ice; k++) kinds[order.pop()] = { ice: spec.thaw + k * 2 };
    for (let k = 0; k < spec.empties; k++) {
      tubes.push([]);
      kinds.push(null);
    }
    for (let k = 0; k < spec.small; k++) {
      tubes.push([]);
      kinds.push({ cap: spec.smallCap });
    }
    return { tubes, layout: { size, kinds } };
  }
}

// Returns { tubes, layout, par, solution, seed, colors, spec, tries }: the
// hardest of ADVANCED_TRIES solvable deals.
export function generateAdvanced(level) {
  const spec = advancedSpec(level);
  const seed = advancedSeed(level);
  let best = null;
  let found = 0;
  for (let attempt = 0; found < ADVANCED_TRIES && (attempt < 40 || !best); attempt++) {
    const { tubes, layout } = dealAdvanced(hashSeed(`${seed}:${attempt}`), spec);
    const result = solve(tubes, { layout, maxNodes: 120000 });
    if (!result.moves) continue;
    found++;
    if (!best || result.expanded > best.expanded) best = { tubes, layout, par: result.moves.length, solution: result.moves, expanded: result.expanded };
  }
  return { ...best, seed, colors: spec.colors, spec };
}

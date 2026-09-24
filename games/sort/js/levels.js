// Puzzle generation. A puzzle comes from a seed and a size; the solver
// checks it and sets par. Attempts are seeded too, so a given seed always
// gives the same puzzle and par on every device.
import { mulberry32, shuffle } from '../core/rng.js';
import { hashSeed } from '../core/golf.js';
import { CAPACITY, isComplete, topRun } from './rules.js';
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
function acceptable(tubes, colors) {
  if (tubes.some((t) => isComplete(t))) return false;
  const runs = tubes.filter((t) => t.length && topRun(t) >= CAPACITY - 1).length;
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

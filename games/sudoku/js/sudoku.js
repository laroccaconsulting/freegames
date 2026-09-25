// Sudoku: generator, solver and a human-style grader. Pure (no DOM).
//
// A grid is 81 numbers, 0 for empty. Puzzles are made by filling a random
// solved grid, then removing clues (in symmetric pairs) while the solution
// stays unique. The grader solves the way a person does, technique by
// technique; the hardest one needed sets the level, and the same code
// gives hints that name and explain the next step.

import { mulberry32, shuffle } from '../core/rng.js';

export const ROW = (i) => Math.floor(i / 9);
export const COL = (i) => i % 9;
export const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

// The 27 units (rows, columns, boxes) as cell lists, and each cell's peers.
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push([...Array(9).keys()].map((c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push([...Array(9).keys()].map((r) => r * 9 + c));
for (let b = 0; b < 9; b++) UNITS.push([...Array(9).keys()].map((k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)));
const PEERS = [...Array(81).keys()].map((i) => [...new Set(UNITS.filter((u) => u.includes(i)).flat())].filter((j) => j !== i));
export const unitName = (u) => (u < 9 ? `row ${u + 1}` : u < 18 ? `column ${u - 8}` : `box ${u - 17}`);

const bits = (m) => {
  const out = [];
  for (let v = 1; v <= 9; v++) if (m & (1 << v)) out.push(v);
  return out;
};
const popcount = (m) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};
const ALL = 0b1111111110;

// Counts solutions up to `max` (bitmask backtracking, fewest options first).
export function countSolutions(grid, max = 2) {
  const g = grid.slice();
  const row = new Array(9).fill(0);
  const col = new Array(9).fill(0);
  const box = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = 1 << v;
    if (row[ROW(i)] & b || col[COL(i)] & b || box[BOX(i)] & b) return 0;
    row[ROW(i)] |= b;
    col[COL(i)] |= b;
    box[BOX(i)] |= b;
  }
  let found = 0;
  let first = null;
  function go() {
    let best = -1;
    let bestMask = 0;
    let bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(row[ROW(i)] | col[COL(i)] | box[BOX(i)]);
      const n = popcount(m);
      if (n < bestN) {
        best = i;
        bestMask = m;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      found++;
      if (!first) first = g.slice();
      return found >= max;
    }
    for (const v of bits(bestMask)) {
      const b = 1 << v;
      g[best] = v;
      row[ROW(best)] |= b;
      col[COL(best)] |= b;
      box[BOX(best)] |= b;
      if (go()) return true;
      row[ROW(best)] &= ~b;
      col[COL(best)] &= ~b;
      box[BOX(best)] &= ~b;
      g[best] = 0;
    }
    return false;
  }
  go();
  return { count: found, solution: first };
}

function fullGrid(random) {
  const g = new Array(81).fill(0);
  function go(i) {
    if (i === 81) return true;
    const used = new Set(PEERS[i].map((j) => g[j]));
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random)) {
      if (used.has(v)) continue;
      g[i] = v;
      if (go(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  }
  go(0);
  return g;
}

// ---------- Human-style solving ----------

export const TECHNIQUES = [
  { id: 'naked-single', name: 'Naked single', level: 1 },
  { id: 'hidden-single', name: 'Hidden single', level: 1 },
  { id: 'pointing', name: 'Pointing pair', level: 2 },
  { id: 'claiming', name: 'Box line reduction', level: 2 },
  { id: 'naked-pair', name: 'Naked pair', level: 2 },
  { id: 'hidden-pair', name: 'Hidden pair', level: 3 },
  { id: 'naked-triple', name: 'Naked triple', level: 3 },
  { id: 'x-wing', name: 'X-Wing', level: 3 },
];

export function candidatesOf(grid) {
  return grid.map((v, i) => {
    if (v) return 0;
    let m = ALL;
    for (const j of PEERS[i]) if (grid[j]) m &= ~(1 << grid[j]);
    return m;
  });
}

// The next logical step, as { tech, place?: [cell, value], remove?: [[cell, value]], unit?, cells? }.
// `cands` are the candidate masks (eliminations carried from earlier steps).
export function nextStep(grid, cands) {
  // Naked single: a cell with one candidate.
  for (let i = 0; i < 81; i++) if (!grid[i] && popcount(cands[i]) === 1) return { tech: 'naked-single', place: [i, bits(cands[i])[0]], cells: [i] };
  // Hidden single: a value with one home in a unit.
  for (let u = 0; u < 27; u++) {
    for (let v = 1; v <= 9; v++) {
      const homes = UNITS[u].filter((i) => !grid[i] && cands[i] & (1 << v));
      if (homes.length === 1 && !UNITS[u].some((i) => grid[i] === v)) return { tech: 'hidden-single', place: [homes[0], v], unit: u, cells: [homes[0]] };
    }
  }
  const remove = (list) => list.filter(([i, v]) => cands[i] & (1 << v));
  // Pointing: in a box, a value's homes all in one row/column: remove it from the rest of that line.
  for (let b = 18; b < 27; b++) {
    for (let v = 1; v <= 9; v++) {
      const homes = UNITS[b].filter((i) => !grid[i] && cands[i] & (1 << v));
      if (homes.length < 2) continue;
      for (const [key, base] of [[ROW, 0], [COL, 9]]) {
        if (homes.every((i) => key(i) === key(homes[0]))) {
          const line = base + key(homes[0]);
          const r = remove(UNITS[line].filter((i) => !homes.includes(i) && !grid[i]).map((i) => [i, v]));
          if (r.length) return { tech: 'pointing', remove: r, unit: b, line, value: v, cells: homes };
        }
      }
    }
  }
  // Claiming: in a line, a value's homes all in one box: remove it from the rest of the box.
  for (let u = 0; u < 18; u++) {
    for (let v = 1; v <= 9; v++) {
      const homes = UNITS[u].filter((i) => !grid[i] && cands[i] & (1 << v));
      if (homes.length < 2 || !homes.every((i) => BOX(i) === BOX(homes[0]))) continue;
      const b = 18 + BOX(homes[0]);
      const r = remove(UNITS[b].filter((i) => !homes.includes(i) && !grid[i]).map((i) => [i, v]));
      if (r.length) return { tech: 'claiming', remove: r, unit: u, box: b, value: v, cells: homes };
    }
  }
  // Naked pair / triple: n cells in a unit sharing n candidates.
  for (const n of [2, 3]) {
    for (let u = 0; u < 27; u++) {
      const open = UNITS[u].filter((i) => !grid[i] && popcount(cands[i]) <= n && popcount(cands[i]) >= 2);
      const combos = n === 2 ? pairs(open) : triples(open);
      for (const combo of combos) {
        const m = combo.reduce((a, i) => a | cands[i], 0);
        if (popcount(m) !== n) continue;
        const r = remove(UNITS[u].filter((i) => !grid[i] && !combo.includes(i)).flatMap((i) => bits(m).map((v) => [i, v])));
        if (r.length) return { tech: n === 2 ? 'naked-pair' : 'naked-triple', remove: r, unit: u, cells: combo, values: bits(m) };
      }
    }
    if (n === 2) {
      // Hidden pair: two values that only fit in the same two cells of a unit.
      for (let u = 0; u < 27; u++) {
        const homes = {};
        for (let v = 1; v <= 9; v++) homes[v] = UNITS[u].filter((i) => !grid[i] && cands[i] & (1 << v));
        for (let a = 1; a <= 9; a++)
          for (let b = a + 1; b <= 9; b++) {
            if (homes[a].length !== 2 || homes[b].length !== 2 || homes[a][0] !== homes[b][0] || homes[a][1] !== homes[b][1]) continue;
            const keep = (1 << a) | (1 << b);
            const r = remove(homes[a].flatMap((i) => bits(cands[i] & ~keep).map((v) => [i, v])));
            if (r.length) return { tech: 'hidden-pair', remove: r, unit: u, cells: homes[a], values: [a, b] };
          }
      }
    }
  }
  // X-Wing: a value in exactly two places in two rows, same columns (or vice versa).
  for (const [lines, cross] of [[[0, 9], [9, 18]], [[9, 18], [0, 9]]]) {
    for (let v = 1; v <= 9; v++) {
      const spots = [];
      for (let u = lines[0]; u < lines[1]; u++) spots.push(UNITS[u].filter((i) => !grid[i] && cands[i] & (1 << v)));
      for (let a = 0; a < 9; a++)
        for (let b = a + 1; b < 9; b++) {
          if (spots[a].length !== 2 || spots[b].length !== 2) continue;
          const key = lines[0] === 0 ? COL : ROW;
          if (key(spots[a][0]) !== key(spots[b][0]) || key(spots[a][1]) !== key(spots[b][1])) continue;
          const corners = [...spots[a], ...spots[b]];
          const r = remove([key(spots[a][0]), key(spots[a][1])].flatMap((k) => UNITS[cross[0] + k].filter((i) => !grid[i] && !corners.includes(i)).map((i) => [i, v])));
          if (r.length) return { tech: 'x-wing', remove: r, value: v, cells: corners };
        }
    }
  }
  return null;
}

const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));
const triples = (list) => list.flatMap((a, i) => list.slice(i + 1).flatMap((b, j) => list.slice(i + j + 2).map((c) => [a, b, c])));

// Solves like a person. Returns { solved, level (1–4), used: Set of technique ids }.
export function grade(puzzle) {
  const grid = puzzle.slice();
  let cands = candidatesOf(grid);
  const used = new Set();
  for (let guard = 0; guard < 2000; guard++) {
    if (grid.every(Boolean)) break;
    const step = nextStep(grid, cands);
    if (!step) break;
    used.add(step.tech);
    if (step.place) {
      const [i, v] = step.place;
      grid[i] = v;
      cands[i] = 0;
      for (const j of PEERS[i]) cands[j] &= ~(1 << v);
    } else for (const [i, v] of step.remove) cands[i] &= ~(1 << v);
  }
  const solved = grid.every(Boolean);
  const top = Math.max(1, ...[...used].map((t) => TECHNIQUES.find((x) => x.id === t).level));
  return { solved, level: solved ? top : 4, used };
}

export const LEVELS = { easy: 1, medium: 2, hard: 3, expert: 4 };

// A puzzle at a level: { puzzle, solution, level }. Deterministic per seed.
export function generate(seed, level = 'medium') {
  const want = LEVELS[level];
  const random = mulberry32(seed);
  let fallback = null;
  for (let t = 0; t < 60; t++) {
    const solution = fullGrid(random);
    const puzzle = solution.slice();
    // Remove clues in symmetric pairs while the answer stays unique.
    const order = shuffle([...Array(41).keys()], random);
    for (const i of order) {
      const j = 80 - i;
      const keep = [puzzle[i], puzzle[j]];
      puzzle[i] = 0;
      puzzle[j] = 0;
      if (countSolutions(puzzle).count !== 1) [puzzle[i], puzzle[j]] = keep;
      // Easy puzzles stop early so they keep plenty of clues.
      if (want === 1 && puzzle.filter(Boolean).length <= 36) break;
    }
    const g = grade(puzzle);
    if (g.level === want) return { puzzle, solution, level: want };
    // Too hard: add clues back one at a time. Each step tries a few
    // holes: take one that grades exactly right, else one that keeps the
    // puzzle harder than wanted, and carry on.
    if (g.level > want && want < 4) {
      const trial = puzzle.slice();
      for (let step = 0; step < 30; step++) {
        const holes = shuffle([...Array(81).keys()].filter((i) => !trial[i]), random).slice(0, 12);
        let keep = -1;
        for (const i of holes) {
          trial[i] = solution[i];
          const lv = grade(trial).level;
          if (lv === want) return { puzzle: trial, solution, level: want };
          trial[i] = 0;
          if (lv > want && keep < 0) keep = i;
        }
        if (keep < 0) break;
        trial[keep] = solution[keep];
      }
    }
    // Keep the closest miss (ties go to the harder one).
    const miss = Math.abs(g.level - want) - (g.level > want ? 0.5 : 0);
    if (!fallback || miss < fallback.miss) fallback = { puzzle, solution, level: g.level, miss };
  }
  const { miss, ...best } = fallback;
  return best;
}

export const conflicts = (grid) => {
  const bad = new Set();
  for (const u of UNITS) {
    const seen = new Map();
    for (const i of u) {
      if (!grid[i]) continue;
      if (seen.has(grid[i])) {
        bad.add(i);
        bad.add(seen.get(grid[i]));
      } else seen.set(grid[i], i);
    }
  }
  return bad;
};

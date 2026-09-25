// Star Battle: place stars so every row, every column and every outlined
// region holds exactly `k` stars, and no two stars touch (not even
// diagonally). Pure (no DOM).
//
// A puzzle is { n, k, regions: n*n region ids, solution: n*n booleans }.
// Made by placing a random valid set of stars, growing a region round each
// group, and keeping only layouts the solver proves have one answer.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = { small: { n: 6, k: 1 }, medium: { n: 8, k: 1 }, large: { n: 10, k: 2 } };

// All ways to put k non-adjacent stars in a row of n: bitmasks.
function rowPatterns(n, k) {
  const out = [];
  for (let m = 0; m < 1 << n; m++) {
    let bits = 0;
    for (let x = m; x; x &= x - 1) bits++;
    if (bits === k && !(m & (m << 1))) out.push(m);
  }
  return out;
}

// Counts solutions (up to `max`). Rows are filled top to bottom.
export function solve(n, k, regions, { max = 2, limit = 500000 } = {}) {
  const patterns = rowPatterns(n, k);
  const colCount = new Int8Array(n);
  const regCount = new Int8Array(n);
  const regLeft = new Int16Array(n); // cells of each region in rows not yet filled
  for (const r of regions) regLeft[r]++;
  const rows = [];
  const solutions = [];
  let nodes = 0;
  function go(row, prev) {
    if (++nodes > limit) return true;
    if (row === n) {
      solutions.push(rows.slice());
      return solutions.length >= max;
    }
    // Remove this row's cells from what's left for each region.
    for (let c = 0; c < n; c++) regLeft[regions[row * n + c]]--;
    for (const m of patterns) {
      if (m & (prev | (prev << 1) | (prev >> 1))) continue;
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        if (!(m & (1 << c))) continue;
        if (colCount[c] >= k) ok = false;
        const g = regions[row * n + c];
        if (regCount[g] >= k) ok = false;
      }
      if (!ok) continue;
      for (let c = 0; c < n; c++) if (m & (1 << c)) {
        colCount[c]++;
        regCount[regions[row * n + c]]++;
      }
      // Every region must still be able to reach k; every column too.
      let feasible = true;
      for (let g = 0; g < n && feasible; g++) if (regCount[g] + Math.min(regLeft[g], k) < k) feasible = false;
      const left = n - row - 1;
      for (let c = 0; c < n && feasible; c++) if (colCount[c] + Math.ceil(left / 2) < k) feasible = false;
      if (feasible) {
        rows.push(m);
        if (go(row + 1, m)) return true;
        rows.pop();
      }
      for (let c = 0; c < n; c++) if (m & (1 << c)) {
        colCount[c]--;
        regCount[regions[row * n + c]]--;
      }
    }
    for (let c = 0; c < n; c++) regLeft[regions[row * n + c]]++;
    return false;
  }
  go(0, 0);
  return { count: nodes > limit ? -1 : solutions.length, solutions };
}

// A random valid star placement (k per row and column, none touching).
function randomStars(n, k, random) {
  const patterns = rowPatterns(n, k);
  const col = new Int8Array(n);
  const rows = [];
  function go(row, prev) {
    if (row === n) return true;
    for (const m of shuffle(patterns.slice(), random)) {
      if (m & (prev | (prev << 1) | (prev >> 1))) continue;
      let ok = true;
      for (let c = 0; c < n; c++) if (m & (1 << c) && col[c] >= k) ok = false;
      if (!ok) continue;
      const left = n - row - 1;
      for (let c = 0; c < n; c++) if (m & (1 << c)) col[c]++;
      let feasible = true;
      for (let c = 0; c < n; c++) if (col[c] + Math.ceil(left / 2) < k) feasible = false;
      if (feasible) {
        rows.push(m);
        if (go(row + 1, m)) return true;
        rows.pop();
      }
      for (let c = 0; c < n; c++) if (m & (1 << c)) col[c]--;
    }
    return false;
  }
  go(0, 0);
  const stars = [];
  rows.forEach((m, r) => {
    for (let c = 0; c < n; c++) if (m & (1 << c)) stars.push(r * n + c);
  });
  return stars;
}

// Grow n regions: each starts from k stars (paired up), then spreads at random.
function growRegions(n, k, stars, random) {
  const regions = new Array(n * n).fill(-1);
  const order = shuffle(stars.slice(), random);
  // Pair stars into regions of k: join each unassigned star with its nearest.
  let g = 0;
  const assigned = new Set();
  for (const s of order) {
    if (assigned.has(s)) continue;
    const group = [s];
    assigned.add(s);
    while (group.length < k) {
      let best = null;
      let bd = Infinity;
      for (const t of order) {
        if (assigned.has(t)) continue;
        const d = Math.abs(Math.floor(t / n) - Math.floor(s / n)) + Math.abs((t % n) - (s % n));
        if (d < bd) [best, bd] = [t, d];
      }
      group.push(best);
      assigned.add(best);
    }
    // Connect the group's stars with a path so the region is one piece.
    for (const t of group) regions[t] = g;
    for (let j = 1; j < group.length; j++) {
      let [r, c] = [Math.floor(group[0] / n), group[0] % n];
      const [tr, tc] = [Math.floor(group[j] / n), group[j] % n];
      while (r !== tr || c !== tc) {
        if (r !== tr && (c === tc || random() < 0.5)) r += Math.sign(tr - r);
        else c += Math.sign(tc - c);
        if (regions[r * n + c] === -1) regions[r * n + c] = g;
      }
    }
    g++;
  }
  // Spread: repeatedly give a random unassigned cell next to a region to it.
  for (;;) {
    const frontier = [];
    for (let i = 0; i < n * n; i++) {
      if (regions[i] !== -1) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      const nb = [r > 0 && i - n, r < n - 1 && i + n, c > 0 && i - 1, c < n - 1 && i + 1].filter((x) => x !== false && regions[x] !== -1);
      if (nb.length) frontier.push([i, nb]);
    }
    if (!frontier.length) break;
    const [i, nb] = frontier[Math.floor(random() * frontier.length)];
    regions[i] = regions[nb[Math.floor(random() * nb.length)]];
  }
  return regions;
}

// Is region g still in one piece without cell `skip`?
function connectedWithout(n, regions, g, skip) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === g && i !== skip) cells.push(i);
  if (!cells.length) return false;
  const inRegion = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    const r = Math.floor(i / n);
    const c = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
      if (j >= 0 && inRegion.has(j) && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
}

// Regions grown at random rarely have one answer. Repair them: while the
// solver finds another answer, move a cell where that answer has a star
// (and ours doesn't) into a neighbouring region, which breaks it.
export function generate(seed, size = 'medium') {
  const { n, k } = SIZES[size];
  const random = mulberry32(seed);
  for (let t = 0; t < 60; t++) {
    const stars = randomStars(n, k, random);
    const regions = growRegions(n, k, stars, random);
    if (regions.includes(-1)) continue;
    const mine = new Set(stars);
    for (let step = 0; step < 120; step++) {
      const res = solve(n, k, regions);
      if (res.count === 1) {
        const solution = new Array(n * n).fill(false);
        for (const s of stars) solution[s] = true;
        return { n, k, regions, solution };
      }
      if (res.count < 1) break;
      const other = res.solutions.find((rows) => rows.some((m, r) => [...Array(n).keys()].some((c) => !!(m & (1 << c)) !== mine.has(r * n + c))));
      const cells = [];
      other.forEach((m, r) => {
        for (let c = 0; c < n; c++) if (m & (1 << c) && !mine.has(r * n + c)) cells.push(r * n + c);
      });
      const moves = [];
      for (const i of cells) {
        const r = Math.floor(i / n);
        const c = i % n;
        for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
          if (j >= 0 && regions[j] !== regions[i] && connectedWithout(n, regions, regions[i], i)) moves.push([i, regions[j]]);
        }
      }
      if (!moves.length) break;
      const [i, g] = moves[Math.floor(random() * moves.length)];
      regions[i] = g;
    }
  }
  throw new Error('no star battle');
}

// Problems with the player's marks: cells that break a rule.
// marks[i] is 0 (empty), 1 (dot: no star) or 2 (star).
export function conflicts(p, marks) {
  const { n, k, regions } = p;
  const bad = new Set();
  const groups = { row: [], col: [], reg: [] };
  for (let i = 0; i < n * n; i++) {
    if (marks[i] !== 2) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    (groups.row[r] ||= []).push(i);
    (groups.col[c] ||= []).push(i);
    (groups.reg[regions[i]] ||= []).push(i);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n && marks[rr * n + cc] === 2) bad.add(i);
      }
  }
  for (const list of [...groups.row, ...groups.col, ...groups.reg]) if (list && list.length > k) list.forEach((i) => bad.add(i));
  return bad;
}

export const isSolved = (p, marks) => p.solution.every((s, i) => s === (marks[i] === 2));

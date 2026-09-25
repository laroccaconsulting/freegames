// Bridges: connect every island with bridges. Each island's number says how
// many bridges touch it; bridges run straight across or down, at most two
// between the same pair, never cross, and all islands end up connected.
// Pure (no DOM).
//
// A puzzle is { w, h, islands: [{ r, c, n }], edges: [[a, b]], solution: [count per edge] }.
// `edges` lists every pair of islands that can see each other.

import { mulberry32, shuffle } from '../core/rng.js';

export const SIZES = { small: { w: 7, h: 7, islands: 10 }, medium: { w: 9, h: 9, islands: 17 }, large: { w: 10, h: 12, islands: 26 } };

// Pairs of islands in a straight line with nothing between them.
export function visibleEdges(w, h, islands) {
  const at = new Map(islands.map((s, k) => [s.r * w + s.c, k]));
  const edges = [];
  islands.forEach((s, a) => {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      for (let r = s.r + dr, c = s.c + dc; r < h && c < w; r += dr, c += dc) {
        const b = at.get(r * w + c);
        if (b !== undefined) {
          edges.push([a, b]);
          break;
        }
      }
    }
  });
  return edges;
}

export function crosses(islands, e, f) {
  const [a, b] = e.map((k) => islands[k]);
  const [c, d] = f.map((k) => islands[k]);
  const eh = a.r === b.r;
  const fh = c.r === d.r;
  if (eh === fh) return false;
  const [H1, H2, V1, V2] = eh ? [a, b, c, d] : [c, d, a, b];
  const r = H1.r;
  const col = V1.c;
  return Math.min(H1.c, H2.c) < col && col < Math.max(H1.c, H2.c) && Math.min(V1.r, V2.r) < r && r < Math.max(V1.r, V2.r);
}

export function connected(n, edges, counts) {
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const x = stack.pop();
    edges.forEach(([a, b], k) => {
      if (!counts[k]) return;
      const y = a === x ? b : b === x ? a : -1;
      if (y >= 0 && !seen.has(y)) {
        seen.add(y);
        stack.push(y);
      }
    });
  }
  return seen.size === n;
}

// Counts solutions (up to `max`) with propagation: an island that needs
// exactly what its open bridges can still give takes them all; one that is
// full closes the rest.
export function solve(p, { max = 2, limit = 200000 } = {}) {
  const { islands, edges } = p;
  const n = islands.length;
  const touching = islands.map((_, k) => edges.map((e, j) => (e[0] === k || e[1] === k ? j : -1)).filter((j) => j >= 0));
  const crossing = edges.map((e, j) => edges.map((f, k) => (k !== j && crosses(islands, e, f) ? k : -1)).filter((k) => k >= 0));
  const solutions = [];
  let nodes = 0;
  // lo/hi: bounds on each edge's count.
  function go(lo, hi) {
    if (++nodes > limit) return true;
    // Propagate to a fixed point.
    for (let changed = true; changed; ) {
      changed = false;
      for (let j = 0; j < edges.length; j++) {
        if (lo[j] > 0) for (const k of crossing[j]) if (hi[k] > 0) {
          if (lo[k] > 0) return false;
          hi[k] = 0;
          changed = true;
        }
      }
      for (let k = 0; k < n; k++) {
        const need = islands[k].n;
        let min = 0;
        let maxSum = 0;
        for (const j of touching[k]) {
          min += lo[j];
          maxSum += hi[j];
        }
        if (min > need || maxSum < need) return false;
        for (const j of touching[k]) {
          // Each edge must supply at least need - (what the others can give).
          const others = maxSum - hi[j];
          const needLo = Math.max(lo[j], need - others);
          const needHi = Math.min(hi[j], need - (min - lo[j]));
          if (needLo > needHi) return false;
          if (needLo !== lo[j] || needHi !== hi[j]) {
            lo[j] = needLo;
            hi[j] = needHi;
            changed = true;
          }
        }
      }
    }
    const open = edges.findIndex((_, j) => lo[j] !== hi[j]);
    if (open < 0) {
      if (!connected(n, edges, lo)) return false;
      solutions.push(lo.slice());
      return solutions.length >= max;
    }
    for (let v = hi[open]; v >= lo[open]; v--) {
      const l2 = lo.slice();
      const h2 = hi.slice();
      l2[open] = h2[open] = v;
      if (go(l2, h2)) return true;
    }
    return false;
  }
  go(edges.map(() => 0), edges.map(() => 2));
  return { count: nodes > limit ? -1 : solutions.length, solutions };
}

// Grow a connected set of islands: from a random island, walk in a random
// direction to a free spot and put a new island there, joined by 1 or 2
// bridges. Islands never sit side by side, and new bridges never cross old ones.
function build(w, h, count, random) {
  const islands = [{ r: Math.floor(random() * h), c: Math.floor(random() * w) }];
  const bridges = []; // [a, b, count]
  const occupied = new Set([islands[0].r * w + islands[0].c]);
  const bridgeCells = new Set();
  const near = (r, c) => [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dr, dc]) => occupied.has((r + dr) * w + (c + dc)) && r + dr >= 0 && r + dr < h && c + dc >= 0 && c + dc < w);
  for (let tries = 0; islands.length < count && tries < 3000; tries++) {
    const a = Math.floor(random() * islands.length);
    const [dr, dc] = [[0, 1], [1, 0], [0, -1], [-1, 0]][Math.floor(random() * 4)];
    const d = 2 + Math.floor(random() * 4);
    const s = islands[a];
    const r = s.r + dr * d;
    const c = s.c + dc * d;
    if (r < 0 || c < 0 || r >= h || c >= w || occupied.has(r * w + c) || bridgeCells.has(r * w + c) || near(r, c)) continue;
    const path = [];
    let ok = true;
    for (let k = 1; k < d; k++) {
      const cell = (s.r + dr * k) * w + (s.c + dc * k);
      if (occupied.has(cell) || bridgeCells.has(cell)) ok = false;
      path.push(cell);
    }
    if (!ok) continue;
    occupied.add(r * w + c);
    path.forEach((cell) => bridgeCells.add(cell));
    islands.push({ r, c });
    bridges.push([a, islands.length - 1, random() < 0.35 ? 2 : 1]);
  }
  return { islands, bridges };
}

export function generate(seed, size = 'medium') {
  const { w, h, islands: count } = SIZES[size];
  const random = mulberry32(seed);
  for (let t = 0; t < 400; t++) {
    const built = build(w, h, count, random);
    if (built.islands.length < count) continue;
    const islands = built.islands.map((s) => ({ ...s, n: 0 }));
    for (const [a, b, k] of built.bridges) {
      islands[a].n += k;
      islands[b].n += k;
    }
    const edges = visibleEdges(w, h, islands);
    const solution = edges.map(([a, b]) => built.bridges.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2] || 0);
    const p = { w, h, islands, edges, solution };
    if (solve(p).count === 1) return p;
  }
  throw new Error('no bridges');
}

// Bridges touching each island, from the player's counts.
export const totals = (p, counts) => p.islands.map((_, k) => p.edges.reduce((s, [a, b], j) => s + (a === k || b === k ? counts[j] : 0), 0));

export function isSolved(p, counts) {
  const t = totals(p, counts);
  if (!p.islands.every((s, k) => t[k] === s.n)) return false;
  for (let j = 0; j < p.edges.length; j++) if (counts[j]) for (let k = j + 1; k < p.edges.length; k++) if (counts[k] && crosses(p.islands, p.edges[j], p.edges[k])) return false;
  return connected(p.islands.length, p.edges, counts);
}

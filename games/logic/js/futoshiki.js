// Futoshiki: fill the grid with 1..n so no number repeats in a row or
// column, and every < or > sign between two squares holds. Pure (no DOM).
//
// A puzzle is { n, givens, signs: [{ a, b }] (value[a] < value[b], a and b
// side by side), solution }. Made from a random Latin square with every sign
// and no givens, then thinned while the answer stays unique.

import { mulberry32, shuffle } from '../core/rng.js';
import { randomLatin, countLatin, repeats, disambiguate } from './latin.js';

export const SIZES = { small: { n: 4 }, medium: { n: 5 }, large: { n: 6 } };

export function rule(p) {
  const n = p.n;
  const by = Array.from({ length: n * n }, () => []);
  const less = Array.from({ length: n * n }, () => []); // squares that must be smaller
  const more = Array.from({ length: n * n }, () => []);
  for (const s of p.signs) {
    by[s.a].push(s);
    by[s.b].push(s);
    less[s.b].push(s.a);
    more[s.a].push(s.b);
  }
  // A square with a chain of k smaller squares below it is at least k + 1,
  // and with k bigger ones above it at most n - k.
  const depth = (links) => {
    const memo = new Array(n * n).fill(-1);
    const f = (i) => (memo[i] >= 0 ? memo[i] : (memo[i] = links[i].reduce((m, j) => Math.max(m, 1 + f(j)), 0)));
    return [...Array(n * n).keys()].map(f);
  };
  const lo = depth(less).map((k) => k + 1);
  const hi = depth(more).map((k) => n - k);
  return (g, i) => {
    if (g[i] < lo[i] || g[i] > hi[i]) return false;
    for (const s of by[i]) {
      const a = g[s.a];
      const b = g[s.b];
      if (a && b && a >= b) return false;
    }
    return true;
  };
}

export function generate(seed, size = 'medium') {
  const { n } = SIZES[size];
  const random = mulberry32(seed);
  {
    const solution = randomLatin(n, random);
    const signs = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      for (const j of [c < n - 1 ? i + 1 : -1, r < n - 1 ? i + n : -1]) {
        if (j < 0) continue;
        signs.push(solution[i] < solution[j] ? { a: i, b: j } : { a: j, b: i });
      }
    }
    let p = { n, givens: new Array(n * n).fill(0), signs, solution };
    // A small search budget also keeps puzzles that need deep guessing out.
    const unique = (q) => countLatin(n, q.givens, rule(q), { limit: 3000 }).count === 1;
    p.givens = disambiguate(n, p.givens, (givens) => rule({ ...p, givens }), solution, random);
    // Thin givens first (signs make nicer clues), then signs, while unique.
    for (const i of shuffle([...Array(n * n).keys()], random)) {
      if (!p.givens[i]) continue;
      const givens = p.givens.slice();
      givens[i] = 0;
      if (unique({ ...p, givens })) p = { ...p, givens };
    }
    for (const s of shuffle(p.signs.slice(), random)) {
      const trial = { ...p, signs: p.signs.filter((x) => x !== s) };
      if (unique(trial)) p = trial;
    }
    return p;
  }
}

// Cells that break a rule: repeats, or both ends of a broken sign.
export function conflicts(p, values) {
  const bad = repeats(p.n, values);
  for (const s of p.signs) if (values[s.a] && values[s.b] && values[s.a] >= values[s.b]) [s.a, s.b].forEach((i) => bad.add(i));
  return bad;
}

export const isSolved = (p, values) => p.solution.every((v, i) => values[i] === v);

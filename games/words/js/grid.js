// Word Grid: find words by joining neighbouring letters (across, up, down or
// diagonally) in a 4×4 grid, each square used once per word. Pure (no DOM).
// "Qu" sits on one square. Words need three letters or more.

import { mulberry32 } from '../core/rng.js';

export const N = 4;
// Letter weights close to English text, so grids read naturally.
const WEIGHTS = 'eeeeeeeeeeeeaaaaaaaaaiiiiiiiioooooooonnnnnnrrrrrrttttttllllsssssuuuuddddgggbbccmmppffhhvvwwyykjxqz';

export function neighbours(i) {
  const r = Math.floor(i / N);
  const c = i % N;
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && cc >= 0 && rr < N && cc < N) out.push(rr * N + cc);
    }
  return out;
}

export const tileText = (t) => (t === 'q' ? 'qu' : t);

// Every word in the grid (from `words`), found by walking the grid with a prefix set.
export function findAll(tiles, words, prefixes) {
  const found = new Set();
  const used = new Array(N * N).fill(false);
  function walk(i, sofar) {
    const s = sofar + tileText(tiles[i]);
    if (!prefixes.has(s)) return;
    used[i] = true;
    if (s.length >= 3 && words.has(s)) found.add(s);
    for (const j of neighbours(i)) if (!used[j]) walk(j, s);
    used[i] = false;
  }
  for (let i = 0; i < N * N; i++) walk(i, '');
  return [...found].sort();
}

export function prefixSet(list) {
  const p = new Set();
  for (const w of list) for (let k = 1; k <= w.length; k++) p.add(w.slice(0, k));
  return p;
}

// A grid with plenty of common words: { tiles, common, all }.
export function generate(dict, seed, prefixes) {
  const random = mulberry32(seed);
  for (let t = 0; t < 200; t++) {
    const tiles = Array.from({ length: N * N }, () => WEIGHTS[Math.floor(random() * WEIGHTS.length)]);
    const vowels = tiles.filter((x) => 'aeiou'.includes(x)).length;
    if (vowels < 4 || vowels > 8) continue;
    const all = findAll(tiles, dict.words, prefixes);
    const common = all.filter((w) => dict.common.has(w));
    if (common.length >= 25) return { tiles, common, all };
  }
  throw new Error('no grid');
}

// Is `path` (square indexes) a legal trace: neighbours, no square twice?
export function validPath(path) {
  return path.every((i, k) => k === 0 || neighbours(path[k - 1]).includes(i)) && new Set(path).size === path.length;
}

export const wordOf = (tiles, path) => path.map((i) => tileText(tiles[i])).join('');

// Points by length, the classic way.
export const points = (w) => (w.length <= 4 ? 1 : w.length === 5 ? 2 : w.length === 6 ? 3 : w.length === 7 ? 5 : 11);

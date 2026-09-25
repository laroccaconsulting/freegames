// Word Ladder: change one letter at a time to turn the first word into the
// last, making a real word at every step. Pure (no DOM).
//
// Par is the shortest possible ladder through the whole word list (found by
// breadth-first search), so it's exact; the start and end are common words.

import { mulberry32 } from '../core/rng.js';

// Words one letter away, via wildcard buckets ("c*t" -> cat, cot, cut).
export function makeGraph(words) {
  const buckets = new Map();
  for (const w of words) {
    for (let i = 0; i < w.length; i++) {
      const key = `${w.slice(0, i)}*${w.slice(i + 1)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(w);
    }
  }
  return {
    next(w) {
      const out = new Set();
      for (let i = 0; i < w.length; i++) for (const x of buckets.get(`${w.slice(0, i)}*${w.slice(i + 1)}`) || []) if (x !== w) out.add(x);
      return [...out];
    },
  };
}

export const oneApart = (a, b) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;

// Shortest ladder from a to b (list of words, both ends included), or null.
export function shortest(graph, a, b, limit = 20) {
  const prev = new Map([[a, null]]);
  let frontier = [a];
  for (let depth = 0; frontier.length && depth < limit; depth++) {
    const next = [];
    for (const w of frontier) {
      for (const x of graph.next(w)) {
        if (prev.has(x)) continue;
        prev.set(x, w);
        if (x === b) {
          const path = [b];
          for (let at = w; at; at = prev.get(at)) path.unshift(at);
          return path;
        }
        next.push(x);
      }
    }
    frontier = next;
  }
  return null;
}

// A puzzle: { start, end, par } where par counts the steps (words changed).
export function generate(dict, seed, { length = 4, min = 4, max = 7 } = {}) {
  const random = mulberry32(seed);
  const all = dict.byLen.get(length);
  const graph = makeGraph(all);
  const common = dict.commonByLen.get(length).filter((w) => !w.endsWith('s') || w.endsWith('ss'));
  for (let t = 0; t < 400; t++) {
    const start = common[Math.floor(random() * common.length)];
    const end = common[Math.floor(random() * common.length)];
    if (start === end) continue;
    const path = shortest(graph, start, end, max + 1);
    if (!path) continue;
    const par = path.length - 1;
    if (par >= min && par <= max) return { start, end, par, length };
  }
  throw new Error('no ladder');
}

// Why a step doesn't work, or null.
export function checkStep(dict, from, word) {
  if (word.length !== from.length) return `Use ${from.length} letters.`;
  if (!oneApart(from, word)) return 'Change exactly one letter.';
  if (!dict.words.has(word)) return 'Not in the word list.';
  return null;
}

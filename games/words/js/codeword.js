// Codeword: a crossword with no clues. Every letter is replaced by a number
// (the same letter always gets the same number); crack the code. Pure
// functions (no DOM).
//
// A puzzle is { size, cells, code, given, words }:
//   cells[r * size + c] is a letter, or '' for a block
//   code  maps each letter used to its number (1..k)
//   given letters shown at the start
// The generator builds a criss-cross grid of common words, numbers the
// letters at random, then gives away letters until a solver proves that
// only one set of letters fits every word in the full word list.

import { mulberry32, shuffle } from '../core/rng.js';

// ---------- Building the grid ----------

// Criss-cross fill: start with one word across the middle, then keep adding
// words that cross letters already placed. Words never touch side by side,
// so every run of letters in the grid is a real word.
export function buildGrid(pool, size, random, { fill = 0.5, tries = 6000 } = {}) {
  const grid = new Array(size * size).fill('');
  const dirs = new Array(size * size).fill(0); // bit 1: part of an across word, bit 2: down
  const at = (r, c) => (r < 0 || c < 0 || r >= size || c >= size ? '' : grid[r * size + c]);
  const words = [];
  const used = new Set();
  let letters = 0;

  const canPlace = (word, r, c, across) => {
    const dr = across ? 0 : 1;
    const dc = across ? 1 : 0;
    const er = r + dr * (word.length - 1);
    const ec = c + dc * (word.length - 1);
    if (r < 0 || c < 0 || er >= size || ec >= size) return -1;
    if (at(r - dr, c - dc) || at(er + dr, ec + dc)) return -1;
    let crosses = 0;
    for (let k = 0; k < word.length; k++) {
      const rr = r + dr * k;
      const cc = c + dc * k;
      const cur = grid[rr * size + cc];
      if (cur) {
        if (cur !== word[k] || dirs[rr * size + cc] & (across ? 1 : 2)) return -1;
        crosses++;
      } else if (across ? at(rr - 1, cc) || at(rr + 1, cc) : at(rr, cc - 1) || at(rr, cc + 1)) return -1;
    }
    return crosses === word.length ? -1 : crosses;
  };
  const place = (word, r, c, across) => {
    for (let k = 0; k < word.length; k++) {
      const i = (r + (across ? 0 : k)) * size + c + (across ? k : 0);
      if (!grid[i]) letters++;
      grid[i] = word[k];
      dirs[i] |= across ? 1 : 2;
    }
    used.add(word);
    words.push({ word, r, c, across });
  };

  const long = pool.filter((w) => w.length >= 7 && w.length <= size);
  const first = long[Math.floor(random() * long.length)];
  place(first, Math.floor(size / 2), Math.floor(random() * (size - first.length + 1)), true);

  for (let t = 0; t < tries && letters < fill * size * size; t++) {
    const word = pool[Math.floor(random() * pool.length)];
    if (used.has(word) || word.length > size) continue;
    // Best spot for this word: the most crossings, ties at random.
    let best = null;
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i] || dirs[i] === 3) continue;
      const across = dirs[i] === 2;
      const r0 = Math.floor(i / size);
      const c0 = i % size;
      for (let k = 0; k < word.length; k++) {
        if (word[k] !== grid[i]) continue;
        const r = across ? r0 : r0 - k;
        const c = across ? c0 - k : c0;
        const n = canPlace(word, r, c, across);
        if (n > 0 && (!best || n > best.n || (n === best.n && random() < 0.3))) best = { r, c, across, n };
      }
    }
    if (best) place(word, best.r, best.c, best.across);
  }
  return { grid, words };
}

// Every run of two or more letters, as lists of cell indexes.
export function slots(cells, size) {
  const out = [];
  for (const across of [true, false]) {
    for (let a = 0; a < size; a++) {
      let run = [];
      for (let b = 0; b <= size; b++) {
        const i = across ? a * size + b : b * size + a;
        if (b < size && cells[i]) run.push(i);
        else {
          if (run.length >= 2) out.push(run);
          run = [];
        }
      }
    }
  }
  return out;
}

// ---------- Solving ----------

class Budget extends Error {}

// Counts the ways to fill the grid with real words (up to `max`), given the
// numbers in each slot and the letters already known. Returns
// { count, solutions: [Map number -> letter] }.
export function solveCode(dict, numSlots, known, { max = 2, limit = 200000 } = {}) {
  // Words grouped by "shape": abca-style repeat pattern, so a slot only
  // ever looks at words with the right length and repeats.
  const shapeOf = (arr) => {
    const seen = new Map();
    return arr.map((x) => (seen.has(x) ? seen.get(x) : (seen.set(x, seen.size), seen.size - 1))).join(',');
  };
  const byShape = new Map();
  const need = new Set(numSlots.map(shapeOf));
  for (const w of dict.list) {
    const s = shapeOf([...w]);
    if (!need.has(s)) continue;
    if (!byShape.has(s)) byShape.set(s, []);
    byShape.get(s).push(w);
  }
  const cands = numSlots.map((s) => byShape.get(shapeOf(s)) || []);
  const assign = new Map(known); // number -> letter
  const usedLetters = new Map([...known].map(([n, l]) => [l, n]));
  const solutions = [];
  let nodes = 0;

  const matches = (slot, w) => {
    for (let k = 0; k < slot.length; k++) {
      const n = slot[k];
      const l = w[k];
      const cur = assign.get(n);
      if (cur) {
        if (cur !== l) return false;
      } else {
        const owner = usedLetters.get(l);
        if (owner !== undefined && owner !== n) return false;
      }
    }
    return true;
  };

  function search(open) {
    if (++nodes > limit) throw new Budget();
    if (!open.length) {
      solutions.push(new Map(assign));
      return solutions.length >= max;
    }
    // The slot with the fewest words that still fit.
    let bestIdx = -1;
    let bestList = null;
    for (let j = 0; j < open.length; j++) {
      const s = open[j];
      const list = [];
      for (const w of cands[s]) {
        if (matches(numSlots[s], w)) {
          list.push(w);
          if (bestList && list.length >= bestList.length) break;
        }
      }
      if (!list.length) return false;
      if (!bestList || list.length < bestList.length) {
        bestList = list;
        bestIdx = j;
        if (list.length === 1) break;
      }
    }
    const s = open[bestIdx];
    const rest = open.filter((_, j) => j !== bestIdx);
    const slot = numSlots[s];
    for (const w of bestList) {
      const added = [];
      for (let k = 0; k < slot.length; k++) {
        if (!assign.has(slot[k])) {
          assign.set(slot[k], w[k]);
          usedLetters.set(w[k], slot[k]);
          added.push(slot[k]);
        }
      }
      // Slots whose letters are now all known must spell a word; then they're done.
      const done = (j) => numSlots[j].every((n) => assign.has(n));
      const dead = rest.some((j) => done(j) && !dict.words.has(numSlots[j].map((n) => assign.get(n)).join('')));
      if (!dead && search(rest.filter((j) => !done(j)))) return true;
      for (const n of added) {
        usedLetters.delete(assign.get(n));
        assign.delete(n);
      }
    }
    return false;
  }

  try {
    search(numSlots.map((_, i) => i));
    return { count: solutions.length, solutions, nodes };
  } catch (e) {
    if (e instanceof Budget) return { count: -1, solutions, nodes };
    throw e;
  }
}

// ---------- Making a puzzle ----------

export function generate(dict, seed, { size = 12 } = {}) {
  const random = mulberry32(seed);
  const pool = dict.commonList.filter((w) => w.length >= 3 && w.length <= size);
  for (let attempt = 0; attempt < 20; attempt++) {
    const { grid } = buildGrid(pool, size, random);
    const cells = grid;
    const letters = [...new Set(cells.filter(Boolean))];
    if (letters.length < 18) continue;
    const numbers = shuffle(letters.map((_, i) => i + 1), random);
    const code = Object.fromEntries(letters.map((l, i) => [l, numbers[i]]));
    const runs = slots(cells, size);
    const numSlots = runs.map((run) => run.map((i) => code[cells[i]]));
    // Start with two letters given; add one wherever two solutions differ.
    const byNumber = Object.fromEntries(Object.entries(code).map(([l, n]) => [n, l]));
    const given = [];
    const order = shuffle(letters.slice(), random);
    given.push(order[0], order[1]);
    let ok = false;
    for (let round = 0; round < 12; round++) {
      const known = new Map(given.map((l) => [code[l], l]));
      const r = solveCode(dict, numSlots, known);
      if (r.count === 1) {
        ok = true;
        break;
      }
      if (r.count === 0) break; // cannot happen: the real answer always fits
      // Reveal a number the two solutions disagree on (or, over budget, a
      // frequent letter that isn't given yet).
      let reveal = null;
      if (r.solutions.length >= 2) {
        const [a, b] = r.solutions;
        const diff = [...a.keys()].filter((n) => a.get(n) !== b.get(n));
        reveal = byNumber[diff[Math.floor(random() * diff.length)]];
      } else {
        const freq = {};
        for (const l of cells) if (l && !given.includes(l)) freq[l] = (freq[l] || 0) + 1;
        reveal = Object.keys(freq).sort((x, y) => freq[y] - freq[x])[0];
      }
      if (!reveal || given.includes(reveal)) break;
      given.push(reveal);
    }
    if (!ok) continue;
    return { size, cells, code, given };
  }
  throw new Error('no codeword');
}

// ---------- Playing ----------

// The player's guesses: number -> letter. Returns the letter shown in cell i.
export const shown = (puzzle, guesses, i) => {
  const l = puzzle.cells[i];
  if (!l) return '';
  const n = puzzle.code[l];
  return puzzle.given.includes(l) ? l : guesses[n] || '';
};

export function isSolved(puzzle, guesses) {
  return Object.entries(puzzle.code).every(([l, n]) => puzzle.given.includes(l) || guesses[n] === l);
}

// Numbers whose guess is wrong (for "check").
export function mistakes(puzzle, guesses) {
  return Object.entries(puzzle.code)
    .filter(([l, n]) => guesses[n] && guesses[n] !== l)
    .map(([, n]) => n);
}

// Word Search: common words hidden in a square of letters, running in any
// of eight directions. Pure (no DOM).
//
// A puzzle is { size, cells: [letter], words: [{ word, start, dir }] }
// where dir is an index into DIRS.

import { mulberry32, shuffle } from '../core/rng.js';
import { isBlocked } from './blocklist.js';

export const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
];
const FILL = 'eeeeeeaaaaaiiiiooooonnnnrrrrttttllssssuuddgbbccmmppffhhvwwyk';

export const path = (size, start, dir, len) => {
  const [dr, dc] = DIRS[dir];
  const r = Math.floor(start / size);
  const c = start % size;
  const out = [];
  for (let k = 0; k < len; k++) {
    const rr = r + dr * k;
    const cc = c + dc * k;
    if (rr < 0 || cc < 0 || rr >= size || cc >= size) return null;
    out.push(rr * size + cc);
  }
  return out;
};

// Plain base words read best in a search: skip plurals and -ed/-ing forms
// of other common words (the common list includes those inflections).
function derived(w, common) {
  if (w.endsWith('s') && (common.has(w.slice(0, -1)) || (w.endsWith('es') && common.has(w.slice(0, -2))))) return true;
  if (w.endsWith('ed') && (common.has(w.slice(0, -2)) || common.has(w.slice(0, -1)) || common.has(w.slice(0, -3)))) return true;
  if (w.endsWith('ing') && (common.has(w.slice(0, -3)) || common.has(`${w.slice(0, -3)}e`) || common.has(w.slice(0, -4)))) return true;
  return false;
}

// How many words of each length, by grid size.
const MIX = { 8: [4, 4, 4, 5, 5, 6, 6, 7], 10: [4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8], 12: [4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 9, 9] };

export function generate(dict, seed, { size = 10 } = {}) {
  const random = mulberry32(seed);
  const lengths = MIX[size];
  const byLen = new Map();
  for (const w of dict.commonList) {
    if (w.length < 4 || w.length > size || !dict.words.has(w) || derived(w, dict.common)) continue;
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length).push(w);
  }
  for (let t = 0; t < 40; t++) {
    const cells = new Array(size * size).fill('');
    const words = [];
    const picks = [];
    for (const len of lengths) {
      const list = byLen.get(len) || [];
      for (let k = 0; k < 50 && list.length; k++) {
        const w = list[Math.floor(random() * list.length)];
        if (!picks.some((u) => u.includes(w) || w.includes(u))) {
          picks.push(w);
          break;
        }
      }
    }
    // Longest first. Most words run forwards (across or down), with some
    // backwards and diagonal ones for spice.
    picks.sort((a, b) => b.length - a.length);
    for (const word of picks) {
      const dirs = random() < 0.5 ? shuffle([0, 1, 2, 3], random) : shuffle([...DIRS.keys()], random);
      let placed = false;
      for (const dir of dirs) {
        for (const start of shuffle([...Array(size * size).keys()], random)) {
          const p = path(size, start, dir, word.length);
          if (!p || !p.every((i, k) => !cells[i] || cells[i] === word[k])) continue;
          p.forEach((i, k) => (cells[i] = word[k]));
          words.push({ word, start, dir });
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
    if (words.length < lengths.length) continue;
    for (let i = 0; i < cells.length; i++) if (!cells[i]) cells[i] = FILL[Math.floor(random() * FILL.length)];
    // Each word should appear exactly once, so any line you find is the one.
    if (rude(size, cells)) continue;
    if (words.every(({ word }) => occurrences(size, cells, word) === 1)) return { size, cells, words: words.sort((a, b) => (a.word < b.word ? -1 : 1)) };
  }
  throw new Error('no word search');
}

// Does any straight run of letters spell a blocked word? (Random filler
// letters could, by bad luck.)
export function rude(size, cells) {
  for (let s = 0; s < size * size; s++) {
    for (let d = 0; d < 8; d++) {
      let text = '';
      for (let k = 0; k < 9; k++) {
        const p = path(size, s, d, k + 1);
        if (!p) break;
        text += cells[p[k]];
        if (k >= 2 && isBlocked(text)) return true;
      }
    }
  }
  return false;
}

export function occurrences(size, cells, word) {
  let n = 0;
  for (let s = 0; s < size * size; s++) {
    if (cells[s] !== word[0]) continue;
    for (let d = 0; d < 8; d++) {
      const p = path(size, s, d, word.length);
      if (p && p.every((i, k) => cells[i] === word[k])) n++;
    }
  }
  // A palindrome reads the same both ways, so it's found twice.
  return word === [...word].reverse().join('') ? n / 2 : n;
}

// The straight line of squares from a to b, or null if they don't line up.
export function line(size, a, b) {
  const r1 = Math.floor(a / size);
  const c1 = a % size;
  const dr = Math.floor(b / size) - r1;
  const dc = (b % size) - c1;
  if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return null;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const out = [];
  for (let k = 0; k <= steps; k++) out.push((r1 + (steps ? (dr / steps) * k : 0)) * size + c1 + (steps ? (dc / steps) * k : 0));
  return out;
}

// Which hidden word does this line spell (either way round)? Its index, or -1.
export function match(p, squares) {
  if (!squares || squares.length < 2) return -1;
  return p.words.findIndex(({ word, start, dir }) => {
    const q = path(p.size, start, dir, word.length);
    if (q.length !== squares.length) return false;
    return q.every((i, k) => i === squares[k]) || q.every((i, k) => i === squares[squares.length - 1 - k]);
  });
}

export const squaresOf = (p, k) => path(p.size, p.words[k].start, p.words[k].dir, p.words[k].word.length);

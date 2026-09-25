// Word Wheel: nine letters round a wheel, one in the middle. Make words of
// four or more letters that use the middle letter, each letter at most once.
// One word uses all nine. Pure functions (no DOM).

import { mulberry32, shuffle } from '../core/rng.js';
import { counts, fits } from './dict.js';

export const MIN = 4;

// Every playable answer for a wheel, split into common words (these set the
// targets) and bonus words (rarer, still accepted and counted).
export function answers(dict, letters, centre) {
  const pool = counts(letters);
  const all = [];
  for (const w of dict.list) {
    if (w.length < MIN || w.length > letters.length || !w.includes(centre)) continue;
    if (fits(w, pool)) all.push(w);
  }
  const common = all.filter((w) => dict.common.has(w));
  return { all, common };
}

// A wheel from a seed: { letters (9, shuffled, centre excluded order), centre, nine, common, all }.
// Re-rolled until the common answer count is comfortable.
export function generate(dict, seed) {
  const random = mulberry32(seed);
  const nines = dict.commonByLen.get(9);
  for (let tries = 0; tries < 200; tries++) {
    const nine = nines[Math.floor(random() * nines.length)];
    const distinct = [...new Set(nine)];
    const centre = distinct[Math.floor(random() * distinct.length)];
    const a = answers(dict, nine, centre);
    if (a.common.length < 18 || a.common.length > 70) continue;
    const rest = nine.split('');
    rest.splice(rest.indexOf(centre), 1);
    return { letters: shuffle(rest, random).join(''), centre, nine, common: a.common, all: a.all };
  }
  throw new Error('no wheel');
}

// Why a guess doesn't count, or null if it's a good word.
export function check(dict, wheel, word, found) {
  if (word.length < MIN) return 'Words need at least four letters.';
  if (!word.includes(wheel.centre)) return `Every word uses the middle letter, ${wheel.centre.toUpperCase()}.`;
  if (!fits(word, counts(wheel.letters + wheel.centre))) return 'Each letter can be used only once.';
  if (found.includes(word)) return 'Already found.';
  if (!dict.words.has(word)) return 'Not in the word list.';
  return null;
}

// Targets as a share of the common words: Good, Very good, Excellent.
export function targets(total) {
  return { good: Math.ceil(total * 0.35), great: Math.ceil(total * 0.6), excellent: Math.ceil(total * 0.85) };
}

export function level(wheel, found) {
  const n = found.filter((w) => wheel.common.includes(w)).length;
  const t = targets(wheel.common.length);
  if (n >= wheel.common.length) return { n, label: 'Genius', tier: 4 };
  if (n >= t.excellent) return { n, label: 'Excellent', tier: 3 };
  if (n >= t.great) return { n, label: 'Very good', tier: 2 };
  if (n >= t.good) return { n, label: 'Good', tier: 1 };
  return { n, label: 'Warming up', tier: 0 };
}

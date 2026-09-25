// Code Breaker: guess the hidden code of coloured pegs. After each guess you
// learn how many pegs are the right colour in the right place (exact) and
// how many more are the right colour in the wrong place (near). Pure (no DOM).
//
// Codes are arrays of colour indexes. Colours may repeat.

import { mulberry32 } from '../core/rng.js';

export const MODES = {
  classic: { pegs: 4, colors: 6, rows: 10 },
  hard: { pegs: 5, colors: 8, rows: 12 },
};

export function score(secret, guess) {
  let exact = 0;
  const a = new Array(10).fill(0);
  const b = new Array(10).fill(0);
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) exact++;
    else {
      a[secret[i]]++;
      b[guess[i]]++;
    }
  }
  let near = 0;
  for (let c = 0; c < 10; c++) near += Math.min(a[c], b[c]);
  return { exact, near };
}

const key = ({ exact, near }) => exact * 10 + near;

// Every possible code for a mode.
export function allCodes({ pegs, colors }) {
  const out = [];
  const total = colors ** pegs;
  for (let n = 0; n < total; n++) {
    const code = [];
    let x = n;
    for (let i = 0; i < pegs; i++) {
      code.push(x % colors);
      x = Math.floor(x / colors);
    }
    out.push(code);
  }
  return out;
}

// Codes still possible after the guesses so far: [{ guess, result }].
export function consistent(codes, history) {
  return codes.filter((c) => history.every(({ guess, result }) => key(score(c, guess)) === key(result)));
}

// The solver's next guess: the candidate whose worst-case answer leaves the
// fewest codes (Knuth's minimax), preferring codes that could be the answer.
// For big code spaces it looks at a sample of guesses, chosen by `random`.
export function nextGuess(mode, remaining, random, all = null) {
  if (remaining.length <= 2) return remaining[0];
  const pool = all || remaining;
  let guesses = pool;
  if (pool.length * remaining.length > 400000) {
    guesses = [];
    const n = Math.max(20, Math.floor(400000 / remaining.length));
    for (let i = 0; i < n; i++) guesses.push(pool[Math.floor(random() * pool.length)]);
    guesses.push(...remaining.slice(0, 30));
  }
  const inRemaining = new Set(remaining.map((c) => c.join()));
  let best = null;
  let bestWorst = Infinity;
  let bestIn = false;
  for (const g of guesses) {
    const parts = new Map();
    let worst = 0;
    for (const c of remaining) {
      const k = key(score(c, g));
      const v = (parts.get(k) || 0) + 1;
      parts.set(k, v);
      if (v > worst) worst = v;
      if (worst > bestWorst) break;
    }
    const isIn = inRemaining.has(g.join());
    if (worst < bestWorst || (worst === bestWorst && isIn && !bestIn)) {
      best = g;
      bestWorst = worst;
      bestIn = isIn;
    }
  }
  return best;
}

// A fixed first guess for the solver (two pairs, like 1122), so par is fast.
export const openingGuess = ({ pegs }) => Array.from({ length: pegs }, (_, i) => (i < pegs / 2 ? 0 : 1));

// How many guesses the solver takes to crack `secret`: the par.
export function solverGuesses(mode, secret, seed = 1) {
  const random = mulberry32(seed);
  const all = allCodes(mode);
  let remaining = all;
  const history = [];
  let guess = openingGuess(mode);
  for (let n = 1; n <= 20; n++) {
    const result = score(secret, guess);
    if (result.exact === mode.pegs) return n;
    history.push({ guess, result });
    remaining = consistent(remaining, [history[history.length - 1]]);
    guess = nextGuess(mode, remaining, random, mode.colors ** mode.pegs <= 1296 ? all : null);
  }
  return 20;
}

export function secretFrom(mode, seed) {
  const random = mulberry32(seed);
  return Array.from({ length: mode.pegs }, () => Math.floor(random() * mode.colors));
}

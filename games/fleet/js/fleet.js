// Fleet: the rules and the computer's aim. Pure (no DOM).
//
// A 10×10 sea. A fleet is five ships (5, 4, 3, 3, 2 long) placed across or
// down, never overlapping or touching (not even corner to corner), so a
// sunk ship's neighbours are known to be empty.
// Shots are kept as a map of cell -> 'miss' | 'hit' | 'sunk'.

import { mulberry32 } from '../core/rng.js';

export const SIZE = 10;
export const SHIPS = [5, 4, 3, 3, 2];
export const SHIP_NAMES = { 5: 'carrier', 4: 'battleship', 3: 'cruiser', 2: 'destroyer' };

export const cellsOf = ({ r, c, len, across }) => Array.from({ length: len }, (_, k) => (across ? r * SIZE + c + k : (r + k) * SIZE + c));

function neighbours(i) {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE) out.push(rr * SIZE + cc);
    }
  return out;
}

export function fits(ships, ship) {
  const { r, c, len, across } = ship;
  if (r < 0 || c < 0 || (across ? c + len > SIZE : r + len > SIZE)) return false;
  const taken = new Set();
  for (const s of ships) for (const i of cellsOf(s)) {
    taken.add(i);
    for (const n of neighbours(i)) taken.add(n);
  }
  return cellsOf(ship).every((i) => !taken.has(i));
}

export function randomFleet(random) {
  for (;;) {
    const ships = [];
    let ok = true;
    for (const len of SHIPS) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const across = random() < 0.5;
        const ship = { len, across, r: Math.floor(random() * (across ? SIZE : SIZE - len + 1)), c: Math.floor(random() * (across ? SIZE - len + 1 : SIZE)) };
        if (fits(ships, ship)) {
          ships.push(ship);
          placed = true;
        }
      }
      if (!placed) ok = false;
    }
    if (ok) return ships;
  }
}

// Fires at cell i. Returns { shots, result: 'miss' | 'hit' | 'sunk', ship }.
// When a ship sinks, all its cells become 'sunk'.
export function fire(ships, shots, i) {
  if (shots[i]) throw new Error('already fired there');
  const next = { ...shots };
  const ship = ships.find((s) => cellsOf(s).includes(i));
  if (!ship) {
    next[i] = 'miss';
    return { shots: next, result: 'miss' };
  }
  next[i] = 'hit';
  const cells = cellsOf(ship);
  if (cells.every((j) => next[j])) {
    for (const j of cells) next[j] = 'sunk';
    return { shots: next, result: 'sunk', ship };
  }
  return { shots: next, result: 'hit', ship };
}

export const allSunk = (ships, shots) => ships.every((s) => cellsOf(s).every((i) => shots[i] === 'sunk'));

// Lengths of ships not yet sunk, from what the shooter can see.
export function afloat(ships, shots) {
  return ships.filter((s) => !cellsOf(s).every((i) => shots[i] === 'sunk')).map((s) => s.len);
}

// Cells known to be empty: misses, and every cell touching a sunk ship.
function knownEmpty(shots) {
  const empty = new Set();
  for (const [k, v] of Object.entries(shots)) {
    const i = Number(k);
    if (v === 'miss') empty.add(i);
    if (v === 'sunk') for (const n of neighbours(i)) if (shots[n] !== 'sunk') empty.add(n);
  }
  // Diagonal neighbours of a hit can't hold a ship either (ships never touch).
  for (const [k, v] of Object.entries(shots)) if (v === 'hit') for (const n of neighbours(Number(k))) {
    const dr = Math.abs(Math.floor(n / SIZE) - Math.floor(Number(k) / SIZE));
    const dc = Math.abs((n % SIZE) - (Number(k) % SIZE));
    if (dr && dc) empty.add(n);
  }
  return empty;
}

// How likely each open cell is to hold a ship: count the ways every ship
// still afloat could lie there. Placements through open hits count much
// more (finish off a ship you have found).
export function heat(shots, lengths) {
  const empty = knownEmpty(shots);
  const h = new Float64Array(SIZE * SIZE);
  const hits = Object.keys(shots).filter((k) => shots[k] === 'hit').map(Number);
  for (const len of lengths) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        for (const across of [true, false]) {
          if (across ? c + len > SIZE : r + len > SIZE) continue;
          const cells = cellsOf({ r, c, len, across });
          if (cells.some((i) => empty.has(i) || shots[i] === 'sunk')) continue;
          const covered = cells.filter((i) => shots[i] === 'hit').length;
          const w = covered ? 40 ** covered : 1;
          for (const i of cells) if (!shots[i]) h[i] += w;
        }
  }
  if (hits.length) {
    // In target mode only cells in line with a hit matter.
    let any = false;
    for (let i = 0; i < h.length; i++) if (h[i] >= 40) any = true;
    if (any) for (let i = 0; i < h.length; i++) if (h[i] < 40) h[i] = 0;
  }
  return h;
}

// The computer's shot. Easy fires at random until it hits, then hunts
// nearby; Medium searches a random checkerboard and uses the heat map once
// it has a hit; Hard always uses the heat map.
export function aim(shots, lengths, level, random) {
  const open = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (!shots[i]) open.push(i);
  if (level === 'easy') {
    const hits = Object.keys(shots).filter((k) => shots[k] === 'hit').map(Number);
    const near = hits.flatMap((i) => [i - SIZE, i + SIZE, i % SIZE ? i - 1 : -1, i % SIZE < SIZE - 1 ? i + 1 : -1]).filter((i) => i >= 0 && i < SIZE * SIZE && !shots[i]);
    if (near.length && random() < 0.85) return near[Math.floor(random() * near.length)];
    return open[Math.floor(random() * open.length)];
  }
  const hunting = !Object.values(shots).includes('hit');
  if (level === 'medium' && hunting) {
    const even = open.filter((i) => (Math.floor(i / SIZE) + (i % SIZE)) % 2 === 0);
    const pool = even.length ? even : open;
    return pool[Math.floor(random() * pool.length)];
  }
  const h = heat(shots, lengths);
  let best = -1;
  let picks = [];
  for (const i of open) {
    let v = h[i];
    if (v > best) {
      best = v;
      picks = [i];
    } else if (v === best) picks.push(i);
  }
  return picks[Math.floor(random() * picks.length)] ?? open[0];
}

// Shots the Hard computer needs to sink this fleet: par for the solo daily.
export function parFor(ships, seed) {
  const random = mulberry32(seed);
  let shots = {};
  let n = 0;
  while (!allSunk(ships, shots) && n < 100) {
    const i = aim(shots, afloat(ships, shots), 'hard', random);
    shots = fire(ships, shots, i).shots;
    n++;
  }
  return n;
}

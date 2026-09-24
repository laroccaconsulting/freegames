// Pour: water-sort rules. Pure data, no DOM, so it can be unit-tested.
//
// A puzzle is a list of tubes. Each tube is an array of colour indices,
// bottom first. A move pours the whole run of matching colour off the top of
// one tube onto another whose top matches (or which is empty), as much as fits.

export const CAPACITY = 4;

export function topRun(tube) {
  if (!tube.length) return 0;
  const color = tube.at(-1);
  let n = 1;
  while (n < tube.length && tube[tube.length - 1 - n] === color) n++;
  return n;
}

export function isComplete(tube, capacity = CAPACITY) {
  return tube.length === capacity && topRun(tube) === capacity;
}

// How many units a pour from → to would move (0 when illegal).
export function pourAmount(tubes, from, to, capacity = CAPACITY) {
  if (from === to) return 0;
  const a = tubes[from];
  const b = tubes[to];
  if (!a?.length || !b || b.length >= capacity) return 0;
  if (b.length && b.at(-1) !== a.at(-1)) return 0;
  return Math.min(topRun(a), capacity - b.length);
}

// Returns new tubes after the pour (inputs are not modified).
export function pour(tubes, from, to, capacity = CAPACITY) {
  const n = pourAmount(tubes, from, to, capacity);
  if (!n) return null;
  const next = tubes.slice();
  next[from] = tubes[from].slice(0, -n);
  next[to] = tubes[to].concat(tubes[from].slice(-n));
  return next;
}

export function isSolved(tubes, capacity = CAPACITY) {
  return tubes.every((t) => t.length === 0 || isComplete(t, capacity));
}

// Moves worth considering: skips pours that can never help (moving a
// finished tube, or tipping a single-colour tube into an empty one) and only
// tries the first empty tube, since all empty tubes are alike.
export function usefulMoves(tubes, capacity = CAPACITY) {
  const moves = [];
  const firstEmpty = tubes.findIndex((t) => t.length === 0);
  for (let from = 0; from < tubes.length; from++) {
    const a = tubes[from];
    if (!a.length || isComplete(a, capacity)) continue;
    const uniform = topRun(a) === a.length;
    for (let to = 0; to < tubes.length; to++) {
      if (to === from) continue;
      const b = tubes[to];
      if (!b.length && (uniform || to !== firstEmpty)) continue;
      if (pourAmount(tubes, from, to, capacity)) moves.push([from, to]);
    }
  }
  return moves;
}

// Any legal move at all (the player is stuck when there is none).
export function hasLegalMove(tubes, capacity = CAPACITY) {
  for (let from = 0; from < tubes.length; from++)
    for (let to = 0; to < tubes.length; to++) if (pourAmount(tubes, from, to, capacity)) return true;
  return false;
}

// Number of colour segments beyond one per colour. Each pour joins at most
// two segments, so this is a lower bound on the moves left.
export function segmentsOver(tubes) {
  let segments = 0;
  const colors = new Set();
  for (const t of tubes) {
    for (let i = 0; i < t.length; i++) {
      colors.add(t[i]);
      if (i === 0 || t[i] !== t[i - 1]) segments++;
    }
  }
  return segments - colors.size;
}

// Tube order does not matter for solving, so equal layouts share a key.
export function stateKey(tubes) {
  return tubes.map((t) => String.fromCharCode(...t.map((c) => 65 + c))).sort().join('|');
}

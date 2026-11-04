// Pour: water-sort rules. Pure data, no DOM, so it can be unit-tested.
//
// A puzzle is a list of tubes. Each tube is an array of colour indices,
// bottom first. A move pours the whole run of matching colour off the top of
// one tube onto another whose top matches (or which is empty), as much as fits.
//
// Advanced puzzles add a layout: { size, kinds }. `size` is how many units of
// each colour there are (and how much a normal tube holds); kinds[i] can give
// tube i its own `cap` (a small tube), a `key` colour (locked until a tube of
// that colour is finished) or `ice` (frozen for that many pours). A hidden
// unit is stored as ~colour (negative): it shows as "?" and does not join the
// run above it until it reaches the top, where it is revealed.

export const CAPACITY = 4;
export const PLAIN = { size: CAPACITY, kinds: [] };

export const colorOf = (u) => (u < 0 ? ~u : u);
export const capOf = (layout, i) => layout.kinds?.[i]?.cap ?? layout.size;

export function topRun(tube) {
  if (!tube.length) return 0;
  const color = tube.at(-1);
  let n = 1;
  while (n < tube.length && tube[tube.length - 1 - n] === color) n++;
  return n;
}

// Finished: a whole colour in one tube. Small tubes can never finish.
export function isComplete(tube, size = CAPACITY) {
  return tube.length === size && tube[0] >= 0 && topRun(tube) === size;
}

const hasComplete = (tubes, color, size) => tubes.some((t) => t[0] === color && isComplete(t, size));

// The key colour while tube i is still locked, else null.
export function lockOf(tubes, i, layout = PLAIN) {
  const key = layout.kinds?.[i]?.key;
  return key != null && !hasComplete(tubes, key, layout.size) ? key : null;
}

// Whether tube i can be poured from or into yet.
export function isOpen(tubes, i, layout = PLAIN, moves = 0) {
  const kind = layout.kinds?.[i];
  if (!kind) return true;
  if (kind.ice && moves < kind.ice) return false;
  if (lockOf(tubes, i, layout) != null) return false;
  return true;
}

// How many units a pour from → to would move (0 when illegal).
export function pourAmount(tubes, from, to, layout = PLAIN, moves = 0) {
  if (from === to) return 0;
  const a = tubes[from];
  const b = tubes[to];
  const cap = capOf(layout, to);
  if (!a?.length || !b || b.length >= cap) return 0;
  if (b.length && b.at(-1) !== a.at(-1)) return 0;
  if (!isOpen(tubes, from, layout, moves) || !isOpen(tubes, to, layout, moves)) return 0;
  return Math.min(topRun(a), cap - b.length);
}

// Returns new tubes after the pour (inputs are not modified). A hidden unit
// left on top of the source is revealed, and so is a tube that fills up with
// one colour.
export function pour(tubes, from, to, layout = PLAIN, moves = 0) {
  const n = pourAmount(tubes, from, to, layout, moves);
  if (!n) return null;
  const next = tubes.slice();
  const rest = tubes[from].slice(0, -n);
  if (rest.length && rest.at(-1) < 0) rest[rest.length - 1] = ~rest.at(-1);
  next[from] = rest;
  let filled = tubes[to].concat(tubes[from].slice(-n));
  if (filled.length === layout.size && filled.some((u) => u < 0) && filled.every((u) => colorOf(u) === colorOf(filled[0]))) filled = filled.map(colorOf);
  next[to] = filled;
  return next;
}

// Plays a list of [from, to] moves from the start (undo replays the rest).
export function replay(start, moves, layout = PLAIN) {
  let tubes = start;
  moves.forEach(([from, to], i) => (tubes = pour(tubes, from, to, layout, i) || tubes));
  return tubes;
}

export function isSolved(tubes, size = CAPACITY) {
  return tubes.every((t) => t.length === 0 || isComplete(t, size));
}

// Moves worth considering: skips pours that can never help (moving a
// finished tube, or tipping a single-colour tube into an empty one just like
// it) and only tries the first empty tube of each size, since those are alike.
export function usefulMoves(tubes, layout = PLAIN, moves = 0) {
  const out = [];
  const empties = new Map();
  tubes.forEach((t, i) => {
    const cap = capOf(layout, i);
    if (!t.length && !empties.has(cap) && isOpen(tubes, i, layout, moves)) empties.set(cap, i);
  });
  for (let from = 0; from < tubes.length; from++) {
    const a = tubes[from];
    if (!a.length || isComplete(a, layout.size)) continue;
    const uniform = topRun(a) === a.length;
    for (let to = 0; to < tubes.length; to++) {
      if (to === from) continue;
      const b = tubes[to];
      if (!b.length) {
        const cap = capOf(layout, to);
        if (empties.get(cap) !== to || (uniform && cap === capOf(layout, from))) continue;
      }
      if (pourAmount(tubes, from, to, layout, moves)) out.push([from, to]);
    }
  }
  return out;
}

// Any legal move at all (the player is stuck when there is none).
export function hasLegalMove(tubes, layout = PLAIN, moves = 0) {
  for (let from = 0; from < tubes.length; from++)
    for (let to = 0; to < tubes.length; to++) if (pourAmount(tubes, from, to, layout, moves)) return true;
  return false;
}

// Number of colour segments beyond one per colour (a hidden unit counts as
// its colour). Each pour joins at most two segments, so this is a lower bound
// on the moves left.
export function segmentsOver(tubes) {
  let segments = 0;
  const colors = new Set();
  for (const t of tubes) {
    for (let i = 0; i < t.length; i++) {
      const c = colorOf(t[i]);
      colors.add(c);
      if (i === 0 || c !== colorOf(t[i - 1])) segments++;
    }
  }
  return segments - colors.size;
}

// Tube order does not matter for solving, so equal layouts share a key. Tubes
// only swap with tubes of the same kind, and while anything is still frozen
// the pour count matters too.
export function stateKey(tubes, layout = PLAIN, moves = 0) {
  const kinds = layout.kinds || [];
  const unit = (u) => String.fromCharCode(u < 0 ? 97 + ~u : 65 + u);
  const parts = tubes.map((t, i) => {
    const k = kinds[i];
    const tag = k ? `${k.cap ?? ''},${k.key ?? ''},${k.ice || ''}:` : '';
    return tag + t.map(unit).join('');
  });
  const ice = Math.max(0, ...kinds.map((k) => k?.ice || 0));
  return parts.sort().join('|') + (moves < ice ? `#${moves}` : '');
}

// Dots and Boxes: take turns drawing a line between two neighbouring dots.
// Close the fourth side of a box to claim it and move again. Most boxes
// wins. Pure (no DOM).
//
// state: { w, h (boxes across and down), lines: [0 | player], boxes: [0 | player], turn: 1 | 2, score: [_, p1, p2] }
// Lines: horizontal (r in 0..h, c in 0..w-1) come first, then vertical (r in 0..h-1, c in 0..w).

export const hLine = (s, r, c) => r * s.w + c;
export const vLine = (s, r, c) => (s.h + 1) * s.w + r * (s.w + 1) + c;
export const lineCount = (s) => (s.h + 1) * s.w + s.h * (s.w + 1);

export function newGame(w = 4, h = 4, first = 1) {
  const s = { w, h, turn: first, score: [0, 0, 0] };
  s.lines = new Array(lineCount(s)).fill(0);
  s.boxes = new Array(w * h).fill(0);
  return s;
}

// The line's endpoints as dot coordinates: { r1, c1, r2, c2 }.
export function ends(s, line) {
  const H = (s.h + 1) * s.w;
  if (line < H) {
    const r = Math.floor(line / s.w);
    const c = line % s.w;
    return { r1: r, c1: c, r2: r, c2: c + 1, across: true };
  }
  const k = line - H;
  const r = Math.floor(k / (s.w + 1));
  const c = k % (s.w + 1);
  return { r1: r, c1: c, r2: r + 1, c2: c, across: false };
}

export function sides(s, b) {
  const r = Math.floor(b / s.w);
  const c = b % s.w;
  return [hLine(s, r, c), hLine(s, r + 1, c), vLine(s, r, c), vLine(s, r, c + 1)];
}

export const drawn = (s, b) => sides(s, b).filter((l) => s.lines[l]).length;

// Boxes on either side of a line.
export function boxesOf(s, line) {
  const { r1, c1, across } = ends(s, line);
  const out = [];
  if (across) {
    if (r1 > 0) out.push((r1 - 1) * s.w + c1);
    if (r1 < s.h) out.push(r1 * s.w + c1);
  } else {
    if (c1 > 0) out.push(r1 * s.w + c1 - 1);
    if (c1 < s.w) out.push(r1 * s.w + c1);
  }
  return out;
}

export const moves = (s) => s.lines.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
export const over = (s) => s.lines.every(Boolean);

// Draw a line. Returns a new state and the boxes it closed.
export function play(s, line) {
  if (s.lines[line]) throw new Error('line taken');
  const next = { ...s, lines: s.lines.slice(), boxes: s.boxes.slice(), score: s.score.slice() };
  next.lines[line] = s.turn;
  const closed = boxesOf(next, line).filter((b) => drawn(next, b) === 4);
  for (const b of closed) {
    next.boxes[b] = s.turn;
    next.score[s.turn]++;
  }
  if (!closed.length) next.turn = 3 - s.turn;
  return { state: next, closed };
}

export function winner(s) {
  if (!over(s)) return 0;
  return s.score[1] > s.score[2] ? 1 : s.score[2] > s.score[1] ? 2 : 3; // 3 = a tie
}

// ---------- The computer ----------

// A move that closes a box right now.
const capture = (s) => moves(s).find((l) => boxesOf(s, l).some((b) => drawn(s, b) === 3));
// A move that doesn't hand the other player a box.
const isSafe = (s, l) => boxesOf(s, l).every((b) => drawn(s, b) < 2);

// How many boxes the player to move can take in a row, greedily.
function run(s) {
  let n = 0;
  let cur = s;
  const who = s.turn;
  for (;;) {
    const l = capture(cur);
    if (l == null || cur.turn !== who) return n;
    const res = play(cur, l);
    n += res.closed.length;
    cur = res.state;
    if (over(cur)) return n;
  }
}

// The hard-hearted handout: with two boxes left at the end of a chain and
// more chains to come, give the pair away so the other player must open
// the next chain for us.
function doubleDeal(s) {
  for (const b of s.boxes.keys()) {
    if (s.boxes[b] || drawn(s, b) !== 3) continue;
    const gap = sides(s, b).find((l) => !s.lines[l]);
    const c = boxesOf(s, gap).find((x) => x !== b);
    if (c == null || drawn(s, c) !== 2) continue;
    const far = sides(s, c).find((l) => !s.lines[l] && l !== gap);
    // c must end the chain: its far side touches the edge or a box with
    // at most one side drawn.
    const beyond = boxesOf(s, far).find((x) => x !== c);
    if (beyond != null && drawn(s, beyond) >= 2) continue;
    // Only worth it when every other move on the board is unsafe and
    // enough boxes remain to win back.
    const rest = moves(s).filter((l) => l !== gap && l !== far && !boxesOf(s, l).includes(b) && !boxesOf(s, l).includes(c));
    if (rest.some((l) => isSafe(s, l))) continue;
    const left = s.boxes.filter((o, k) => !o && k !== b && k !== c).length;
    if (left >= 4) return far;
  }
  return null;
}

// level: 'easy' | 'normal' | 'hard'. `random` returns [0, 1).
export function choose(s, level, random = Math.random) {
  const all = moves(s);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const take = capture(s);
  if (level === 'hard' && take != null) {
    const dd = doubleDeal(s);
    // Only hand out when taking this box is the start of a 2-box end.
    if (dd != null && run(s) === 2) return dd;
  }
  if (take != null && (level !== 'easy' || random() < 0.75)) return take;
  const safe = all.filter((l) => isSafe(s, l));
  if (safe.length) return pick(safe);
  if (level === 'easy') return pick(all);
  // Every move gives something away: give the least.
  let best = [];
  let bestGive = Infinity;
  for (const l of all) {
    const { state } = play(s, l);
    const give = state.turn === s.turn ? -1 : run(state);
    if (give < bestGive) [best, bestGive] = [[l], give];
    else if (give === bestGive) best.push(l);
  }
  return pick(best);
}

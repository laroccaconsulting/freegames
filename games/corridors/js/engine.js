// Corridors rules engine. Pure functions over plain JSON state, no DOM:
// the UI, the bot (in a Web Worker) and the online room server all share it.
//
// Board: 9×9 cells, row 0 at the top. A wall is two cells long and sits in
// the grooves between cells. Its anchor (r, c) is the groove crossing below
// and right of cell (r, c), so r and c run 0..7:
//   'H' lies between rows r and r+1 and covers columns c and c+1.
//   'V' lies between columns c and c+1 and covers rows r and r+1.
//
// State = {
//   size: 9,
//   players: [{ id, pos: [r, c], wallsLeft, goal: 'N'|'S'|'E'|'W' }],
//   walls: [{ r, c, o: 'H'|'V' }],
//   turn,       // index into players
//   moveNo,     // number of moves applied so far
//   winner,     // player index or null
// }
// Move = { t: 'pawn', to: [r, c] } | { t: 'wall', r, c, o: 'H'|'V' }

export const SIZE = 9;
const N = SIZE;
const A = SIZE - 1; // wall anchors per row / column
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// Players sit clockwise from the bottom: 0 bottom, 1 left, 2 top, 3 right.
const SEATS = {
  2: [
    { pos: [8, 4], goal: 'N' },
    { pos: [0, 4], goal: 'S' },
  ],
  4: [
    { pos: [8, 4], goal: 'N' },
    { pos: [4, 0], goal: 'E' },
    { pos: [0, 4], goal: 'S' },
    { pos: [4, 8], goal: 'W' },
  ],
};
export const WALLS_PER_PLAYER = { 2: 10, 4: 5 };

export class IllegalMove extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

export function newGame(numPlayers = 2, { first = 0 } = {}) {
  const seats = SEATS[numPlayers];
  if (!seats) throw new Error('Corridors is played by 2 or 4 players');
  return {
    size: SIZE,
    players: seats.map((s, id) => ({ id, pos: [...s.pos], wallsLeft: WALLS_PER_PLAYER[numPlayers], goal: s.goal })),
    walls: [],
    turn: first % numPlayers,
    moveNo: 0,
    winner: null,
  };
}

export function atGoal(goal, r, c) {
  return goal === 'N' ? r === 0 : goal === 'S' ? r === N - 1 : goal === 'E' ? c === N - 1 : c === 0;
}

const inBoard = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

// ---------- Wall grid ----------

// States are immutable and pawn moves reuse the walls array, so the grid
// (and the distance maps below) are cached per walls array.
const grids = new WeakMap();

function gridOf(walls) {
  let g = grids.get(walls);
  if (!g) {
    g = { h: new Uint8Array(A * A), v: new Uint8Array(A * A), dist: new Map() };
    for (const w of walls) (w.o === 'H' ? g.h : g.v)[w.r * A + w.c] = 1;
    grids.set(walls, g);
  }
  return g;
}

// Is the step from (r, c) by (dr, dc) cut by a wall? Both cells must be on the board.
function cut(g, r, c, dr, dc) {
  if (dr) {
    const row = dr > 0 ? r : r - 1;
    return (c < A && g.h[row * A + c] === 1) || (c > 0 && g.h[row * A + c - 1] === 1);
  }
  const col = dc > 0 ? c : c - 1;
  return (r < A && g.v[r * A + col] === 1) || (r > 0 && g.v[(r - 1) * A + col] === 1);
}

// Can a pawn step from (r, c) by (dr, dc)? False off the board or through a wall.
export function canStep(state, r, c, dr, dc) {
  return inBoard(r + dr, c + dc) && !cut(gridOf(state.walls), r, c, dr, dc);
}

// ---------- Paths ----------

// Steps from every cell to the goal side, ignoring pawns (-1 = cut off).
function distances(g, goal) {
  let d = g.dist.get(goal);
  if (d) return d;
  d = new Int8Array(N * N).fill(-1);
  const queue = new Uint8Array(N * N);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < N; i++) {
    const cell = goal === 'N' ? i : goal === 'S' ? (N - 1) * N + i : goal === 'E' ? i * N + N - 1 : i * N;
    d[cell] = 0;
    queue[tail++] = cell;
  }
  while (head < tail) {
    const cell = queue[head++];
    const r = (cell / N) | 0;
    const c = cell % N;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBoard(nr, nc) || d[nr * N + nc] !== -1 || cut(g, r, c, dr, dc)) continue;
      d[nr * N + nc] = d[cell] + 1;
      queue[tail++] = nr * N + nc;
    }
  }
  g.dist.set(goal, d);
  return d;
}

// Distance map (index r * 9 + c) towards player p's goal.
export function distanceMap(state, p) {
  return distances(gridOf(state.walls), state.players[p].goal);
}

// Fewest steps from player p to their goal, ignoring pawns (-1 if cut off).
export function shortestPath(state, p) {
  const [r, c] = state.players[p].pos;
  return distanceMap(state, p)[r * N + c];
}

// One shortest route for player p, as a list of cells after the start.
export function shortestRoute(state, p) {
  const d = distanceMap(state, p);
  const g = gridOf(state.walls);
  let [r, c] = state.players[p].pos;
  const route = [];
  while (d[r * N + c] > 0) {
    const here = d[r * N + c];
    const step = DIRS.find(([dr, dc]) => inBoard(r + dr, c + dc) && d[(r + dr) * N + c + dc] === here - 1 && !cut(g, r, c, dr, dc));
    if (!step) break;
    r += step[0];
    c += step[1];
    route.push([r, c]);
  }
  return route;
}

// ---------- Pawns ----------

const occupant = (state, r, c) => state.players.findIndex((pl) => pl.pos[0] === r && pl.pos[1] === c);

// Every cell player p may move to. A pawn next to yours can be jumped
// straight over; when a wall, the edge or another pawn stops the straight
// jump, you may step diagonally to either side of it instead.
export function legalPawnMoves(state, p = state.turn) {
  const g = gridOf(state.walls);
  const [r, c] = state.players[p].pos;
  const out = [];
  const add = (tr, tc) => {
    if (!out.some(([ar, ac]) => ar === tr && ac === tc)) out.push([tr, tc]);
  };
  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBoard(nr, nc) || cut(g, r, c, dr, dc)) continue;
    if (occupant(state, nr, nc) < 0) {
      add(nr, nc);
      continue;
    }
    const jr = nr + dr;
    const jc = nc + dc;
    if (inBoard(jr, jc) && !cut(g, nr, nc, dr, dc) && occupant(state, jr, jc) < 0) {
      add(jr, jc);
      continue;
    }
    for (const [sr, sc] of dr ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
      const tr = nr + sr;
      const tc = nc + sc;
      if (inBoard(tr, tc) && !cut(g, nr, nc, sr, sc) && occupant(state, tr, tc) < 0) add(tr, tc);
    }
  }
  return out;
}

// ---------- Walls ----------

function overlaps(g, { r, c, o }) {
  const i = r * A + c;
  if (g.h[i] || g.v[i]) return true; // same anchor: overlap or cross
  if (o === 'H') return (c > 0 && g.h[i - 1] === 1) || (c < A - 1 && g.h[i + 1] === 1);
  return (r > 0 && g.v[i - A] === 1) || (r < A - 1 && g.v[i + A] === 1);
}

const isInt = (n) => Number.isInteger(n);
const wallShapeOk = (w) => w && isInt(w.r) && isInt(w.c) && (w.o === 'H' || w.o === 'V') && w.r >= 0 && w.r < A && w.c >= 0 && w.c < A;

// Why player p can't place this wall, or null if they can.
export function wallError(state, wall, p = state.turn) {
  if (!wallShapeOk(wall)) return 'out-of-bounds';
  if (state.players[p].wallsLeft <= 0) return 'no-walls';
  const g = gridOf(state.walls);
  if (overlaps(g, wall)) return 'overlap';
  const next = gridOf([...state.walls, { r: wall.r, c: wall.c, o: wall.o }]);
  for (const pl of state.players) {
    if (distances(next, pl.goal)[pl.pos[0] * N + pl.pos[1]] < 0) return 'blocks-path';
  }
  return null;
}

export function isLegalWall(state, wall, p = state.turn) {
  return wallError(state, wall, p) === null;
}

// Every wall player p may place (up to 128).
export function legalWalls(state, p = state.turn) {
  const out = [];
  if (state.players[p].wallsLeft <= 0) return out;
  for (let r = 0; r < A; r++) {
    for (let c = 0; c < A; c++) {
      for (const o of ['H', 'V']) if (isLegalWall(state, { r, c, o }, p)) out.push({ r, c, o });
    }
  }
  return out;
}

// ---------- Moves ----------

export function moveError(state, move) {
  if (state.winner != null) return 'game-over';
  if (!move || typeof move !== 'object') return 'bad-move';
  if (move.t === 'pawn') {
    const to = move.to;
    if (!Array.isArray(to) || to.length !== 2 || !isInt(to[0]) || !isInt(to[1])) return 'bad-move';
    return legalPawnMoves(state).some(([r, c]) => r === to[0] && c === to[1]) ? null : 'illegal-pawn';
  }
  if (move.t === 'wall') return wallError(state, move);
  return 'bad-move';
}

export function isLegalMove(state, move) {
  return moveError(state, move) === null;
}

// Returns the next state; throws IllegalMove if the move isn't allowed.
export function applyMove(state, move) {
  const error = moveError(state, move);
  if (error) throw new IllegalMove(error);
  const p = state.turn;
  let winner = null;
  let walls = state.walls;
  const players = state.players.map((pl, i) => {
    if (i !== p) return pl;
    if (move.t === 'pawn') {
      const pos = [move.to[0], move.to[1]];
      if (atGoal(pl.goal, pos[0], pos[1])) winner = p;
      return { ...pl, pos };
    }
    return { ...pl, wallsLeft: pl.wallsLeft - 1 };
  });
  if (move.t === 'wall') walls = [...walls, { r: move.r, c: move.c, o: move.o }];
  return {
    ...state,
    players,
    walls,
    turn: winner == null ? (p + 1) % players.length : p,
    moveNo: state.moveNo + 1,
    winner,
  };
}

// Every legal move for the player to move (pawn moves first).
export function legalMoves(state) {
  if (state.winner != null) return [];
  return [
    ...legalPawnMoves(state).map((to) => ({ t: 'pawn', to })),
    ...legalWalls(state).map((w) => ({ t: 'wall', ...w })),
  ];
}

// ---------- Hashing ----------

// Canonical text for a position (wall order doesn't matter). Used as the
// bot's transposition key.
export function positionKey(state) {
  const walls = state.walls.map((w) => w.o + (w.r * A + w.c)).sort().join('');
  const pawns = state.players.map((pl) => `${pl.pos[0] * N + pl.pos[1]}.${pl.wallsLeft}`).join(',');
  return `${state.turn}|${pawns}|${walls}`;
}

// Cheap 32-bit FNV-1a hash of the whole state, to spot a client out of sync.
export function hashState(state) {
  const text = `${positionKey(state)}|${state.moveNo}|${state.winner}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Is this a well-formed state (e.g. loaded from storage)?
export function isValidState(s) {
  return (
    s &&
    s.size === SIZE &&
    Array.isArray(s.players) &&
    (s.players.length === 2 || s.players.length === 4) &&
    s.players.every((pl) => Array.isArray(pl.pos) && inBoard(pl.pos[0], pl.pos[1]) && isInt(pl.wallsLeft) && 'NSEW'.includes(pl.goal)) &&
    Array.isArray(s.walls) &&
    s.walls.every(wallShapeOk) &&
    isInt(s.turn) &&
    s.turn >= 0 &&
    s.turn < s.players.length &&
    isInt(s.moveNo) &&
    (s.winner === null || isInt(s.winner))
  );
}

// The board, drawn as SVG. Knows nothing about rules: app.js tells it what
// to show and hears back which cell or groove was tapped.
import { SIZE } from './engine.js';

const NS = 'http://www.w3.org/2000/svg';
const P = 100; // cell pitch
const GAP = 18; // groove width
const CELL = P - GAP;
const PAD = 26; // room around the board for the goal stripes

export const COLORS = ['#2f6fde', '#e0533d', '#1f9d57', '#d99a00'];
export const COLOR_NAMES = ['Blue', 'Red', 'Green', 'Gold'];

function node(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
}

const cellX = (c) => c * P + GAP / 2;
const center = (i) => i * P + P / 2;

function wallRect({ r, c, o }) {
  const long = 2 * P - GAP * 0.6;
  const thick = GAP * 0.95;
  return o === 'H'
    ? { x: c * P + GAP * 0.3, y: (r + 1) * P - thick / 2, width: long, height: thick }
    : { x: (c + 1) * P - thick / 2, y: r * P + GAP * 0.3, width: thick, height: long };
}

export class Board {
  // onCell(r, c), onWall(wall, { confirm }), onHover(wall | null)
  constructor(host, { onCell, onWall, onHover }) {
    this.handlers = { onCell, onWall, onHover };
    const span = SIZE * P;
    this.svg = node('svg', { viewBox: `${-PAD} ${-PAD} ${span + 2 * PAD} ${span + 2 * PAD}`, class: 'board', role: 'img' });
    const defs = node('defs', {}, this.svg);
    COLORS.forEach((color, i) => {
      const g = node('radialGradient', { id: `pawn${i}`, cx: '38%', cy: '32%', r: '75%' }, defs);
      node('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.9' }, g);
      node('stop', { offset: '0.28', 'stop-color': color }, g);
      node('stop', { offset: '1', 'stop-color': color, 'stop-opacity': '1', class: 'deep' }, g);
    });
    this.group = node('g', { class: 'board-g' }, this.svg);
    node('rect', { x: -PAD, y: -PAD, width: span + 2 * PAD, height: span + 2 * PAD, rx: 34, class: 'frame' }, this.group);
    this.goals = node('g', {}, this.group);
    const cells = node('g', { class: 'cells' }, this.group);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) node('rect', { x: cellX(c), y: cellX(r), width: CELL, height: CELL, rx: 12, class: 'cell' }, cells);
    }
    this.marks = node('g', { class: 'marks' }, this.group);
    this.targets = node('g', { class: 'targets' }, this.group);
    this.walls = node('g', { class: 'walls' }, this.group);
    this.ghost = node('rect', { class: 'ghost', rx: 8, visibility: 'hidden' }, this.group);
    this.pawns = node('g', { class: 'pawns' }, this.group);
    this.pawnEls = [];
    this.wallCount = 0;
    this.rotation = 0;
    host.append(this.svg);
    this.bindInput();
  }

  setRotation(quarters) {
    this.rotation = quarters;
    const c = (SIZE * P) / 2;
    this.group.style.transformOrigin = `${c}px ${c}px`;
    this.group.style.transform = `rotate(${-90 * quarters}deg)`;
  }

  // Goal stripes: each player's colour along the side they are racing to.
  setPlayers(players) {
    this.goals.replaceChildren();
    const span = SIZE * P;
    const t = PAD * 0.55;
    const stripe = { N: [0, -t - 4, span, t], S: [0, span + 4, span, t], E: [span + 4, 0, t, span], W: [-t - 4, 0, t, span] };
    players.forEach((pl, i) => {
      const [x, y, w, h] = stripe[pl.goal];
      node('rect', { x: x + (w > h ? 20 : 0), y: y + (h > w ? 20 : 0), width: w > h ? w - 40 : w, height: h > w ? h - 40 : h, rx: t / 2, fill: COLORS[i], class: 'goal' }, this.goals);
    });
    this.pawns.replaceChildren();
    this.pawnEls = players.map((_, i) => {
      const g = node('g', { class: 'pawn' }, this.pawns);
      node('circle', { r: 40, class: 'pawn-halo', fill: COLORS[i] }, g);
      node('circle', { r: 30, cy: 4, class: 'pawn-shadow' }, g);
      node('circle', { r: 30, fill: `url(#pawn${i})`, class: 'pawn-body' }, g);
      return g;
    });
  }

  // view: { state, targets: [[r,c]], turn, lastMove, hint }
  render({ state, targets = [], active = -1, lastMove = null, marks = [] }) {
    if (this.pawnEls.length !== state.players.length) this.setPlayers(state.players);
    state.players.forEach((pl, i) => {
      const g = this.pawnEls[i];
      // Counter-rotated so the light always falls from the top left.
      g.style.transform = `translate(${center(pl.pos[1])}px, ${center(pl.pos[0])}px) rotate(${90 * this.rotation}deg)`;
      g.classList.toggle('active', i === active);
      g.classList.toggle('winner', state.winner === i);
    });
    // Walls: add new ones with a drop-in, rebuild if any went away (undo, new game).
    if (state.walls.length < this.wallCount) {
      this.walls.replaceChildren();
      this.wallCount = 0;
    }
    for (let i = this.wallCount; i < state.walls.length; i++) {
      const w = state.walls[i];
      node('rect', { ...wallRect(w), rx: 7, class: `wall ${this.wallCount ? 'fresh' : ''}` }, this.walls);
    }
    this.wallCount = state.walls.length;
    [...this.walls.children].forEach((el, i) => el.classList.toggle('last', lastMove?.t === 'wall' && i === state.walls.length - 1));
    this.targets.replaceChildren();
    for (const [r, c] of targets) {
      node('circle', { cx: center(c), cy: center(r), r: 13, fill: COLORS[active] ?? COLORS[0], class: 'target' }, this.targets);
    }
    this.marks.replaceChildren();
    for (const { r, c, color, kind } of marks) {
      if (kind === 'route') node('circle', { cx: center(c), cy: center(r), r: 7, fill: color, class: 'route' }, this.marks);
      else node('rect', { x: cellX(c) + 4, y: cellX(r) + 4, width: CELL - 8, height: CELL - 8, rx: 10, stroke: color, class: 'hint-cell' }, this.marks);
    }
    this.targetSet = new Set(targets.map(([r, c]) => r * SIZE + c));
  }

  // Shows a wall outline (placed or not): legal=false draws it in red.
  showGhost(wall, { legal = true, pending = false } = {}) {
    if (!wall) {
      this.ghost.setAttribute('visibility', 'hidden');
      return;
    }
    for (const [k, v] of Object.entries(wallRect(wall))) this.ghost.setAttribute(k, v);
    this.ghost.setAttribute('visibility', 'visible');
    this.ghost.setAttribute('class', `ghost ${legal ? '' : 'bad'} ${pending ? 'pending' : ''}`);
  }

  // Maps a pointer to a cell or a wall slot, in board coordinates.
  hit(clientX, clientY) {
    const m = this.group.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    const fx = pt.x / P;
    const fy = pt.y / P;
    if (fx < -0.2 || fy < -0.2 || fx > SIZE + 0.2 || fy > SIZE + 0.2) return null;
    const col = Math.min(SIZE - 1, Math.max(0, Math.floor(fx)));
    const row = Math.min(SIZE - 1, Math.max(0, Math.floor(fy)));
    const ox = fx - col;
    const oy = fy - row;
    const dx = Math.min(ox, 1 - ox);
    const dy = Math.min(oy, 1 - oy);
    const gx = ox < 0.5 ? col : col + 1; // groove index 1..8 lies between columns gx-1 and gx
    const gy = oy < 0.5 ? row : row + 1;
    // Near a groove means a wall, unless the cell is somewhere you can move.
    const reach = this.targetSet?.has(row * SIZE + col) ? 0.1 : 0.24;
    const clamp = (v) => Math.min(SIZE - 2, Math.max(0, v));
    const hGroove = dy < reach && gy >= 1 && gy <= SIZE - 1;
    const vGroove = dx < reach && gx >= 1 && gx <= SIZE - 1;
    if (hGroove && (!vGroove || dy <= dx)) return { wall: { r: gy - 1, c: clamp(Math.round(fx - 1)), o: 'H' } };
    if (vGroove) return { wall: { r: clamp(Math.round(fy - 1)), c: gx - 1, o: 'V' } };
    return { cell: [row, col] };
  }

  bindInput() {
    const svg = this.svg;
    let down = null;
    svg.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, type: e.pointerType };
    });
    svg.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 24) return (down = null);
      const h = this.hit(e.clientX, e.clientY);
      const type = down.type;
      down = null;
      if (!h) return;
      if (h.cell) this.handlers.onCell(h.cell[0], h.cell[1]);
      else this.handlers.onWall(h.wall, { confirm: type === 'mouse' });
    });
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const h = this.hit(e.clientX, e.clientY);
      this.handlers.onHover(h?.wall ?? null);
    });
    svg.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && this.handlers.onHover(null));
  }
}

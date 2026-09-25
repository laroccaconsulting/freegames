// Slide: the boards, drawn with plain DOM elements so blocks and tiles can
// glide with CSS transitions and be dragged with pointer events.
import { range } from './unblock.js';
import { slideLine } from './tiles.js';

const h = (tag, cls, parent) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  parent?.append(node);
  return node;
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export class Renderer {
  // onMove({ b, to }) for Unblock, onTap(index) for Tiles.
  constructor(host, { onMove, onTap, onSelect }) {
    this.host = host;
    this.onMove = onMove;
    this.onTap = onTap;
    this.onSelect = onSelect || (() => {});
    this.kind = null;
    this.selected = -1;
  }

  clear() {
    this.kind = null;
    this.host.replaceChildren();
  }

  // ---------- Unblock ----------

  setUnblock(puzzle, { fresh = false } = {}) {
    const same = this.kind === 'unblock' && !fresh && this.puzzle?.blocks.length === puzzle.blocks.length && this.puzzle.blocks.every((b, i) => b.h === puzzle.blocks[i].h && b.lane === puzzle.blocks[i].lane && b.len === puzzle.blocks[i].len);
    this.puzzle = puzzle;
    if (!same) this.buildUnblock(puzzle);
    const n = puzzle.size;
    puzzle.blocks.forEach((b, i) => {
      const el = this.blocks[i];
      el.style.setProperty('--x', b.h ? b.pos : b.lane);
      el.style.setProperty('--y', b.h ? b.lane : b.pos);
      el.style.setProperty('--w', b.h ? b.len : 1);
      el.style.setProperty('--h', b.h ? 1 : b.len);
      el.style.transform = '';
      el.classList.remove('exiting');
    });
    this.board.style.setProperty('--n', n);
    this.select(this.selected < puzzle.blocks.length ? this.selected : -1);
  }

  buildUnblock(p) {
    this.kind = 'unblock';
    this.selected = -1;
    const wrap = h('div', 'ub-wrap');
    const frame = h('div', 'ub-frame', wrap);
    const board = h('div', 'ub-board', frame);
    board.style.setProperty('--n', p.size);
    const exit = h('div', 'ub-exit', frame);
    exit.style.setProperty('--row', p.exit);
    exit.setAttribute('aria-hidden', 'true');
    for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) h('div', 'ub-cell', board);
    this.dots = h('div', 'ub-dots', board);
    this.ghost = h('div', 'ub-ghost', board);
    this.ghost.hidden = true;
    this.blocks = p.blocks.map((b, i) => {
      const el = h('button', `ub-block ${i === 0 ? 'key' : `tone-${(i * 5) % 7}`} ${b.h ? 'horiz' : 'vert'} len-${b.len}`, board);
      el.dataset.i = i;
      el.setAttribute('aria-label', i === 0 ? 'Key block' : `${b.h ? 'Across' : 'Upright'} block ${i}`);
      if (i === 0) h('span', 'key-mark', el);
      el.addEventListener('pointerdown', (e) => this.dragStart(e, i));
      return el;
    });
    board.addEventListener('click', (e) => {
      if (e.target.closest('.ub-block')) return;
      const dot = e.target.closest('.ub-dot');
      if (dot) this.onMove({ b: this.selected, to: Number(dot.dataset.to) });
      else this.select(-1);
    });
    this.board = board;
    this.frame = frame;
    this.host.replaceChildren(wrap);
  }

  cellSize() {
    return this.board.getBoundingClientRect().width / this.puzzle.size;
  }

  dragStart(e, i) {
    if (this.locked || e.button > 0) return;
    const el = this.blocks[i];
    const b = this.puzzle.blocks[i];
    const [lo, hi] = range(this.puzzle, i);
    const cell = this.cellSize();
    const start = b.h ? e.clientX : e.clientY;
    let moved = false;
    let offset = 0;
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('dragging');
    const move = (ev) => {
      const d = ((b.h ? ev.clientX : ev.clientY) - start) / cell;
      if (Math.abs(d) > 0.12) moved = true;
      offset = Math.max(lo - b.pos, Math.min(hi - b.pos, d));
      el.style.transform = b.h ? `translateX(${offset * cell}px)` : `translateY(${offset * cell}px)`;
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const to = b.pos + Math.round(offset);
      if (moved && to !== b.pos) {
        // Swap the drag offset for the real position without a jump, then
        // let the block glide the last bit into its slot.
        const axis = b.h ? '--x' : '--y';
        el.style.transform = '';
        el.style.setProperty(axis, b.pos + offset);
        void el.offsetWidth;
        el.classList.remove('dragging');
        el.style.setProperty(axis, to);
        this.select(-1);
        this.onMove({ b: i, to });
      } else {
        el.classList.remove('dragging');
        el.style.transform = '';
        if (!moved) this.select(this.selected === i ? -1 : i);
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // Tap a block to see where it can go, then tap a spot.
  select(i) {
    if (this.kind !== 'unblock') return;
    this.selected = i;
    this.blocks.forEach((el, k) => el.classList.toggle('selected', k === i));
    this.dots.replaceChildren();
    if (i < 0) return;
    const b = this.puzzle.blocks[i];
    const [lo, hi] = range(this.puzzle, i);
    // One target per empty cell the block can reach; tapping one slides the
    // block just far enough to cover it.
    const cells = [];
    for (let x = lo; x < b.pos; x++) cells.push([x, x]);
    for (let x = b.pos + b.len; x < hi + b.len; x++) cells.push([x, x - b.len + 1]);
    for (const [x, to] of cells) {
      const dot = h('button', 'ub-dot', this.dots);
      dot.dataset.to = to;
      dot.style.setProperty('--x', b.h ? x : b.lane);
      dot.style.setProperty('--y', b.h ? b.lane : x);
      dot.setAttribute('aria-label', `Move ${b.h ? (to < b.pos ? 'left' : 'right') : to < b.pos ? 'up' : 'down'} ${Math.abs(to - b.pos)}`);
    }
    this.onSelect(i);
  }

  showUnblockHint(move) {
    if (this.kind !== 'unblock') return;
    this.ghost.hidden = !move;
    this.blocks.forEach((el, k) => el.classList.toggle('hinted', !!move && k === move.b));
    if (!move) return;
    const b = this.puzzle.blocks[move.b];
    this.ghost.style.setProperty('--x', b.h ? move.to : b.lane);
    this.ghost.style.setProperty('--y', b.h ? b.lane : move.to);
    this.ghost.style.setProperty('--w', b.h ? b.len : 1);
    this.ghost.style.setProperty('--h', b.h ? 1 : b.len);
  }

  // The key block glides out through the gap.
  async exitKey() {
    const el = this.blocks[0];
    el.classList.add('exiting');
    await wait(reduced.matches ? 0 : 650);
  }

  // ---------- Tiles ----------

  setTiles(board, { fresh = false } = {}) {
    const { n, tiles } = board;
    if (this.kind !== 'tiles' || fresh || this.n !== n) this.buildTiles(n);
    this.board.style.setProperty('--n', n);
    tiles.forEach((v, i) => {
      if (!v) return;
      const el = this.tiles[v];
      el.style.setProperty('--x', i % n);
      el.style.setProperty('--y', Math.floor(i / n));
      el.classList.toggle('home', i === v - 1);
      el.dataset.at = i;
    });
    this.tileBoard = board;
  }

  buildTiles(n) {
    this.kind = 'tiles';
    this.n = n;
    const wrap = h('div', 'ub-wrap');
    const frame = h('div', 'ub-frame tiles-frame', wrap);
    const board = h('div', 'tiles-board', frame);
    board.style.setProperty('--n', n);
    this.tiles = [null];
    for (let v = 1; v < n * n; v++) {
      const el = h('button', `tile tone-${(v * 3) % 7}`, board);
      el.textContent = v;
      el.addEventListener('pointerdown', (e) => {
        if (this.locked || e.button > 0) return;
        e.preventDefault();
        this.onTap(Number(el.dataset.at));
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.onTap(Number(el.dataset.at));
        }
      });
      this.tiles.push(el);
    }
    this.board = board;
    this.host.replaceChildren(wrap);
  }

  // Which tiles would move, for a gentle "can't move" wiggle.
  wiggle(i) {
    const v = this.tileBoard?.tiles[i];
    const el = this.tiles?.[v];
    if (!el || reduced.matches) return;
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
  }

  showTilesHint(index) {
    if (this.kind !== 'tiles') return;
    for (const el of this.tiles.slice(1)) el.classList.remove('hinted');
    if (index == null) return;
    const v = this.tileBoard.tiles[index];
    this.tiles[v]?.classList.add('hinted');
  }

  canSlide(i) {
    return slideLine(this.tileBoard, i).length > 0;
  }

  // A ripple across the tiles, from the top-left.
  async waveTiles() {
    if (reduced.matches) return;
    const n = this.n;
    this.tiles.slice(1).forEach((el) => {
      const i = Number(el.dataset.at);
      el.style.setProperty('--delay', `${((i % n) + Math.floor(i / n)) * 60}ms`);
      el.classList.remove('wave');
      void el.offsetWidth;
      el.classList.add('wave');
    });
    await wait(700 + n * 120);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

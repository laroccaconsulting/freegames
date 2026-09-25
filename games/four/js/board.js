// Four in a Row: the board, drawn as SVG. Discs sit behind a plate with
// round holes cut out of it, so they drop "inside" the board.

const NS = 'http://www.w3.org/2000/svg';
const CELL = 100;
const PAD = 18;
const TOP = 104; // room above the board for the disc about to drop

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  parent?.append(node);
  return node;
}

let uid = 0;

export class Board {
  // onColumn(c) is called when a column is tapped or clicked.
  constructor(host, { onColumn }) {
    this.host = host;
    this.onColumn = onColumn;
    this.cols = 0;
    this.rows = 0;
    this.shown = []; // moves already drawn, to animate only new discs
    this.hover = -1;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
  }

  build(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.shown = [];
    const w = cols * CELL + PAD * 2;
    const h = rows * CELL + PAD * 2;
    const id = `holes-${++uid}`;
    const root = svg('svg', { class: 'board', viewBox: `0 ${-TOP} ${w} ${h + TOP + 14}`, role: 'group', 'aria-label': `Board, ${cols} columns` });
    const defs = svg('defs', {}, root);
    const mask = svg('mask', { id }, defs);
    svg('rect', { x: 0, y: 0, width: w, height: h, fill: '#fff' }, mask);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) svg('circle', { cx: this.cx(c), cy: this.cy(r), r: CELL * 0.4, fill: '#000' }, mask);

    this.back = svg('rect', { class: 'board-back', x: PAD / 2, y: PAD / 2, width: w - PAD, height: h - PAD, rx: 18 }, root);
    this.hintG = svg('g', { class: 'hint-layer' }, root);
    this.discs = svg('g', { class: 'discs' }, root);
    this.ghost = svg('circle', { class: 'disc ghost', r: CELL * 0.41, cx: -999, cy: -TOP / 2 }, root);
    this.plateG = svg('g', { class: 'plate-g' }, root);
    svg('rect', { class: 'plate', x: 0, y: 0, width: w, height: h, rx: 22, mask: `url(#${id})` }, this.plateG);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) svg('circle', { class: 'rim', cx: this.cx(c), cy: this.cy(r), r: CELL * 0.4 }, this.plateG);
    svg('rect', { class: 'foot', x: -6, y: h, width: w + 12, height: 14, rx: 7 }, root);
    this.marks = svg('g', { class: 'marks' }, root);
    this.lineG = svg('g', { class: 'win-line' }, root);

    // Invisible full-height column targets.
    this.targets = [];
    for (let c = 0; c < cols; c++) {
      const t = svg('rect', { class: 'col-target', x: PAD + c * CELL, y: -TOP, width: CELL, height: h + TOP, 'data-col': c }, root);
      this.targets.push(t);
    }
    root.addEventListener('pointermove', (e) => this.setHover(this.colAt(e), e.pointerType));
    root.addEventListener('pointerleave', () => this.setHover(-1));
    root.addEventListener('click', (e) => {
      const c = this.colAt(e);
      if (c >= 0) this.onColumn(c);
    });
    this.host.replaceChildren(root);
    this.root = root;
  }

  cx(c) {
    return PAD + c * CELL + CELL / 2;
  }
  cy(r) {
    return PAD + (this.rows - 1 - r) * CELL + CELL / 2;
  }

  colAt(e) {
    const t = e.target.closest?.('[data-col]');
    if (t) return Number(t.dataset.col);
    return -1;
  }

  setHover(c, pointerType) {
    // On touch there is no hover; the preview would linger after the tap.
    if (pointerType === 'touch') c = -1;
    this.hover = c;
    this.updateGhost();
  }

  updateGhost() {
    const on = this.canPlay && this.hover >= 0 && this.playable?.includes(this.hover);
    this.ghost.setAttribute('cx', on ? this.cx(this.hover) : -999);
    this.ghost.setAttribute('class', `disc ghost p${this.turn}`);
  }

  // view: { state, canPlay, threats: [{c, r, p}], hint: column | -1, focus: column | -1 }
  render({ state, canPlay, threats = [], hint = -1, focus = -1 }) {
    if (state.cols !== this.cols || state.rows !== this.rows) this.build(state.cols, state.rows);
    const moves = state.moves;
    const same = this.shown.length <= moves.length && this.shown.every((c, i) => moves[i] === c);
    if (!same) {
      this.discs.replaceChildren();
      this.shown = [];
    }
    // Replay the new moves to find each disc's player and row.
    const heights = new Array(state.cols).fill(0);
    let player = state.moves.length % 2 === 0 ? state.turn : 3 - state.turn; // who moved first
    for (let i = 0; i < moves.length; i++) {
      const c = moves[i];
      const r = heights[c]++;
      if (i >= this.shown.length) this.addDisc(c, r, player, i === moves.length - 1 && same);
      player = 3 - player;
    }
    this.shown = moves.slice();
    for (const d of this.discs.children) d.classList.toggle('last', Number(d.dataset.i) === moves.length - 1);

    // Winning line.
    this.lineG.replaceChildren();
    for (const d of this.discs.children) d.classList.remove('win');
    if (state.line) {
      const [a, b] = [state.line[0], state.line[state.line.length - 1]];
      svg('line', { x1: this.cx(a[0]), y1: this.cy(a[1]), x2: this.cx(b[0]), y2: this.cy(b[1]) }, this.lineG);
      for (const [c, r] of state.line) this.discs.querySelector(`[data-cell="${c},${r}"]`)?.classList.add('win');
    }

    // Threat marks: an empty cell that would complete four.
    this.marks.replaceChildren();
    for (const t of threats) svg('circle', { class: `threat p${t.p}`, cx: this.cx(t.c), cy: this.cy(t.r), r: CELL * 0.17 }, this.marks);

    // Hint and keyboard focus.
    this.hintG.replaceChildren();
    if (hint >= 0) {
      svg('rect', { class: 'hint-col', x: PAD + hint * CELL + 6, y: 6, width: CELL - 12, height: state.rows * CELL + PAD * 2 - 12, rx: 44 }, this.hintG);
      svg('path', { class: 'hint-arrow', d: `M${this.cx(hint) - 16} ${-TOP + 14} h32 l-16 20z` }, this.root.querySelector('.marks'));
    }
    if (focus >= 0) svg('rect', { class: 'focus-col', x: PAD + focus * CELL + 4, y: 4, width: CELL - 8, height: state.rows * CELL + PAD * 2 - 8, rx: 46 }, this.marks);

    this.canPlay = canPlay;
    this.turn = state.turn;
    this.playable = [];
    for (let c = 0; c < state.cols; c++) if (heights[c] < state.rows) this.playable.push(c);
    if (focus >= 0) this.hover = focus;
    this.updateGhost();
    this.root.classList.toggle('can-play', canPlay);
    this.targets.forEach((t, c) => {
      t.setAttribute('aria-label', `Column ${c + 1}${heights[c] >= state.rows ? ', full' : ''}`);
    });
  }

  addDisc(c, r, p, animate) {
    const g = svg('g', { class: `disc-g`, 'data-i': this.discs.children.length, 'data-cell': `${c},${r}` }, this.discs);
    g.setAttribute('transform', `translate(${this.cx(c)} ${this.cy(r)})`);
    const inner = svg('g', { class: 'disc-in' }, g);
    svg('circle', { class: `disc p${p}`, r: CELL * 0.41 }, inner);
    svg('circle', { class: `disc-ring p${p}`, r: CELL * 0.28 }, inner);
    svg('circle', { class: 'disc-dot', r: CELL * 0.07 }, inner);
    if (animate && !this.reduced.matches && inner.animate) {
      const from = -TOP / 2 - this.cy(r);
      const fall = Math.sqrt(Math.abs(from) / 900) * 330;
      inner.animate(
        [
          { transform: `translateY(${from}px)`, easing: 'cubic-bezier(0.5, 0, 1, 1)' },
          { transform: 'translateY(0)', offset: 0.72, easing: 'cubic-bezier(0, 0, 0.4, 1)' },
          { transform: `translateY(${-Math.min(18, Math.abs(from) * 0.06)}px)`, offset: 0.86, easing: 'cubic-bezier(0.6, 0, 1, 1)' },
          { transform: 'translateY(0)' },
        ],
        { duration: fall + 170 },
      );
    }
  }

  // Duration of the drop animation for a disc landing on row r, in ms.
  dropTime(r) {
    if (this.reduced.matches) return 0;
    const from = TOP / 2 + this.cy(r);
    return Math.sqrt(from / 900) * 330 * 0.72;
  }
}

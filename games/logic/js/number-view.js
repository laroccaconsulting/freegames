// A shared grid view for number puzzles (Futoshiki, Skyscrapers): tap a
// square, then a number; Notes pencils in options. Givens can't be changed.
// Each mode passes `decorate(cell, i)` to add its clues to squares and
// `frame(grid)` to wrap the grid (for clues outside it). Kakuro also passes
// `digits` (the pad's numbers), `open(i)` (false for its clue squares) and
// `peers(i)` (the squares that share a run, for notes and highlighting).
import { el } from '../core/ui.js';
import { sfx } from './sfx.js';
import { candidates } from './latin.js';

export function numberView(host, p, ctx, { cls, conflicts, decorate = () => {}, frame = (g) => g, redraw = () => {}, digits = p.n, open = () => true, peers = null }) {
  const { n } = p;
  const fixed = (i) => Boolean(p.givens[i]);
  const sameLine = (a, b) => Math.floor(a / n) === Math.floor(b / n) || a % n === b % n;
  const linked = peers ? (a, b) => peers(a).includes(b) : sameLine;
  let sel = ctx.marks.v.findIndex((x, i) => open(i) && !x && !fixed(i));
  if (sel < 0) sel = 0;
  let noting = false;
  const grid = el('div', { class: `ng-grid ${cls}`, style: `--n: ${n}`, role: 'grid' });
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    const cell = open(i) ? el('button', { class: `ng-cell${fixed(i) ? ' given' : ''}`, dataset: { i }, onclick: () => select(i) }, el('b', {}), el('span', { class: 'notes' })) : el('div', { class: 'ng-block', dataset: { i } });
    decorate(cell, i);
    cells.push(cell);
    grid.append(cell);
  }
  const pad = el('div', { class: 'pad' });
  for (let v = 1; v <= digits; v++) pad.append(el('button', { class: 'pad-key', onclick: () => enter(v) }, v));
  const noteBtn = el('button', { class: 'pad-key wide', onclick: () => ((noting = !noting), api.draw(last)), 'aria-pressed': 'false' }, 'Notes');
  pad.append(noteBtn, el('button', { class: 'pad-key wide', onclick: () => enter(0), 'aria-label': 'Erase' }, '⌫'));
  host.replaceChildren(el('div', { class: `board-wrap ${cls}` }, frame(grid)), pad);

  const select = (i) => {
    sel = i;
    sfx.tap();
    api.draw(last);
  };
  const enter = (v) => {
    if (ctx.done() || fixed(sel)) return;
    const m = { v: ctx.marks.v.slice(), notes: ctx.marks.notes.slice() };
    if (v && noting && !m.v[sel]) m.notes[sel] ^= 1 << v;
    else {
      m.v[sel] = v;
      m.notes[sel] = 0;
      if (v) for (let j = 0; j < n * n; j++) if (j !== sel && linked(sel, j)) m.notes[j] &= ~(1 << v);
      if (v) sfx.place();
    }
    ctx.change(m);
  };
  let last = { errors: true };
  const api = {
    draw(opts) {
      last = opts;
      const { v, notes } = ctx.marks;
      const bad = opts.errors ? conflicts(v) : new Set();
      cells.forEach((cell, i) => {
        if (!open(i)) return;
        cell.querySelector('b').textContent = v[i] || '';
        cell.querySelector('.notes').textContent = v[i] ? '' : [...Array(digits).keys()].map((k) => (notes[i] & (1 << (k + 1)) ? k + 1 : '')).filter(Boolean).join(' ');
        cell.classList.toggle('sel', i === sel && !ctx.done());
        cell.classList.toggle('line', i !== sel && linked(sel, i) && !ctx.done());
        cell.classList.toggle('bad', bad.has(i) && !fixed(i));
        cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${v[i] ? `, ${v[i]}` : ', empty'}${fixed(i) ? ', given' : ''}`);
      });
      noteBtn.classList.toggle('on', noting);
      noteBtn.setAttribute('aria-pressed', String(noting));
      grid.classList.toggle('solved', ctx.done());
      redraw(v, opts);
    },
    key(e) {
      const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
      const k = Number(e.key);
      if (moves[e.key]) {
        let next = sel;
        do next += moves[e.key];
        while (next >= 0 && next < n * n && !open(next));
        if (next >= 0 && next < n * n) sel = next;
        api.draw(last);
      } else if (k >= 1 && k <= digits) enter(k);
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') enter(0);
      else if (e.key === 'n') {
        noting = !noting;
        api.draw(last);
      } else return false;
      return true;
    },
  };
  return api;
}

// The shared hint: clear a wrong number, else fill the empty square with the
// fewest options (and say why when there's only one).
export function numberHint(p, m, ok, why) {
  const v = m.v.slice();
  const notes = m.notes.slice();
  const wrong = v.findIndex((x, i) => x && x !== p.solution[i]);
  if (wrong >= 0) {
    v[wrong] = p.givens[wrong] || 0;
    return { marks: { v, notes }, text: 'That number isn’t right, so it’s been cleared.' };
  }
  let best = -1;
  let bestCount = Infinity;
  for (let i = 0; i < p.n * p.n; i++) {
    if (v[i]) continue;
    const count = candidates(p.n, v, ok, i).length;
    if (count < bestCount) [best, bestCount] = [i, count];
  }
  if (best < 0) return null;
  v[best] = p.solution[best];
  notes[best] = 0;
  return { marks: { v, notes }, text: bestCount === 1 ? `Only ${p.solution[best]} fits there: ${why}.` : `${p.solution[best]} goes there. That square had the fewest options left.` };
}

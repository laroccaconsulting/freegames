// Calcudoku mode: rules text, hints and the grid view with a number pad.
import * as C from './calc.js';
import { el } from '../core/ui.js';
import { sfx } from './sfx.js';

export const calcMode = {
  name: 'Calcudoku',
  icon: 'grid',
  blurb: 'Numbers, cages and a little arithmetic',
  goal: 'Fill the grid so no number repeats in a row or column, and every cage makes its target.',
  rules: 'Fill every row and column with the numbers 1 to the grid size, each once. The small label in each outlined cage is a target and a sum: the cage’s numbers must make the target with that operation (for − and ÷, start from the bigger number). Tap a square, then a number. Notes lets you pencil in options.',
  sizes: { small: { label: '4×4' }, medium: { label: '5×5' }, large: { label: '6×6' } },
  dailySize: 'large',
  generate: (seed, size) => C.generate(seed, size),
  blank: (p) => ({ v: new Array(p.n * p.n).fill(0), notes: new Array(p.n * p.n).fill(0) }),
  isSolved: (p, m) => C.isSolved(p, m.v),
  progress: (p, m) => ({ label: 'Filled', value: `${m.v.filter(Boolean).length}/${p.n * p.n}` }),

  hint(p, m) {
    const v = m.v.slice();
    const notes = m.notes.slice();
    const wrong = v.findIndex((x, i) => x && x !== p.solution[i]);
    if (wrong >= 0) {
      v[wrong] = 0;
      return { marks: { v, notes }, text: 'That number isn’t right, so it’s been cleared.' };
    }
    // The empty square with the fewest numbers that fit its row, column and cage.
    let best = -1;
    let bestCount = Infinity;
    for (let i = 0; i < p.n * p.n; i++) {
      if (v[i]) continue;
      const count = candidates(p, v, i).length;
      if (count < bestCount) [best, bestCount] = [i, count];
    }
    if (best < 0) return null;
    v[best] = p.solution[best];
    notes[best] = 0;
    return { marks: { v, notes }, text: bestCount === 1 ? `Only ${p.solution[best]} fits there: every other number clashes with its row, column or cage.` : `${p.solution[best]} goes there. That square had the fewest options left.` };
  },

  view(host, p, ctx) {
    const { n } = p;
    const cageOf = new Array(n * n);
    p.cages.forEach((c, k) => c.cells.forEach((i) => (cageOf[i] = k)));
    let sel = ctx.marks.v.findIndex((x) => !x);
    if (sel < 0) sel = 0;
    let noting = false;
    const grid = el('div', { class: 'cc-grid', style: `--n: ${n}`, role: 'grid', 'aria-label': 'Calcudoku' });
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const k = cageOf[i];
      const edges = [r === 0 || cageOf[i - n] !== k ? 'et' : '', c === n - 1 || cageOf[i + 1] !== k ? 'er' : '', r === n - 1 || cageOf[i + n] !== k ? 'eb' : '', c === 0 || cageOf[i - 1] !== k ? 'el' : ''].filter(Boolean);
      const cage = p.cages[k];
      const cell = el('button', { class: `cc-cell ${edges.join(' ')}`, dataset: { i }, onclick: () => select(i) }, cage.cells[0] === i ? el('small', { class: 'cage' }, C.label(cage)) : null, el('b', {}), el('span', { class: 'notes' }));
      cells.push(cell);
      grid.append(cell);
    }
    const pad = el('div', { class: 'pad' });
    for (let v = 1; v <= n; v++) pad.append(el('button', { class: 'pad-key', onclick: () => enter(v) }, v));
    const noteBtn = el('button', { class: 'pad-key wide', onclick: () => ((noting = !noting), api.draw(last)), 'aria-pressed': 'false' }, 'Notes');
    pad.append(noteBtn, el('button', { class: 'pad-key wide', onclick: () => enter(0), 'aria-label': 'Erase' }, '⌫'));
    host.replaceChildren(el('div', { class: 'board-wrap calc' }, grid), pad);

    const select = (i) => {
      sel = i;
      sfx.tap();
      api.draw(last);
    };
    const enter = (v) => {
      if (ctx.done()) return;
      const m = { v: ctx.marks.v.slice(), notes: ctx.marks.notes.slice() };
      if (v && noting && !m.v[sel]) m.notes[sel] ^= 1 << v;
      else {
        m.v[sel] = v;
        m.notes[sel] = 0;
        // A placed number clears itself from notes in the same row and column.
        if (v) for (let j = 0; j < n * n; j++) if (Math.floor(j / n) === Math.floor(sel / n) || j % n === sel % n) m.notes[j] &= ~(1 << v);
        if (v) sfx.place();
      }
      ctx.change(m);
    };
    let last = { errors: true };
    const api = {
      draw(opts) {
        last = opts;
        const { v, notes } = ctx.marks;
        const bad = opts.errors ? C.conflicts(p, v) : new Set();
        cells.forEach((cell, i) => {
          cell.querySelector('b').textContent = v[i] || '';
          const ns = cell.querySelector('.notes');
          ns.textContent = v[i] ? '' : [...Array(n).keys()].map((k) => (notes[i] & (1 << (k + 1)) ? k + 1 : '')).filter(Boolean).join(' ');
          cell.classList.toggle('sel', i === sel && !ctx.done());
          cell.classList.toggle('line', i !== sel && (Math.floor(i / n) === Math.floor(sel / n) || i % n === sel % n) && !ctx.done());
          cell.classList.toggle('bad', bad.has(i));
          cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${v[i] ? `, ${v[i]}` : ''}, cage ${C.label(p.cages[cageOf[i]])}`);
        });
        noteBtn.classList.toggle('on', noting);
        noteBtn.setAttribute('aria-pressed', String(noting));
        grid.classList.toggle('solved', ctx.done());
      },
      key(e) {
        const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
        const k = Number(e.key);
        if (moves[e.key]) {
          sel = Math.max(0, Math.min(n * n - 1, sel + moves[e.key]));
          api.draw(last);
        } else if (k >= 1 && k <= n) enter(k);
        else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') enter(0);
        else if (e.key === 'n') {
          noting = !noting;
          api.draw(last);
        } else return false;
        return true;
      },
    };
    return api;
  },
};

function candidates(p, v, i) {
  const { n } = p;
  const out = [];
  for (let x = 1; x <= n; x++) {
    let ok = true;
    for (let j = 0; j < n * n && ok; j++) if (j !== i && v[j] === x && (Math.floor(j / n) === Math.floor(i / n) || j % n === i % n)) ok = false;
    if (!ok) continue;
    const trial = v.slice();
    trial[i] = x;
    if (!C.conflicts(p, trial).has(i)) out.push(x);
  }
  return out;
}

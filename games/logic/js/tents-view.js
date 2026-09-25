// Tents mode: rules text, hints and the grid view with row and column counts.
import * as T from './tents.js';
import { el } from '../core/ui.js';
import { sfx } from './sfx.js';

const tentsOf = (marks) => marks.map((m) => m === 2);

export const tentsMode = {
  name: 'Tents',
  icon: 'leaf',
  blurb: 'A tent beside every tree',
  goal: 'Pitch one tent beside each tree so tents never touch and every row and column has its number of tents.',
  rules: 'Every tree gets one tent on one of its four sides (not diagonally), and every tent belongs to one tree. Tents never touch each other, not even diagonally. The numbers outside the grid say how many tents are in each row and column. Tap for a tent, again for grass (no tent here), again to clear.',
  sizes: { small: { label: '6×6' }, medium: { label: '8×8' }, large: { label: '10×10' } },
  dailySize: 'medium',
  generate: (seed, size) => T.generate(seed, size),
  blank: (p) => new Array(p.n * p.n).fill(0),
  isSolved: (p, marks) => T.isSolved(p, tentsOf(marks)),
  progress: (p, marks) => ({ label: 'Tents', value: `${marks.filter((m) => m === 2).length}/${p.trees.filter(Boolean).length}` }),

  hint(p, marks) {
    const next = marks.slice();
    const wrong = marks.findIndex((m, i) => m === 2 && !p.solution[i]);
    if (wrong >= 0) {
      next[wrong] = 0;
      return { marks: next, text: 'That tent isn’t part of the answer, so it’s been taken down.' };
    }
    const wrongGrass = marks.findIndex((m, i) => m === 1 && p.solution[i]);
    if (wrongGrass >= 0) {
      next[wrongGrass] = 2;
      return { marks: next, text: 'Some grass was covering a tent. It’s been pitched.' };
    }
    // The row or column with the fewest open squares for the tents it still needs.
    const { n } = p;
    const tents = tentsOf(marks);
    const touching = new Set();
    tents.forEach((t, i) => t && T.around(n, i).forEach((j) => touching.add(j)));
    const open = (i) => !p.trees[i] && !tents[i] && marks[i] !== 1 && !touching.has(i);
    let best = null;
    for (let k = 0; k < n; k++) {
      for (const [kind, cellsOf, need] of [['row', (x) => k * n + x, p.rows[k]], ['column', (x) => x * n + k, p.cols[k]]]) {
        const line = Array.from({ length: n }, (_, x) => cellsOf(x));
        const left = need - line.filter((i) => tents[i]).length;
        if (left <= 0) continue;
        const free = line.filter(open).length;
        if (!best || free - left < best.slack) best = { kind, k, line, slack: free - left };
      }
    }
    if (!best) return null;
    const cell = best.line.find((i) => p.solution[i] && !tents[i]);
    next[cell] = 2;
    return { marks: next, text: best.slack === 0 ? `${best.kind === 'row' ? 'Row' : 'Column'} ${best.k + 1} needs a tent in every free square it has left.` : `A tent goes here, in the ${best.kind} with the least room to spare.` };
  },

  view(host, p, ctx) {
    const { n } = p;
    const grid = el('div', { class: 'tt-grid', style: `--n: ${n}`, role: 'grid', 'aria-label': 'Tents' });
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const tree = p.trees[i];
      const cell = el(tree ? 'div' : 'button', { class: `tt-cell${tree ? ' tree' : ''}`, dataset: { i }, onclick: tree ? null : () => tap(i), 'aria-label': tree ? 'Tree' : null });
      cells.push(cell);
      grid.append(cell);
    }
    const counts = { top: [], left: [] };
    const clue = (side, k, v) => {
      const node = el('span', { class: `sky-clue ${side}` }, v);
      counts[side][k] = node;
      return node;
    };
    const frame = el(
      'div',
      { class: 'sky-frame tents', style: `--n: ${n}` },
      el('span'),
      el('div', { class: 'sky-row' }, p.cols.map((v, k) => clue('top', k, v))),
      el('div', { class: 'sky-col' }, p.rows.map((v, k) => clue('left', k, v))),
      grid,
    );
    const tap = (i) => {
      if (ctx.done()) return;
      const marks = ctx.marks.slice();
      marks[i] = marks[i] === 0 ? 2 : marks[i] === 2 ? 1 : 0;
      if (marks[i] === 2) sfx.place();
      else sfx.tap();
      ctx.change(marks);
    };
    host.replaceChildren(el('div', { class: 'board-wrap tents' }, frame));
    let focus = p.trees.indexOf(false);
    return {
      draw({ errors }) {
        const marks = ctx.marks;
        const tents = tentsOf(marks);
        const bad = errors ? T.conflicts(p, tents) : new Set();
        const c = T.counts(p, tents);
        cells.forEach((cell, i) => {
          if (p.trees[i]) return;
          cell.classList.toggle('tent', marks[i] === 2);
          cell.classList.toggle('grass', marks[i] === 1);
          cell.classList.toggle('bad', bad.has(i));
          cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${marks[i] === 2 ? ', tent' : marks[i] === 1 ? ', grass' : ''}`);
        });
        for (let k = 0; k < n; k++) {
          counts.left[k].classList.toggle('met', c.rows[k] === p.rows[k]);
          counts.left[k].classList.toggle('bad', errors && c.rows[k] > p.rows[k]);
          counts.top[k].classList.toggle('met', c.cols[k] === p.cols[k]);
          counts.top[k].classList.toggle('bad', errors && c.cols[k] > p.cols[k]);
        }
        grid.classList.toggle('solved', ctx.done());
      },
      key(e) {
        const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
        if (moves[e.key]) {
          let f = focus;
          do f += moves[e.key];
          while (f >= 0 && f < n * n && p.trees[f]);
          if (f >= 0 && f < n * n) focus = f;
          cells[focus].focus();
          return true;
        }
        if (e.key === ' ' || e.key === 'Enter') {
          tap(Number(document.activeElement?.dataset?.i ?? focus));
          return true;
        }
        return false;
      },
    };
  },
};

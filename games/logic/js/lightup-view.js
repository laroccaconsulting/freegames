// Light Up mode: rules text, hints and the grid view.
import * as L from './lightup.js';
import { el } from '../core/ui.js';
import { sfx } from './sfx.js';

const bulbsOf = (marks) => marks.map((m) => m === 2);

export const lightupMode = {
  name: 'Light Up',
  icon: 'bulb',
  blurb: 'Light every square, bulbs never see each other',
  goal: 'Place bulbs so every white square is lit, no bulb shines on another, and each number has that many bulbs beside it.',
  rules: 'Put bulbs in white squares. A bulb lights its whole row and column until a black square blocks it. Light every white square, but no bulb may shine on another. A number on a black square says exactly how many bulbs touch its four sides. Tap for a bulb, again for a dot (no bulb here), again to clear.',
  sizes: { small: { label: '7×7' }, medium: { label: '9×9' }, large: { label: '11×11' } },
  dailySize: 'medium',
  generate: (seed, size) => L.generate(seed, size),
  blank: (p) => new Array(p.n * p.n).fill(0),
  isSolved: (p, marks) => L.isSolved(p, bulbsOf(marks)),
  progress: (p, marks) => {
    const lit = L.litBy(p, bulbsOf(marks));
    const whites = p.cells.filter((v) => v === L.WHITE).length;
    return { label: 'Lit', value: `${Math.round((100 * lit.filter((x, i) => x && p.cells[i] === L.WHITE).length) / whites)}%` };
  },

  hint(p, marks) {
    const next = marks.slice();
    const wrong = marks.findIndex((m, i) => m === 2 && !p.solution[i]);
    if (wrong >= 0) {
      next[wrong] = 0;
      return { marks: next, text: 'That bulb isn’t part of the answer, so it’s been taken off.' };
    }
    const wrongDot = marks.findIndex((m, i) => m === 1 && p.solution[i]);
    if (wrongDot >= 0) {
      next[wrongDot] = 2;
      return { marks: next, text: 'A dot was covering a bulb. It’s been placed.' };
    }
    // The dark square with the fewest places it could be lit from.
    const bulbs = bulbsOf(marks);
    const lit = L.litBy(p, bulbs);
    let best = -1;
    let bestN = Infinity;
    for (let i = 0; i < p.n * p.n; i++) {
      if (p.cells[i] !== L.WHITE || lit[i]) continue;
      const spots = [i, ...L.sight(p.n, p.cells, i)].filter((j) => !lit[j] && marks[j] !== 1);
      if (spots.length < bestN) [best, bestN] = [i, spots.length];
    }
    if (best < 0) return null;
    const bulb = [best, ...L.sight(p.n, p.cells, best)].find((j) => p.solution[j]);
    next[bulb] = 2;
    return { marks: next, text: bestN === 1 ? 'That dark square could only be lit from one place.' : 'A bulb goes here: it lights the square with the fewest options.' };
  },

  view(host, p, ctx) {
    const { n } = p;
    const grid = el('div', { class: 'lu-grid', style: `--n: ${n}`, role: 'grid', 'aria-label': 'Light Up' });
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const v = p.cells[i];
      const white = v === L.WHITE;
      const cell = el(white ? 'button' : 'div', { class: `lu-cell ${white ? 'white' : 'black'}`, dataset: { i }, onclick: white ? () => tap(i) : null }, v >= 0 ? el('b', {}, v) : null);
      cells.push(cell);
      grid.append(cell);
    }
    const tap = (i) => {
      if (ctx.done()) return;
      const marks = ctx.marks.slice();
      marks[i] = marks[i] === 0 ? 2 : marks[i] === 2 ? 1 : 0;
      if (marks[i] === 2) sfx.place();
      else sfx.tap();
      ctx.change(marks);
    };
    host.replaceChildren(el('div', { class: 'board-wrap' }, grid));
    let focus = p.cells.indexOf(L.WHITE);
    return {
      draw({ errors }) {
        const marks = ctx.marks;
        const bulbs = bulbsOf(marks);
        const lit = L.litBy(p, bulbs);
        const bad = errors ? L.conflicts(p, bulbs, marks.map((m) => m === 1)) : new Set();
        cells.forEach((cell, i) => {
          if (p.cells[i] !== L.WHITE) {
            cell.classList.toggle('bad', bad.has(i));
            cell.classList.toggle('met', p.cells[i] >= 0 && !bad.has(i) && [i - n, i + n, i % n ? i - 1 : -1, i % n < n - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < n * n && bulbs[j]).length === p.cells[i]);
            return;
          }
          cell.classList.toggle('bulb', marks[i] === 2);
          cell.classList.toggle('dot', marks[i] === 1);
          cell.classList.toggle('lit', lit[i]);
          cell.classList.toggle('bad', bad.has(i));
          cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${marks[i] === 2 ? ', bulb' : marks[i] === 1 ? ', dot' : lit[i] ? ', lit' : ''}`);
        });
        grid.classList.toggle('solved', ctx.done());
      },
      key(e) {
        const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
        if (moves[e.key]) {
          let f = focus;
          do f += moves[e.key];
          while (f >= 0 && f < n * n && p.cells[f] !== L.WHITE);
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

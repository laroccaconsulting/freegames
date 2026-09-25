// Futoshiki mode: rules text and the grid with < and > signs between squares.
import * as F from './futoshiki.js';
import { el } from '../core/ui.js';
import { numberView, numberHint } from './number-view.js';

export const futoshikiMode = {
  name: 'Futoshiki',
  icon: 'equal',
  blurb: 'Numbers with greater-than signs',
  goal: 'Fill the grid so no number repeats in a row or column, and every sign between squares holds.',
  rules: 'Fill every row and column with the numbers 1 to the grid size, each once. A sign between two squares must hold: the open side of < or ∧ faces the bigger number. Tap a square, then a number.',
  sizes: { small: { label: '4×4' }, medium: { label: '5×5' }, large: { label: '6×6' } },
  dailySize: 'large',
  generate: (seed, size) => F.generate(seed, size),
  blank: (p) => ({ v: p.givens.slice(), notes: new Array(p.n * p.n).fill(0) }),
  isSolved: (p, m) => F.isSolved(p, m.v),
  progress: (p, m) => ({ label: 'Filled', value: `${m.v.filter(Boolean).length}/${p.n * p.n}` }),
  hint: (p, m) => numberHint(p, m, F.rule(p), 'every other number clashes with its row, column or a sign'),

  view(host, p, ctx) {
    const { n } = p;
    const signAt = new Map();
    for (const s of p.signs) {
      const [lo, hi] = s.a < s.b ? [s.a, s.b] : [s.b, s.a];
      const across = hi === lo + 1;
      // The first square holds the sign on its right or bottom edge.
      const text = across ? (s.a === lo ? '<' : '>') : s.a === lo ? '∧' : '∨';
      signAt.set(`${lo}${across ? 'r' : 'b'}`, { text, s });
    }
    const signs = [];
    return numberView(host, p, ctx, {
      cls: 'futoshiki',
      conflicts: (v) => F.conflicts(p, v),
      decorate(cell, i) {
        for (const side of ['r', 'b']) {
          const sign = signAt.get(`${i}${side}`);
          if (!sign) continue;
          const node = el('i', { class: `sign sign-${side}`, 'aria-hidden': 'true' }, sign.text);
          signs.push({ node, s: sign.s });
          cell.append(node);
        }
      },
      redraw(v, opts) {
        for (const { node, s } of signs) node.classList.toggle('bad', opts.errors && Boolean(v[s.a] && v[s.b] && v[s.a] >= v[s.b]));
      },
    });
  },
};

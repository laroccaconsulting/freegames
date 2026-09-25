// Kakuro mode: rules text, hints and the grid with sums in the black squares.
import * as K from './kakuro.js';
import { el } from '../core/ui.js';
import { numberView } from './number-view.js';

export const kakuroMode = {
  name: 'Kakuro',
  icon: 'chart',
  blurb: 'A crossword of sums',
  goal: 'Fill the white squares with 1 to 9 so each run adds up to its clue, with no digit twice in a run.',
  rules: 'Fill every white square with a digit from 1 to 9. Each run of white squares across or down adds up to the number in the black square at its start (across sums sit top right, down sums bottom left), and no digit repeats within a run. Tap a square, then a digit. Notes lets you pencil in options.',
  sizes: { small: { label: '6×6' }, medium: { label: '8×8' }, large: { label: '9×9' } },
  dailySize: 'medium',
  generate: (seed, size) => K.generate(seed, size),
  blank: (p) => ({ v: p.givens.slice(), notes: new Array(p.n * p.n).fill(0) }),
  isSolved: (p, m) => K.isSolved(p, m.v),
  progress: (p, m) => ({ label: 'Filled', value: `${m.v.filter((x, i) => x && p.white[i]).length}/${p.white.filter(Boolean).length}` }),

  hint(p, m) {
    const v = m.v.slice();
    const notes = m.notes.slice();
    const wrong = v.findIndex((x, i) => x && x !== p.solution[i]);
    if (wrong >= 0) {
      v[wrong] = p.givens[wrong] || 0;
      return { marks: { v, notes }, text: 'That digit isn’t right, so it’s been cleared.' };
    }
    // The empty square whose runs allow the fewest digits.
    let best = -1;
    let bestN = 10;
    for (let i = 0; i < p.n * p.n; i++) {
      if (!p.white[i] || v[i]) continue;
      let mask = 0b1111111110;
      for (const run of p.runs) if (run.cells.includes(i)) mask &= K.digitsFor(run.cells.length, run.sum);
      let c = 0;
      for (let x = mask; x; x &= x - 1) c++;
      if (c < bestN) [best, bestN] = [i, c];
    }
    if (best < 0) return null;
    v[best] = p.solution[best];
    notes[best] = 0;
    return { marks: { v, notes }, text: bestN === 1 ? `Only ${p.solution[best]} fits both sums through that square.` : `${p.solution[best]} goes there: its two sums leave few options.` };
  },

  view(host, p, ctx) {
    const { n } = p;
    const runsOf = Array.from({ length: n * n }, () => []);
    p.runs.forEach((run, k) => run.cells.forEach((i) => runsOf[i].push(k)));
    const clueEls = new Map();
    return numberView(host, p, ctx, {
      cls: 'kakuro',
      digits: 9,
      open: (i) => p.white[i],
      peers: (i) => runsOf[i].flatMap((k) => p.runs[k].cells),
      conflicts: (v) => K.conflicts(p, v),
      decorate(cell, i) {
        if (p.white[i]) return;
        p.runs.forEach((run, k) => {
          if (run.clue !== i) return;
          const node = el('span', { class: `kk-sum ${run.dir}`, 'aria-label': `${run.dir} sum ${run.sum}` }, run.sum);
          clueEls.set(k, node);
          cell.append(node);
          cell.classList.add('clue');
        });
      },
      redraw(v, opts) {
        const bad = opts.errors ? K.badRuns(p, v) : [];
        for (const [k, node] of clueEls) node.classList.toggle('bad', Boolean(bad[k]));
      },
    });
  },
};

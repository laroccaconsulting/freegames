// Skyscrapers mode: rules text and the grid framed by its view clues.
import * as S from './skyscrapers.js';
import { el } from '../core/ui.js';
import { numberView, numberHint } from './number-view.js';

export const skyscrapersMode = {
  name: 'Skyscrapers',
  icon: 'blocks',
  blurb: 'Count the towers you can see',
  goal: 'Fill the grid with building heights so no height repeats in a row or column, and each clue counts the buildings seen from there.',
  rules: 'Each square holds a building from 1 to the grid size tall, each height once per row and column. A number outside the grid says how many buildings you can see looking in from there: taller buildings hide shorter ones behind them. Tap a square, then a height.',
  sizes: { small: { label: '4×4' }, medium: { label: '5×5' }, large: { label: '6×6' } },
  dailySize: 'medium',
  generate: (seed, size) => S.generate(seed, size),
  blank: (p) => ({ v: p.givens.slice(), notes: new Array(p.n * p.n).fill(0) }),
  isSolved: (p, m) => S.isSolved(p, m.v),
  progress: (p, m) => ({ label: 'Filled', value: `${m.v.filter(Boolean).length}/${p.n * p.n}` }),
  hint: (p, m) => numberHint(p, m, S.rule(p), 'any other height breaks a row, column or view clue'),

  view(host, p, ctx) {
    const { n, clues } = p;
    const clueEls = {};
    const clue = (side, k) => {
      const value = clues[side][k];
      const node = el('span', { class: `sky-clue ${side}`, 'aria-label': value ? `${value} visible from the ${side}` : null }, value || '');
      clueEls[`${side}${k}`] = node;
      return node;
    };
    return numberView(host, p, ctx, {
      cls: 'skyscrapers',
      conflicts: (v) => S.conflicts(p, v),
      frame(grid) {
        const top = el('div', { class: 'sky-row' }, [...Array(n).keys()].map((k) => clue('top', k)));
        const bottom = el('div', { class: 'sky-row' }, [...Array(n).keys()].map((k) => clue('bottom', k)));
        const left = el('div', { class: 'sky-col' }, [...Array(n).keys()].map((k) => clue('left', k)));
        const right = el('div', { class: 'sky-col' }, [...Array(n).keys()].map((k) => clue('right', k)));
        return el('div', { class: 'sky-frame', style: `--n: ${n}` }, el('span'), top, el('span'), left, grid, right, el('span'), bottom, el('span'));
      },
      redraw(v, opts) {
        const bad = opts.errors ? S.badClues(p, v) : new Set();
        for (const [key, node] of Object.entries(clueEls)) node.classList.toggle('bad', bad.has(key));
      },
    });
  },
};

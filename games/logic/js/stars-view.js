// Star Battle mode: rules text, hints and the grid view.
import * as S from './stars.js';
import { el } from '../core/ui.js';
import { sfx } from './sfx.js';

const neighbours = (n, i) => {
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc);
    }
  return out;
};

// Squares that can't hold a star, given the stars placed: touching a star,
// or in a row, column or region that already has its k stars.
export function ruledOut(p, marks) {
  const { n, k, regions } = p;
  const out = new Set();
  const rows = new Array(n).fill(0);
  const cols = new Array(n).fill(0);
  const regs = new Array(n).fill(0);
  for (let i = 0; i < n * n; i++) {
    if (marks[i] !== 2) continue;
    rows[Math.floor(i / n)]++;
    cols[i % n]++;
    regs[regions[i]]++;
    for (const j of neighbours(n, i)) out.add(j);
  }
  for (let i = 0; i < n * n; i++) {
    if (marks[i] === 2) continue;
    if (rows[Math.floor(i / n)] >= k || cols[i % n] >= k || regs[regions[i]] >= k) out.add(i);
  }
  for (let i = 0; i < n * n; i++) if (marks[i] === 2) out.delete(i);
  return out;
}

// Colours for regions so that neighbouring regions never share one.
function colourRegions(p) {
  const { n, regions } = p;
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n * n; i++) {
    for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (j < 0 || regions[j] === regions[i]) continue;
      adj[regions[i]].add(regions[j]);
      adj[regions[j]].add(regions[i]);
    }
  }
  const colour = new Array(n).fill(-1);
  for (let g = 0; g < n; g++) {
    const used = new Set([...adj[g]].map((h) => colour[h]));
    let c = (g * 3) % 10;
    while (used.has(c)) c = (c + 1) % 10;
    colour[g] = c;
  }
  return colour;
}

export const starsMode = {
  name: 'Star Battle',
  icon: 'star',
  blurb: 'Stars in every row, column and region',
  goal: 'Place stars so every row, column and outlined region has the same number, with no two touching.',
  rules: 'Place stars so every row, every column and every outlined region has exactly one star (two on the big board). Stars never touch, not even diagonally. Tap a square for a star, again for a dot (a reminder that no star goes there), again to clear.',
  sizes: { small: { label: '6×6' }, medium: { label: '8×8' }, large: { label: '10×10 ★★' } },
  dailySize: 'medium',
  generate: (seed, size) => S.generate(seed, size),
  blank: (p) => new Array(p.n * p.n).fill(0),
  isSolved: (p, marks) => S.isSolved(p, marks),
  progress: (p, marks) => ({ label: 'Stars', value: `${marks.filter((m) => m === 2).length}/${p.n * p.k}` }),

  hint(p, marks) {
    const next = marks.slice();
    const bad = S.conflicts(p, marks);
    const wrong = marks.findIndex((m, i) => m === 2 && (bad.has(i) || !p.solution[i]));
    if (wrong >= 0) {
      next[wrong] = 0;
      return { marks: next, text: bad.has(wrong) ? 'That star breaks a rule, so it’s been taken off.' : 'That star can’t be part of the answer, so it’s been taken off.' };
    }
    const wrongDot = marks.findIndex((m, i) => m === 1 && p.solution[i]);
    if (wrongDot >= 0) {
      next[wrongDot] = 2;
      return { marks: next, text: 'A dot was hiding a star. It’s been placed.' };
    }
    // The region with the fewest open squares: its star is the easiest to see.
    const out = ruledOut(p, marks);
    let best = -1;
    let bestOpen = Infinity;
    for (let g = 0; g < p.n; g++) {
      const cells = [];
      for (let i = 0; i < p.n * p.n; i++) if (p.regions[i] === g) cells.push(i);
      if (cells.filter((i) => marks[i] === 2).length >= p.k) continue;
      const open = cells.filter((i) => !out.has(i) && marks[i] !== 1 && marks[i] !== 2).length;
      if (open < bestOpen) [best, bestOpen] = [g, open];
    }
    if (best < 0) return null;
    const cell = p.solution.findIndex((s, i) => s && p.regions[i] === best && marks[i] !== 2);
    next[cell] = 2;
    return { marks: next, text: `The region with the fewest free squares has only ${bestOpen} left. Its star goes here.` };
  },

  view(host, p, ctx) {
    const { n } = p;
    const colour = colourRegions(p);
    const grid = el('div', { class: `sb-grid n${n}`, style: `--n: ${n}`, role: 'grid', 'aria-label': 'Star Battle' });
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const g = p.regions[i];
      const edges = [r === 0 || p.regions[i - n] !== g ? 't' : '', c === n - 1 || p.regions[i + 1] !== g ? 'r' : '', r === n - 1 || p.regions[i + n] !== g ? 'b' : '', c === 0 || p.regions[i - 1] !== g ? 'l' : ''].filter(Boolean);
      const cell = el('button', { class: `sb-cell reg${colour[g]} ${edges.map((e) => `e${e}`).join(' ')}`, dataset: { i }, onclick: () => tap(i) });
      cells.push(cell);
      grid.append(cell);
    }
    let focus = 0;
    const tap = (i) => {
      if (ctx.done()) return;
      const marks = ctx.marks.slice();
      marks[i] = marks[i] === 0 ? 2 : marks[i] === 2 ? 1 : 0;
      if (marks[i] === 2) sfx.place();
      else sfx.tap();
      focus = i;
      ctx.change(marks);
    };
    host.replaceChildren(el('div', { class: 'board-wrap' }, grid));
    return {
      draw({ errors }) {
        const marks = ctx.marks;
        const bad = errors ? S.conflicts(p, marks) : new Set();
        const auto = ctx.settings.get('autoDots') ? ruledOut(p, marks) : new Set();
        cells.forEach((cell, i) => {
          const m = marks[i];
          cell.classList.toggle('star', m === 2);
          cell.classList.toggle('dot', m === 1);
          cell.classList.toggle('auto', m === 0 && auto.has(i));
          cell.classList.toggle('bad', bad.has(i));
          cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${m === 2 ? ', star' : m === 1 ? ', dot' : ''}`);
        });
        grid.classList.toggle('solved', ctx.done());
      },
      key(e) {
        const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
        if (moves[e.key]) {
          focus = Math.max(0, Math.min(n * n - 1, focus + moves[e.key]));
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

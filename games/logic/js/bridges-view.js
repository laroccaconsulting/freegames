// Bridges mode: rules text, hints and the SVG view.
import * as B from './bridges.js';
import { toast } from '../core/ui.js';
import { sfx } from './sfx.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, parent) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
};

export const bridgesMode = {
  name: 'Bridges',
  icon: 'share',
  blurb: 'Link every island, count the bridges',
  goal: 'Join the islands with bridges so each has as many as its number, and every island is connected.',
  rules: 'Each island’s number is how many bridges touch it. Bridges run straight across or down, at most two between the same islands, and never cross. When you’re done, every island must be connected. Drag from one island toward another (or tap one, then the other) to add a bridge; do it again for a second, and again to remove them. Tapping a bridge does the same.',
  sizes: { small: { label: '7×7' }, medium: { label: '9×9' }, large: { label: '10×12' } },
  dailySize: 'medium',
  generate: (seed, size) => B.generate(seed, size),
  blank: (p) => p.edges.map(() => 0),
  isSolved: (p, counts) => B.isSolved(p, counts),
  progress: (p, counts) => {
    const t = B.totals(p, counts);
    return { label: 'Islands', value: `${p.islands.filter((s, k) => t[k] === s.n).length}/${p.islands.length}` };
  },

  hint(p, counts) {
    const next = counts.slice();
    const wrong = counts.findIndex((c, j) => c > p.solution[j]);
    if (wrong >= 0) {
      next[wrong] = p.solution[wrong];
      return { marks: next, text: 'There were too many bridges there. Fixed.' };
    }
    // An island whose remaining bridges are forced: it needs all its open capacity.
    const t = B.totals(p, counts);
    let best = -1;
    let bestSlack = Infinity;
    p.islands.forEach((s, k) => {
      if (t[k] >= s.n) return;
      const cap = p.edges.reduce((sum, [a, b], j) => sum + (a === k || b === k ? 2 - counts[j] : 0), 0);
      const slack = cap - (s.n - t[k]);
      if (slack < bestSlack) [best, bestSlack] = [k, slack];
    });
    if (best < 0) return null;
    const j = p.edges.findIndex(([a, b], j2) => (a === best || b === best) && counts[j2] < p.solution[j2]);
    next[j] = p.solution[j];
    const s = p.islands[best];
    return { marks: next, text: bestSlack === 0 ? `The ${s.n} island needs every bridge it can still get, so they’re all certain.` : `The ${s.n} island has the fewest choices left. A bridge goes here.` };
  },

  view(host, p, ctx) {
    const { w, h, islands, edges } = p;
    const root = svg('svg', { class: 'br-board', viewBox: `-0.5 -0.5 ${w} ${h}`, role: 'group', 'aria-label': 'Bridges' });
    svg('rect', { class: 'br-sea', x: -0.5, y: -0.5, width: w, height: h, rx: 0.3 }, root);
    const dots = svg('g', { class: 'br-dots' }, root);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) svg('circle', { cx: c, cy: r, r: 0.05 }, dots);
    const bridgeG = svg('g', {}, root);
    const hitG = svg('g', {}, root);
    const islandG = svg('g', {}, root);
    const lines = edges.map(([a, b], j) => {
      const A = islands[a];
      const B2 = islands[b];
      const g = svg('g', { class: 'br-bridge' }, bridgeG);
      const hit = svg('line', { class: 'br-hit', x1: A.c, y1: A.r, x2: B2.c, y2: B2.r }, hitG);
      hit.addEventListener('click', () => cycle(j));
      return g;
    });
    let selected = -1;
    const nodes = islands.map((s, k) => {
      const g = svg('g', { class: 'br-island', transform: `translate(${s.c} ${s.r})`, tabindex: 0, role: 'button' }, islandG);
      svg('circle', { r: 0.4 }, g);
      const t = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', y: 0.02 }, g);
      t.textContent = s.n;
      g.addEventListener('pointerdown', (e) => startDrag(e, k));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tapIsland(k);
        }
      });
      return g;
    });
    host.replaceChildren(Object.assign(document.createElement('div'), { className: 'board-wrap bridges' }));
    host.firstChild.append(root);

    const edgeBetween = (a, b) => edges.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
    const partnerToward = (k, dr, dc) => {
      const s = islands[k];
      let best = -1;
      edges.forEach(([a, b]) => {
        const o = a === k ? b : b === k ? a : -1;
        if (o < 0) return;
        const t = islands[o];
        if (Math.sign(t.r - s.r) === dr && Math.sign(t.c - s.c) === dc) best = o;
      });
      return best;
    };
    const cycle = (j) => {
      if (ctx.done() || j < 0) return;
      const counts = ctx.marks.slice();
      const nextCount = (counts[j] + 1) % 3;
      if (nextCount === 1) {
        const block = counts.findIndex((c, k) => c && k !== j && B.crosses(islands, edges[j], edges[k]));
        if (block >= 0) {
          sfx.bad();
          toast('Bridges can’t cross');
          return;
        }
      }
      counts[j] = nextCount;
      if (nextCount) sfx.place();
      else sfx.tap();
      selected = -1;
      ctx.change(counts);
    };
    const tapIsland = (k) => {
      if (selected >= 0 && selected !== k) {
        const j = edgeBetween(selected, k);
        if (j >= 0) {
          cycle(j);
          return;
        }
      }
      selected = selected === k ? -1 : k;
      sfx.tap();
      api.draw(last);
    };
    const startDrag = (e, k) => {
      if (ctx.done()) return;
      e.preventDefault();
      const pt = root.createSVGPoint();
      const toSvg = (ev) => {
        pt.x = ev.clientX;
        pt.y = ev.clientY;
        return pt.matrixTransform(root.getScreenCTM().inverse());
      };
      const start = toSvg(e);
      let done = false;
      const move = (ev) => {
        const q = toSvg(ev);
        const dx = q.x - start.x;
        const dy = q.y - start.y;
        if (done || Math.hypot(dx, dy) < 0.55) return;
        done = true;
        const [dr, dc] = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
        const o = partnerToward(k, dr, dc);
        if (o >= 0) cycle(edgeBetween(k, o));
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        if (!done) tapIsland(k);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    };

    let last = { errors: true };
    const api = {
      draw(opts) {
        last = opts;
        const counts = ctx.marks;
        const t = B.totals(p, counts);
        lines.forEach((g, j) => {
          g.replaceChildren();
          const n = counts[j];
          if (!n) return;
          const [a, b] = edges[j];
          const A = islands[a];
          const B2 = islands[b];
          const horizontal = A.r === B2.r;
          const offsets = n === 2 ? [-0.1, 0.1] : [0];
          for (const off of offsets) {
            svg('line', { x1: A.c + (horizontal ? 0 : off), y1: A.r + (horizontal ? off : 0), x2: B2.c + (horizontal ? 0 : off), y2: B2.r + (horizontal ? off : 0) }, g);
          }
        });
        nodes.forEach((g, k) => {
          const need = islands[k].n;
          g.classList.toggle('full', t[k] === need);
          g.classList.toggle('over', opts.errors && t[k] > need);
          g.classList.toggle('sel', k === selected);
          g.setAttribute('aria-label', `Island ${need}, ${t[k]} bridge${t[k] === 1 ? '' : 's'}`);
        });
        root.classList.toggle('solved', ctx.done());
      },
      key() {
        return false;
      },
    };
    return api;
  },
};

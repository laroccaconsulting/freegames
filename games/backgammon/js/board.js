// The board, drawn as SVG. Knows nothing about rules: app.js tells it what
// to show and hears back which point, bar or off-tray was tapped.
//
// Layout (engine point numbers, player 0's numbering): points 1-12 run along
// the bottom edge right to left... actually left to right as column 0-11
// increases point 12 → 1; points 13-24 run along the top edge, column 0-11
// giving point 13 → 24. The bar sits between columns 5 and 6 on both rows,
// and the off trays sit beyond column 11.

const NS = 'http://www.w3.org/2000/svg';
const P = 90; // column pitch
const BAR = 72; // bar width
const OFF = 66; // off-tray width
const RH = 320; // row height (edge to centre line)
const PAD = 22;
const R = P * 0.42; // checker radius
const SPACING = R * 1.7;
const MAX_SHOWN = 5;

const W = 12 * P + BAR + OFF;
const H = 2 * RH;
const BAR_X = 6 * P;
const OFF_X = 12 * P + BAR;

function node(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
}

// Column x for point index i (0-23, player 0's numbering).
function colOf(i) {
  return i < 12 ? 11 - i : i - 12;
}
function colX(c) {
  return c < 6 ? c * P : c * P + BAR;
}
function pointX(i) {
  const c = colOf(i);
  return colX(c) + P / 2;
}
const isBottom = (i) => i < 12;

export class Board {
  // onZone(zone): zone is 0-23, 'bar0', 'bar1', 'off0' or 'off1'.
  constructor(host, { onZone, onHover } = {}) {
    this.handlers = { onZone, onHover };
    this.svg = node('svg', { viewBox: `${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`, class: 'board', role: 'img' });
    node('rect', { x: -PAD, y: -PAD, width: W + 2 * PAD, height: H + 2 * PAD, rx: 26, class: 'frame' }, this.svg);
    node('rect', { x: 0, y: 0, width: W, height: H, rx: 10, class: 'felt' }, this.svg);
    node('rect', { x: BAR_X, y: 0, width: BAR, height: H, class: 'bar' }, this.svg);
    node('rect', { x: OFF_X, y: 0, width: OFF, height: H, rx: 8, class: 'off-tray' }, this.svg);
    node('line', { x1: 0, y1: H / 2, x2: BAR_X, y2: H / 2, class: 'centreline' }, this.svg);
    node('line', { x1: BAR_X + BAR, y1: H / 2, x2: W, y2: H / 2, class: 'centreline' }, this.svg);

    const points = node('g', { class: 'points' }, this.svg);
    for (let i = 0; i < 24; i++) {
      const c = colOf(i);
      const x0 = colX(c);
      const xMid = x0 + P / 2;
      const pt = i + 1; // point number, player 0's numbering
      const bottom = isBottom(i);
      const d = bottom ? `${x0},${H} ${x0 + P},${H} ${xMid},${H / 2}` : `${x0},0 ${x0 + P},0 ${xMid},${H / 2}`;
      const home = pt <= 6 || pt >= 19;
      node('polygon', { points: d, class: `point ${pt % 2 ? 'a' : 'b'} ${home ? 'home' : ''}` }, points);
    }

    this.checkers = node('g', { class: 'checkers' }, this.svg);
    this.targets = node('g', { class: 'targets' }, this.svg);

    // Transparent hit areas, one per zone.
    const hits = node('g', { class: 'hits' }, this.svg);
    for (let i = 0; i < 24; i++) {
      const c = colOf(i);
      const bottom = isBottom(i);
      node('rect', { x: colX(c), y: bottom ? H / 2 : 0, width: P, height: H / 2, class: 'hit', 'data-zone': i }, hits);
    }
    node('rect', { x: BAR_X, y: H / 2, width: BAR, height: H / 2, class: 'hit', 'data-zone': 'bar0' }, hits);
    node('rect', { x: BAR_X, y: 0, width: BAR, height: H / 2, class: 'hit', 'data-zone': 'bar1' }, hits);
    node('rect', { x: OFF_X, y: H / 2, width: OFF, height: H / 2, class: 'hit', 'data-zone': 'off0' }, hits);
    node('rect', { x: OFF_X, y: 0, width: OFF, height: H / 2, class: 'hit', 'data-zone': 'off1' }, hits);

    host.append(this.svg);
    this.bindInput();
  }

  drawStack(cx, edgeY, dir, n, owner, { selected = false, movable = false } = {}) {
    const shown = Math.min(n, MAX_SHOWN);
    for (let k = 0; k < shown; k++) {
      const cy = edgeY + dir * (R + k * SPACING);
      const top = k === shown - 1;
      const g = node('g', { class: `checker p${owner} ${selected && top ? 'selected' : ''} ${movable && top ? 'movable' : ''}`, transform: `translate(${cx},${cy})` }, this.checkers);
      node('circle', { r: R, class: 'checker-body' }, g);
      if (top && n > MAX_SHOWN) node('text', { class: 'checker-count', 'text-anchor': 'middle', dy: '0.35em' }, g).textContent = String(n);
    }
  }

  // view: { points: [{owner,count}]×24, bar: [n0,n1], off: [n0,n1],
  //   source, sources: Set, targets: Set, mover, interactive }
  render(view) {
    const { points, bar, off, source, sources = new Set(), targets = new Set(), mover, interactive } = view;
    this.checkers.replaceChildren();
    for (let i = 0; i < 24; i++) {
      const { owner, count } = points[i];
      if (!count) continue;
      const bottom = isBottom(i);
      this.drawStack(pointX(i), bottom ? H : 0, bottom ? -1 : 1, count, owner, { selected: source === i, movable: source == null && sources.has(i) });
    }
    const barXMid = BAR_X + BAR / 2;
    if (bar[0]) this.drawStack(barXMid, H, -1, bar[0], 0, { selected: source === 'bar' && mover === 0, movable: source == null && sources.has('bar') && mover === 0 });
    if (bar[1]) this.drawStack(barXMid, 0, 1, bar[1], 1, { selected: source === 'bar' && mover === 1, movable: source == null && sources.has('bar') && mover === 1 });
    const offXMid = OFF_X + OFF / 2;
    if (off[0]) this.drawStack(offXMid, H, -1, off[0], 0);
    if (off[1]) this.drawStack(offXMid, 0, 1, off[1], 1);

    this.targets.replaceChildren();
    for (const zone of targets) {
      if (zone === 'off') {
        const cx = offXMid;
        const cy = mover === 0 ? H - RH / 2 : RH / 2;
        node('circle', { cx, cy, r: 16, class: 'target' }, this.targets);
      } else {
        const bottom = isBottom(zone);
        const cx = pointX(zone);
        const cy = bottom ? H - RH * 0.35 : RH * 0.35;
        node('circle', { cx, cy, r: 16, class: 'target' }, this.targets);
      }
    }

    this.svg.classList.toggle('interactive', !!interactive);
    this.zoneTargets = targets;
  }

  bindInput() {
    let down = null;
    this.svg.addEventListener('pointerdown', (e) => {
      const zone = e.target.closest?.('[data-zone]')?.dataset.zone;
      down = zone === undefined ? null : { zone, x: e.clientX, y: e.clientY };
    });
    this.svg.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 20;
      const zone = down.zone;
      down = null;
      if (moved) return;
      const z = /^\d+$/.test(zone) ? Number(zone) : zone;
      this.handlers.onZone?.(z);
    });
  }
}

export { W, H };

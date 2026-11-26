// Shared constants and geometry for parts, the machine model and drawing.
// Kept free of imports from those modules so nothing imports in a circle.

export const MOTOR = { stall: 40, speed: 3 * Math.PI };
export const DRUM_R = 0.5;
export const GEAR_TEETH = { 1: 10, 2: 20, 3: 30 }; // the first release's sizes
/** Tooth counts on offer. Pitch radius is teeth / 10 cells. */
export const TEETH = [10, 15, 20, 25, 30, 40];
export const gearR = (g) => (g.teeth ?? (g.size ?? 1) * 10) / 10;
/** The gear on a peg in a layer (0 back, 1 front), or the first one there. */
export const gearOn = (parts, p, plane) => {
  const here = parts.filter((o) => o.type === 'gear' && o.p[0] === p[0] && o.p[1] === p[1]);
  return here.find((g) => (g.plane || 0) === (plane ?? 0)) || (plane == null ? here[0] : null) || here[0];
};

export const ITEM_INFO = {
  ball: { name: 'ball', r: 0.4, density: 1, friction: 0.6, restitution: 0.35 },
  steel: { name: 'steel ball', r: 0.4, density: 5, friction: 0.4, restitution: 0.15 },
  egg: { name: 'egg', r: 0.35, density: 0.8, friction: 0.6, restitution: 0.05, breakSpeed: 9 },
  crate: { name: 'crate', w: 0.9, h: 0.9, density: 0.6, friction: 0.7, restitution: 0.05 },
  heavy: { name: 'iron crate', w: 0.9, h: 0.9, density: 6, friction: 0.7, restitution: 0.02 },
  can: { name: 'can', w: 0.55, h: 1.1, density: 0.6, friction: 0.6, restitution: 0.1 },
};

export const key = (p) => `${p[0]},${p[1]}`;
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const rad = (deg) => (deg * Math.PI) / 180;

/** Distance from a point to a segment. */
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Lever end points [left end, right end] in world coordinates. */
export function leverEnds(part) {
  const a = rad(part.angle || 0);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y] = part.p;
  return [
    [x - c * part.l1, y - s * part.l1],
    [x + c * part.l2, y + s * part.l2],
  ];
}

/** The cup walls of a goal (left, right, bottom), as rects. */
export function cupWalls(goal) {
  if (!goal?.cup) return [];
  const t = 0.25;
  const { x, y, w, h } = goal;
  return [
    [x - t, y, t, h + t],
    [x + w, y, t, h + t],
    [x - t, y + h, w + 2 * t, t],
  ];
}

/** Snap a two-peg part's end to the peg nearest (wx, wy). */
export function dragEnd(part, which, [wx, wy]) {
  const q = [Math.round(wx), Math.round(wy)];
  const cur = part[which];
  if (q[0] === cur[0] && q[1] === cur[1]) return false;
  part[which] = q;
  return true;
}

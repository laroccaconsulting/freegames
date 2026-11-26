// Contraption's physics engine. Pure: no DOM, no randomness, fixed step, so
// the same machine always does the same thing (tests run levels with it).
//
// Units: one grid cell is 1 unit, y points down, angles are radians and a
// positive angular velocity turns clockwise on screen.
//
// Shapes are rounded convex polygons: { verts: [[x,y]...], radius } in the
// body's local frame. A circle is one vertex with a radius, a capsule two.
//
// Body kinds:
//   static     never moves (walls, ramps). A static body with `belt` has a
//              moving surface: speed = train velocity × k × r.
//   kinematic  follows motion(t) → { x, y, angle } (moving level pieces)
//   dynamic    free rigid body (items, weights)
//   rotor      turns about a fixed pivot with its train: angle = base + k·θ
//
// Trains are the simple-machine core: each is one degree of freedom θ shared
// by every axle in it (gears in mesh, chains, belts, parts on one peg), each
// axle turning at k·θ̇. Contact impulses on a rotor feed back into the train
// through k, so gearing down really does trade speed for torque.

export const GRAVITY = 40;
export const DT = 1 / 120;
const ITERATIONS = 10;
const SLOP = 0.01;
const BAUMGARTE = 0.25;
const MAX_BIAS = 6;
const SPECULATIVE = 0.12;
const RESTITUTION_THRESHOLD = 1.5;
const MAX_SPEED = 70;

// ---------- small vector helpers (arrays avoided in hot loops) ----------

const dot = (ax, ay, bx, by) => ax * bx + ay * by;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------- shapes ----------

/** Make a shape from local vertices (any winding) and a radius. */
export function makeShape(verts, radius = 0) {
  let pts = verts.map(([x, y]) => [x, y]);
  if (pts.length >= 3) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      area += x1 * y2 - x2 * y1;
    }
    if (area < 0) pts.reverse();
  }
  return { verts: pts, radius };
}

export const circle = (r, x = 0, y = 0) => makeShape([[x, y]], r);
export const capsule = (x1, y1, x2, y2, r) => makeShape([[x1, y1], [x2, y2]], r);
export const box = (w, h, cx = 0, cy = 0) =>
  makeShape([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], 0);

/** Area, centroid and second moment (about the centroid) per unit density. */
export function massProps(shape) {
  const { verts, radius: r } = shape;
  if (verts.length === 1) {
    const a = Math.PI * r * r;
    return { area: a, cx: verts[0][0], cy: verts[0][1], i: 0.5 * a * r * r };
  }
  if (verts.length === 2) {
    const [[x1, y1], [x2, y2]] = verts;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const rect = len * 2 * r;
    const caps = Math.PI * r * r;
    const a = rect + caps;
    // rectangle plus two half discs at distance len/2 (close enough)
    const i = (rect * (len * len + 4 * r * r)) / 12 + caps * (0.5 * r * r + (len * len) / 4);
    return { area: a, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, i };
  }
  let area = 0;
  let cx = 0;
  let cy = 0;
  let I = 0;
  const [ox, oy] = verts[0];
  for (let k = 1; k < verts.length - 1; k++) {
    const e1x = verts[k][0] - ox;
    const e1y = verts[k][1] - oy;
    const e2x = verts[k + 1][0] - ox;
    const e2y = verts[k + 1][1] - oy;
    const d = cross(e1x, e1y, e2x, e2y);
    const ta = d / 2;
    area += ta;
    cx += (ta * (e1x + e2x)) / 3;
    cy += (ta * (e1y + e2y)) / 3;
    const intx2 = e1x * e1x + e2x * e1x + e2x * e2x;
    const inty2 = e1y * e1y + e2y * e1y + e2y * e2y;
    I += (0.25 / 3) * d * (intx2 + inty2);
  }
  cx /= area;
  cy /= area;
  // I is about verts[0]; shift to the centroid
  I -= area * (cx * cx + cy * cy);
  return { area, cx: cx + ox, cy: cy + oy, i: I };
}

// ---------- world-space shapes ----------

function toWorld(body) {
  const { shape } = body;
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  const n = shape.verts.length;
  const w = body.world || (body.world = { verts: new Array(n), normals: new Array(n >= 2 ? n : 0), count: n, radius: shape.radius, minX: 0, minY: 0, maxX: 0, maxY: 0 });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const [lx, ly] = shape.verts[i];
    const x = body.x + c * lx - s * ly;
    const y = body.y + s * lx + c * ly;
    w.verts[i] = [x, y];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (n === 2) {
    const ex = w.verts[1][0] - w.verts[0][0];
    const ey = w.verts[1][1] - w.verts[0][1];
    const l = Math.hypot(ex, ey) || 1;
    w.normals[0] = [ey / l, -ex / l];
    w.normals[1] = [-ey / l, ex / l];
  } else if (n > 2) {
    for (let i = 0; i < n; i++) {
      const a = w.verts[i];
      const b = w.verts[(i + 1) % n];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const l = Math.hypot(ex, ey) || 1;
      w.normals[i] = [ey / l, -ex / l];
    }
  }
  const r = shape.radius;
  w.minX = minX - r;
  w.minY = minY - r;
  w.maxX = maxX + r;
  w.maxY = maxY + r;
  return w;
}

/** World-space polygon for a shape placed at (x, y, angle); for checks outside a world. */
export function placeShape(shape, x = 0, y = 0, angle = 0) {
  return toWorld({ shape, x, y, angle });
}

// ---------- collision (after Box2D v3's manifold functions) ----------

function segmentDistance(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const dd1 = d1x * d1x + d1y * d1y;
  const dd2 = d2x * d2x + d2y * d2y;
  const rd1 = rx * d1x + ry * d1y;
  const rd2 = rx * d2x + ry * d2y;
  const eps = 1e-12;
  let f1 = 0;
  let f2 = 0;
  if (dd1 < eps || dd2 < eps) {
    if (dd1 >= eps) f1 = clamp(-rd1 / dd1, 0, 1);
    else if (dd2 >= eps) f2 = clamp(rd2 / dd2, 0, 1);
  } else {
    const d12 = d1x * d2x + d1y * d2y;
    const denom = dd1 * dd2 - d12 * d12;
    f1 = denom !== 0 ? clamp((d12 * rd2 - rd1 * dd2) / denom, 0, 1) : 0;
    f2 = (d12 * f1 + rd2) / dd2;
    if (f2 < 0) {
      f2 = 0;
      f1 = clamp(-rd1 / dd1, 0, 1);
    } else if (f2 > 1) {
      f2 = 1;
      f1 = clamp((d12 - rd1) / dd1, 0, 1);
    }
  }
  const c1x = p1x + f1 * d1x;
  const c1y = p1y + f1 * d1y;
  const c2x = p2x + f2 * d2x;
  const c2y = p2y + f2 * d2y;
  return { f1, f2, c1x, c1y, c2x, c2y, d2: (c2x - c1x) ** 2 + (c2y - c1y) ** 2 };
}

function circles(A, B) {
  const [ax, ay] = A.verts[0];
  const [bx, by] = B.verts[0];
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  const sep = d - A.radius - B.radius;
  if (sep > SPECULATIVE) return null;
  const nx = d > 1e-9 ? dx / d : 0;
  const ny = d > 1e-9 ? dy / d : 1;
  const cAx = ax + A.radius * nx;
  const cAy = ay + A.radius * ny;
  const cBx = bx - B.radius * nx;
  const cBy = by - B.radius * ny;
  return { nx, ny, points: [{ x: (cAx + cBx) / 2, y: (cAy + cBy) / 2, sep, id: 0 }] };
}

// Polygon A (2+ vertices) against circle B. Normal points from A to B.
function polyCircle(A, B) {
  const [cx, cy] = B.verts[0];
  const radius = A.radius + B.radius;
  let idx = 0;
  let separation = -Infinity;
  for (let i = 0; i < A.count; i++) {
    const [vx, vy] = A.verts[i];
    const [nx, ny] = A.normals[i];
    const s = dot(nx, ny, cx - vx, cy - vy);
    if (s > separation) {
      separation = s;
      idx = i;
    }
  }
  if (separation - radius > SPECULATIVE) return null;
  const [v1x, v1y] = A.verts[idx];
  const [v2x, v2y] = A.verts[idx + 1 < A.count ? idx + 1 : 0];
  const u1 = dot(cx - v1x, cy - v1y, v2x - v1x, v2y - v1y);
  const u2 = dot(cx - v2x, cy - v2y, v1x - v2x, v1y - v2y);
  let nx;
  let ny;
  let cAx;
  let cAy;
  if ((u1 < 0 || u2 < 0) && separation > 1e-6) {
    const vx = u1 < 0 ? v1x : v2x;
    const vy = u1 < 0 ? v1y : v2y;
    const dx = cx - vx;
    const dy = cy - vy;
    const d = Math.hypot(dx, dy);
    if (d - radius > SPECULATIVE) return null;
    nx = dx / d;
    ny = dy / d;
    cAx = vx + A.radius * nx;
    cAy = vy + A.radius * ny;
  } else {
    [nx, ny] = A.normals[idx];
    const s = dot(cx - v1x, cy - v1y, nx, ny);
    cAx = cx + (A.radius - s) * nx;
    cAy = cy + (A.radius - s) * ny;
  }
  const cBx = cx - B.radius * nx;
  const cBy = cy - B.radius * ny;
  const sep = dot(cBx - cAx, cBy - cAy, nx, ny);
  return { nx, ny, points: [{ x: (cAx + cBx) / 2, y: (cAy + cBy) / 2, sep, id: idx }] };
}

function maxSeparation(P, Q) {
  let best = 0;
  let max = -Infinity;
  for (let i = 0; i < P.count; i++) {
    const [nx, ny] = P.normals[i];
    const [vx, vy] = P.verts[i];
    let si = Infinity;
    for (let j = 0; j < Q.count; j++) {
      const s = dot(nx, ny, Q.verts[j][0] - vx, Q.verts[j][1] - vy);
      if (s < si) si = s;
    }
    if (si > max) {
      max = si;
      best = i;
    }
  }
  return [best, max];
}

function clipPolygons(A, B, edgeA, edgeB, flip) {
  const P1 = flip ? B : A;
  const P2 = flip ? A : B;
  const i11 = flip ? edgeB : edgeA;
  const i12 = i11 + 1 < P1.count ? i11 + 1 : 0;
  const i21 = flip ? edgeA : edgeB;
  const i22 = i21 + 1 < P2.count ? i21 + 1 : 0;
  const [nx, ny] = P1.normals[i11];
  const [v11x, v11y] = P1.verts[i11];
  const [v12x, v12y] = P1.verts[i12];
  const [v21x, v21y] = P2.verts[i21];
  const [v22x, v22y] = P2.verts[i22];
  const tx = -ny;
  const ty = nx;
  const lower1 = 0;
  const upper1 = dot(v12x - v11x, v12y - v11y, tx, ty);
  const upper2 = dot(v21x - v11x, v21y - v11y, tx, ty);
  const lower2 = dot(v22x - v11x, v22y - v11y, tx, ty);
  let lx = v22x;
  let ly = v22y;
  let ux = v21x;
  let uy = v21y;
  const span = upper2 - lower2;
  if (lower2 < lower1 && span > 1e-9) {
    const t = (lower1 - lower2) / span;
    lx = v22x + t * (v21x - v22x);
    ly = v22y + t * (v21y - v22y);
  }
  if (upper2 > upper1 && span > 1e-9) {
    const t = (upper1 - lower2) / span;
    ux = v22x + t * (v21x - v22x);
    uy = v22y + t * (v21y - v22y);
  }
  const sl = dot(lx - v11x, ly - v11y, nx, ny);
  const su = dot(ux - v11x, uy - v11y, nx, ny);
  const r = P1.radius + P2.radius;
  const kl = 0.5 * (P1.radius - P2.radius - sl);
  const ku = 0.5 * (P1.radius - P2.radius - su);
  const lower = { x: lx + kl * nx, y: ly + kl * ny, sep: sl - r };
  const upper = { x: ux + ku * nx, y: uy + ku * ny, sep: su - r };
  const points = [];
  if (!flip) {
    lower.id = i11 * 16 + i22;
    upper.id = i12 * 16 + i21 + 256;
    if (lower.sep <= SPECULATIVE) points.push(lower);
    if (upper.sep <= SPECULATIVE) points.push(upper);
    return points.length ? { nx, ny, points } : null;
  }
  upper.id = i21 * 16 + i12 + 512;
  lower.id = i22 * 16 + i11 + 768;
  if (upper.sep <= SPECULATIVE) points.push(upper);
  if (lower.sep <= SPECULATIVE) points.push(lower);
  return points.length ? { nx: -nx, ny: -ny, points } : null;
}

function polygons(A, B) {
  let [edgeA, sepA] = maxSeparation(A, B);
  let [edgeB, sepB] = maxSeparation(B, A);
  const radius = A.radius + B.radius;
  if (sepA > SPECULATIVE + radius || sepB > SPECULATIVE + radius) return null;
  let flip;
  if (sepB > sepA + 0.1 * SLOP) {
    flip = true;
    const [sx, sy] = B.normals[edgeB];
    let min = Infinity;
    for (let i = 0; i < A.count; i++) {
      const d = dot(sx, sy, A.normals[i][0], A.normals[i][1]);
      if (d < min) {
        min = d;
        edgeA = i;
      }
    }
  } else {
    flip = false;
    const [sx, sy] = A.normals[edgeA];
    let min = Infinity;
    for (let i = 0; i < B.count; i++) {
      const d = dot(sx, sy, B.normals[i][0], B.normals[i][1]);
      if (d < min) {
        min = d;
        edgeB = i;
      }
    }
  }
  if (Math.max(sepA, sepB) > 0.1 * SLOP) {
    const i11 = edgeA;
    const i12 = edgeA + 1 < A.count ? edgeA + 1 : 0;
    const i21 = edgeB;
    const i22 = edgeB + 1 < B.count ? edgeB + 1 : 0;
    const [v11x, v11y] = A.verts[i11];
    const [v12x, v12y] = A.verts[i12];
    const [v21x, v21y] = B.verts[i21];
    const [v22x, v22y] = B.verts[i22];
    const r = segmentDistance(v11x, v11y, v12x, v12y, v21x, v21y, v22x, v22y);
    const endA = r.f1 === 0 || r.f1 === 1;
    const endB = r.f2 === 0 || r.f2 === 1;
    if (endA && endB) {
      // vertex against vertex: one point along the line between them
      const d = Math.sqrt(r.d2);
      if (d - radius > SPECULATIVE) return null;
      if (d < 1e-9) return clipPolygons(A, B, edgeA, edgeB, flip);
      const nx = (r.c2x - r.c1x) / d;
      const ny = (r.c2y - r.c1y) / d;
      const cAx = r.c1x + A.radius * nx;
      const cAy = r.c1y + A.radius * ny;
      const cBx = r.c2x - B.radius * nx;
      const cBy = r.c2y - B.radius * ny;
      const ia = r.f1 === 0 ? i11 : i12;
      const ib = r.f2 === 0 ? i21 : i22;
      return { nx, ny, points: [{ x: (cAx + cBx) / 2, y: (cAy + cBy) / 2, sep: d - radius, id: 1024 + ia * 16 + ib }] };
    }
  }
  return clipPolygons(A, B, edgeA, edgeB, flip);
}

/** Contact manifold between two world shapes (from toWorld/placeShape), normal A→B. */
export function collide(A, B) {
  if (A.count === 1 && B.count === 1) return circles(A, B);
  if (B.count === 1) return polyCircle(A, B);
  if (A.count === 1) {
    const m = polyCircle(B, A);
    if (!m) return null;
    m.nx = -m.nx;
    m.ny = -m.ny;
    return m;
  }
  return polygons(A, B);
}

/** Deepest overlap between two world shapes (negative = overlapping), or Infinity. */
export function overlap(A, B) {
  const m = collide(A, B);
  if (!m) return Infinity;
  return Math.min(...m.points.map((p) => p.sep));
}

// ---------- world ----------

/**
 * Make an empty world. Add bodies with addBody and trains with addTrain.
 */
export function makeWorld({ gravity = GRAVITY } = {}) {
  return { bodies: [], trains: [], gravity, time: 0, contacts: [], cache: new Map(), nextId: 1, events: [] };
}

/**
 * Add a body. opts: kind, shape, x, y, angle, density, friction,
 * restitution, plus for rotors: train, k, base (angle at θ = 0); for
 * kinematic: motion(t); for belts: belt { train, k, r }. Anything else
 * (tag, item, fragile…) is kept on the body for the game to read.
 */
export function addBody(world, opts) {
  const b = {
    id: world.nextId++,
    kind: 'static',
    x: 0,
    y: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    w: 0,
    density: 1,
    friction: 0.5,
    restitution: 0.1,
    linearDamping: 0.02,
    angularDamping: 0.1,
    invMass: 0,
    invI: 0,
    mass: 0,
    I: 0,
    group: 0, // bodies sharing a non-zero group never collide
    ...opts,
  };
  if (b.kind === 'dynamic') {
    // Recentre the shape on its centroid so the body origin is its centre of mass.
    const mp = massProps(b.shape);
    if (Math.abs(mp.cx) > 1e-9 || Math.abs(mp.cy) > 1e-9) {
      b.shape = { verts: b.shape.verts.map(([x, y]) => [x - mp.cx, y - mp.cy]), radius: b.shape.radius };
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      b.x += c * mp.cx - s * mp.cy;
      b.y += s * mp.cx + c * mp.cy;
    }
    b.mass = mp.area * b.density;
    b.I = mp.i * b.density;
    b.invMass = 1 / b.mass;
    b.invI = b.I > 0 ? 1 / b.I : 0;
  } else if (b.kind === 'rotor') {
    // Shape is in pivot coordinates; x, y is the pivot.
    const mp = massProps(b.shape);
    b.mass = mp.area * b.density;
    b.com = [mp.cx, mp.cy];
    b.I = (mp.i + mp.area * (mp.cx * mp.cx + mp.cy * mp.cy)) * b.density;
    b.base ??= 0;
    b.k ??= 1;
  }
  toWorld(b);
  world.bodies.push(b);
  return b;
}

/**
 * Add a train: one degree of freedom. inertia is Σk²I of its axles (rotor
 * bodies added later contribute their own I through `k`, so pass only the
 * extra inertia of gears, drums and motor rotors). motors: [{ k, stall,
 * speed, dir, delay }]. jammed trains never move.
 */
export function addTrain(world, { inertia = 0, motors = [], damping = 0.02, jammed = false } = {}) {
  const t = { id: world.trains.length, inertia, motors, damping, jammed, theta: 0, v: 0, invI: 0, torque: 0 };
  world.trains.push(t);
  return t;
}

function finishTrains(world) {
  for (const t of world.trains) {
    let I = t.inertia;
    for (const b of world.bodies) if (b.kind === 'rotor' && b.train === t) I += b.k * b.k * b.I;
    t.I = Math.max(I, 1e-3);
    t.invI = t.jammed ? 0 : 1 / t.I;
  }
  world.ready = true;
}

function poseRotor(b) {
  b.angle = b.base + b.k * b.train.theta;
}

// Velocity of a body's material at world point (px, py).
function velAt(b, px, py, out) {
  if (b.kind === 'dynamic' || b.kind === 'kinematic') {
    out[0] = b.vx - b.w * (py - b.y);
    out[1] = b.vy + b.w * (px - b.x);
  } else if (b.kind === 'rotor') {
    const w = b.k * b.train.v;
    out[0] = -w * (py - b.y);
    out[1] = w * (px - b.x);
  } else {
    out[0] = 0;
    out[1] = 0;
  }
  return out;
}

// ---------- contacts ----------

function canCollide(a, b) {
  if (a.sensor || b.sensor) return false;
  const movingA = a.kind === 'dynamic' || a.kind === 'rotor';
  const movingB = b.kind === 'dynamic' || b.kind === 'rotor';
  if (!movingA && !movingB) return false;
  if (a.group && a.group === b.group) return false;
  if (a.kind === 'rotor' && b.kind === 'rotor' && a.train === b.train) return false;
  if (a.belt && b.kind === 'rotor' && a.belt.train === b.train) return false;
  if (b.belt && a.kind === 'rotor' && b.belt.train === a.train) return false;
  if (a.mask && !a.mask(b)) return false;
  if (b.mask && !b.mask(a)) return false;
  return true;
}

// Per side of a contact point: how an impulse along a direction moves it.
// Returns the scalar coefficient c so that the side's velocity along d is
// linear + c·(generalised velocity); for dynamic bodies that is the usual
// r×d with ω.
function side(b, px, py, nx, ny, sign) {
  const s = { b, rx: px - b.x, ry: py - b.y, beltX: 0, beltY: 0 };
  if (b.belt) {
    // surface moves along perp(outward normal) × k·r·θ̇
    const ox = sign * nx;
    const oy = sign * ny;
    s.beltX = -oy * b.belt.k * b.belt.r;
    s.beltY = ox * b.belt.k * b.belt.r;
  }
  return s;
}

function coef(s, dx, dy) {
  const b = s.b;
  if (b.kind === 'dynamic' || b.kind === 'rotor') return cross(s.rx, s.ry, dx, dy) * (b.kind === 'rotor' ? b.k : 1);
  if (b.belt) return dot(s.beltX, s.beltY, dx, dy);
  return 0;
}

function invEff(s, c) {
  const b = s.b;
  if (b.kind === 'dynamic') return b.invMass + b.invI * c * c;
  if (b.kind === 'rotor') return b.train.invI * c * c;
  if (b.belt) return b.belt.train.invI * c * c;
  return 0;
}

function velAlong(s, dx, dy, c, tmp) {
  const b = s.b;
  if (b.kind === 'rotor') return c * b.train.v;
  if (b.belt) return c * b.belt.train.v;
  if (b.kind === 'dynamic' || b.kind === 'kinematic') {
    velAt(b, b.x + s.rx, b.y + s.ry, tmp);
    return tmp[0] * dx + tmp[1] * dy;
  }
  return 0;
}

function push(s, dx, dy, c, lambda) {
  const b = s.b;
  if (b.kind === 'dynamic') {
    b.vx += b.invMass * lambda * dx;
    b.vy += b.invMass * lambda * dy;
    b.w += b.invI * c * lambda;
  } else if (b.kind === 'rotor') {
    b.train.v += b.train.invI * c * lambda;
  } else if (b.belt) {
    b.belt.train.v += b.belt.train.invI * c * lambda;
  }
}

function findContacts(world) {
  const { bodies } = world;
  const old = world.cache;
  const fresh = new Map();
  const list = [];
  for (const b of bodies) if (b.kind !== 'static' || !b.world) toWorld(b);
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    const wa = a.world;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const wb = b.world;
      if (wa.maxX + SPECULATIVE < wb.minX || wb.maxX + SPECULATIVE < wa.minX || wa.maxY + SPECULATIVE < wb.minY || wb.maxY + SPECULATIVE < wa.minY) continue;
      if (!canCollide(a, b)) continue;
      const m = collide(wa, wb);
      if (!m) continue;
      const friction = Math.sqrt(a.friction * b.friction);
      const restitution = Math.max(a.restitution, b.restitution);
      const rolling = Math.max(a.rolling || 0, b.rolling || 0);
      for (const p of m.points) {
        const key = a.id * 1e7 + b.id * 4096 + p.id;
        const prev = old.get(key);
        const c = { a, b, nx: m.nx, ny: m.ny, x: p.x, y: p.y, sep: p.sep, friction, restitution, jn: prev ? prev.jn : 0, jt: prev ? prev.jt : 0, jr: prev ? prev.jr : 0, rolling, key, maxJn: 0 };
        fresh.set(key, c);
        list.push(c);
      }
    }
  }
  world.cache = fresh;
  world.contacts = list;
  return list;
}

const tmp = [0, 0];

function prepare(c, dt) {
  const { nx, ny } = c;
  const tx = -ny;
  const ty = nx;
  c.sa = side(c.a, c.x, c.y, nx, ny, 1);
  c.sb = side(c.b, c.x, c.y, nx, ny, -1);
  c.can = coef(c.sa, nx, ny);
  c.cbn = coef(c.sb, nx, ny);
  c.cat = coef(c.sa, tx, ty);
  c.cbt = coef(c.sb, tx, ty);
  const kn = invEff(c.sa, c.can) + invEff(c.sb, c.cbn);
  const kt = invEff(c.sa, c.cat) + invEff(c.sb, c.cbt);
  c.mn = kn > 0 ? 1 / kn : 0;
  c.mt = kt > 0 ? 1 / kt : 0;
  const vn = velAlong(c.sb, nx, ny, c.cbn, tmp) - velAlong(c.sa, nx, ny, c.can, tmp);
  c.vn0 = vn;
  if (c.sep > 0) c.bias = -c.sep / dt;
  else c.bias = Math.min(MAX_BIAS, (BAUMGARTE / dt) * Math.max(0, -c.sep - SLOP));
}

const spinInv = (b) => (b.kind === 'dynamic' ? b.invI : 0);

function warmStart(c) {
  const { nx, ny } = c;
  const tx = -ny;
  const ty = nx;
  if (c.jn) {
    push(c.sa, nx, ny, c.can, -c.jn);
    push(c.sb, nx, ny, c.cbn, c.jn);
  }
  if (c.jt) {
    push(c.sa, tx, ty, c.cat, -c.jt);
    push(c.sb, tx, ty, c.cbt, c.jt);
  }
  if (c.jr) {
    c.a.w -= spinInv(c.a) * c.jr;
    c.b.w += spinInv(c.b) * c.jr;
  }
}

function solveContact(c, useBias) {
  const { nx, ny } = c;
  const tx = -ny;
  const ty = nx;
  // rolling resistance: an angular impulse, capped by the normal impulse
  if (c.rolling && c.jn > 0) {
    const ia = spinInv(c.a);
    const ib = spinInv(c.b);
    if (ia + ib > 0) {
      const rel = (c.b.kind === 'dynamic' ? c.b.w : 0) - (c.a.kind === 'dynamic' ? c.a.w : 0);
      const max = c.rolling * c.jn;
      const old = c.jr;
      c.jr = clamp(old - rel / (ia + ib), -max, max);
      const d = c.jr - old;
      c.a.w -= ia * d;
      c.b.w += ib * d;
    }
  }
  // friction (targets zero relative surface speed, belts included)
  {
    const vt = velAlong(c.sb, tx, ty, c.cbt, tmp) - velAlong(c.sa, tx, ty, c.cat, tmp);
    const max = c.friction * c.jn;
    const old = c.jt;
    c.jt = clamp(old - c.mt * vt, -max, max);
    const d = c.jt - old;
    if (d) {
      push(c.sa, tx, ty, c.cat, -d);
      push(c.sb, tx, ty, c.cbt, d);
    }
  }
  {
    const vn = velAlong(c.sb, nx, ny, c.cbn, tmp) - velAlong(c.sa, nx, ny, c.can, tmp);
    const bias = useBias ? c.bias : Math.min(c.bias, 0);
    const old = c.jn;
    c.jn = Math.max(0, old - c.mn * (vn - bias));
    const d = c.jn - old;
    if (d) {
      push(c.sa, nx, ny, c.can, -d);
      push(c.sb, nx, ny, c.cbn, d);
    }
    if (c.jn > c.maxJn) c.maxJn = c.jn;
  }
}

function restitute(c) {
  if (c.restitution === 0 || c.vn0 > -RESTITUTION_THRESHOLD || c.maxJn === 0) return;
  const { nx, ny } = c;
  const vn = velAlong(c.sb, nx, ny, c.cbn, tmp) - velAlong(c.sa, nx, ny, c.can, tmp);
  const old = c.jn;
  c.jn = Math.max(0, old - c.mn * (vn + c.restitution * c.vn0));
  const d = c.jn - old;
  if (d) {
    push(c.sa, nx, ny, c.can, -d);
    push(c.sb, nx, ny, c.cbn, d);
  }
}

// ---------- stepping ----------

// Gauss–Seidel step for a train's motors: the step's impulse P should equal
// dt·(A − B·v) at the final speed v.
function solveMotor(t, dt) {
  if (t.jammed || !t.B) return;
  const d = (dt * (t.A - t.B * t.v) - t.P) / (1 + dt * t.B * t.invI);
  t.P += d;
  t.v += t.invI * d;
}

/** Motor torque on its own axle at axle speed w: linear from stall to zero at top speed. */
export function motorTorque(m, w) {
  return m.dir * m.stall * (1 - (m.dir * w) / m.speed);
}

/** Advance the world by one fixed step. Returns the contacts used. */
export function step(world, dt = DT) {
  if (!world.ready) finishTrains(world);
  const { bodies, trains, gravity } = world;
  const t0 = world.time;
  const t1 = t0 + dt;

  // kinematic bodies: velocity from where they will be
  for (const b of bodies) {
    if (b.kind !== 'kinematic' || !b.motion) continue;
    const p0 = b.motion(t0);
    const p1 = b.motion(t1);
    b.x = p0.x;
    b.y = p0.y;
    b.angle = p0.angle || 0;
    b.vx = (p1.x - p0.x) / dt;
    b.vy = (p1.y - p0.y) / dt;
    let da = (p1.angle || 0) - (p0.angle || 0);
    b.w = da / dt;
  }

  const contacts = findContacts(world);

  // forces
  for (const b of bodies) {
    if (b.kind !== 'dynamic') continue;
    b.vy += gravity * dt;
    const ld = 1 / (1 + dt * b.linearDamping);
    const ad = 1 / (1 + dt * b.angularDamping);
    b.vx *= ld;
    b.vy *= ld;
    b.w *= ad;
  }
  for (const t of trains) {
    if (t.jammed) {
      t.v = 0;
      continue;
    }
    // gravity on every rotor in the train, as a torque on θ
    let F = 0;
    for (const b of bodies) {
      if (b.kind !== 'rotor' || b.train !== t || !b.mass) continue;
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      const rx = c * b.com[0] - s * b.com[1];
      F += b.k * rx * b.mass * gravity; // (r × (0, m g)) = rx·m·g
    }
    // motors: a linear torque–speed curve τ = A − B·v, solved together with
    // the contacts below (a stiff motor integrated on its own would look far
    // weaker than it is once the load pushes back)
    let A = 0;
    let B = t.damping;
    for (const m of t.motors) {
      if (t0 < (m.delay || 0)) continue;
      A += m.k * m.dir * m.stall;
      B += (m.k * m.k * m.stall) / m.speed;
    }
    t.A = A;
    t.B = B;
    t.P = 0;
    t.v += dt * t.invI * F;
  }

  for (const c of contacts) prepare(c, dt);
  for (const c of contacts) warmStart(c);
  for (let it = 0; it < ITERATIONS; it++) {
    for (const t of trains) solveMotor(t, dt);
    for (const c of contacts) solveContact(c, true);
  }
  for (const t of trains) solveMotor(t, dt);
  for (const t of trains) t.torque = t.P / dt;
  for (const c of contacts) restitute(c);

  // integrate positions
  for (const b of bodies) {
    if (b.kind === 'dynamic') {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) {
        b.vx *= MAX_SPEED / sp;
        b.vy *= MAX_SPEED / sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.w * dt;
    } else if (b.kind === 'kinematic' && b.motion) {
      const p = b.motion(t1);
      b.x = p.x;
      b.y = p.y;
      b.angle = p.angle || 0;
    }
  }
  for (const t of trains) t.theta += t.v * dt;
  for (const b of bodies) if (b.kind === 'rotor') poseRotor(b);
  world.time = t1;
  return contacts;
}

/** Pose rotors for the trains' current θ (call after building a world). */
export function settle(world) {
  if (!world.ready) finishTrains(world);
  for (const b of world.bodies) {
    if (b.kind === 'rotor') poseRotor(b);
    if (b.kind === 'kinematic' && b.motion) {
      const p = b.motion(world.time);
      b.x = p.x;
      b.y = p.y;
      b.angle = p.angle || 0;
    }
    toWorld(b);
  }
}

export { toWorld };

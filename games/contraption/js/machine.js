// The machine model: parts on a pegboard → physics bodies and trains, the
// placement rules, and a run that reports win or failure. Pure (no DOM), so
// the tests run every level's reference solution through it.
//
// A part is plain data, saved as is:
//   { id, type: 'ramp' | 'bouncer' | 'conveyor', a: [x, y], b: [x, y] }
//   { id, type: 'lever', p: [x, y], angle (degrees), l1, l2 }   arms either side of the fulcrum
//   { id, type: 'weight', p }
//   { id, type: 'motor', p, dir: 1 (clockwise) | -1, delay (seconds) }
//   { id, type: 'gear', p, size: 1 | 2 }   size is the pitch radius in cells
//   { id, type: 'chain', a, b }            between two gears' pegs
// Fixed parts (given by the level) carry fixed: true.

import { makeWorld, addBody, addTrain, settle, step, circle, capsule, box, makeShape, placeShape, overlap, DT } from './physics.js';

export const MOTOR = { stall: 40, speed: 3 * Math.PI };
export const DRUM_R = 0.5;
export const GEAR_TEETH = { 1: 10, 2: 20, 3: 30 };

export const PART_TYPES = ['ramp', 'lever', 'weight', 'conveyor', 'motor', 'gear', 'chain', 'bouncer'];

export const PART_INFO = {
  ramp: { name: 'Ramp', blurb: 'A fixed plank between two pegs.', physics: 'An inclined plane: the steeper it is, the faster things roll or slide down it.', tip: 'Leave the bottom end pointing up a little and a ball leaves it like a ski jump.' },
  lever: { name: 'Lever', blurb: 'A bar that turns freely on its fulcrum peg.', physics: 'A lever trades distance for force: the long arm moves farther and faster, the short arm pushes harder.', tip: 'Drop something heavy on the short arm to throw something light off the long one.' },
  weight: { name: 'Weight', blurb: 'A heavy iron block that falls when the machine starts.', physics: 'Weight is force: a block six times heavier than a crate lands six times harder.', tip: 'Put it above a lever to make a catapult.' },
  conveyor: { name: 'Conveyor', blurb: 'A belt around two drums. Idle until something turns a drum.', physics: 'Friction carries flat things along the belt. A ball rolls back down a sloped belt: rolling needs no grip.', tip: 'Put a motor on either drum peg.' },
  motor: { name: 'Motor', blurb: 'Turns whatever shares its peg: a drum, a gear or a lever.', physics: 'Strongest when stalled, weakest at top speed (one and a half turns a second). Gear it down for more push.', tip: 'Tap it to change direction or set a start delay.' },
  gear: { name: 'Gear', blurb: 'Small, medium or large (radius 1, 2 or 3). Gears whose rims touch mesh.', physics: 'Meshed gears turn opposite ways. Small driving large: half the speed, twice the torque.', tip: 'Gears sit behind the board, so items pass in front of them.' },
  chain: { name: 'Chain', blurb: 'Links two gears that are apart.', physics: 'A chain keeps the direction and the same ratio as meshing: sizes set the speed.', tip: 'Tap one gear, then the other.' },
  bouncer: { name: 'Bouncer', blurb: 'A springy pad between two pegs.', physics: 'Hits it hard and it gives back almost all of the speed, mirrored across the pad.', tip: 'Angle it to turn a fall into a throw.' },
};

export const ITEM_INFO = {
  ball: { name: 'ball', r: 0.4, density: 1, friction: 0.6, restitution: 0.35 },
  steel: { name: 'steel ball', r: 0.4, density: 5, friction: 0.4, restitution: 0.15 },
  egg: { name: 'egg', r: 0.35, density: 0.8, friction: 0.6, restitution: 0.05, breakSpeed: 9 },
  crate: { name: 'crate', w: 0.9, h: 0.9, density: 0.6, friction: 0.7, restitution: 0.05 },
  heavy: { name: 'iron crate', w: 0.9, h: 0.9, density: 6, friction: 0.7, restitution: 0.02 },
  can: { name: 'can', w: 0.55, h: 1.1, density: 0.6, friction: 0.6, restitution: 0.1 },
};

const LIMITS = { ramp: [1, 10], bouncer: [1, 4], conveyor: [2, 12], chain: [0, 20] };
const LEVER_ARM = [0.5, 6];

// ---------- geometry helpers ----------

export const key = (p) => `${p[0]},${p[1]}`;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rad = (deg) => (deg * Math.PI) / 180;

export function rectShape([x, y, w, h]) {
  return placeShape(box(w, h), x + w / 2, y + h / 2);
}
function polyShape(pts) {
  return placeShape(makeShape(pts, 0));
}
export function zoneShape(z) {
  return Array.isArray(z) ? rectShape(z) : z.poly ? polyShape(z.poly) : rectShape(z.rect);
}
const inRect = ([px, py], [x, y, w, h]) => px >= x && px <= x + w && py >= y && py <= y + h;
function inPoly([px, py], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inZone(p, z) {
  if (Array.isArray(z)) return inRect(p, z);
  if (z.poly) return inPoly(p, z.poly);
  return inRect(p, z.rect);
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
  if (!goal.cup) return [];
  const t = 0.25;
  const { x, y, w, h } = goal;
  return [
    [x - t, y, t, h + t],
    [x + w, y, t, h + t],
    [x - t, y + h, w + 2 * t, t],
  ];
}

/** World-space shape a part occupies on the front layer (or the gear disc). */
export function partShape(part) {
  switch (part.type) {
    case 'ramp':
      return placeShape(capsule(part.a[0], part.a[1], part.b[0], part.b[1], 0.15));
    case 'bouncer':
      return placeShape(capsule(part.a[0], part.a[1], part.b[0], part.b[1], 0.2));
    case 'conveyor':
      return placeShape(capsule(part.a[0], part.a[1], part.b[0], part.b[1], DRUM_R));
    case 'lever': {
      const [e1, e2] = leverEnds(part);
      return placeShape(capsule(e1[0], e1[1], e2[0], e2[1], 0.14));
    }
    case 'weight':
      return placeShape(box(0.9, 0.9), part.p[0], part.p[1]);
    case 'gear':
      return placeShape(circle(part.size), part.p[0], part.p[1]);
    case 'motor':
      return placeShape(circle(0.45), part.p[0], part.p[1]);
    default:
      return null;
  }
}

export function itemShape(item) {
  const info = ITEM_INFO[item.type];
  return info.r ? circle(info.r) : box(info.w, info.h);
}

/** The pegs a part sits on (for moving and hit-testing). */
export function partPegs(part) {
  if (part.a) return [part.a, part.b];
  return [part.p];
}

// ---------- axles and trains ----------

/**
 * Group parts into axles (one per peg with something that turns) and axles
 * into trains with each axle's speed ratio k. Returns
 *   { axles: Map(key → axle), trains: [{ axles, jammed, motors }] }
 * axle: { p, gear, motor, drums: [conveyor], levers: [lever], k, train }
 */
export function analyse(parts) {
  const axles = new Map();
  const axle = (p) => {
    const k = key(p);
    if (!axles.has(k)) axles.set(k, { p, gear: null, motor: null, drums: [], levers: [], links: [], k: 0, train: -1 });
    return axles.get(k);
  };
  for (const part of parts) {
    if (part.type === 'gear') axle(part.p).gear = part;
    else if (part.type === 'motor') axle(part.p).motor = part;
    else if (part.type === 'lever') axle(part.p).levers.push(part);
    else if (part.type === 'conveyor') {
      axle(part.a).drums.push(part);
      axle(part.b).drums.push(part);
    }
  }
  const list = [...axles.values()];
  const link = (A, B, ratio, via) => {
    A.links.push({ to: B, ratio, via });
    B.links.push({ to: A, ratio: 1 / ratio, via });
  };
  // gears in mesh: rims touch exactly
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      if (!A.gear || !B.gear) continue;
      if (Math.abs(dist(A.p, B.p) - (A.gear.size + B.gear.size)) < 1e-6) link(A, B, -A.gear.size / B.gear.size, 'mesh');
    }
  }
  for (const part of parts) {
    if (part.type === 'conveyor' && key(part.a) !== key(part.b)) link(axles.get(key(part.a)), axles.get(key(part.b)), 1, 'belt');
    if (part.type === 'chain') {
      const A = axles.get(key(part.a));
      const B = axles.get(key(part.b));
      if (A?.gear && B?.gear && A !== B) link(A, B, A.gear.size / B.gear.size, 'chain');
    }
  }
  // walk each train from a motor if it has one, so motors read as 1×
  const trains = [];
  const order = [...list].sort((a, b) => (b.motor ? 1 : 0) - (a.motor ? 1 : 0));
  for (const start of order) {
    if (start.train >= 0) continue;
    const t = { axles: [], jammed: false, motors: [] };
    const id = trains.length;
    trains.push(t);
    start.k = 1;
    start.train = id;
    const queue = [start];
    while (queue.length) {
      const A = queue.shift();
      t.axles.push(A);
      if (A.motor) t.motors.push(A);
      for (const { to, ratio } of A.links) {
        const k = A.k * ratio;
        if (to.train === id) {
          if (Math.abs(to.k - k) > 1e-6 * Math.max(1, Math.abs(k))) t.jammed = true;
        } else {
          to.train = id;
          to.k = k;
          queue.push(to);
        }
      }
    }
  }
  return { axles, trains };
}

// ---------- placement rules ----------

function levelZones(level) {
  if (level._zones) return level._zones;
  const walls = (level.walls || []).map(zoneShape);
  for (const r of cupWalls(level.goal)) walls.push(rectShape(r));
  const noBuild = (level.noBuild || []).map(zoneShape);
  const danger = (level.danger || []).map(zoneShape);
  const items = (level.items || []).map((it) => placeShape(itemShape(it), it.x, it.y, it.angle || 0));
  Object.defineProperty(level, '_zones', { value: { walls, noBuild, danger, items }, enumerable: false });
  return level._zones;
}

function pegOk(level, p) {
  const [x, y] = p;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Off the pegs';
  if (x < 1 || y < 1 || x > level.w - 1 || y > level.h - 1) return 'Off the board';
  if ((level.walls || []).some((z) => inZone(p, z))) return 'Inside a wall';
  if ((level.noBuild || []).some((z) => inZone(p, z))) return 'No building here';
  return null;
}

/**
 * Why a part can't go where it is, or null if it can. `others` is the rest of
 * the machine (fixed parts included).
 */
export function problem(level, part, others = []) {
  if (part.type === 'chain') return chainProblem(level, part, others);
  for (const p of partPegs(part)) {
    const r = pegOk(level, p);
    if (r) return r;
  }
  const z = levelZones(level);
  if (part.a) {
    const len = dist(part.a, part.b);
    const [lo, hi] = LIMITS[part.type];
    if (len < lo - 1e-9) return 'Too short';
    if (len > hi + 1e-9) return 'Too long';
  }
  if (part.type === 'lever') {
    for (const l of [part.l1, part.l2]) if (l < LEVER_ARM[0] - 1e-9 || l > LEVER_ARM[1] + 1e-9) return 'Arm length must be ½ to 6';
    for (const e of leverEnds(part)) if (e[0] < 0 || e[1] < 0 || e[0] > level.w || e[1] > level.h) return 'Off the board';
  }
  const shape = partShape(part);
  if (shape) {
    const back = part.type === 'gear' || part.type === 'motor';
    const touch = (s) => overlap(shape, s) < -0.02;
    if (z.walls.some(touch)) return 'Hits a wall';
    if (z.noBuild.some(touch)) return 'No building here';
    if (!back && z.danger.some(touch)) return 'In a danger zone';
    if (!back && z.items.some(touch)) return 'In the way of the start';
    if (level.goal && !back && inRect([shape.minX, shape.minY], [level.goal.x, level.goal.y, level.goal.w, level.goal.h]) && inRect([shape.maxX, shape.maxY], [level.goal.x, level.goal.y, level.goal.w, level.goal.h])) return 'Inside the goal';
  }
  const pk = part.p ? key(part.p) : null;
  for (const o of others) {
    if (o === part || o.id === part.id) continue;
    if (part.type === 'gear' && o.type === 'gear') {
      const d = dist(part.p, o.p);
      if (d < 1e-9) return 'A peg holds one gear';
      if (d < part.size + o.size - 1e-6) return 'Overlaps another gear';
    }
    if (part.type === 'motor' && o.type === 'motor' && key(o.p) === pk) return 'A peg holds one motor';
    if (part.type === 'weight' && o.type === 'weight' && key(o.p) === pk) return 'Already a weight here';
  }
  return null;
}

// A chain runs behind the board between two gears, wherever they are.
function chainProblem(level, part, others) {
  const ga = others.find((o) => o.type === 'gear' && key(o.p) === key(part.a));
  const gb = others.find((o) => o.type === 'gear' && key(o.p) === key(part.b));
  if (!ga || !gb) return 'A chain needs a gear at each end';
  if (key(part.a) === key(part.b)) return 'Pick two different gears';
  if (dist(part.a, part.b) < ga.size + gb.size + 0.5) return 'Too close: those gears mesh or touch';
  if (dist(part.a, part.b) > LIMITS.chain[1]) return 'Too long';
  if (others.some((o) => o !== part && o.id !== part.id && o.type === 'chain' && ((key(o.a) === key(part.a) && key(o.b) === key(part.b)) || (key(o.a) === key(part.b) && key(o.b) === key(part.a))))) return 'Already chained';
  return null;
}

/** Problems for every part: Map(id → reason). Empty map = all fine. */
export function problems(level, parts) {
  const out = new Map();
  const all = [...(level.fixed || []), ...parts];
  for (const part of parts) {
    const r = problem(level, part, all);
    if (r) out.set(part.id, r);
  }
  return out;
}

/** How many of each type the player has used, and whether that fits the box. */
export function usage(level, parts) {
  const used = {};
  for (const p of parts) used[p.type] = (used[p.type] || 0) + 1;
  const over = Object.entries(used).filter(([t, n]) => n > (level.parts?.[t] ?? 0)).map(([t]) => t);
  return { used, over, total: parts.length };
}

// ---------- building and running ----------

const LEVER_DENSITY = 0.8;
const GEAR_DENSITY = 0.005;

/**
 * Build a physics world for a level and machine. Returns the world and the
 * bodies the game cares about.
 */
export function build(level, parts, { sandbox = false } = {}) {
  const world = makeWorld();
  const all = [...(level.fixed || []), ...parts];
  const { axles, trains } = analyse(all);
  const trainObjs = trains.map((t) => {
    let inertia = 0;
    const motors = [];
    for (const a of t.axles) {
      let I = 0;
      if (a.gear) {
        const m = GEAR_DENSITY * Math.PI * a.gear.size ** 2;
        I += 0.5 * m * a.gear.size ** 2;
      }
      I += a.drums.length * 0.01;
      if (a.motor) {
        I += 0.05;
        motors.push({ k: a.k, stall: MOTOR.stall, speed: MOTOR.speed, dir: a.motor.dir || 1, delay: a.motor.delay || 0 });
      }
      inertia += a.k * a.k * I;
    }
    return addTrain(world, { inertia, motors, damping: motors.length ? 0.2 : 0.03, jammed: t.jammed });
  });

  // level geometry
  const statics = [];
  for (const z of level.walls || []) {
    const shape = Array.isArray(z) ? box(z[2], z[3]) : makeShape(z.poly, 0);
    const x = Array.isArray(z) ? z[0] + z[2] / 2 : 0;
    const y = Array.isArray(z) ? z[1] + z[3] / 2 : 0;
    statics.push(addBody(world, { kind: 'static', shape, x, y, friction: 0.6, restitution: 0.1, tag: 'wall' }));
  }
  for (const r of cupWalls(level.goal || {})) statics.push(addBody(world, { kind: 'static', shape: box(r[2], r[3]), x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, friction: 0.6, restitution: 0.05, tag: 'cup' }));

  const movers = (level.movers || []).map((m, i) => addBody(world, { kind: 'kinematic', shape: moverShape(m), motion: moverMotion(m), friction: 0.6, restitution: 0.1, tag: 'mover', danger: !!m.danger, index: i }));

  // parts
  const partBodies = new Map();
  for (const part of all) {
    let b = null;
    if (part.type === 'ramp') b = addBody(world, { kind: 'static', shape: capsule(...part.a, ...part.b, 0.15), friction: 0.4, restitution: 0.1, tag: 'ramp' });
    else if (part.type === 'bouncer') b = addBody(world, { kind: 'static', shape: capsule(...part.a, ...part.b, 0.2), friction: 0.3, restitution: 0.85, tag: 'bouncer' });
    else if (part.type === 'conveyor') {
      const A = axles.get(key(part.a));
      b = addBody(world, { kind: 'static', shape: capsule(...part.a, ...part.b, DRUM_R), friction: 1.2, restitution: 0.05, belt: { train: trainObjs[A.train], k: A.k, r: DRUM_R }, tag: 'conveyor' });
    } else if (part.type === 'lever') {
      const A = axles.get(key(part.p));
      b = addBody(world, { kind: 'rotor', shape: capsule(-part.l1, 0, part.l2, 0, 0.14), x: part.p[0], y: part.p[1], base: rad(part.angle || 0), train: trainObjs[A.train], k: A.k, density: LEVER_DENSITY, friction: 0.6, restitution: 0.1, tag: 'lever' });
    } else if (part.type === 'weight') {
      b = addBody(world, { kind: 'dynamic', shape: box(0.9, 0.9), x: part.p[0], y: part.p[1], density: 6, friction: 0.6, restitution: 0.02, tag: 'weight' });
    }
    if (b) {
      b.part = part;
      partBodies.set(part.id, b);
    }
  }

  // items
  const items = (level.items || []).map((it, i) => {
    const info = ITEM_INFO[it.type];
    const b = addBody(world, {
      kind: 'dynamic',
      shape: itemShape(it),
      x: it.x,
      y: it.y,
      angle: it.angle || 0,
      vx: it.vx || 0,
      vy: it.vy || 0,
      density: info.density,
      friction: info.friction,
      restitution: info.restitution,
      linearDamping: 0.03,
      angularDamping: 0.1,
      rolling: info.r ? 0.025 : 0,
      tag: 'item',
      item: it,
      index: i,
      deliver: it.deliver !== false,
      breakSpeed: info.breakSpeed,
    });
    return b;
  });
  settle(world);
  return { world, items, movers, statics, partBodies, trains: trainObjs, axles, analysis: trains, sandbox };
}

function moverShape(m) {
  if (m.shape === 'bar') return capsule(-m.length / 2, 0, m.length / 2, 0, m.r ?? 0.2);
  return box(m.w ?? 1, m.h ?? 1);
}

/**
 * Mover motion. path: { from, to, period, phase } slides back and forth
 * (smooth ends); spin: { at, speed (rad/s), phase } turns about a point.
 */
export function moverMotion(m) {
  if (m.spin) {
    const { at, speed, phase = 0 } = m.spin;
    return (t) => ({ x: at[0], y: at[1], angle: phase + speed * t });
  }
  if (m.keys) {
    // keyframes [[time, x, y, angle?], ...] over one period, eased between
    const { keys, period } = m;
    return (t) => {
      const u = ((t % period) + period) % period;
      let i = keys.length - 1;
      while (i > 0 && keys[i][0] > u) i--;
      const k0 = keys[i];
      const k1 = keys[(i + 1) % keys.length];
      const t1 = i + 1 < keys.length ? k1[0] : period;
      const f = t1 > k0[0] ? (u - k0[0]) / (t1 - k0[0]) : 0;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * f);
      return { x: k0[1] + (k1[1] - k0[1]) * e, y: k0[2] + (k1[2] - k0[2]) * e, angle: (k0[3] || 0) + ((k1[3] || 0) - (k0[3] || 0)) * e };
    };
  }
  const { from, to, period, phase = 0, hold = 0 } = m.path;
  return (t) => {
    // 0 → 1 → 0 over a period, easing at the ends, optionally pausing
    const u = ((t / period + phase) % 1 + 1) % 1;
    let s;
    const move = (1 - 2 * hold) / 2;
    if (u < hold) s = 0;
    else if (u < hold + move) s = (u - hold) / move;
    else if (u < 2 * hold + move) s = 1;
    else s = 1 - (u - 2 * hold - move) / move;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * s);
    return { x: from[0] + (to[0] - from[0]) * e, y: from[1] + (to[1] - from[1]) * e, angle: m.angle || 0 };
  };
}

export const SETTLE_TIME = 0.5;
export const STUCK_TIME = 2.5;

/**
 * Start a run. Call run.tick() once per fixed step; it returns the status:
 * 'running', 'win' or 'fail' (then run.reason says why and run.lost which item).
 */
export function makeRun(level, parts, opts = {}) {
  const built = build(level, parts, opts);
  const { world, items } = built;
  const danger = (level.danger || []).map(zoneShape);
  const goal = level.goal;
  const limit = level.timeLimit ?? 20;
  const run = {
    ...built,
    status: 'running',
    reason: '',
    lost: null,
    time: 0,
    steps: 0,
    inGoal: items.map(() => 0),
    delivered: items.map(() => false),
    paths: items.map((b) => [[b.x, b.y]]),
    hardestHit: 0,
    still: 0,
    impacts: [],
    maxThrow: 0,
    launch: items.map(() => null),
    tick() {
      if (run.status !== 'running') return run.status;
      const contacts = step(world);
      run.steps++;
      run.time = world.time;
      run.impacts = [];
      for (const c of contacts) {
        if (c.maxJn <= 0) continue;
        const sp = -c.vn0;
        if (sp > 3) run.impacts.push({ x: c.x, y: c.y, speed: sp, a: c.a.tag, b: c.b.tag });
        for (const b of [c.a, c.b]) {
          if (b.tag !== 'item' || !b.deliver) continue;
          if (b.breakSpeed && sp > b.breakSpeed) return run.fail('broken', b, `The ${b.item.type} cracked`);
          const other = b === c.a ? c.b : c.a;
          if (other.danger) return run.fail('danger', b, `The ${ITEM_INFO[b.item.type].name} hit a hazard`);
          if (sp > run.hardestHit) run.hardestHit = sp;
        }
      }
      for (const b of items) {
        const i = b.index;
        if (b.gone) continue;
        if (run.steps % 4 === 0) run.paths[i].push([b.x, b.y]);
        if (!b.deliver) {
          // helpers (a steel ball used as a hammer) can go anywhere
          if (b.x < -2 || b.x > level.w + 2 || b.y > level.h + 2) {
            b.gone = true;
            b.kind = 'static';
            b.sensor = true;
          }
          continue;
        }
        for (const d of danger) {
          if (overlap(b.world, d) < 0) return run.fail('danger', b, `The ${ITEM_INFO[b.item.type].name} hit a hazard`);
        }
        if (b.x < -2 || b.x > level.w + 2 || b.y > level.h + 2 || b.y < -30) return run.fail('lost', b, `The ${ITEM_INFO[b.item.type].name} left the board`);
        // throws: how far an item flies between touching things
        const touching = contacts.some((c) => (c.a === b || c.b === b) && c.sep < 0.05);
        if (!touching) {
          if (!run.launch[i]) run.launch[i] = [b.x, b.y];
          else run.maxThrow = Math.max(run.maxThrow, Math.abs(b.x - run.launch[i][0]));
        } else run.launch[i] = null;
        if (goal && b.deliver && !run.delivered[i]) {
          if (inRect([b.x, b.y], [goal.x, goal.y, goal.w, goal.h])) run.inGoal[i] += DT;
          else run.inGoal[i] = 0;
          if (run.inGoal[i] >= SETTLE_TIME) run.delivered[i] = true;
        }
      }
      if (goal && items.some((b) => b.deliver) && items.every((b) => !b.deliver || run.delivered[b.index])) {
        run.status = 'win';
        return run.status;
      }
      // every undelivered item has come to rest: it is not going anywhere
      const waiting = run.trains.some((t) => t.motors.some((m) => world.time < (m.delay || 0)));
      const still = !waiting && items.every((b) => !b.deliver || run.delivered[b.index] || (Math.hypot(b.vx, b.vy) < 0.08 && Math.abs(b.w) < 0.3));
      run.still = still ? run.still + DT : 0;
      if (run.still >= STUCK_TIME) {
        const b = items.find((b) => b.deliver && !run.delivered[b.index]);
        return run.fail('stuck', b, `The ${ITEM_INFO[b.item.type].name} stopped short`);
      }
      if (run.time >= limit) return run.fail('time', null, 'Out of time');
      return run.status;
    },
    fail(kind, body, reason) {
      run.status = 'fail';
      run.failKind = kind;
      run.lost = body;
      run.reason = reason;
      return run.status;
    },
  };
  return run;
}

/** Run a machine to the end (tests, hint checks). */
export function simulate(level, parts, opts = {}) {
  const run = makeRun(level, parts, opts);
  const max = Math.ceil(((level.timeLimit ?? 20) + 1) / DT);
  for (let i = 0; i < max && run.status === 'running'; i++) run.tick();
  return { status: run.status, reason: run.reason, kind: run.failKind, time: run.time, paths: run.paths, run };
}

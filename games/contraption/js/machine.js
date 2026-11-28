// The machine model: parts on a pegboard → physics bodies and trains, the
// placement rules, and a run that reports win or failure. Pure (no DOM), so
// the tests run every level's reference solution through it.
//
// A part is plain data, saved as is:
//   { id, type: 'ramp' | 'bouncer' | 'conveyor', a: [x, y], b: [x, y] }
//   { id, type: 'lever', p: [x, y], angle (degrees), l1, l2 }   arms either side of the fulcrum
//   { id, type: 'weight', p }
//   { id, type: 'motor', p, dir: 1 (clockwise) | -1, delay (seconds) }
//   { id, type: 'gear', p, teeth (10–40, radius teeth/10), plane: 0 back | 1 front }
//   { id, type: 'chain', a, b }            between two gears' pegs
// Fixed parts (given by the level) carry fixed: true.

import { makeWorld, addBody, addTrain, settle, step, circle, capsule, box, makeShape, placeShape, overlap, DT } from './physics.js';
import { MOTOR, DRUM_R, GEAR_TEETH, ITEM_INFO, key, dist, leverEnds, cupWalls, gearR } from './geom.js';
import { PARTS, PART_TYPES, partOf } from './parts/index.js';
import { unpack } from './parts/chip.js';

export { MOTOR, DRUM_R, GEAR_TEETH, ITEM_INFO, key, leverEnds, cupWalls, gearR, PARTS, PART_TYPES, partOf };

/** Text for each part type (tray, cards, guide), from the registry. */
export const PART_INFO = Object.fromEntries(PART_TYPES.map((t) => [t, { name: PARTS[t].name, blurb: PARTS[t].blurb, physics: PARTS[t].physics, tip: PARTS[t].tip }]));

// ---------- geometry helpers ----------


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

/** World-space shape a part occupies (front layer, or the disc of a back part). */
export function partShape(part) {
  return PARTS[part.type]?.shape(part) ?? null;
}

export function itemShape(item) {
  const info = ITEM_INFO[item.type];
  return info.r ? circle(info.r) : box(info.w, info.h);
}

/** The pegs a part sits on (for moving and hit-testing). */
export function partPegs(part) {
  return PARTS[part.type].pegs(part);
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
    if (!axles.has(k)) axles.set(k, { p, gear: null, gears: [], motor: null, drums: [], levers: [], extra: [], links: [], k: 0, train: -1 });
    return axles.get(k);
  };
  for (const part of parts) PARTS[part.type].axles?.(part, axle);
  const list = [...axles.values()];
  const link = (A, B, ratio, via, ga, gb) => {
    A.links.push({ to: B, ratio, via, from: ga, into: gb });
    B.links.push({ to: A, ratio: 1 / ratio, via, from: gb, into: ga });
  };
  // gears in mesh: rims touch exactly
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      const d = dist(A.p, B.p);
      for (const ga of A.gears) {
        for (const gb of B.gears) {
          if ((ga.plane || 0) !== (gb.plane || 0)) continue;
          if (Math.abs(d - (gearR(ga) + gearR(gb))) < 1e-6) link(A, B, -gearR(ga) / gearR(gb), 'mesh', ga, gb);
        }
      }
    }
  }
  for (const part of parts) PARTS[part.type].links?.(part, axles, link);
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
  const def = PARTS[part.type];
  if (!def) return 'Unknown part';
  if (!def.free) {
    for (const p of def.pegs(part)) {
      const r = pegOk(level, p);
      if (r) return r;
    }
  }
  if (def.ends) {
    const len = dist(part.a, part.b);
    const [lo, hi] = def.limits;
    if (len < lo - 1e-9) return 'Too short';
    if (len > hi + 1e-9) return 'Too long';
  }
  const own = def.check?.(level, part, others);
  if (own) return own;
  if (def.free) return null;
  const z = levelZones(level);
  const shape = def.shape(part);
  if (shape) {
    const touch = (s) => overlap(shape, s) < -0.02;
    if (z.walls.some(touch)) return 'Hits a wall';
    if (z.noBuild.some(touch)) return 'No building here';
    if (def.front && z.danger.some(touch)) return 'In a danger zone';
    // a trapdoor (or a latched lever) may carry an item from the start: touching is fine, overlapping is not
    const carries = typeof def.carries === 'function' ? def.carries(part) : def.carries;
    if (def.front && z.items.some(carries ? (s) => overlap(shape, s) < -0.12 : touch)) return 'In the way of the start';
    const g = level.goal;
    if (g && def.front && inRect([shape.minX, shape.minY], [g.x, g.y, g.w, g.h]) && inRect([shape.maxX, shape.maxY], [g.x, g.y, g.w, g.h])) return 'Inside the goal';
  }
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

// Every part on an axle (each drum counts once per belt, as before).
function axleParts(a) {
  return [...a.gears, a.motor, ...a.drums, ...a.levers, ...a.extra].filter(Boolean);
}

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
      for (const part of axleParts(a)) {
        const def = PARTS[part.type];
        I += def.inertia?.(part) ?? 0;
        const m = def.motor?.(part);
        if (m) motors.push({ k: a.k, ...m });
      }
      inertia += a.k * a.k * I;
    }
    // a train with no motor (a free lever, a loose gear) holds still until something touches it
    // a part that swings by itself (a pendulum) is never held
    const free = t.axles.some((a) => axleParts(a).some((p) => PARTS[p.type].swings));
    return addTrain(world, { inertia, motors, damping: motors.length ? (motors.every((m) => m.spring) ? 0.005 : 0.2) : free ? 0.0005 : 0.03, jammed: t.jammed, held: !motors.length && !free, latch: t.axles.some((a) => axleParts(a).some((p) => p.latch)) ? LATCH : 0 });
  });
  const ctx = {
    axle: (p) => {
      const A = axles.get(key(p));
      return { train: trainObjs[A.train], k: A.k };
    },
  };

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
    const b = PARTS[part.type].body?.(world, part, ctx);
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
  // signals: wired motors start off and wait for their input
  const all2 = all;
  const chips = unpack(all2);
  const sensors = all2.filter((p) => PARTS[p.type].sense);
  const logic = [...all2.filter((p) => PARTS[p.type].logic), ...chips.inner];
  // a wire to or from a chip pin goes to the gate behind that pin
  // { part, pin } behind a wire end: a chip pin leads to the gate (and its pin) inside
  const end = (hit, dir) => (hit?.part.type === 'chip' ? chips.pin.get(`${hit.part.id}:${dir}:${hit.pin}`) : hit && { part: hit.part, pin: dir === 'in' ? hit.pin : 0 });
  const wires = [
    ...all2.filter((p) => p.type === 'wire').map((w) => {
      const a = end(PARTS.wire.source(w, all2), 'out');
      const b = end(PARTS.wire.target(w, all2), 'in');
      return { from: a?.part, to: b?.part, toPin: b?.pin || 0 };
    }),
    ...chips.links,
  ].filter((w) => w.from && w.to);
  const gated = new Set([...wires.map((w) => w.to), ...all2.filter((p) => p.type === 'motor' && p.switched)]);
  for (const t of trainObjs) for (const m of t.motors) if (gated.has(m.part)) m.off = true;
  const signals = new Map();
  settle(world);
  const followers = all2.filter((p) => PARTS[p.type].follow);
  return { sensors, logic, logicState: new Map(), wires, signals, world, items, movers, statics, partBodies, trains: trainObjs, axles, analysis: trains, sandbox, followers };
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

// Sensors read the world after a step; wired motors act on the next step,
// so a signal takes exactly one step to arrive. On/off only: no floats.
function updateSignals(run, settle = false) {
  const { sensors, wires, logic } = run;
  if (!sensors.length && !wires.length && !logic.length && !run.followers?.length) return;
  const prev = run.signals;
  const next = new Map();
  for (const p of sensors) next.set(p.id, settle ? false : !!PARTS[p.type].sense(p, run, run.partBodies.get(p.id)));
  // sensors are read now; gates answer one step late, so loops are well defined
  const val = (p) => (PARTS[p.type].sense ? next.get(p.id) : prev.get(p.id)) || false;
  // inputs per part, per pin: pins[0] is the main input, pins[1] a second pin (a toggle's clear)
  const ins = new Map();
  for (const w of wires) {
    if (!ins.has(w.to)) ins.set(w.to, [[]]);
    const pins = ins.get(w.to);
    (pins[w.toPin] ||= []).push(val(w.from));
  }
  for (const g of logic) {
    if (!run.logicState.has(g)) run.logicState.set(g, {});
    const pins = ins.get(g) || [[]];
    next.set(g.id, !!PARTS[g.type].logic(g, pins[0] || [], run.logicState.get(g), settle, pins));
  }
  for (const t of run.trains) for (const m of t.motors) if (m.part && (m.part.switched || ins.has(m.part))) m.off = !(ins.get(m.part)?.[0] || []).some(Boolean);
  // trapdoors (and anything else that lets go on a signal)
  if (!settle) for (const [part, pins] of ins) if (PARTS[part.type]?.release && (pins[0] || []).some(Boolean)) PARTS[part.type].release(run, part);
  // parts that follow their signal every step (a gate's pins)
  if (!settle) for (const part of run.followers) PARTS[part.type].follow(run, part, (ins.get(part)?.[0] || []).some(Boolean));
  run.signals = next;
}

// Power-up: before time starts, let the logic settle with every sensor off
// (delays hold, toggles only note their input), so nothing counts the
// switch-on as an event.
function settleSignals(run) {
  if (!run.logic.length) return;
  for (let i = 0; i < 24; i++) updateSignals(run, true);
}

export const SETTLE_TIME = 0.5;
/** How hard (cells per second) something must hit a latched lever to let it go. */
export const LATCH = 1.5;
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
      run.contacts = contacts;
      updateSignals(run);
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
      // a signal goal: a fixed lamp has to blink so many times
      const sg = level.signalGoal;
      if (sg) {
        const lit = !!run.signals.get(sg.lamp);
        if (lit && sg.darkUntil && run.time < sg.darkUntil) return run.fail('early', null, 'The lamp lit too early');
        if (lit && !run.lampWas) run.blinks = (run.blinks || 0) + 1;
        run.lampWas = lit;
        run.litFor = lit ? (run.litFor || 0) + DT : 0;
        // darkHold: light for hold seconds, then go dark and stay dark
        if (sg.darkHold) {
          if (sg.hold && run.litFor >= sg.hold) run.litDone = true;
          run.darkFor = run.litDone && !lit ? (run.darkFor || 0) + DT : 0;
          if (run.darkFor >= sg.darkHold) {
            run.status = 'win';
            return run.status;
          }
        } else if ((sg.blinks && (run.blinks || 0) >= sg.blinks) || (sg.hold && run.litFor >= sg.hold)) {
          run.status = 'win';
          return run.status;
        }
      }
      if (goal && items.some((b) => b.deliver) && items.every((b) => !b.deliver || run.delivered[b.index])) {
        run.status = 'win';
        return run.status;
      }
      // every undelivered item has come to rest: it is not going anywhere
      const waiting = run.trains.some((t) => t.motors.some((m) => world.time < (m.delay || 0)));
      // stuck only once everything has stopped: a helper still rolling (a trigger on its way) may yet set things going
      const still = !waiting && items.every((b) => (b.deliver && run.delivered[b.index]) || b.gone || (Math.hypot(b.vx, b.vy) < 0.08 && Math.abs(b.w) < 0.3));
      // the sandbox has no 'stopped short': a machine there runs until you stop it
      run.still = still && !level.signalGoal && !opts.sandbox && items.some((b) => b.deliver) ? run.still + DT : 0;
      if (run.still >= STUCK_TIME) {
        const b = items.find((b) => b.deliver && !run.delivered[b.index]);
        return run.fail('stuck', b, `The ${ITEM_INFO[b.item.type].name} stopped short`);
      }
      if (run.time >= limit) {
        const sg = level.signalGoal;
        if (sg?.blinks) return run.fail('time', null, `The lamp blinked ${run.blinks || 0} of ${sg.blinks} times`);
        if (sg?.darkHold) return run.fail('time', null, run.litDone ? `The lamp has to go dark and stay dark for ${sg.darkHold} s` : `The lamp has to stay lit for ${sg.hold} s, then go dark`);
        if (sg?.hold) return run.fail('time', null, `The lamp has to stay lit for ${sg.hold} s`);
        return run.fail('time', null, 'Out of time');
      }
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
  settleSignals(run);
  return run;
}

/** Run a machine to the end (tests, hint checks). */
export function simulate(level, parts, opts = {}) {
  const run = makeRun(level, parts, opts);
  const max = Math.ceil(((level.timeLimit ?? 20) + 1) / DT);
  for (let i = 0; i < max && run.status === 'running'; i++) run.tick();
  return { status: run.status, reason: run.reason, kind: run.failKind, time: run.time, paths: run.paths, run };
}

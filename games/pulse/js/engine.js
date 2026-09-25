// Pulse physics. Pure and deterministic: a fixed 240 Hz tick, no DOM, so
// the game, the bot and the tests all run the exact same rules.
//
// Units are blocks. x grows to the right, y grows upward, y = 0 is the top
// of the ground. The player is a box given by its centre (x, y). Gravity
// pulls toward -y when `grav` is 1 and toward +y when it is -1.

export const TICK = 1 / 240;
export const SPEEDS = [8.4, 10.4, 12.96, 15.6]; // slow, normal, fast, faster (blocks/s)
export const MODES = ['cube', 'ship', 'ball', 'wave'];
export const CORRIDOR = 10; // ship, ball and wave fly between floor and floor + 10

const CUBE = { g: 95, jump: 20, maxFall: 26 };
const SHIP = { up: 42, down: 34, maxUp: 8.5, maxDown: 9.5 };
const BALL = { g: 80, flip: 6, max: 22 };
const LAND_TOL = 0.3; // how far below a surface you can still land on it
const LOST = 60; // flipped cube drifting this far up is gone

// Half sizes of the player's box, and of the inner box whose touch on a
// block's side is fatal (the outer box may graze edges).
const SIZE = { cube: 0.5, ship: 0.5, ball: 0.5, wave: 0.2 };
const INNER = { cube: 0.15, ship: 0.15, ball: 0.15, wave: 0.2 };
const SHIP_H = 0.36; // the ship is flatter than it is long

// Launch speeds for pads and orbs, before the mode multiplier.
const PADS = { pad: 28, ppad: 17, bpad: 12 };
const ORBS = { orb: 20, porb: 14, borb: 9 };
const MODE_BOOST = { cube: 1, ship: 0.45, ball: 0.72, wave: 0 };

export const SOLIDS = new Set(['block', 'slab']);
export const HAZARDS = new Set(['spike', 'mini']);
export const ORB_TYPES = new Set(['orb', 'porb', 'borb']);
export const PAD_TYPES = new Set(['pad', 'ppad', 'bpad']);

// Each object sits in the cell [x, x+1] × [y, y+1]; `f` flips it upside down
// (spikes hanging from a ceiling, pads under one, slabs on the top half).
// Returns its hitbox [x0, y0, x1, y1].
export function hitbox(o) {
  const { x, y, f } = o;
  switch (o.t) {
    case 'block':
      return [x, y, x + 1, y + 1];
    case 'slab':
      return f ? [x, y + 0.5, x + 1, y + 1] : [x, y, x + 1, y + 0.5];
    case 'spike':
      return f ? [x + 0.38, y + 0.4, x + 0.62, y + 0.95] : [x + 0.38, y + 0.05, x + 0.62, y + 0.6];
    case 'mini':
      return f ? [x + 0.38, y + 0.7, x + 0.62, y + 1] : [x + 0.38, y, x + 0.62, y + 0.3];
    case 'pad':
    case 'ppad':
    case 'bpad':
      return f ? [x + 0.1, y + 0.75, x + 0.9, y + 1] : [x + 0.1, y, x + 0.9, y + 0.25];
    case 'orb':
    case 'porb':
    case 'borb':
      return [x - 0.15, y - 0.15, x + 1.15, y + 1.15];
    case 'coin':
      return [x, y, x + 1, y + 1];
    case 'portal':
      // Portals are three blocks tall, or `s` blocks up from y when given
      // (exit portals often span the whole corridor).
      return o.s ? [x, y, x + 1, y + o.s] : [x, y - 1, x + 1, y + 2];
    default:
      return [x, y, x + 1, y + 1];
  }
}

// Prepares a level for play: numbers the objects, stores hitboxes and
// buckets them by column so each tick only looks at nearby ones.
//   level = { name, length, speed: 0-3, mode, objects: [{ t, x, y, f?, v? }], ... }
export function compile(level) {
  const objects = level.objects.map((o, id) => ({ ...o, id, box: hitbox(o) }));
  objects.sort((a, b) => a.x - b.x || a.y - b.y);
  const buckets = new Map();
  let coins = 0;
  for (const o of objects) {
    if (o.t === 'coin') o.coin = coins++;
    const [x0, , x1] = o.box;
    for (let c = Math.floor(x0); c <= Math.floor(x1); c++) {
      if (!buckets.has(c)) buckets.set(c, []);
      buckets.get(c).push(o);
    }
  }
  const last = objects.reduce((m, o) => Math.max(m, o.x), 0);
  const length = level.length ?? Math.ceil(last + 12);
  return { ...level, objects, buckets, coins, length };
}

export function initState(lv) {
  const mode = lv.mode || 'cube';
  return {
    x: 0,
    y: halfH(mode),
    vy: 0,
    grav: 1,
    mode,
    speed: lv.speed ?? 1,
    floor: 0,
    ceil: mode === 'cube' ? Infinity : CORRIDOR,
    grounded: true,
    buffer: false, // a press not yet used by an orb, jump or flip
    hold: false,
    rot: 0,
    tick: 0,
    used: [], // ids of pads, orbs and coins already touched this attempt
    coins: [],
    orb: -1, // orb being touched, if any
    dead: false,
    won: false,
    jumps: 0,
  };
}

export function cloneState(s) {
  return { ...s, used: s.used.slice(), coins: s.coins.slice() };
}

const halfW = (mode) => SIZE[mode];
const halfH = (mode) => (mode === 'ship' ? SHIP_H : SIZE[mode]);
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

function box(s, hw = halfW(s.mode), hh = halfH(s.mode)) {
  return [s.x - hw, s.y - hh, s.x + hw, s.y + hh];
}

function nearby(lv, x, fn) {
  const c = Math.floor(x);
  for (let k = c - 1; k <= c + 1; k++) {
    const list = lv.buckets.get(k);
    if (list) for (const o of list) fn(o);
  }
}

// A mode portal may set the corridor: floor height `h` and height `c`.
function setMode(s, mode, o) {
  const floor = o.h ?? 0;
  s.mode = mode;
  s.floor = floor;
  s.ceil = mode === 'cube' ? Infinity : floor + (o.c ?? CORRIDOR);
  if (mode === 'wave' || mode === 'ship') s.vy = Math.max(-4, Math.min(4, s.vy));
  s.rot = 0;
}

function flip(s) {
  s.grav = -s.grav;
  s.grounded = false;
}

// Applies a pad or orb launch in the current gravity.
function launch(s, strength) {
  s.vy = s.grav * strength * MODE_BOOST[s.mode];
  s.grounded = false;
}

// Advances one tick. `hold` is whether the button is down; `press` is true
// on the first tick of a press. Events (jump, orb, pad, portal, coin, die,
// win) are pushed to `events` when given.
export function step(lv, s, hold, press, events = null) {
  if (s.dead || s.won) return s;
  const emit = (type, data) => events && events.push({ type, ...data });
  if (press) s.buffer = true;
  if (!hold) s.buffer = false;
  s.hold = hold;
  s.tick++;

  // Orbs take a fresh press while you touch them.
  if (s.buffer && s.orb >= 0 && !s.used.includes(s.orb) && s.mode !== 'wave') {
    const o = lv.objects.find((q) => q.id === s.orb);
    s.used.push(o.id);
    s.buffer = false;
    if (o.t === 'borb') {
      flip(s);
      launch(s, -ORBS.borb);
    } else launch(s, ORBS[o.t]);
    emit('orb', { obj: o });
  }

  const dt = TICK;
  const g = s.grav;
  switch (s.mode) {
    case 'cube':
      if (s.grounded && hold) {
        s.vy = g * CUBE.jump;
        s.grounded = false;
        s.buffer = false;
        s.jumps++;
        emit('jump');
      }
      s.vy -= g * CUBE.g * dt;
      s.vy = g > 0 ? Math.max(s.vy, -CUBE.maxFall) : Math.min(s.vy, CUBE.maxFall);
      break;
    case 'ship': {
      s.vy += g * (hold ? SHIP.up : -SHIP.down) * dt;
      const up = g > 0 ? SHIP.maxUp : SHIP.maxDown;
      const down = g > 0 ? SHIP.maxDown : SHIP.maxUp;
      s.vy = Math.max(-down, Math.min(up, s.vy));
      break;
    }
    case 'ball':
      if (s.grounded && s.buffer) {
        flip(s);
        s.vy = s.grav * -BALL.flip;
        s.buffer = false;
        s.jumps++;
        emit('jump');
      }
      s.vy -= s.grav * BALL.g * dt;
      s.vy = Math.max(-BALL.max, Math.min(BALL.max, s.vy));
      break;
    case 'wave':
      s.vy = (hold ? 1 : -1) * g * SPEEDS[s.speed];
      break;
  }

  const prevY = s.y;
  s.x += SPEEDS[s.speed] * dt;
  s.y += s.vy * dt;
  s.grounded = false;
  s.orb = -1;
  collide(lv, s, prevY, emit);

  // Visual rotation: cubes spin in the air and settle square on landing.
  if (s.mode === 'cube') {
    if (s.grounded) {
      const target = Math.round(s.rot / 90) * 90;
      s.rot += (target - s.rot) * Math.min(1, dt * 30);
    } else s.rot += g * 400 * dt;
  } else if (s.mode === 'ship') s.rot = (-Math.atan2(s.vy, SPEEDS[s.speed] * 1.6) * 180) / Math.PI;
  else if (s.mode === 'wave') s.rot = s.vy > 0 ? -45 : s.vy < 0 ? 45 : 0;
  else if (s.mode === 'ball') s.rot += g * SPEEDS[s.speed] * dt * 115;

  if (s.x >= lv.length) {
    s.won = true;
    emit('win');
  }
  return s;
}

function die(s, emit) {
  s.dead = true;
  emit('die');
}

function collide(lv, s, prevY, emit) {
  const hw = halfW(s.mode);
  const hh = halfH(s.mode);
  const g = s.grav;
  // Floor and ceiling of the play area are always safe to touch.
  if (s.y - hh < s.floor) {
    s.y = s.floor + hh;
    if (g > 0 || s.vy < 0) s.vy = 0;
    if (g > 0) s.grounded = true;
  }
  if (s.y + hh > s.ceil) {
    s.y = s.ceil - hh;
    if (g < 0 || s.vy > 0) s.vy = 0;
    if (g < 0) s.grounded = true;
  }
  if (s.y > LOST) return die(s, emit);

  const canCeil = s.mode !== 'cube';
  // Land on solids in the direction of gravity (and, except for the cube,
  // slide along ones on the other side).
  let outer = box(s, hw, hh);
  nearby(lv, s.x, (o) => {
    if (!SOLIDS.has(o.t) || !overlaps(outer, o.box)) return;
    const [, y0, , y1] = o.box;
    const movingDown = s.vy <= 0;
    const movingUp = s.vy >= 0;
    if (g > 0) {
      const pen = y1 - (s.y - hh);
      if (movingDown && pen <= Math.max(LAND_TOL, prevY - s.y + 0.05)) {
        s.y = y1 + hh;
        s.vy = 0;
        s.grounded = true;
      } else if (canCeil && movingUp && s.y + hh - y0 <= Math.max(LAND_TOL, s.y - prevY + 0.05)) {
        s.y = y0 - hh;
        s.vy = 0;
      }
    } else {
      const pen = s.y + hh - y0;
      if (movingUp && pen <= Math.max(LAND_TOL, s.y - prevY + 0.05)) {
        s.y = y0 - hh;
        s.vy = 0;
        s.grounded = true;
      } else if (canCeil && movingDown && y1 - (s.y - hh) <= Math.max(LAND_TOL, prevY - s.y + 0.05)) {
        s.y = y1 + hh;
        s.vy = 0;
      }
    }
    outer = box(s, hw, hh);
  });

  const ih = s.mode === 'ship' ? Math.min(INNER[s.mode], hh) : INNER[s.mode];
  const inner = box(s, INNER[s.mode], ih);
  const hurt = s.mode === 'wave' ? inner : outer;
  let dead = false;
  nearby(lv, s.x, (o) => {
    if (dead) return;
    if (SOLIDS.has(o.t)) {
      if (overlaps(inner, o.box)) dead = true;
      return;
    }
    if (!overlaps(o.t === 'portal' || o.t === 'coin' || ORB_TYPES.has(o.t) ? outer : hurt, o.box)) return;
    if (HAZARDS.has(o.t)) dead = true;
    else if (ORB_TYPES.has(o.t)) s.orb = o.id;
    else if (PAD_TYPES.has(o.t)) {
      if (s.used.includes(o.id) || s.mode === 'wave') return;
      s.used.push(o.id);
      if (o.t === 'bpad') {
        flip(s);
        launch(s, -PADS.bpad);
      } else launch(s, PADS[o.t]);
      emit('pad', { obj: o });
    } else if (o.t === 'coin') {
      if (s.used.includes(o.id)) return;
      s.used.push(o.id);
      s.coins.push(o.coin);
      emit('coin', { obj: o });
    } else if (o.t === 'portal') portal(s, o, emit);
  });
  if (dead) die(s, emit);
}

// Portals: v = 'cube' | 'ship' | 'ball' | 'wave' | 'up' | 'down' | 's0'..'s3'.
function portal(s, o, emit) {
  const kind = o.v;
  if (MODES.includes(kind)) {
    if (s.mode === kind) return;
    setMode(s, kind, o);
  } else if (kind === 'up' || kind === 'down') {
    const want = kind === 'up' ? -1 : 1;
    if (s.grav === want) return;
    flip(s);
    s.vy *= 0.5;
  } else if (/^s[0-3]$/.test(kind)) {
    const sp = Number(kind[1]);
    if (s.speed === sp) return;
    s.speed = sp;
  } else return;
  emit('portal', { obj: o });
}

// Progress through the level, 0-100.
export const percent = (lv, s) => Math.max(0, Math.min(100, Math.floor((s.x / lv.length) * 100)));

// Runs a whole attempt from a list of hold changes (ticks at which the
// button toggles, starting released). Used by tests and replays.
export function replay(lv, toggles, maxTicks = 1e6) {
  const s = initState(lv);
  let hold = false;
  let k = 0;
  while (!s.dead && !s.won && s.tick < maxTicks) {
    let press = false;
    while (k < toggles.length && toggles[k] <= s.tick) {
      hold = !hold;
      if (hold) press = true;
      k++;
    }
    step(lv, s, hold, press);
  }
  return s;
}

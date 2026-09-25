// Drift: fly a little ship around a wrap-around field of drifting rocks and
// shoot them to pieces. Pure (no DOM) and deterministic per seed.
//
// controls: { turn: -1 | 0 | 1, thrust, fire, aim: angle | null }. With
// `aim`, the ship turns toward that angle by itself (for touch play).

import { mulberry32 } from '../core/rng.js';

export const W = 360;
export const H = 600;
export const SHIP_R = 10;
const SIZES = { 3: 34, 2: 20, 1: 11 };
export const POINTS = { 3: 20, 2: 50, 1: 100 };
const TURN = 4.2; // radians per second
const ACCEL = 260;
const DRAG = 0.55; // velocity kept per second
const MAX_SPEED = 260;
const BULLET_SPEED = 430;
const BULLET_LIFE = 0.85;
const FIRE_GAP = 0.2;
const TICK = 1 / 240;

const wrap = (v, max) => ((v % max) + max) % max;
// Shortest distance on the wrap-around field.
const wd = (a, b, max) => {
  const d = Math.abs(a - b) % max;
  return Math.min(d, max - d);
};
export const dist = (a, b) => Math.hypot(wd(a.x, b.x, W), wd(a.y, b.y, H));

export function newGame(seed = 1) {
  const s = { random: null, seed, t: 0, wave: 0, score: 0, lives: 3, over: false, ship: null, bullets: [], rocks: [], cooldown: 0, respawn: 0, extra: 10000 };
  s.random = mulberry32(seed);
  spawnShip(s);
  nextWave(s);
  return s;
}

function spawnShip(s) {
  s.ship = { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, shield: 2.2 };
}

function rock(s, x, y, size, speed) {
  const a = s.random() * Math.PI * 2;
  const v = speed * (0.7 + s.random() * 0.6);
  // A lumpy outline, fixed per rock.
  const shape = Array.from({ length: 10 }, () => 0.75 + s.random() * 0.35);
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size, r: SIZES[size], spin: (s.random() - 0.5) * 2, a: 0, shape };
}

function nextWave(s) {
  s.wave++;
  const count = Math.min(3 + s.wave, 10);
  for (let k = 0; k < count; k++) {
    // Start them away from the ship.
    let x;
    let y;
    do {
      x = s.random() * W;
      y = s.random() * H;
    } while (Math.hypot(x - s.ship.x, y - s.ship.y) < 140);
    s.rocks.push(rock(s, x, y, 3, 30 + s.wave * 4));
  }
}

export function step(s, dt, controls = {}) {
  const events = [];
  let left = Math.min(dt, 0.05);
  while (left > 1e-9 && !s.over) {
    const h = Math.min(TICK, left);
    tick(s, h, controls, events);
    left -= h;
  }
  return events;
}

function tick(s, dt, c, events) {
  s.t += dt;
  const ship = s.ship;
  if (ship) {
    ship.shield = Math.max(0, ship.shield - dt);
    if (c.aim != null) {
      let d = c.aim - ship.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      ship.a += Math.max(-TURN * dt, Math.min(TURN * dt, d));
    } else ship.a += (c.turn || 0) * TURN * dt;
    if (c.thrust) {
      ship.vx += Math.cos(ship.a) * ACCEL * dt;
      ship.vy += Math.sin(ship.a) * ACCEL * dt;
    }
    const k = DRAG ** dt;
    ship.vx *= k;
    ship.vy *= k;
    const sp = Math.hypot(ship.vx, ship.vy);
    if (sp > MAX_SPEED) {
      ship.vx *= MAX_SPEED / sp;
      ship.vy *= MAX_SPEED / sp;
    }
    ship.x = wrap(ship.x + ship.vx * dt, W);
    ship.y = wrap(ship.y + ship.vy * dt, H);
    s.cooldown -= dt;
    if (c.fire && s.cooldown <= 0 && s.bullets.length < 6) {
      s.cooldown = FIRE_GAP;
      s.bullets.push({ x: ship.x + Math.cos(ship.a) * SHIP_R, y: ship.y + Math.sin(ship.a) * SHIP_R, vx: Math.cos(ship.a) * BULLET_SPEED + ship.vx * 0.5, vy: Math.sin(ship.a) * BULLET_SPEED + ship.vy * 0.5, life: BULLET_LIFE });
      events.push({ type: 'fire' });
    }
  } else if ((s.respawn -= dt) <= 0) {
    spawnShip(s);
    events.push({ type: 'respawn' });
  }
  for (const b of s.bullets) {
    b.x = wrap(b.x + b.vx * dt, W);
    b.y = wrap(b.y + b.vy * dt, H);
    b.life -= dt;
  }
  for (const r of s.rocks) {
    r.x = wrap(r.x + r.vx * dt, W);
    r.y = wrap(r.y + r.vy * dt, H);
    r.a += r.spin * dt;
  }
  // Bullets break rocks: big ones into two middles, middles into two smalls.
  const born = [];
  for (const b of s.bullets) {
    if (b.life <= 0) continue;
    const r = s.rocks.find((q) => !q.dead && dist(q, b) < q.r);
    if (!r) continue;
    b.life = 0;
    r.dead = true;
    s.score += POINTS[r.size];
    events.push({ type: 'break', x: r.x, y: r.y, size: r.size });
    if (r.size > 1) for (let k = 0; k < 2; k++) born.push(rock(s, r.x, r.y, r.size - 1, 50 + s.wave * 5 + (3 - r.size) * 25));
  }
  s.bullets = s.bullets.filter((b) => b.life > 0);
  s.rocks = s.rocks.filter((r) => !r.dead).concat(born);
  if (s.score >= s.extra) {
    s.extra += 10000;
    s.lives++;
    events.push({ type: 'extra' });
  }
  // Rocks hit the ship (unless its shield is up).
  if (ship && !ship.shield) {
    const r = s.rocks.find((q) => dist(q, ship) < q.r * 0.85 + SHIP_R * 0.7);
    if (r) {
      events.push({ type: 'crash', x: ship.x, y: ship.y });
      s.ship = null;
      s.lives--;
      s.respawn = 1.4;
      if (s.lives <= 0) {
        s.over = true;
        events.push({ type: 'over' });
      }
    }
  }
  if (!s.rocks.length && !s.over) {
    events.push({ type: 'wave', wave: s.wave + 1 });
    if (s.ship) s.ship.shield = Math.max(s.ship.shield, 1.5);
    nextWave(s);
  }
}

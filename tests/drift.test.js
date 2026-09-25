import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, dist, W, H, POINTS } from '../games/drift/js/drift.js';

// Aim at the nearest rock with a little lead and fire when lined up.
function pilot(s) {
  const ship = s.ship;
  if (!ship || !s.rocks.length) return {};
  const best = s.rocks.reduce((a, b) => (dist(a, ship) <= dist(b, ship) ? a : b));
  let dx = best.x - ship.x;
  let dy = best.y - ship.y;
  if (Math.abs(dx) > W / 2) dx -= Math.sign(dx) * W;
  if (Math.abs(dy) > H / 2) dy -= Math.sign(dy) * H;
  const t = Math.hypot(dx, dy) / 430;
  const aim = Math.atan2(dy + best.vy * t, dx + best.vx * t);
  const d = Math.atan2(Math.sin(aim - ship.a), Math.cos(aim - ship.a));
  return { aim, fire: Math.abs(d) < 0.25 };
}

test('a new game starts with a shielded ship and rocks kept away from it', () => {
  const s = newGame(3);
  assert.equal(s.wave, 1);
  assert.equal(s.rocks.length, 4);
  assert.ok(s.ship.shield > 0);
  for (const r of s.rocks) assert.ok(dist(r, s.ship) >= 140);
});

test('the field wraps around', () => {
  const s = newGame(1);
  s.rocks = [];
  Object.assign(s.ship, { x: W - 1, y: 5, vx: 200, vy: -200, a: 0 });
  step(s, 0.05, {});
  assert.ok(s.ship.x < 20 && s.ship.y > H - 20);
});

test('shots break big rocks into two smaller ones and score', () => {
  const s = newGame(1);
  s.rocks = [{ x: s.ship.x + 60, y: s.ship.y, vx: 0, vy: 0, size: 3, r: 34, spin: 0, a: 0, shape: [1] }, { x: 20, y: 20, vx: 0, vy: 0, size: 1, r: 11, spin: 0, a: 0, shape: [1] }];
  s.ship.a = 0;
  const events = [];
  for (let i = 0; i < 10; i++) events.push(...step(s, 1 / 60, { fire: true })); // one shot
  const br = events.find((e) => e.type === 'break');
  assert.equal(br.size, 3);
  assert.equal(s.score, POINTS[3]);
  assert.equal(s.rocks.filter((r) => r.size === 2).length, 2);
});

test('a rock hitting the ship costs a ship, then it comes back shielded', () => {
  const s = newGame(1);
  s.ship.shield = 0;
  s.rocks = [{ x: s.ship.x + 5, y: s.ship.y, vx: 0, vy: 0, size: 2, r: 20, spin: 0, a: 0, shape: [1] }];
  const events = step(s, 1 / 60, {});
  assert.ok(events.some((e) => e.type === 'crash'));
  assert.equal(s.lives, 2);
  assert.equal(s.ship, null);
  s.rocks = [{ x: 20, y: 20, vx: 0, vy: 0, size: 1, r: 11, spin: 0, a: 0, shape: [1] }];
  for (let i = 0; i < 100; i++) step(s, 1 / 60, {});
  assert.ok(s.ship && s.ship.shield > 0);
});

test('clearing the field brings the next, bigger wave', () => {
  const s = newGame(9);
  const events = [];
  for (let f = 0; f < 60 * 120 && s.wave < 3 && !s.over; f++) events.push(...step(s, 1 / 60, pilot(s)));
  assert.ok(s.wave >= 3, `reached wave ${s.wave}`);
  assert.ok(events.some((e) => e.type === 'wave'));
});

test('games end when the last ship is lost', () => {
  const s = newGame(2);
  for (let f = 0; f < 60 * 900 && !s.over; f++) step(s, 1 / 60, {});
  assert.ok(s.over, 'a ship that never moves or fires is eventually hit');
  assert.equal(s.lives, 0);
});

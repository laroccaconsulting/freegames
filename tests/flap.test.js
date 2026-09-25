import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, step, gateAt, medalFor, BIRD_X, GATE_W, GROUND, H } from '../games/flap/js/flap.js';

// A simple pilot: flap whenever it's below a point a little under the
// middle of the next gap and falling.
function fly(seed, limit) {
  const s = newRun(seed);
  step(s, 1 / 60, true);
  for (let f = 0; f < 60 * 900 && !s.over && s.score < limit; f++) {
    const bx = s.x + BIRD_X;
    const g = s.gates.find((q) => q.x + GATE_W > bx - 10);
    step(s, 1 / 60, s.y > g.gap + g.size * 0.18 && s.vy > 0);
  }
  return s;
}

test('courses are the same for the same seed and gaps stay on screen', () => {
  for (let k = 0; k < 200; k += 7) {
    const g = gateAt(42, k);
    assert.deepEqual(g, gateAt(42, k));
    assert.ok(g.gap - g.size / 2 > 60 && g.gap + g.size / 2 < GROUND - 40, `gate ${k}`);
    assert.ok(g.size >= 132);
  }
  assert.notDeepEqual(gateAt(1, 5), gateAt(2, 5));
});

test('the bird hovers until the first flap', () => {
  const s = newRun(1);
  for (let i = 0; i < 100; i++) step(s, 1 / 60);
  assert.equal(s.x, 0);
  assert.ok(!s.over);
  assert.ok(Math.abs(s.y - H * 0.42) < 10);
});

test('doing nothing ends at the ground', () => {
  const s = newRun(1);
  const events = [];
  events.push(...step(s, 1 / 60, true));
  for (let i = 0; i < 400 && !s.over; i++) events.push(...step(s, 1 / 60));
  assert.ok(s.over);
  assert.ok(events.some((e) => e.type === 'crash'));
  assert.deepEqual(step(s, 1 / 60, true), [], 'nothing happens after a crash');
});

test('every course can be flown a long way', () => {
  for (let seed = 1; seed <= 12; seed++) assert.equal(fly(seed, 120).score, 120, `seed ${seed}`);
});

test('medals', () => {
  assert.equal(medalFor(9), null);
  assert.equal(medalFor(10).name, 'Bronze');
  assert.equal(medalFor(60).name, 'Gold');
  assert.equal(medalFor(100).name, 'Platinum');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W, H, R, TOP_Y, BOTTOM_Y, newMatch, step, predictX, aiTarget, aiSpeed } from '../games/rally/js/rally.js';

const play = (s, top, bottom, seconds) => {
  const events = [];
  const mt = {};
  const mb = {};
  for (let t = 0; t < seconds && !s.winner; t += 1 / 60) {
    const targets = { top: typeof top === 'string' ? aiTarget(s, 'top', top, mt) : top, bottom: typeof bottom === 'string' ? aiTarget(s, 'bottom', bottom, mb) : bottom };
    events.push(...step(s, 1 / 60, targets, { top: typeof top === 'string' ? aiSpeed(top) : undefined, bottom: typeof bottom === 'string' ? aiSpeed(bottom) : undefined }));
  }
  return events;
};

test('the ball is served after a pause, toward the receiver', () => {
  const s = newMatch({ serveTo: 'top' });
  assert.equal(s.ball.vy, 0);
  const events = step(s, 0.05, {});
  assert.ok(!events.length);
  for (let i = 0; i < 20; i++) step(s, 0.05, {});
  assert.ok(s.ball.vy < 0, 'served upward');
});

test('predictX follows wall bounces', () => {
  assert.equal(predictX({ x: 100, y: 300, vx: 0, vy: 100 }, 400), 100);
  assert.equal(predictX({ x: 100, y: 300, vx: 0, vy: -100 }, 400), null);
  // 300 px right from x=300 hits the right wall at W-R and comes back.
  const x = predictX({ x: 300, y: 0, vx: 300, vy: 300 }, 300);
  assert.ok(Math.abs(x - (2 * (W - R) - 600)) < 1e-9);
});

test('a paddle in the way returns the ball, faster, angled by the contact point', () => {
  const s = newMatch();
  s.wait = 0;
  Object.assign(s.ball, { x: 200, y: BOTTOM_Y - 40, vx: 0, vy: 300 });
  s.paddles.bottom.x = 180;
  const events = [];
  for (let i = 0; i < 4; i++) events.push(...step(s, 0.05, { bottom: 180 }));
  assert.ok(events.some((e) => e.type === 'paddle' && e.side === 'bottom'));
  assert.ok(s.ball.vy < 0 && s.ball.vx > 0);
  assert.ok(Math.hypot(s.ball.vx, s.ball.vy) > 300);
});

test('a miss scores for the other side, who then receives', () => {
  const s = newMatch();
  s.wait = 0;
  Object.assign(s.ball, { x: 20, y: BOTTOM_Y - 20, vx: 0, vy: 400 });
  const events = play(s, W / 2, W - 40, 0.5);
  const point = events.find((e) => e.type === 'point');
  assert.equal(point.side, 'top');
  assert.deepEqual(s.score, { top: 1, bottom: 0 });
  assert.equal(s.serveTo, 'bottom');
  assert.ok(s.ball.y === H / 2 && s.wait > 0);
  assert.ok(TOP_Y < H / 2);
});

test('matches end at the target score', () => {
  const s = newMatch({ to: 3 });
  const events = play(s, 'hard', W - 40, 120); // bottom never moves
  assert.equal(s.winner, 'top');
  assert.equal(s.score.top, 3);
  assert.ok(events.some((e) => e.type === 'win'));
  assert.ok(!step(s, 1, {}).length, 'nothing happens after the match');
});

test('harder computers beat easier ones, and even matches finish', () => {
  let hard = 0;
  for (let g = 0; g < 6; g++) {
    const s = newMatch({ to: 5, serveTo: g % 2 ? 'top' : 'bottom' });
    s.t = g * 0.37;
    play(s, 'easy', 'hard', 600);
    if (s.winner === 'bottom') hard++;
  }
  assert.ok(hard >= 5, `hard won ${hard} of 6`);
  const s = newMatch({ to: 5 });
  play(s, 'hard', 'hard', 600);
  assert.ok(s.winner, 'hard vs hard reaches a result');
});

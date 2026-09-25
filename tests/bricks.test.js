import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W, H, R, PADDLE_Y, makeLevel, newGame, launch, step } from '../games/bricks/js/bricks.js';

test('levels are mirrored, deterministic and grow', () => {
  for (const level of [1, 2, 3, 4, 9]) {
    const bricks = makeLevel(level);
    assert.deepEqual(bricks.map((b) => b.x), makeLevel(level).map((b) => b.x));
    assert.ok(bricks.length > 10 && bricks.length % 2 === 0);
    const key = (b) => `${Math.round(b.x + b.w / 2)},${b.y}`;
    const mirror = (b) => `${Math.round(W - 4 - (b.x + b.w / 2))},${b.y}`;
    assert.deepEqual(bricks.map(key).sort(), bricks.map(mirror).sort());
    for (const b of bricks) assert.ok(b.x >= 0 && b.x + b.w <= W && b.hp >= 1);
  }
  assert.ok(makeLevel(9).length >= makeLevel(1).length);
  assert.ok(makeLevel(9).some((b) => b.hp > 1), 'later levels have tough bricks');
});

test('the ball sits on the paddle until launched', () => {
  const s = newGame();
  step(s, 0.05, 40);
  assert.ok(s.balls[0].stuck);
  assert.equal(s.balls[0].x, s.paddle.x);
  launch(s);
  assert.ok(!s.balls[0].stuck && s.balls[0].vy < 0);
});

test('the paddle bounces the ball back up at an angle', () => {
  const s = newGame();
  s.bricks = [{ x: 0, y: 0, w: 1, h: 1, hp: 0, max: 1 }, { x: 300, y: 10, w: 10, h: 10, hp: 1, max: 1 }];
  Object.assign(s.balls[0], { stuck: false, x: s.paddle.x + 20, y: PADDLE_Y - 40, vx: 0, vy: 300 });
  const events = [];
  for (let i = 0; i < 20; i++) events.push(...step(s, 0.02, s.paddle.x));
  assert.ok(events.some((e) => e.type === 'paddle'));
  assert.ok(s.balls[0].vy < 0 && s.balls[0].vx > 0, 'hitting right of centre sends it right');
});

test('breaking bricks scores with a combo', () => {
  const s = newGame();
  s.bricks = [
    { x: 100, y: 100, w: 30, h: 10, hp: 1, max: 1 },
    { x: 100, y: 200, w: 30, h: 10, hp: 1, max: 1 },
    { x: 300, y: 300, w: 10, h: 10, hp: 1, max: 1 },
  ];
  Object.assign(s.balls[0], { stuck: false, x: 115, y: 150, vx: 0, vy: -300 });
  const events = [];
  for (let i = 0; i < 30; i++) events.push(...step(s, 0.02, 180));
  const breaks = events.filter((e) => e.type === 'break');
  assert.deepEqual(breaks.map((e) => e.combo), [1, 2]);
  assert.equal(s.score, 30);
});

test('tough bricks take more than one hit', () => {
  const s = newGame();
  s.bricks = [{ x: 100, y: 100, w: 30, h: 10, hp: 2, max: 2 }];
  Object.assign(s.balls[0], { stuck: false, x: 115, y: 150, vx: 0, vy: -300 });
  const events = [];
  for (let i = 0; i < 10; i++) events.push(...step(s, 0.02, 180));
  assert.ok(events.some((e) => e.type === 'hit'));
  assert.equal(s.bricks[0].hp, 1);
  assert.ok(!s.cleared);
});

test('missing the ball costs a life and ends the game at zero', () => {
  const s = newGame({ lives: 2 });
  Object.assign(s.balls[0], { stuck: false, x: 10, y: H + 15, vx: 0, vy: 400 });
  let events = step(s, 0.05, W - 40);
  assert.ok(events.some((e) => e.type === 'lose'));
  assert.equal(s.lives, 1);
  assert.ok(s.balls[0].stuck && !s.over);
  Object.assign(s.balls[0], { stuck: false, x: 10, y: H + 15, vx: 0, vy: 400 });
  step(s, 0.05, W - 40);
  assert.ok(s.over);
});

test('a player tracking the ball clears level 1', () => {
  const s = newGame({ lives: 99 });
  launch(s);
  let t = 0;
  while (!s.cleared && t < 600) {
    const low = s.balls.filter((b) => !b.stuck).sort((a, b) => b.y - a.y)[0];
    step(s, 1 / 60, low ? low.x : W / 2);
    if (s.balls.every((b) => b.stuck)) launch(s);
    t += 1 / 60;
  }
  assert.ok(s.cleared, `cleared after ${t.toFixed(0)}s with ${s.bricks.filter((b) => b.hp > 0).length} left`);
  assert.ok(s.score > 0 && R > 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, turn, step } from '../games/snake/js/snake.js';

const run = (s, n) => {
  let e;
  for (let k = 0; k < n; k++) ({ state: s, event: e } = step(s));
  return [s, e];
};

test('moves, turns and ignores reversing', () => {
  let s = newGame({ w: 10, h: 10 });
  const head = s.body[0];
  s = step(s).state;
  assert.equal(s.body[0], head + 1);
  s = turn(s, 'left'); // reverse: ignored
  assert.equal(s.queue.length, 0);
  s = turn(turn(s, 'up'), 'left');
  assert.deepEqual(s.queue, ['up', 'left']);
  s = step(s).state;
  assert.equal(s.body[0], head + 1 - 10);
});

test('walls: classic dies, wrap comes round', () => {
  const [dead, e] = run(newGame({ w: 10, h: 10 }), 20);
  assert.equal(e, 'dead');
  assert.ok(!dead.alive);
  const [alive] = run(newGame({ w: 10, h: 10, mode: 'wrap' }), 20);
  assert.ok(alive.alive);
});

test('eating grows the snake and moves the food', () => {
  let s = newGame({ w: 10, h: 10 });
  s = { ...s, food: s.body[0] + 1 };
  const { state, event } = step(s);
  assert.equal(event, 'eat');
  assert.equal(state.score, 1);
  assert.notEqual(state.food, s.food);
  assert.ok(!state.body.includes(state.food));
  const [longer] = run(state, 3);
  assert.equal(longer.body.length, 3 + 3);
});

test('zen: biting yourself cuts the tail instead', () => {
  let s = newGame({ w: 10, h: 10, mode: 'zen' });
  s = { ...s, body: [55, 54, 53, 63, 64, 65, 66], dir: 'right' };
  s = turn(s, 'down');
  const r = step(s);
  assert.equal(r.event, 'cut');
  assert.ok(r.state.alive);
  assert.ok(r.state.body.length < 7);
});

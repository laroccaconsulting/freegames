import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../template/core/rng.js';
import { SIZE, SHIPS, cellsOf, fits, randomFleet, fire, allSunk, afloat, aim, heat, parFor } from '../games/fleet/js/fleet.js';

test('random fleets: five ships, in bounds, never touching', () => {
  for (let s = 1; s <= 20; s++) {
    const ships = randomFleet(mulberry32(s));
    assert.deepEqual(ships.map((x) => x.len), SHIPS);
    for (let k = 0; k < ships.length; k++) {
      const others = ships.filter((_, j) => j !== k);
      assert.ok(fits(others, ships[k]), 'no overlap or touching');
      for (const i of cellsOf(ships[k])) assert.ok(i >= 0 && i < SIZE * SIZE);
    }
  }
});

test('firing: miss, hit, then sunk marks the whole ship', () => {
  const ships = [{ r: 0, c: 0, len: 2, across: true }];
  let r = fire(ships, {}, 50);
  assert.equal(r.result, 'miss');
  r = fire(ships, r.shots, 0);
  assert.equal(r.result, 'hit');
  r = fire(ships, r.shots, 1);
  assert.equal(r.result, 'sunk');
  assert.equal(r.shots[0], 'sunk');
  assert.ok(allSunk(ships, r.shots));
  assert.throws(() => fire(ships, r.shots, 1));
});

test('the heat map finishes a ship it has found', () => {
  const ships = [{ r: 4, c: 3, len: 3, across: true }];
  const shots = fire(ships, {}, 44).shots; // hit the middle
  const h = heat(shots, afloat(ships, shots));
  const best = [...h.keys()].sort((a, b) => h[b] - h[a])[0];
  assert.ok([43, 45, 34, 54].includes(best), `aims next to the hit, got ${best}`);
});

test('every level sinks a fleet; hard needs the fewest shots', () => {
  const avg = {};
  for (const level of ['easy', 'medium', 'hard']) {
    let total = 0;
    for (let s = 1; s <= 8; s++) {
      const random = mulberry32(s);
      const ships = randomFleet(random);
      let shots = {};
      let n = 0;
      while (!allSunk(ships, shots)) {
        shots = fire(ships, shots, aim(shots, afloat(ships, shots), level, random)).shots;
        n++;
      }
      total += n;
    }
    avg[level] = total / 8;
  }
  assert.ok(avg.hard < avg.easy);
  const ships = randomFleet(mulberry32(3));
  assert.equal(parFor(ships, 9), parFor(ships, 9), 'par is deterministic');
});

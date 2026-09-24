import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverMap, isFree, freeTiles, addToTray, pick, isWon, isLost, trayPeak } from '../games/trio/js/rules.js';
import { solve } from '../games/trio/js/solver.js';
import { generate, levelSpec, levelSeed, DAILY_SPEC } from '../games/trio/js/levels.js';

const T = (x, y, z, type = 0) => ({ x, y, z, type });

test('a tile is covered by overlapping tiles on higher layers only', () => {
  const tiles = [T(0, 0, 0), T(2, 0, 0), T(1, 0, 1), T(4, 0, 0)];
  const covers = coverMap(tiles);
  assert.deepEqual(covers[0], [2]);
  assert.deepEqual(covers[1], [2]);
  assert.deepEqual(covers[3], []);
  const removed = [0, 0, 0, 0];
  assert.deepEqual(freeTiles(covers, removed), [2, 3]);
  assert.ok(isFree(covers, [0, 0, 1, 0], 0));
});

test('tray groups like tiles and clears three of a kind', () => {
  let r = addToTray([1, 2], 1);
  assert.deepEqual(r.tray, [1, 1, 2]);
  assert.equal(r.at, 1);
  r = addToTray(r.tray, 1);
  assert.deepEqual(r.tray, [2]);
  assert.equal(r.cleared, 1);
  assert.equal(addToTray([3], 4).cleared, null);
});

test('pick, win and loss', () => {
  const tiles = [T(0, 0, 0, 5), T(2, 0, 0, 5), T(4, 0, 0, 5)];
  const covers = coverMap(tiles);
  let s = { types: [5, 5, 5], removed: [0, 0, 0], tray: [] };
  for (const i of [0, 1, 2]) s = pick(s, covers, i);
  assert.ok(isWon(s));
  assert.equal(pick(s, covers, 0), null, 'cannot pick a removed tile');
  assert.ok(isLost({ tray: [1, 2, 3, 4, 5, 6, 7] }));
  assert.ok(!isLost({ tray: [1, 2, 3, 4, 5, 6] }));
  assert.equal(trayPeak([0, 1, 0, 0, 1, 1], [0, 1, 2, 3, 4, 5]), 3);
});

test('solver finds the lowest tray peak on a small board', () => {
  // Two stacks: a triple of A is reachable only by digging through B.
  const tiles = [T(0, 0, 0, 0), T(0, 0, 1, 1), T(2, 0, 0, 0), T(2, 0, 1, 1), T(4, 0, 0, 0), T(4, 0, 1, 1)];
  const r = solve(tiles, coverMap(tiles));
  assert.equal(r.peak, 2);
  assert.ok(r.proven);
  assert.equal(trayPeak(tiles.map((t) => t.type), r.order), 2);
});

test('generated boards are winnable at par, and repeatable', () => {
  for (const level of [1, 4, 12, 30]) {
    const g = generate(levelSeed(level), levelSpec(level));
    assert.equal(g.tiles.length % 3, 0);
    const covers = coverMap(g.tiles);
    let s = { types: g.tiles.map((t) => t.type), removed: new Array(g.tiles.length).fill(0), tray: [] };
    let peak = 0;
    for (const i of g.solution) {
      s = pick(s, covers, i);
      assert.ok(s, `legal move on level ${level}`);
      assert.ok(!isLost(s));
      peak = Math.max(peak, s.tray.length);
    }
    assert.ok(isWon(s), `level ${level} clears`);
    assert.equal(peak, g.par);
    assert.deepEqual(generate(levelSeed(level), levelSpec(level)).tiles, g.tiles);
  }
  const d = generate(123, DAILY_SPEC);
  assert.ok(d.tiles.length >= 60);
});

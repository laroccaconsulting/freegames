import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, geometry, isFree, deal, reshuffle, moves, matches, matchKey } from '../games/mahjong/js/mahjong.js';

// Depth-first search for a full clearance (small layouts only).
function winnable(positions, faces, present, geo, budget = { n: 200000 }) {
  if (!present.some(Boolean)) return true;
  if (--budget.n < 0) return false;
  for (const [a, b] of moves(geo, faces, present)) {
    const next = present.slice();
    next[a] = next[b] = false;
    if (winnable(positions, faces, next, geo, budget)) return true;
  }
  return false;
}

test('layouts: even tile counts, the turtle has 144', () => {
  assert.equal(LAYOUTS.turtle.positions.length, 144);
  for (const l of Object.values(LAYOUTS)) assert.equal(l.positions.length % 2, 0);
});

test('free tiles: blocked from above, or on both sides', () => {
  const positions = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }];
  const geo = geometry(positions);
  const all = [true, true, true, true];
  assert.ok(isFree(geo, all, 0));
  assert.ok(!isFree(geo, all, 1), 'covered and flanked');
  assert.ok(isFree(geo, all, 3));
  assert.ok(!isFree(geo, [true, true, true, false], 1), 'flanked on both sides');
  assert.ok(isFree(geo, [false, true, true, false], 1));
});

test('deals use matching pairs and can be cleared', () => {
  for (const id of Object.keys(LAYOUTS)) {
    const faces = deal(id, 7);
    assert.deepEqual(faces, deal(id, 7), 'deterministic');
    const counts = {};
    for (const f of faces) counts[matchKey(f)] = (counts[matchKey(f)] || 0) + 1;
    for (const n of Object.values(counts)) assert.equal(n % 2, 0, 'faces come in pairs');
  }
  const { positions } = LAYOUTS.quick;
  const geo = geometry(positions);
  for (const seed of [1, 2, 3]) assert.ok(winnable(positions, deal('quick', seed), positions.map(() => true), geo), `quick deal ${seed} is winnable`);
  assert.ok(matches('f1', 'f4') && matches('s2', 's3') && !matches('f1', 's1') && matches('d3', 'd3') && !matches('d3', 'd4'));
});

test('reshuffles keep the same tiles and stay winnable', () => {
  const { positions } = LAYOUTS.quick;
  const geo = geometry(positions);
  const faces = deal('quick', 4);
  const present = positions.map(() => true);
  const [a, b] = moves(geo, faces, present)[0];
  present[a] = present[b] = false;
  const shuffled = reshuffle('quick', faces, present, 9);
  const keys = (fs) => fs.filter((_, i) => present[i]).map(matchKey).sort();
  assert.deepEqual(keys(shuffled), keys(faces));
  assert.ok(winnable(positions, shuffled, present, geo));
});

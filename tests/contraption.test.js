import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CHAPTERS } from '../games/contraption/js/levels.js';
import { simulate, problems, usage, analyse } from '../games/contraption/js/machine.js';

test('every level is winnable: its reference solution fits the box and wins', () => {
  const ids = new Set();
  for (const level of LEVELS) {
    assert.ok(!ids.has(level.id), `${level.id} is unique`);
    ids.add(level.id);
    assert.ok(CHAPTERS[level.chapter], `${level.id} has a chapter`);
    const parts = level.solution;
    assert.equal(problems(level, parts).size, 0, `${level.id}: solution parts are placeable ${JSON.stringify([...problems(level, parts)])}`);
    assert.deepEqual(usage(level, parts).over, [], `${level.id}: solution uses only parts on offer`);
    assert.ok(parts.length <= level.stars.parts, `${level.id}: solution meets the parts target`);
    const r = simulate(level, parts);
    assert.equal(r.status, 'win', `${level.id}: ${r.reason}`);
    assert.ok(r.time <= level.stars.time, `${level.id}: solution meets the time target (${r.time.toFixed(2)}s)`);
  }
});

test('an empty machine never wins', () => {
  for (const level of LEVELS) assert.notEqual(simulate(level, []).status, 'win', `${level.id} needs a machine`);
});

test('gear ratios: meshing flips and scales, chains keep direction, loops that disagree jam', () => {
  const g = (id, x, y, size) => ({ id, type: 'gear', p: [x, y], size });
  let { axles, trains } = analyse([{ id: 'm', type: 'motor', p: [2, 2], dir: 1 }, g('a', 2, 2, 1), g('b', 5, 2, 2), g('c', 5, 8, 1), { id: 'ch', type: 'chain', a: [5, 2], b: [5, 8] }]);
  assert.equal(axles.get('2,2').k, 1);
  assert.equal(axles.get('5,2').k, -0.5);
  assert.equal(axles.get('5,8').k, -1);
  assert.equal(trains.length, 1);
  assert.ok(!trains[0].jammed);
  ({ trains } = analyse([g('a', 2, 2, 1), g('b', 4, 2, 1), g('c', 3, 2 + Math.sqrt(3), 1)]));
  assert.ok(trains[0].jammed, 'three gears in a triangle jam');
});

test('gearing matters: the heavy crate needs gearing down, the throw needs gearing up', async () => {
  const { levelById } = await import('../games/contraption/js/levels.js');
  const direct = simulate(levelById('heavy'), [{ id: 'm', type: 'motor', p: [3, 12], dir: 1 }]);
  assert.notEqual(direct.status, 'win', 'a motor straight on the drum stalls');
  const half = simulate(levelById('gear-up'), [{ id: 'a', type: 'gear', p: [10, 5], size: 1 }, { id: 'b', type: 'gear', p: [7, 5], size: 2 }, { id: 'c', type: 'motor', p: [7, 5], dir: -1 }]);
  assert.notEqual(half.status, 'win', '2:1 is not fast enough');
});

test('a motor geared down by two pushes twice as hard', async () => {
  const P = await import('../games/contraption/js/physics.js');
  const w = P.makeWorld();
  const t = P.addTrain(w, { inertia: 0.1, motors: [{ k: 2, stall: 40, speed: 3 * Math.PI, dir: 1 }], damping: 0 });
  P.addBody(w, { kind: 'static', shape: P.circle(0.5), belt: { train: t, k: 1, r: 0.5 } });
  P.settle(w);
  for (let i = 0; i < 600; i++) P.step(w);
  assert.ok(Math.abs(t.v - (3 * Math.PI) / 2) < 0.01, 'free speed halves');
});

test('quality gates: slack around every solution and no cheap exploits', async () => {
  const { slack, exploits, describe } = await import('../scripts/contraption/lib.mjs');
  for (const level of LEVELS) {
    const s = slack(level);
    const need = level.minSlack ?? 0.25;
    assert.ok(s.slack >= need, `${level.id}: slack ${(s.slack * 100).toFixed(0)}% (${s.won}/${s.tried}) is under ${need * 100}%; reshape the level or pick a more central solution (scripts/contraption/centre.mjs)`);
    const ex = exploits(level, { stride: 2 });
    assert.equal(ex.length, 0, `${level.id}: a cheap machine wins: ${ex.length ? describe(ex[0]) : ''}`);
  }
});

test('determinism: every recorded machine behaves exactly as recorded', async () => {
  const { readFileSync } = await import('node:fs');
  const { outcomes } = await import('../scripts/contraption/golden.mjs');
  const was = JSON.parse(readFileSync(new URL('./contraption-golden.json', import.meta.url), 'utf8'));
  const now = outcomes();
  if (now.engine === was.engine) {
    for (const [id, o] of Object.entries(was.machines)) assert.deepEqual(now.machines[id], o, `${id} changed: bump ENGINE in physics.js on purpose, then node scripts/contraption/golden.mjs --write`);
  } else assert.fail(`ENGINE is ${now.engine} but the corpus was recorded on ${was.engine}: re-record with node scripts/contraption/golden.mjs --write`);
});

test('saved machines: old bare arrays load, unknown parts are dropped, round trip is exact', async () => {
  const { toSave, fromSave, FORMAT } = await import('../games/contraption/js/format.js');
  const parts = [{ id: 'a', type: 'ramp', a: [1, 2], b: [4, 3] }];
  assert.deepEqual(fromSave(parts).parts, parts, 'v0 array');
  assert.deepEqual(fromSave(toSave(parts)).parts, parts);
  assert.equal(toSave(parts).v, FORMAT);
  assert.deepEqual(fromSave([...parts, { id: 'x', type: 'teleporter' }]).parts, parts);
  assert.deepEqual(fromSave(null).parts, []);
});

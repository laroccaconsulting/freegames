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
  const g = (id, x, y, size, plane = 0) => ({ id, type: 'gear', p: [x, y], teeth: size * 10, plane });
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
  const half = simulate(levelById('gear-up'), [{ id: 'a', type: 'gear', p: [10, 5], teeth: 10 }, { id: 'b', type: 'gear', p: [7, 5], teeth: 20 }, { id: 'c', type: 'motor', p: [7, 5], dir: -1 }]);
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

test('compound gears: two gears on one peg, one per layer, multiply ratios to 60:1', () => {
  const g = (id, x, y, teeth, plane = 0) => ({ id, type: 'gear', p: [x, y], teeth, plane });
  // 10→30 in the back layer, 10→40 in the front, 15→25 back again: each pair's radii sum to a peg distance
  const parts = [
    { id: 'm', type: 'motor', p: [2, 2], dir: 1 },
    g('a', 2, 2, 10), g('b', 6, 2, 30), // 1:3, distance 4
    g('c', 6, 2, 10, 1), g('d', 6, 7, 40, 1), // 1:4 in the front layer, distance 5
    g('e', 6, 7, 15), g('f', 10, 7, 25), // 3:5 in the back layer, distance 4
  ];
  const { axles, trains } = analyse(parts);
  assert.ok(!trains[0].jammed);
  assert.ok(Math.abs(Math.abs(axles.get('10,7').k) - 1 / 20) < 1e-9, '1/3 × 1/4 × 3/5 = 1/20');
  // a front-layer gear does not mesh with a back-layer one
  const { trains: t2 } = analyse([g('x', 2, 2, 10, 0), g('y', 4, 2, 10, 1)]);
  assert.equal(t2.length, 2);
});

test('saved machines from before tooth counts load with 10/20/30 teeth', async () => {
  const { fromSave } = await import('../games/contraption/js/format.js');
  const old = { v: 1, engine: 1, parts: [{ id: 'g', type: 'gear', p: [3, 3], size: 2 }] };
  assert.deepEqual(fromSave(old).parts, [{ id: 'g', type: 'gear', p: [3, 3], teeth: 20, plane: 0 }]);
});

test('machines travel in links: encode, decode, compact enough for a big build', async () => {
  const { encodeMachine, decodeMachine, machineFromHash } = await import('../games/contraption/js/share.js');
  const { levelById } = await import('../games/contraption/js/levels.js');
  const level = levelById('grand');
  const link = await encodeMachine(level.id, level.solution);
  assert.match(link, /^[zj][A-Za-z0-9_-]+$/);
  const back = await decodeMachine(link);
  assert.equal(back.level, 'grand');
  assert.deepEqual(back.parts.map(({ id, ...p }) => p), level.solution.map(({ id, ...p }) => p));
  assert.equal(simulate(level, back.parts).status, 'win', 'a shared solution still wins');
  assert.equal(machineFromHash(`#m=${link}`), link);
  assert.equal(await decodeMachine('zgarbage'), null);
  // a 300-part machine stays a reasonable link
  const big = Array.from({ length: 300 }, (_, i) => ({ type: 'ramp', a: [i % 40, (i / 40) | 0], b: [(i % 40) + 3, ((i / 40) | 0) + 1] }));
  assert.ok((await encodeMachine('sandbox', big)).length < 4000);
});

test('every gallery machine still does what it says', async () => {
  const { GALLERY } = await import('../games/contraption/js/gallery.js');
  const { ALL_PARTS_SANDBOX, levelById } = await import('../games/contraption/js/levels.js');
  const ids = new Set();
  for (const g of GALLERY) {
    assert.ok(!ids.has(g.id), `${g.id} unique`);
    ids.add(g.id);
    const { BENCH } = await import('../games/contraption/js/levels.js');
    const level = g.level === 'sandbox' ? ALL_PARTS_SANDBOX : g.level === 'bench' ? BENCH : levelById(g.level);
    const parts = g.parts.map((p, i) => ({ ...p, id: `g${i}` }));
    assert.equal(problems(level, parts).size, 0, `${g.id} is placeable ${JSON.stringify([...problems(level, parts)])}`);
    if (g.show) {
      const { makeRun } = await import('../games/contraption/js/machine.js');
      const run = makeRun(level, parts);
      for (let i = 0; i < g.show * 120; i++) run.tick();
      assert.equal(run.status, 'running', `${g.id} keeps running`);
    } else assert.equal(simulate(level, parts).status, 'win', `${g.id} delivers`);
  }
});

test('logic: NAND + delay ticks, toggles count in binary, crossed NANDs remember', async () => {
  const { makeRun } = await import('../games/contraption/js/machine.js');
  const board = { id: 't', w: 24, h: 16, items: [], walls: [], parts: {}, stars: { parts: 99, time: 99 }, timeLimit: 30 };
  const W = (id, a, b) => ({ id, type: 'wire', a, b });
  // oscillator: NAND → delay(0.5 s) → back into the NAND; the NAND drives a chain of toggles
  const parts = [
    { id: 'n', type: 'nand', p: [2, 2] },
    { id: 'd', type: 'delay', p: [4, 2], wait: 0.5 },
    W('w1', [2, 2], [4, 2]),
    W('w2', [4, 2], [2, 2]),
    { id: 'b0', type: 'pixel', p: [6, 2], mode: 'toggle' },
    { id: 'b1', type: 'pixel', p: [8, 2], mode: 'toggle' },
    { id: 'b2', type: 'pixel', p: [10, 2], mode: 'toggle' },
    // each bit flips when the one before it falls: through a NOT (a one-wire NAND)
    { id: 'i0', type: 'nand', p: [6, 4] },
    { id: 'i1', type: 'nand', p: [8, 4] },
    W('w3', [2, 2], [6, 2]),
    W('w4', [6, 2], [6, 4]),
    W('w5', [6, 4], [8, 2]),
    W('w6', [8, 2], [8, 4]),
    W('w7', [8, 4], [10, 2]),
  ];
  const run = makeRun(board, parts);
  let rises = 0;
  let was = run.signals.get('n');
  for (let i = 0; i < 120 * 10; i++) {
    run.tick();
    const on = run.signals.get('n');
    if (on && !was) rises++;
    was = on;
  }
  // one full tick = two delays plus two one-step gate delays: about 1 s, so ~10 rises in 10 s
  assert.ok(rises >= 8 && rises <= 10, `oscillator rose ${rises} times in 10 s`);
  // the toggles count the NAND's rising edges, in binary (allow a step for the ripple)
  for (let i = 0; i < 12; i++) run.tick();
  const value = ['b0', 'b1', 'b2'].reduce((v, id, i) => v + (run.signals.get(id) ? 1 << i : 0), 0);
  assert.equal(value, rises % 8, `counter shows ${value}, rises ${rises}`);
  // SR latch: two crossed NANDs. "Set" (active low) is held for half a
  // second at the start, then released; the latch has to keep its state.
  const latch = makeRun(board, [
    { id: 'one', type: 'nand', p: [2, 8] }, // no inputs: always on
    { id: 'd', type: 'delay', p: [4, 8], wait: 0.5 }, // off for 0.5 s, then on
    { id: 'set', type: 'nand', p: [6, 8] }, // NOT of that: on for 0.5 s, then off
    { id: 'setLow', type: 'nand', p: [8, 8] }, // NOT again: low (asserted) for 0.5 s, then released
    W('p1', [2, 8], [4, 8]),
    W('p2', [4, 8], [6, 8]),
    W('p3', [6, 8], [8, 8]),
    { id: 'a', type: 'nand', p: [2, 2] },
    { id: 'c', type: 'nand', p: [2, 4] },
    W('x', [2, 2], [2, 4]),
    W('y', [2, 4], [2, 2]),
    W('s', [8, 8], [2, 2]),
  ]);
  for (let i = 0; i < 240; i++) latch.tick();
  const a1 = latch.signals.get('a');
  assert.equal(a1, true, 'set');
  assert.equal(latch.signals.get('c'), false);
  for (let i = 0; i < 240; i++) latch.tick();
  assert.equal(latch.signals.get('a'), a1, 'and it holds');
});

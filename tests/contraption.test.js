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
    const { BIG_BENCH } = await import('../games/contraption/js/levels.js');
    const level = g.level === 'sandbox' ? ALL_PARTS_SANDBOX : g.level === 'bench' ? BENCH : g.level === 'bench-big' ? BIG_BENCH : levelById(g.level);
    const parts = g.parts.map((p, i) => ({ ...p, id: `g${i}` }));
    const board = { ...level, ...(g.board || {}) };
    assert.equal(problems(board, parts).size, 0, `${g.id} is placeable ${JSON.stringify([...problems(board, parts)])}`);
    if (g.show) {
      const { makeRun } = await import('../games/contraption/js/machine.js');
      const run = makeRun(board, parts, { sandbox: true });
      for (let i = 0; i < g.show * 120; i++) run.tick();
      assert.equal(run.status, 'running', `${g.id} keeps running`);
    } else {
      // a gallery machine may take its time: run it as the gallery does
      const { makeRun } = await import('../games/contraption/js/machine.js');
      const run = makeRun(board, parts, { sandbox: true });
      while (run.status === 'running' && run.time < 60) run.tick();
      assert.equal(run.status, 'win', `${g.id} delivers: ${run.reason}`);
    }
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

test('chips: wrapped logic behaves exactly like the gates inside it', async () => {
  const { makeRun } = await import('../games/contraption/js/machine.js');
  const board = { id: 't', w: 24, h: 16, items: [], walls: [], parts: {}, stars: { parts: 99, time: 99 }, timeLimit: 30 };
  const NOT = { name: 'NOT', parts: [{ id: 'n', type: 'nand' }], links: [], inputs: ['n'], outputs: ['n'] };
  // chip at (6,2): input pin (6,3), output pin (9,3)
  const chip = { id: 'c', type: 'chip', p: [6, 2], def: NOT };
  const lamp = { id: 'L', type: 'pixel', p: [12, 3], mode: 'lamp' };
  const one = { id: 'one', type: 'nand', p: [2, 3] }; // always on
  const wIn = { id: 'w1', type: 'wire', a: [2, 3], b: [6, 3] };
  const wOut = { id: 'w2', type: 'wire', a: [9, 3], b: [12, 3] };
  const run = (parts) => {
    const r = makeRun(board, parts);
    for (let i = 0; i < 30; i++) r.tick();
    return r.signals.get('L');
  };
  assert.equal(run([one, chip, lamp, wIn, wOut]), false, 'NOT(on) is off');
  assert.equal(run([one, chip, lamp, wOut]), true, 'NOT(nothing) is on');
  // a chip's inner wiring: a 2-bit counter packed as one part keeps counting
  const COUNTER = {
    name: 'CNT',
    parts: [{ id: 'b0', type: 'pixel', mode: 'toggle' }, { id: 'i0', type: 'nand' }, { id: 'b1', type: 'pixel', mode: 'toggle' }],
    links: [['b0', 'i0'], ['i0', 'b1']],
    inputs: ['b0'],
    outputs: ['b0', 'b1'],
  };
  const r = makeRun(board, [
    { id: 'n', type: 'nand', p: [2, 2] },
    { id: 'd', type: 'delay', p: [2, 5], wait: 0.5 },
    { id: 'x1', type: 'wire', a: [2, 2], b: [2, 5] },
    { id: 'x2', type: 'wire', a: [2, 5], b: [2, 2] },
    { id: 'k', type: 'chip', p: [6, 2], def: COUNTER },
    { id: 'x3', type: 'wire', a: [2, 2], b: [6, 3] },
  ]);
  let rises = 0;
  let was = r.signals.get('n');
  for (let i = 0; i < 120 * 6; i++) {
    r.tick();
    const on = r.signals.get('n');
    if (on && !was) rises++;
    was = on;
  }
  for (let i = 0; i < 6; i++) r.tick();
  const v = (r.signals.get('k/b0') ? 1 : 0) + (r.signals.get('k/b1') ? 2 : 0);
  assert.equal(v, rises % 4, `chip counter shows ${v} after ${rises} beats`);
});

test('the digital clock tells the time: every beat for two minutes, rollovers included', async () => {
  const { buildClock, readClock } = await import('../games/contraption/js/clock.js');
  const { makeRun } = await import('../games/contraption/js/machine.js');
  const { BIG_BENCH } = await import('../games/contraption/js/levels.js');
  const { parts, display } = buildClock();
  assert.equal(problems(BIG_BENCH, parts).size, 0);
  const run = makeRun(BIG_BENCH, parts);
  const fmt = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  let beats = 0;
  let was = run.signals.get('beat');
  let since = -1;
  let checked = 0;
  while (beats < 125) {
    run.tick();
    const on = run.signals.get('beat');
    if (on && !was) {
      beats++;
      since = 0;
    } else if (since >= 0) since++;
    was = on;
    // read it a quarter second after each beat, once the ripple has settled
    if (since === 30) {
      assert.equal(readClock(run.signals, display), fmt(beats), `after ${beats} beats`);
      checked++;
    }
  }
  assert.ok(checked >= 124);
  assert.ok(Math.abs(run.time / beats - 1) < 0.01, `a beat is about a second (${(run.time / beats).toFixed(4)} s)`);
});

test('level editor: edits, solving, and level links that check their own solution', async () => {
  const E = await import('../games/contraption/js/editor.js');
  let d = E.newDraft();
  d = E.addRect(d, 'wall', [5.2, 6.7], [9.9, 7.1]);
  assert.deepEqual(d.walls.at(-1), [5, 6, 5, 2]);
  d = E.eraseAt(d, [6, 7]);
  assert.equal(d.walls.length, 2, 'the eraser takes the wall back out');
  d = E.placeAt(d, 'crate', [10.3, 3.2]);
  assert.equal(d.items.at(-1).deliver, false, 'later items are helpers');
  d = E.eraseAt(d, [10.5, 3]);
  assert.equal(d.items.length, 1);
  assert.equal(E.draftProblem(d), null);
  // solve it with one ramp from the ball towards the hole
  const ramp = [{ id: 'r', type: 'ramp', a: [2, 3], b: [9, 10] }];
  const r = simulate(d, ramp);
  assert.equal(r.status, 'win');
  d = E.solvedWith(d, ramp, r.time);
  assert.ok(d.solved && d.stars.parts === 1);
  const code = await E.encodeLevel(d);
  const back = await E.decodeLevel(code);
  assert.ok(back.custom && !back.unverified, 'a solved level round-trips and still verifies');
  assert.equal(E.levelFromHash(`#lv=${code}`), code);
  // a tampered level whose solution no longer wins is flagged
  const bad = await E.decodeLevel(await E.encodeLevel({ ...d, solution: [] }));
  assert.ok(bad.unverified);
  assert.equal(await E.decodeLevel('zjunk'), null);
});

test('the pendulum clock: the physics keeps time to within a few percent', async () => {
  const { buildClock, readClock, PENDULUM_BOARD } = await import('../games/contraption/js/clock.js');
  const { makeRun } = await import('../games/contraption/js/machine.js');
  const { BIG_BENCH } = await import('../games/contraption/js/levels.js');
  const { parts, display } = buildClock({ pendulum: true });
  const board = { ...BIG_BENCH, ...PENDULUM_BOARD };
  const run = makeRun(board, parts, { sandbox: true });
  const fmt = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  let beats = 0;
  let was = false;
  let since = -1;
  while (run.time < 75) {
    run.tick();
    const on = run.signals.get('beat');
    if (on && !was) {
      beats++;
      since = 0;
    } else if (since >= 0) since++;
    was = on;
    if (since === 30) assert.equal(readClock(run.signals, display), fmt(beats), `after ${beats} swings`);
  }
  assert.ok(Math.abs(beats / 75 - 1) < 0.03, `${beats} swings in 75 s`);
});

test('lamps that must light, then go dark, and memory that must hold', async () => {
  const { levelById } = await import('../games/contraption/js/levels.js');
  const ids = (ps) => ps.map((p, i) => ({ id: `t${i}`, ...p }));
  // One, not both: AND (lit once both are home, never dark again) fails
  const and = ids([
    { type: 'plate', p: [3, 8] }, { type: 'plate', p: [7, 9] }, { type: 'nand', p: [12, 12] }, { type: 'nand', p: [15, 12] },
    { type: 'wire', a: [3, 8], b: [12, 12] }, { type: 'wire', a: [7, 9], b: [12, 12] }, { type: 'wire', a: [12, 12], b: [15, 12] }, { type: 'wire', a: [15, 12], b: [20, 11] },
  ]);
  const r1 = simulate(levelById('one-not-both'), and);
  assert.equal(r1.status, 'fail');
  assert.match(r1.reason, /go dark/);
  // Set and reset: without the clear wire the lamp never goes out
  const noClear = levelById('set-reset').solution.filter((p) => !(p.type === 'wire' && p.b[1] === 6));
  assert.equal(simulate(levelById('set-reset'), noClear).status, 'fail');
  // Ride along and Keep it going: a short beam straight to the motor stops the belt
  assert.equal(simulate(levelById('ride-along'), ids([{ type: 'beam', a: [10, 8], b: [12, 8] }, { type: 'wire', a: [10, 8], b: [9, 9] }])).status, 'fail');
  assert.equal(simulate(levelById('hold-the-door'), ids([{ type: 'beam', a: [3, 1], b: [3, 15] }, { type: 'wire', a: [3, 1], b: [8, 9] }])).status, 'fail');
});

test('editor: lamp goals, fixed parts and movers, solved and shared by link', async () => {
  const ED = await import('../games/contraption/js/editor.js');
  // a lamp level: the heartbeat, made in the editor
  let d = ED.newDraft();
  d = ED.placeAt(d, 'lamp', [16.2, 8.1]);
  assert.equal(d.goal, null);
  assert.deepEqual(d.fixed.find((p) => p.id === 'lamp').p, [16, 8]);
  assert.ok(d.items.every((it) => it.deliver === false), 'a lamp level delivers nothing');
  d = ED.setLampGoal(d, { kind: 'blink', blinks: 3 });
  assert.deepEqual(d.signalGoal, { lamp: 'lamp', blinks: 3 });
  d = ED.setParts(d, { nand: 1, delay: 1, wire: 3 });
  assert.equal(ED.draftProblem(d), null);
  const beat = [
    { id: 'a', type: 'nand', p: [8, 8] }, { id: 'b', type: 'delay', p: [8, 11], wait: 1 },
    { id: 'c', type: 'wire', a: [8, 8], b: [8, 11] }, { id: 'e', type: 'wire', a: [8, 11], b: [8, 8] }, { id: 'f', type: 'wire', a: [8, 8], b: [16, 8] },
  ];
  const r = simulate(d, beat);
  assert.equal(r.status, 'win', r.reason);
  d = ED.solvedWith(d, beat, r.time);
  const back = await ED.decodeLevel(await ED.encodeLevel(d));
  assert.ok(!back.unverified, 'the shared lamp level re-runs and wins');
  assert.deepEqual(back.signalGoal, d.signalGoal);
  // erasing the lamp takes the lamp goal with it; the cup brings deliveries back
  const noLamp = ED.eraseAt(d, [16, 8]);
  assert.equal(noLamp.signalGoal, undefined);
  assert.match(ED.draftProblem(noLamp), /cup or a lamp/);
  const cupped = ED.placeAt(noLamp, 'cup', [17, 13]);
  assert.equal(cupped.items[0].deliver, true);

  // fixed parts: a switched motor and belt the player must wire up
  let f = ED.newDraft();
  f = ED.setFixed(f, [{ id: 'x', type: 'conveyor', a: [5, 9], b: [12, 9] }, { id: 'y', type: 'motor', p: [5, 9], dir: 1, delay: 0, switched: true }]);
  assert.deepEqual(f.fixed.map((p) => [p.id, p.fixed]), [['f1', true], ['f2', true]]);
  assert.equal(ED.fixedMachine(f).length, 2);
  assert.ok(ED.fixedMachine(f).every((p) => !p.fixed));

  // movers: a drag makes a slider, a tap a spinning arm; settings change them; the eraser removes them
  let m = ED.newDraft();
  m = ED.addMover(m, [6.2, 6], [6.1, 10.3]);
  assert.deepEqual(m.movers[0].path.from, [6, 6]);
  assert.deepEqual(m.movers[0].path.to, [6, 10.5]);
  m = ED.addMover(m, [10, 4], [10.1, 4.1]);
  assert.equal(m.movers[1].shape, 'bar');
  assert.equal(ED.moverAt(m, [6.5, 6.1]), 0);
  m = ED.setMover(m, 0, { shape: 'gate', period: 6, danger: true });
  assert.equal(ED.moverShapeOf(m.movers[0]), 'gate');
  assert.equal(m.movers[0].path.period, 6);
  assert.equal(m.movers[0].danger, true);
  assert.ok(simulate(m, []).status !== 'win', 'movers run without crashing');
  const back2 = await ED.decodeLevel(await ED.encodeLevel(m));
  assert.deepEqual(back2.movers, m.movers);
  m = ED.eraseAt(m, [10, 4]);
  assert.equal(m.movers.length, 1);
});

test('clockwork: an anchor escapement with real teeth keeps time, and gears turn the hands', async () => {
  const { buildGearClock, GEAR_CLOCK_BOARD } = await import('../games/contraption/js/clock.js');
  const { makeRun } = await import('../games/contraption/js/machine.js');
  const { BENCH } = await import('../games/contraption/js/levels.js');
  const board = { ...BENCH, ...GEAR_CLOCK_BOARD };
  const parts = buildGearClock().map((p, i) => ({ id: `c${i}`, ...p }));
  const run = makeRun(board, parts, { sandbox: true });
  const turns = (peg) => {
    const A = run.axles.get(peg);
    return (run.trains[A.train].theta * A.k) / (2 * Math.PI);
  };
  const pend = run.partBodies.get(parts.find((p) => p.type === 'pendulum').id).train;
  let swings = 0;
  let last = 0;
  let widest = 0;
  while (run.time < 120) {
    run.tick();
    const s = Math.sign(pend.v);
    if (s && s !== last) {
      if (last) swings++;
      last = s;
    }
    if (run.time > 100) widest = Math.max(widest, Math.abs(pend.theta));
  }
  assert.equal(run.status, 'running');
  // the seconds hand: once a minute, within 2%
  assert.ok(Math.abs(turns('4,6') / 2 - 1) < 0.02, `seconds hand turned ${turns('4,6').toFixed(3)} times in 2 minutes`);
  // one tooth per swing there and back: the wheel is never let slip
  assert.ok(Math.abs(turns('4,6') * 30 - swings / 2) < 1.5, `${(turns('4,6') * 30).toFixed(1)} teeth for ${swings} swings`);
  // the pendulum keeps swinging (the teeth keep pushing it)
  assert.ok(widest > 0.08, `still swinging ${widest.toFixed(3)} rad after 100 s`);
  // the hands: 60 to 1, then 12 to 1, all clockwise
  assert.ok(Math.abs(turns('16,13') * 60 - turns('4,6')) < 1e-6);
  assert.ok(Math.abs(turns('20,5') * 12 - turns('16,13')) < 1e-9);
  assert.ok(turns('20,5') > 0);
});

test('cleats carry a ball up a slope a smooth belt cannot; a trapdoor holds until its signal', async () => {
  const { ESCALATOR, TRAPDOOR_CATAPULT } = await import('../games/contraption/js/showcase.js');
  const { makeRun } = await import('../games/contraption/js/machine.js');
  const { BENCH } = await import('../games/contraption/js/levels.js');
  const go = (board, parts, T = 15) => {
    const run = makeRun({ ...BENCH, ...board }, parts.map((p, i) => ({ id: `t${i}`, ...p })), { sandbox: true });
    while (run.status === 'running' && run.time < T) run.tick();
    return run;
  };
  assert.equal(go(ESCALATOR.board, ESCALATOR.parts).status, 'win');
  const smooth = go(ESCALATOR.board, ESCALATOR.parts.map((p) => (p.type === 'conveyor' ? { ...p, cleats: false } : p)));
  assert.notEqual(smooth.status, 'win', 'a ball rolls back down a smooth belt');
  // without the wire the trapdoor never opens: the steel ball stays put
  const noWire = go(TRAPDOOR_CATAPULT.board, TRAPDOOR_CATAPULT.parts.filter((p) => p.type !== 'wire'), 6);
  assert.notEqual(noWire.status, 'win');
  assert.ok(Math.abs(noWire.items[1].y - TRAPDOOR_CATAPULT.board.items[1].y) < 0.1, 'the steel ball is still on the trapdoor');
});

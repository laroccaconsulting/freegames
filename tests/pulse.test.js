import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, initState, step, replay, percent, TICK, SPEEDS } from '../games/pulse/js/engine.js';
import { solve, fair, holdAt } from '../games/pulse/js/bot.js';
import { LEVELS, buildLevel, generate } from '../games/pulse/js/levels.js';

const level = (objects, extra = {}) => compile({ objects, length: 60, ...extra });

// Runs with a hold function of the tick until the attempt ends or `ticks` pass.
function run(lv, holdFn = () => false, ticks = 240 * 8, s = initState(lv)) {
  let prev = false;
  const events = [];
  for (let i = 0; i < ticks && !s.dead && !s.won; i++) {
    const hold = holdFn(s.tick, s);
    step(lv, s, hold, hold && !prev, events);
    prev = hold;
  }
  return { s, events };
}

test('a cube runs along flat ground to the end', () => {
  const { s } = run(level([]));
  assert.ok(s.won);
  assert.ok(!s.dead);
  assert.equal(s.y, 0.5);
});

test('running into a spike or a wall is fatal', () => {
  assert.ok(run(level([{ t: 'spike', x: 10, y: 0 }])).s.dead);
  assert.ok(run(level([{ t: 'block', x: 10, y: 0 }])).s.dead);
});

test('a jump clears three spikes and is about two blocks high', () => {
  const lv = level([{ t: 'spike', x: 10, y: 0 }, { t: 'spike', x: 11, y: 0 }, { t: 'spike', x: 12, y: 0 }]);
  let peak = 0;
  const jumpAt = Math.round((9.1 / SPEEDS[1]) / TICK);
  const { s } = run(lv, (t, st) => ((peak = Math.max(peak, st.y)), t >= jumpAt && t < jumpAt + 5));
  assert.ok(s.won, 'cleared');
  assert.ok(peak - 0.5 > 1.9 && peak - 0.5 < 2.4, `peak ${peak}`);
});

test('holding keeps jumping; you can land on and run across blocks', () => {
  const lv = level([{ t: 'block', x: 10, y: 0 }, { t: 'block', x: 11, y: 0 }, { t: 'block', x: 12, y: 0 }]);
  const { s, events } = run(lv, (t) => t > 150 && t < 190);
  assert.ok(s.won);
  assert.ok(events.filter((e) => e.type === 'jump').length >= 1);
});

test('orbs give a jump in mid-air, but only on a fresh press', () => {
  const pit = Array.from({ length: 7 }, (_, i) => ({ t: 'spike', x: 10 + i, y: 0 }));
  const lv = level([...pit, { t: 'orb', x: 13, y: 2 }]);
  const jumpAt = Math.round((9 / SPEEDS[1]) / TICK);
  // Holding from the ground straight through the orb does nothing.
  assert.ok(run(lv, (t) => t >= jumpAt && t < jumpAt + 60).s.dead);
  // Let go, then tap on the orb.
  let tapped = false;
  const { s, events } = run(lv, (t, st) => {
    if (t >= jumpAt && t < jumpAt + 4) return true;
    if (st.orb >= 0 && !tapped) return (tapped = true);
    return false;
  });
  assert.ok(events.some((e) => e.type === 'orb'));
  assert.ok(s.won);
});

test('pads launch, portals change mode and gravity', () => {
  let peak = 0;
  run(level([{ t: 'pad', x: 5, y: 0 }]), (t, st) => ((peak = Math.max(peak, st.y)), false), 240);
  assert.ok(peak > 4, `pad peak ${peak}`);
  const ship = run(level([{ t: 'portal', x: 5, y: 1, v: 'ship' }]), () => true, 240);
  assert.equal(ship.s.mode, 'ship');
  assert.equal(ship.s.ceil, 10);
  assert.ok(ship.s.y > 3, 'holding flies up');
  const up = run(level([{ t: 'portal', x: 5, y: 1, v: 'up' }, ...Array.from({ length: 50 }, (_, i) => ({ t: 'block', x: i, y: 5 }))]), () => false, 240);
  assert.equal(up.s.grav, -1);
  assert.ok(Math.abs(up.s.y - 4.5) < 1e-6, 'standing on the roof');
  assert.ok(up.s.grounded);
  const wave = run(level([{ t: 'portal', x: 5, y: 1, v: 'wave' }]), () => true, 120);
  assert.equal(wave.s.mode, 'wave');
  assert.ok(Math.abs(wave.s.vy - SPEEDS[1]) < 1e-9, 'wave climbs at 45°');
});

test('ball flips gravity on a tap', () => {
  const lv = level([{ t: 'portal', x: 3, y: 1, v: 'ball', c: 6 }]);
  const { s } = run(lv, (t) => t >= 200 && t < 204, 240 * 2);
  assert.equal(s.mode, 'ball');
  assert.equal(s.grav, -1);
  assert.ok(Math.abs(s.y - 5.5) < 1e-6);
});

test('coins are collected once', () => {
  const lv = level([{ t: 'coin', x: 8, y: 0 }]);
  const { s, events } = run(lv);
  assert.deepEqual(s.coins, [0]);
  assert.equal(events.filter((e) => e.type === 'coin').length, 1);
});

test('replays are deterministic and holdAt matches the toggles', () => {
  const lv = buildLevel(LEVELS[0]);
  const sol = solve(lv);
  assert.ok(sol.ok);
  const a = replay(lv, sol.toggles);
  const b = run(lv, holdAt(sol.toggles), 1e6).s;
  assert.ok(a.won && b.won);
  assert.equal(a.tick, b.tick);
  assert.equal(percent(lv, a), 100);
});

test('the fairness check is stricter than just beatable', () => {
  // Land in a short gap and jump straight out again: possible, but it
  // leaves less than a 50 ms window.
  const spikes = [10, 11, 12, 18, 19, 20].map((x) => ({ t: 'spike', x, y: 0 }));
  const lv = level(spikes);
  assert.ok(solve(lv).ok);
  assert.ok(fair(lv, { slack: 4 }));
  assert.equal(fair(lv, { slack: 6 }), null);
  // Its run survives every input being moved a little on its own.
  const run = fair(level([{ t: 'spike', x: 12, y: 0 }, { t: 'spike', x: 13, y: 0 }]), { slack: 4 });
  for (const d of [-3, 3]) assert.ok(replay(level([{ t: 'spike', x: 12, y: 0 }, { t: 'spike', x: 13, y: 0 }]), run.map((t) => t + d)).won);
});

test('every hand-made level can be beaten, with every coin', () => {
  for (const def of LEVELS) {
    const lv = buildLevel(def);
    assert.equal(lv.coins, 3, `${def.id} has three coins`);
    const sol = solve(lv, { budget: 3e6 });
    assert.ok(sol.ok, `${def.id} beatable (stuck at ${sol.best?.toFixed(1)})`);
    assert.ok(replay(lv, sol.toggles).won);
    assert.ok(fair(lv, { slack: 6, budget: 3e6 }), `${def.id}: every input has a 50 ms window`);
    for (let c = 0; c < lv.coins; c++) {
      const got = solve(lv, { need: c, budget: 3e6 });
      assert.ok(got.ok, `${def.id} coin ${c} reachable`);
      assert.ok(replay(lv, got.toggles).coins.includes(c));
    }
  }
});

test('generated levels are proven beatable within a few re-rolls', () => {
  for (const [seed, d] of [['daily:2026-09-25', 0], ['daily:2026-09-26', 1], ['r12345', 2], ['r777', 3]]) {
    {
      let ok = false;
      for (let k = 0; k < 10 && !ok; k++) ok = !!fair(generate(seed, d, k), { budget: 250000 });
      assert.ok(ok, `${seed} at difficulty ${d}`);
    }
  }
  // Same seed, same level.
  assert.deepEqual(generate('x', 1).objects.map((o) => [o.t, o.x, o.y]), generate('x', 1).objects.map((o) => [o.t, o.x, o.y]));
});

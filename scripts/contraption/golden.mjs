#!/usr/bin/env node
// The determinism corpus: every level solution (and any featured machine
// added to GOLDEN below) run to the end, with the exact outcome recorded.
// tests/contraption.test.js replays them; any engine change that alters a
// result fails until it is a deliberate ENGINE bump and this file is
// re-written with --write.
//   node scripts/contraption/golden.mjs          compare
//   node scripts/contraption/golden.mjs --write  record
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { LEVELS, simulate, withIds } from './lib.mjs';
import { ENGINE } from '../../games/contraption/js/physics.js';

const FILE = new URL('../../tests/contraption-golden.json', import.meta.url);
const r6 = (v) => Math.round(v * 1e6) / 1e6 || 0; // no -0: JSON cannot keep it

export function outcomes() {
  const out = {};
  for (const level of LEVELS) {
    const r = simulate(level, withIds(level.solution.map(({ id, ...p }) => p)));
    out[level.id] = { status: r.status, steps: r.run.steps, items: r.run.items.map((b) => [r6(b.x), r6(b.y), r6(b.angle)]) };
  }
  return { engine: ENGINE, machines: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const now = outcomes();
  if (process.argv.includes('--write')) {
    writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
    console.log(`wrote ${Object.keys(now.machines).length} machines, engine ${ENGINE}`);
  } else {
    const was = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { machines: {} };
    let diff = 0;
    for (const [id, o] of Object.entries(now.machines)) if (JSON.stringify(o) !== JSON.stringify(was.machines[id])) (diff++, console.log('changed:', id));
    console.log(diff ? `${diff} changed` : 'all identical');
  }
}

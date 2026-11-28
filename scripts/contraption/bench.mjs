#!/usr/bin/env node
// The machine workbench: run a Gallery machine (or a JSON file of
// { board, parts }) headless and report what happened.
//   node scripts/contraption/bench.mjs <id|file.json> [--seconds T] [--trace]
//        [--land] [--signals id,id] [--at x,y]
// --trace     every item's path, sampled every 0.25 s
// --land      where each item first comes to rest, or leaves the board
// --signals   when each listed part's signal turns on and off
// --at x,y    which parts are on that peg (to find a part's id)
import { readFileSync } from 'node:fs';
import { makeRun, problems } from '../../games/contraption/js/machine.js';
import { BENCH } from '../../games/contraption/js/levels.js';
import { MACHINES } from '../../games/contraption/js/machines/index.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const name = args[0];
const spec = name.endsWith('.json') ? JSON.parse(readFileSync(name, 'utf8')) : MACHINES.find((m) => m.id === name);
if (!spec) throw new Error(`No machine ${name}. Known: ${MACHINES.map((m) => m.id).join(', ')}`);
const board = { ...BENCH, id: `gallery:${spec.id || 'x'}`, timeLimit: Infinity, ...spec.board };
const parts = spec.parts.map((p, i) => ({ id: p.id || `g${i}`, ...p }));
const T = Number(opt('--seconds')) || spec.seconds || 20;

const probs = [...problems(board, parts)];
console.log(probs.length ? `PROBLEMS ${probs.map(([id, why]) => `${id} (${parts.find((p) => p.id === id)?.type}): ${why}`).join('; ')}` : 'placement ok');
if (opt('--at')) {
  const [x, y] = opt('--at').split(',').map(Number);
  console.log(parts.filter((p) => [p.p, p.a, p.b].some((q) => q && q[0] === x && q[1] === y)).map((p) => `${p.id} ${p.type}`).join(', ') || 'nothing there');
}
const run = makeRun(board, parts, { sandbox: true });
const s = {};
const trace = run.items.map(() => []);
const rest = run.items.map(() => null);
const still = run.items.map(() => 0);
const sigIds = (opt('--signals') || '').split(',').filter(Boolean);
const sigWas = new Map();
const sigLog = [];
while (run.time < T && (run.status === 'running' || !board.goal)) {
  run.tick();
  spec.watch?.(run, s);
  if (run.steps % 30 === 0) run.items.forEach((b, i) => trace[i].push(`${b.x.toFixed(1)},${b.y.toFixed(1)}`));
  run.items.forEach((b, i) => {
    if (rest[i]) return;
    if (b.gone) rest[i] = `left the board at ${run.time.toFixed(1)} s`;
    else if (Math.hypot(b.vx, b.vy) < 0.05) {
      if ((still[i] += 1) > 60) rest[i] = `rests at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}) from ${(run.time - 0.5).toFixed(1)} s`;
    } else still[i] = 0;
  });
  for (const id of sigIds) {
    const on = !!run.signals.get(id);
    if (on !== !!sigWas.get(id)) sigLog.push(`${run.time.toFixed(2)} ${id} ${on ? 'on' : 'off'}`);
    sigWas.set(id, on);
  }
  if (board.goal && run.status !== 'running') break;
}
console.log(`ran ${run.time.toFixed(2)} s: ${run.status}${run.reason ? ` (${run.reason})` : ''}`);
if (spec.verify) console.log(`verify: ${spec.verify(run, s) ?? 'ok'}`);
if (flag('--land')) run.items.forEach((b, i) => console.log(`item ${i} ${board.items[i].type}: ${rest[i] || `still moving at (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`}`));
if (flag('--trace')) trace.forEach((t, i) => console.log(`item ${i} ${board.items[i].type}: ${t.join(' ')}`));
if (sigLog.length) console.log(sigLog.join('\n'));

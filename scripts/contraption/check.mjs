#!/usr/bin/env node
// The quality gates for every level: solution wins within its targets,
// slack around the solution, and no cheap exploit.
//   node scripts/contraption/check.mjs [levelId|all] [--stride 2]
import { LEVELS, levelById, runOnce, slack, exploits, describe } from './lib.mjs';

const args = process.argv.slice(2);
const id = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const stride = Number(args[args.indexOf('--stride') + 1]) || 2;
let bad = 0;
for (const level of id === 'all' ? LEVELS : [levelById(id)]) {
  const r = runOnce(level, level.solution.map(({ id: _, ...p }) => p));
  const s = slack(level);
  const ex = exploits(level, { stride });
  const need = level.minSlack ?? 0.25;
  const ok = r.status === 'win' && s.slack >= need && ex.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${level.id.padEnd(12)} ${r.status} ${r.time.toFixed(2)}s  slack ${(s.slack * 100).toFixed(0).padStart(3)}% (${s.won}/${s.tried}, need ${need * 100}%)  exploits ${ex.length}${ex.length ? ` e.g. ${describe(ex[0])}` : ''}`);
}
process.exit(bad ? 1 : 0);

#!/usr/bin/env node
// Run a level's reference solution (or a machine given as JSON) headless.
//   node scripts/contraption/sim.mjs <levelId|all> ['<parts json>'] [--trace]
import { LEVELS, levelById, runOnce, problems, withIds, describe } from './lib.mjs';

const [id = 'all', json, ...flags] = process.argv.slice(2);
const trace = flags.includes('--trace') || json === '--trace';
const custom = json && json !== '--trace' ? JSON.parse(json) : null;
for (const level of id === 'all' ? LEVELS : [levelById(id)]) {
  if (!level) throw new Error(`No level ${id}`);
  const parts = custom || level.solution.map(({ id: _, ...p }) => p);
  const probs = problems(level, withIds(parts));
  const r = runOnce(level, parts);
  console.log(`${level.id.padEnd(12)} ${r.status.padEnd(4)} ${r.time.toFixed(2).padStart(6)} s  ${r.reason}${probs.size ? `  problems: ${JSON.stringify([...probs])}` : ''}`);
  if (trace) {
    r.paths.forEach((p, i) => console.log(`  item ${i}:`, p.filter((_, k) => k % 8 === 0).map((q) => q.map((v) => v.toFixed(1)).join(',')).join('  ')));
    if (custom) console.log('  machine', describe(withIds(parts)));
  }
}

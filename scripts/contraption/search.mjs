#!/usr/bin/env node
// Try a family of machines on a level and report winners and why the rest failed.
//   node scripts/contraption/search.mjs <levelId> '<JS expression → array of part lists>' [--top N]
// The expression can use range, grid, ramps, pads, ramp, bouncer, conv, lever,
// weight, motor, gear and chain from lib.mjs, e.g.
//   "ramps(range(1,4), range(2,5), range(6,12), range(6,11)).map(r => [r])"
import * as lib from './lib.mjs';

const [id, expr, ...rest] = process.argv.slice(2);
const top = Number(rest[rest.indexOf('--top') + 1]) || 12;
const level = lib.levelById(id);
if (!level || !expr) {
  console.error("Usage: search.mjs <levelId> '<expression>' [--top N]");
  process.exit(1);
}
const candidates = new Function(...Object.keys(lib), `return (${expr});`)(...Object.values(lib));
const { wins, tally, tried } = lib.search(level, candidates);
console.log(`${wins.length} wins of ${tried} legal (${candidates.length} candidates)`);
for (const [t, c] of wins.slice(0, top)) console.log(t.toFixed(2), lib.describe(c));
console.log('why the rest ended:');
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(String(n).padStart(6), k);

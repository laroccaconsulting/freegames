#!/usr/bin/env node
// Find the most forgiving winning machine in a family: the winner whose
// neighbours (see lib.neighbours) win most often. Use it to pick a level's
// reference solution, or to see whether a level needs reshaping.
//   node scripts/contraption/centre.mjs <levelId> '<JS expression → array of part lists>'
import * as lib from './lib.mjs';

const [id, expr] = process.argv.slice(2);
const level = lib.levelById(id);
const candidates = new Function(...Object.keys(lib), `return (${expr});`)(...Object.values(lib));
const best = lib.centre(level, candidates);
if (!best.length) console.log('no winners');
for (const b of best) console.log(`${(b.slack * 100).toFixed(0).padStart(3)}% (${b.won}/${b.tried})  ${b.time.toFixed(2)}s  ${lib.describe(b.parts)}`);

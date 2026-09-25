#!/usr/bin/env node
// Builds the word lists for games/words/data from two public-domain sources:
//   ENABLE (enable1.txt): every playable word. Public domain.
//     https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
//   5000 more common words (Michael Wehar, public domain, made with OPTED):
//     https://raw.githubusercontent.com/MichaelWehar/Public-Domain-Word-Lists/master/5000-more-common.txt
// Usage: node scripts/build-words.mjs <enable1.txt> <5000-more-common.txt>
//
// words.txt  every ENABLE word of 3–9 letters: what players may enter.
// common.txt the common words plus their plain inflections (-s, -es, -ed,
//            -ing) found in ENABLE: what puzzles are built from.
// Offensive words are left out of both (games/words/js/blocklist.js).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';
import { isBlocked } from '../games/words/js/blocklist.js';

const [enablePath, commonPath] = process.argv.slice(2);
if (!enablePath || !commonPath) {
  console.error('Usage: node scripts/build-words.mjs <enable1.txt> <5000-more-common.txt>');
  process.exit(1);
}
const clean = (text) => text.split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w));
const enable = new Set(clean(await readFile(enablePath, 'utf8')).filter((w) => w.length >= 3 && w.length <= 9 && !isBlocked(w)));
const base = clean(await readFile(commonPath, 'utf8')).filter((w) => enable.has(w));

// Plain inflections only (plurals and verb forms); comparatives and -ly
// forms invent too many odd words ("enterer").
const forms = (w) => {
  const out = [w];
  if (/(s|x|z|ch|sh|o)$/.test(w)) out.push(`${w}es`);
  else if (/[^aeiou]y$/.test(w)) out.push(`${w.slice(0, -1)}ies`, `${w.slice(0, -1)}ied`);
  else out.push(`${w}s`);
  if (w.endsWith('e')) out.push(`${w}d`, `${w.slice(0, -1)}ing`);
  else {
    out.push(`${w}ed`, `${w}ing`);
    if (/[^aeiou][aeiou][bdglmnprt]$/.test(w)) out.push(`${w}${w.at(-1)}ed`, `${w}${w.at(-1)}ing`);
  }
  return out;
};
const common = new Set();
for (const w of base) for (const f of forms(w)) if (enable.has(f)) common.add(f);

const dir = join(ROOT, 'games', 'words', 'data');
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'words.txt'), [...enable].sort().join('\n') + '\n');
await writeFile(join(dir, 'common.txt'), [...common].sort().join('\n') + '\n');
console.log(`words.txt: ${enable.size} words, common.txt: ${common.size} words`);

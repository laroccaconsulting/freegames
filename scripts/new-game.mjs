#!/usr/bin/env node
// Usage: node scripts/new-game.mjs <slug> "<Display Name>" ["Description"]
// Copies template/ to games/<slug>/ and fills in the placeholders.
import { cp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const [slug, name, description] = process.argv.slice(2);
if (!slug || !name || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: node scripts/new-game.mjs <slug> "<Display Name>" ["Description"]');
  process.exit(1);
}
const dest = join(ROOT, 'games', slug);
if (existsSync(dest)) {
  console.error(`games/${slug} already exists`);
  process.exit(1);
}
await cp(join(ROOT, 'template'), dest, { recursive: true });

const replacements = {
  '{{NAME}}': name,
  '{{SLUG}}': slug,
  '{{DESCRIPTION}}': description || `${name} — free, no ads, works offline.`,
};
async function fill(dir) {
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) await fill(path);
    else if (/\.(html|js|css|webmanifest|json|svg|md)$/.test(entry)) {
      let text = await readFile(path, 'utf8');
      for (const [k, v] of Object.entries(replacements)) text = text.replaceAll(k, v);
      await writeFile(path, text);
    }
  }
}
await fill(dest);
console.log(`Created games/${slug}. Next: edit icons/icon.svg, then run
  node scripts/icons.mjs games/${slug}
  node scripts/build-sw.mjs`);

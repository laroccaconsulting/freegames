#!/usr/bin/env node
// Regenerates each app's service worker precache list and content-hash version.
// Run before every deploy so installed copies pick up the new files.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROOT, appDirs, listFiles, achievementsModule } from './lib.mjs';

const SKIP = /(^|\/)(sw\.js|README\.md|.*\.test\.js)$/;

// The games list shows every game's achievements, so gather each game's
// achievements.js into one file there (before hashing the hub's files).
const catalogue = {};
for (const dir of await appDirs()) {
  const slug = basename(dir);
  if (slug === 'template' || !existsSync(join(dir, 'achievements.js'))) continue;
  catalogue[slug] = (await import(pathToFileURL(join(dir, 'achievements.js')).href)).default;
}
await writeFile(join(ROOT, 'site', 'achievements.js'), achievementsModule(catalogue));
console.log(`site/achievements.js: ${Object.keys(catalogue).length} games`);

// The hub page (site/) is installable too and gets its own worker.
for (const dir of [...(await appDirs()), join(ROOT, 'site')]) {
  const files = (await listFiles(dir)).filter((f) => !SKIP.test(f));
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(await readFile(join(dir, f)));
  const version = hash.digest('hex').slice(0, 12);
  const swPath = join(dir, 'sw.js');
  let sw = await readFile(swPath, 'utf8');
  const list = ['./', ...files.map((f) => `./${f}`)];
  sw = sw
    .replace(/const VERSION = .*?;/, `const VERSION = '${version}';`)
    .replace(/const FILES = \[[\s\S]*?\];/, `const FILES = ${JSON.stringify(list, null, 2).replaceAll('"', "'")};`);
  await writeFile(swPath, sw);
  console.log(`${relative(ROOT, dir)}: ${list.length} files, version ${version}`);
}

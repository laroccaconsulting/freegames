#!/usr/bin/env node
// Regenerates each app's service worker precache list and content-hash version.
// Run before every deploy so installed copies pick up the new files.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { ROOT, appDirs, listFiles } from './lib.mjs';

const SKIP = /(^|\/)(sw\.js|README\.md|.*\.test\.js)$/;

for (const dir of await appDirs()) {
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

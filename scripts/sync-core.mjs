#!/usr/bin/env node
// Copies template/core into every game so each stays independently deployable,
// and core/hallows.js into the hub page (site/).
import { cp, copyFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT, appDirs } from './lib.mjs';

const source = join(ROOT, 'template', 'core');
for (const dir of (await appDirs()).slice(1)) {
  await rm(join(dir, 'core'), { recursive: true, force: true });
  await cp(source, join(dir, 'core'), { recursive: true });
  console.log(`synced core → ${relative(ROOT, dir)}`);
}

// The hub page draws the same autumn scenery as the games.
await copyFile(join(source, 'hallows.js'), join(ROOT, 'site', 'hallows.js'));
console.log('synced core/hallows.js → site');

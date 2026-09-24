#!/usr/bin/env node
// Copies template/core into every game so each stays independently deployable.
import { cp, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT, appDirs } from './lib.mjs';

const source = join(ROOT, 'template', 'core');
for (const dir of (await appDirs()).slice(1)) {
  await rm(join(dir, 'core'), { recursive: true, force: true });
  await cp(source, join(dir, 'core'), { recursive: true });
  console.log(`synced core → ${relative(ROOT, dir)}`);
}

import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every deployable app: the template plus each folder in games/.
export async function appDirs() {
  const games = join(ROOT, 'games');
  const dirs = [join(ROOT, 'template')];
  for (const entry of await readdir(games).catch(() => [])) {
    const path = join(games, entry);
    if ((await stat(path)).isDirectory()) dirs.push(path);
  }
  return dirs;
}

export async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of (await readdir(dir)).sort()) {
    if (entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) out.push(...(await listFiles(path, base)));
    else out.push(relative(base, path).split('\\').join('/'));
  }
  return out;
}

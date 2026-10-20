// The README's games table is the map new sessions start from: keep it
// listing every game folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readme = readFileSync(new URL('README.md', root), 'utf8');
const games = readdirSync(new URL('games/', root), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

test('README lists every game folder', () => {
  for (const slug of games) assert.ok(readme.includes(`[\`games/${slug}\`](games/${slug})`), `README is missing games/${slug}`);
});

test('docs linked from README exist', () => {
  for (const [, path] of readme.matchAll(/\]\(((?:docs\/)?[A-Z]+[\w/]*\.md)\)/g)) readFileSync(new URL(path, root));
  readFileSync(new URL('docs/DEVELOPING.md', root));
});

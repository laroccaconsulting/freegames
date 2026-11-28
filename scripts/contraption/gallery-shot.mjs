#!/usr/bin/env node
// Screenshot a Gallery machine in the real game, a few seconds into its run.
//   node scripts/contraption/gallery-shot.mjs <id> <out.png> [seconds=3] [port=8080]
// Needs a static server on the games folder (python3 -m http.server 8080).
import { execSync } from 'node:child_process';
import { join } from 'node:path';
const [id, out, secs = 3, port = 8080] = process.argv.slice(2);
let pw;
try { pw = await import('playwright'); } catch { pw = await import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')); }
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/contraption/`);
await page.evaluate(async () => {
  const { LEVELS } = await import('./js/levels.js');
  const { CHANGES } = await import('./js/changes.js');
  const p = {};
  LEVELS.forEach((l) => { p[l.id] = { solved: true, stars: 2, time: 5, parts: 2, score: 1200 }; });
  localStorage.setItem('contraption:progress', JSON.stringify(p));
  localStorage.setItem('contraption:seenChanges', JSON.stringify(CHANGES[0].id));
});
await page.reload();
await page.waitForTimeout(600);
await page.click('#t-gallery');
await page.waitForTimeout(300);
const { GALLERY } = await page.evaluate(async () => ({ GALLERY: (await import('./js/gallery.js')).GALLERY.map((g) => [g.id, g.title]) }));
const title = GALLERY.find(([gid]) => gid === id)?.[1];
if (!title) throw new Error(`No gallery entry ${id}`);
await page.click(`dialog[open] .gallery-item:has(h3:text-is("${title}")) button`);
await page.waitForTimeout(500);
await page.click('#d-run');
await page.waitForTimeout(Number(secs) * 1000);
await page.screenshot({ path: out });
console.log(errors.length ? `errors: ${JSON.stringify(errors)}` : 'no page errors');
await browser.close();

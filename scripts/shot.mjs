#!/usr/bin/env node
// Dev tool: open a page in headless Chromium, optionally run a script, save a
// screenshot and print any page errors. Uses the globally installed Playwright.
//
//   node scripts/shot.mjs <url> <out.png> [width=390] [height=780] [script-file]
//
// The script file is the body of an async function with `page` in scope, e.g.
//   await page.click('#hint-btn'); await page.waitForTimeout(500);
// To reach a tricky game state, write it into localStorage and reload rather
// than clicking through many moves (long click loops can crash the browser).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [url, out, w = 390, h = 780, scriptFile] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [script-file]');
  process.exit(1);
}
let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs'));
}
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(800);
if (scriptFile) {
  const run = new Function('page', `return (async () => { ${readFileSync(scriptFile, 'utf8')} })()`);
  await run(page);
}
await page.screenshot({ path: out });
console.log(errors.length ? `errors: ${JSON.stringify(errors)}` : 'no page errors');
await browser.close();

#!/usr/bin/env node
// Renders <app>/icons/icon.svg to the PNG sizes browsers and iOS need,
// using the Playwright Chromium. Usage: node scripts/icons.mjs games/<slug>
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { ROOT } from './lib.mjs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return await import(join(globalRoot, 'playwright', 'index.mjs'));
  }
}

const dir = resolve(ROOT, process.argv[2] || 'template');
const svg = await readFile(join(dir, 'icons', 'icon.svg'), 'utf8');
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();

// [file, size, rounded corners]
const outputs = [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];
for (const [file, size, rounded] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  const radius = rounded ? size * 0.22 : 0;
  await page.setContent(
    `<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden">
        ${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}
      </div></body></html>`,
  );
  await page.screenshot({ path: join(dir, 'icons', file), omitBackground: true });
  console.log(`icons/${file}`);
}
await browser.close();

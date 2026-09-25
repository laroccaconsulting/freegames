import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { record, tally } from '../template/core/achievements.js';
import { summarise, latest } from '../site/trophies.js';
import CATALOGUE from '../site/achievements.js';
import { achievementsModule } from '../scripts/lib.mjs';

const gamesDir = new URL('../games/', import.meta.url);
const slugs = readdirSync(gamesDir).filter((d) => statSync(new URL(d, gamesDir)).isDirectory());
const defsOf = async (slug) => (await import(pathToFileURL(new URL(`${slug}/achievements.js`, gamesDir).pathname).href)).default;

test('record: one-offs unlock once, goals fill up, at() keeps the best', () => {
  const once = { id: 'a' };
  const goal = { id: 'g', goal: 3 };
  let r = record({}, 'x', once, { add: 1, now: 5 });
  assert.ok(r.unlocked);
  assert.equal(r.data.x.done.a, 5);
  r = record(r.data, 'x', once, { add: 1, now: 9 });
  assert.ok(!r.unlocked, 'already unlocked');
  assert.equal(r.data.x.done.a, 5);
  let d = r.data;
  for (let k = 0; k < 2; k++) ({ data: d } = record(d, 'x', goal, { add: 1 }));
  assert.equal(d.x.count.g, 2);
  assert.ok(!d.x.done.g);
  ({ data: d, unlocked: r } = record(d, 'x', goal, { add: 1 }));
  assert.ok(r && d.x.done.g);
  let e = record({}, 'y', { id: 'best', goal: 10 }, { at: 4 }).data;
  e = record(e, 'y', { id: 'best', goal: 10 }, { at: 2 }).data;
  assert.equal(e.y.count.best, 4, 'at() never lowers progress');
  assert.ok(record(e, 'y', { id: 'best', goal: 10 }, { at: 12 }).unlocked);
  assert.deepEqual(tally(d, 'x', [once, goal, { id: 'z' }]), { done: 2, total: 3 });
});

test('every game has achievements: valid, unique, and wired into its code', async () => {
  for (const slug of slugs) {
    assert.ok(existsSync(new URL(`${slug}/achievements.js`, gamesDir)), `${slug} has achievements.js`);
    const defs = await defsOf(slug);
    assert.ok(Array.isArray(defs) && defs.length >= 5, `${slug} has at least 5 achievements`);
    const ids = new Set();
    for (const d of defs) {
      assert.match(d.id, /^[a-z0-9-]+$/, `${slug}/${d.id} id`);
      assert.ok(!ids.has(d.id), `${slug}/${d.id} is unique`);
      ids.add(d.id);
      assert.ok(typeof d.title === 'string' && d.title && typeof d.desc === 'string' && d.desc.endsWith('.'), `${slug}/${d.id} title and desc`);
      if (d.goal != null) assert.ok(Number.isInteger(d.goal) && d.goal > 1, `${slug}/${d.id} goal`);
    }
    const app = readFileSync(new URL(`${slug}/app.js`, gamesDir), 'utf8');
    assert.ok(app.includes(`makeAchievements('${slug}', ACHIEVEMENTS)`), `${slug} sets up its achievements`);
    for (const id of ids) assert.ok(app.includes(`'${id}'`), `${slug}: achievement '${id}' is unlocked somewhere in app.js`);
  }
});

test('the games list catalogue is up to date (run scripts/build-sw.mjs)', async () => {
  const fresh = {};
  for (const slug of slugs) fresh[slug] = await defsOf(slug);
  assert.deepEqual(CATALOGUE, fresh);
  assert.equal(readFileSync(new URL('../site/achievements.js', import.meta.url), 'utf8'), achievementsModule(fresh));
});

test('the games list sums up progress and the latest unlocks', () => {
  const catalogue = { a: [{ id: 'x', title: 'X', desc: 'x.' }, { id: 'y', title: 'Y', desc: 'y.', goal: 5 }], b: [{ id: 'z', title: 'Z', desc: 'z.' }] };
  const data = { a: { done: { x: 10 }, count: { y: 2 } }, b: { done: { z: 20 } }, gone: { done: { q: 1 } } };
  const s = summarise(catalogue, data, ['b', 'a']);
  assert.deepEqual(s.games.map((g) => g.slug), ['b', 'a']);
  assert.equal(s.done, 2);
  assert.equal(s.total, 3);
  assert.equal(s.games[1].items[1].count, 2);
  assert.deepEqual(latest(s).map((i) => i.id), ['z', 'x']);
});

// The checklist in PLAN.md ("Every game has"), checked for every game.
test('every game has themes, achievements, a way back and offline support', () => {
  for (const slug of slugs) {
    const dir = new URL(`${slug}/`, gamesDir);
    const app = readFileSync(new URL('app.js', dir), 'utf8');
    for (const call of ['themeFor(', 'onLookChange(', 'offerHallows(', 'applyTheme(', 'addHubLink()', 'registerServiceWorker(', 'makeAchievements(']) assert.ok(app.includes(call), `${slug} calls ${call}`);
    const own = [app, readFileSync(new URL('app.css', dir), 'utf8'), ...(existsSync(new URL('js/', dir)) ? readdirSync(new URL('js/', dir)).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(`js/${f}`, dir), 'utf8')) : [])].join('\n');
    assert.ok(/hallows/.test(own.replace(/core\/hallows\.js/g, '')), `${slug} styles its own Hallows look`);
    assert.ok(existsSync(new URL('manifest.webmanifest', dir)) && existsSync(new URL('icons/icon.svg', dir)), `${slug} is installable`);
  }
});

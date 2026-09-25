import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { matches, recentGames } from '../site/arcade.js';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const gamesDir = new URL('../games/', import.meta.url);
const slugs = readdirSync(gamesDir).filter((d) => statSync(new URL(d, gamesDir)).isDirectory());

test('the games list links every game, with an icon and a category', () => {
  for (const slug of slugs) {
    const card = new RegExp(`<a class="game" href="${slug}/" data-slug="${slug}" data-tags="([a-z ]+)"[^>]*>\\s*<img src="([^"]+)"`).exec(html);
    assert.ok(card, `${slug} is on the games list`);
    assert.ok(card[1].split(' ').every((t) => ['puzzle', 'board', 'cards', 'arcade'].includes(t)), `${slug} has known categories`);
    assert.ok(existsSync(new URL(`../site/${card[2]}`, import.meta.url)), `${slug} icon ${card[2]} exists`);
    assert.ok(existsSync(new URL(`${slug}/sw.js`, gamesDir)), `${slug} has a service worker to save it offline`);
  }
});

test('search matches the start of any word, in any order', () => {
  const four = { name: 'Four in a Row', blurb: 'Line up four before the computer', tags: ['board'], keywords: 'connect discs' };
  assert.ok(matches(four, ''));
  assert.ok(matches(four, 'fou'));
  assert.ok(matches(four, 'row four'));
  assert.ok(matches(four, 'CONNECT'));
  assert.ok(matches(four, 'board'));
  assert.ok(!matches(four, 'our'), 'middle of a word does not match');
  assert.ok(!matches(four, 'four cards'));
  assert.ok(matches(four, '', 'board'));
  assert.ok(!matches(four, 'four', 'puzzle'));
});

test('recently played: newest first, only games that exist', () => {
  const recent = { four: 30, slide: 50, gone: 99, sort: 10, trio: 20, blocks: 40, bad: 'x' };
  assert.deepEqual(recentGames(recent, ['four', 'slide', 'sort', 'trio', 'blocks', 'bad']), ['slide', 'blocks', 'four', 'trio']);
  assert.deepEqual(recentGames(null, ['four']), []);
});

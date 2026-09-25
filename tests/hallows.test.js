import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isHallowsSeason, themeFor, saveLook, readLook } from '../template/core/hallows.js';

// A stand-in for the browser's localStorage, where the hub keeps its look.
const data = new Map();
globalThis.localStorage = {
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => data.set(k, String(v)),
};
beforeEach(() => data.clear());

const inSeason = isHallowsSeason();
const seasonal = (normal) => (inSeason ? 'hallows' : normal);

test('season runs from September to the first week of November', () => {
  assert.equal(isHallowsSeason(new Date(2026, 7, 31)), false);
  assert.equal(isHallowsSeason(new Date(2026, 8, 1)), true);
  assert.equal(isHallowsSeason(new Date(2026, 9, 31)), true);
  assert.equal(isHallowsSeason(new Date(2026, 10, 7)), true);
  assert.equal(isHallowsSeason(new Date(2026, 10, 8)), false);
});

test('with no choice anywhere, games follow the season', () => {
  assert.equal(themeFor(null, undefined, 'neon'), seasonal('neon'));
  assert.equal(themeFor('calm', 5, 'neon'), 'calm');
});

test('the hub look overrides every game until the game picks again', () => {
  saveLook('hallows');
  const { at } = readLook();
  assert.equal(themeFor(null, undefined, 'neon'), 'hallows');
  assert.equal(themeFor('calm', at - 1000, 'neon'), 'hallows');
  assert.equal(themeFor('calm', at + 1000, 'neon'), 'calm');
});

test('the classic hub look keeps a game’s own non-Hallows theme', () => {
  saveLook('classic');
  const { at } = readLook();
  assert.equal(themeFor('calm', at - 1000, 'neon'), 'calm');
  assert.equal(themeFor('hallows', at - 1000, 'neon'), 'neon');
  assert.equal(themeFor(null, undefined, 'auto'), 'auto');
  assert.equal(themeFor('hallows', at + 1000, 'neon'), 'hallows');
});

test('a broken stored look is ignored', () => {
  localStorage.setItem('freegames:look', 'not json');
  assert.equal(readLook(), null);
  assert.equal(themeFor('calm', 0, 'neon'), 'calm');
});

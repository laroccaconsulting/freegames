import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDict } from '../games/words/js/dict.js';
import { isBlocked } from '../games/words/js/blocklist.js';
import * as S from '../games/words/js/search.js';

const read = (f) => readFileSync(new URL(`../games/words/data/${f}`, import.meta.url), 'utf8');
const dict = makeDict(read('words.txt'), read('common.txt'));

test('every hidden word is in the grid exactly once, along its path', () => {
  for (const [seed, size] of [[1, 10], [2, 10], [3, 12], [4, 8]]) {
    const p = S.generate(dict, seed, { size });
    assert.deepEqual(p, S.generate(dict, seed, { size }));
    assert.equal(p.cells.length, size * size);
    assert.ok(p.cells.every((c) => /^[a-z]$/.test(c)));
    for (const [k, { word }] of p.words.entries()) {
      assert.ok(dict.common.has(word) && word.length >= 4);
      assert.equal(S.squaresOf(p, k).map((i) => p.cells[i]).join(''), word);
      assert.equal(S.occurrences(size, p.cells, word), 1);
    }
    assert.equal(new Set(p.words.map((w) => w.word)).size, p.words.length);
  }
});

test('lines snap only to the eight directions', () => {
  assert.deepEqual(S.line(5, 0, 4), [0, 1, 2, 3, 4]);
  assert.deepEqual(S.line(5, 24, 0), [24, 18, 12, 6, 0]);
  assert.deepEqual(S.line(5, 4, 20), [4, 8, 12, 16, 20]);
  assert.deepEqual(S.line(5, 2, 2), [2]);
  assert.equal(S.line(5, 0, 7), null);
});

test('a found line matches its word either way round', () => {
  const p = S.generate(dict, 5);
  const squares = S.squaresOf(p, 3);
  assert.equal(S.match(p, squares), 3);
  assert.equal(S.match(p, squares.slice().reverse()), 3);
  assert.equal(S.match(p, squares.slice(0, -1)), -1);
  assert.equal(S.match(p, [squares[0]]), -1);
});

test('no blocked words are hidden', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const p = S.generate(dict, seed);
    for (const { word } of p.words) assert.ok(!isBlocked(word), word);
    assert.ok(!S.rude(p.size, p.cells));
  }
  assert.ok(S.rude(3, [...'xxxxxxass']));
});

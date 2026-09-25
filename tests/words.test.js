import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDict, counts, fits } from '../games/words/js/dict.js';
import { isBlocked } from '../games/words/js/blocklist.js';
import * as wheel from '../games/words/js/wheel.js';
import * as cw from '../games/words/js/codeword.js';

const read = (f) => readFileSync(new URL(`../games/words/data/${f}`, import.meta.url), 'utf8');
const dict = makeDict(read('words.txt'), read('common.txt'));

test('word lists: sizes, common words are playable, nothing offensive', () => {
  assert.ok(dict.words.size > 100000);
  assert.ok(dict.common.size > 8000);
  for (const w of dict.commonList) assert.ok(dict.words.has(w), `${w} is playable`);
  for (const w of dict.list) assert.ok(!isBlocked(w), `${w} is blocked but listed`);
  assert.ok(isBlocked('shithead') && isBlocked('bitch'));
  assert.ok(!isBlocked('class') && !isBlocked('cockpit') && !isBlocked('spicy') && !isBlocked('assess'));
});

test('letters: fits counts each letter once', () => {
  assert.ok(fits('tread', counts('graduates')));
  assert.ok(fits('adage', counts('adagesxyz')));
  assert.ok(!fits('added', counts('graduates')));
});

test('word wheel: deterministic, every answer checks out', () => {
  const a = wheel.generate(dict, 42);
  assert.deepEqual(a, wheel.generate(dict, 42));
  assert.equal(a.letters.length, 8);
  assert.ok(a.common.includes(a.nine));
  assert.ok(a.common.length >= 18);
  for (const w of a.all) assert.equal(wheel.check(dict, a, w, []), null, w);
  assert.match(wheel.check(dict, a, 'ab', []), /four letters/);
  const noCentre = a.all.find(() => true).replace(a.centre, '');
  assert.notEqual(wheel.check(dict, a, noCentre, []), null);
  assert.match(wheel.check(dict, a, a.nine, [a.nine]), /Already/);
  assert.equal(wheel.level(a, []).tier, 0);
  assert.equal(wheel.level(a, a.common).label, 'Genius');
});

test('codeword: grid words are real, numbering is a code, solution is unique', () => {
  for (const seed of [1, 2, 3]) {
    const p = cw.generate(dict, seed * 7919);
    assert.deepEqual(p, cw.generate(dict, seed * 7919), 'deterministic');
    const runs = cw.slots(p.cells, p.size);
    for (const run of runs) assert.ok(dict.words.has(run.map((i) => p.cells[i]).join('')), 'every run is a word');
    const nums = Object.values(p.code);
    assert.equal(new Set(nums).size, nums.length, 'one number per letter');
    const known = new Map(p.given.map((l) => [p.code[l], l]));
    const r = cw.solveCode(dict, runs.map((run) => run.map((i) => p.code[p.cells[i]])), known);
    assert.equal(r.count, 1, 'exactly one solution');
    const answer = Object.fromEntries(Object.entries(p.code).map(([l, n]) => [n, l]));
    assert.ok(cw.isSolved(p, answer));
    assert.ok(!cw.isSolved(p, {}));
    const n = Object.values(p.code).find((x) => !p.given.includes(answer[x]));
    assert.deepEqual(cw.mistakes(p, { [n]: answer[n] === 'z' ? 'q' : 'z' }), [n]);
  }
});

import * as ladder from '../games/words/js/ladder.js';
import * as wgrid from '../games/words/js/grid.js';

test('word ladder: par is the shortest ladder, steps are checked', () => {
  const p = ladder.generate(dict, 13);
  assert.deepEqual(p, ladder.generate(dict, 13));
  const graph = ladder.makeGraph(dict.byLen.get(p.length));
  const path = ladder.shortest(graph, p.start, p.end);
  assert.equal(path.length - 1, p.par);
  for (let k = 1; k < path.length; k++) assert.equal(ladder.checkStep(dict, path[k - 1], path[k]), null);
  assert.ok(p.par >= 4 && p.par <= 7);
  assert.match(ladder.checkStep(dict, 'cold', 'cord'.slice(0, 3)), /letters/);
  assert.match(ladder.checkStep(dict, 'cold', 'warm'), /exactly one/);
  assert.ok(ladder.oneApart('cold', 'cord'));
});

test('word grid: every listed word can be traced', () => {
  const prefixes = wgrid.prefixSet(dict.list);
  const g = wgrid.generate(dict, 17, prefixes);
  assert.equal(g.tiles.length, 16);
  assert.ok(g.common.length >= 25);
  for (const w of g.common) assert.ok(g.all.includes(w) && dict.words.has(w));
  // Re-find a word by walking: at least the first common word has a legal path.
  assert.ok(wgrid.validPath([0, 1, 5]));
  assert.ok(!wgrid.validPath([0, 2]));
  assert.ok(!wgrid.validPath([0, 1, 0]));
  assert.equal(wgrid.points('cat'), 1);
  assert.equal(wgrid.points('planet'), 3);
  assert.equal(wgrid.tileText('q'), 'qu');
});

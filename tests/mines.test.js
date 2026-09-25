import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle } from '../template/core/rng.js';
import { SIZES, neighbours, counts, reveal, deduce, solvable, generate } from '../games/mines/js/mines.js';

test('counts and flood fill', () => {
  const mines = [0];
  const num = counts(3, 3, mines);
  assert.deepEqual([...num], [-1, 1, 0, 1, 1, 0, 0, 0, 0]);
  const open = reveal(3, 3, num, new Array(9).fill(false), 8);
  assert.deepEqual(open, [false, true, true, true, true, true, true, true, true]);
  assert.equal(neighbours(3, 3, 4).length, 8);
  assert.equal(neighbours(3, 3, 0).length, 3);
});

test('every deduction the solver makes is true', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const random = mulberry32(seed);
    const { w, h, mines: count } = SIZES[seed % 2 ? 'beginner' : 'intermediate'];
    const mines = shuffle([...Array(w * h).keys()], random).slice(0, count);
    const isMine = new Set(mines);
    const num = counts(w, h, mines);
    const safe = [...Array(w * h).keys()].filter((i) => !isMine.has(i));
    let open = reveal(w, h, num, new Array(w * h).fill(false), safe[0]);
    const flags = new Set();
    for (let step = 0; step < 200; step++) {
      const d = deduce(w, h, num, open, flags, count);
      if (!d) {
        const hidden = safe.filter((i) => !open[i]);
        if (!hidden.length) break;
        open = reveal(w, h, num, open, hidden[Math.floor(random() * hidden.length)]);
        continue;
      }
      for (const s of d.safe) assert.ok(!isMine.has(s), `safe is safe (${d.why.kind})`);
      for (const m of d.mines) assert.ok(isMine.has(m), `mine is a mine (${d.why.kind})`);
      d.mines.forEach((m) => flags.add(m));
      for (const s of d.safe) open = reveal(w, h, num, open, s);
    }
  }
});

test('generated boards: right mine count, clear start, solvable by logic', () => {
  for (const size of Object.keys(SIZES)) {
    const { w, h, mines: count } = SIZES[size];
    const start = Math.floor(h / 2) * w + Math.floor(w / 2);
    const b = generate(size, 11, start);
    assert.deepEqual(b, generate(size, 11, start), 'deterministic');
    assert.equal(b.mines.length, count);
    assert.ok(!b.mines.includes(start));
    for (const n of neighbours(w, h, start)) assert.ok(!b.mines.includes(n), 'the start is a clear opening');
    assert.ok(solvable(w, h, b.mines, start));
  }
});

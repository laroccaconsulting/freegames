import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, countSolutions, grade, candidatesOf, nextStep, conflicts, UNITS, LEVELS } from '../games/sudoku/js/sudoku.js';

test('generated puzzles: valid solution, unique, graded as asked', () => {
  for (const level of Object.keys(LEVELS)) {
    const p = generate(level.length * 11, level);
    assert.deepEqual(p, generate(level.length * 11, level), 'deterministic');
    for (const u of UNITS) assert.deepEqual(u.map((i) => p.solution[i]).sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    p.puzzle.forEach((v, i) => v && assert.equal(v, p.solution[i]));
    const r = countSolutions(p.puzzle);
    assert.equal(r.count, 1);
    assert.deepEqual(r.solution, p.solution);
    assert.equal(p.level, LEVELS[level]);
    assert.equal(grade(p.puzzle).level, LEVELS[level]);
  }
});

test('every human step is true to the solution', () => {
  const p = generate(5, 'hard');
  const grid = p.puzzle.slice();
  const cands = candidatesOf(grid);
  for (let k = 0; k < 400 && grid.some((v) => !v); k++) {
    const step = nextStep(grid, cands);
    if (!step) break;
    if (step.place) {
      const [i, v] = step.place;
      assert.equal(v, p.solution[i], `${step.tech} places the right number`);
      grid[i] = v;
      cands[i] = 0;
      for (let j = 0; j < 81; j++) if (UNITS.some((u) => u.includes(i) && u.includes(j))) cands[j] &= ~(1 << v);
    } else
      for (const [i, v] of step.remove) {
        assert.notEqual(v, p.solution[i], `${step.tech} never removes the answer`);
        cands[i] &= ~(1 << v);
      }
  }
  assert.ok(grid.every(Boolean), 'a hard puzzle is solved by the techniques');
});

test('conflicts find repeats', () => {
  const g = new Array(81).fill(0);
  g[0] = 5;
  g[8] = 5;
  assert.deepEqual([...conflicts(g)].sort((a, b) => a - b), [0, 8]);
});

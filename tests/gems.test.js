import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, EMPTY, at, findMatches, gravity, resolve, trySwap, validSwaps, isCleared } from '../games/gems/js/rules.js';
import { solve } from '../games/gems/js/solver.js';
import { generate, levelSpec, levelSeed, DAILY_SPEC } from '../games/gems/js/levels.js';

const blank = () => new Array(ROWS * COLS).fill(EMPTY);
const bottom = ROWS - 1;

test('finds horizontal and vertical runs of three or more', () => {
  const g = blank();
  g[at(bottom, 0)] = g[at(bottom, 1)] = g[at(bottom, 2)] = 1;
  g[at(bottom, 4)] = g[at(bottom - 1, 4)] = g[at(bottom - 2, 4)] = g[at(bottom - 3, 4)] = 2;
  const m = findMatches(g);
  assert.equal(m.length, 7);
  g[at(bottom, 2)] = 3;
  assert.equal(findMatches(g).length, 4);
});

test('gravity drops gems to the bottom of each column', () => {
  const g = blank();
  g[at(0, 3)] = 5;
  const { grid, falls } = gravity(g);
  assert.equal(grid[at(bottom, 3)], 5);
  assert.equal(grid[at(0, 3)], EMPTY);
  assert.deepEqual(falls, [{ from: at(0, 3), to: at(bottom, 3) }]);
});

test('a swap must make a match; matches cascade', () => {
  const g = blank();
  // Bottom row: 1 1 2 1 ; above the 2 sits a 1 → swapping them clears the row.
  g[at(bottom, 0)] = 1;
  g[at(bottom, 1)] = 1;
  g[at(bottom, 2)] = 2;
  g[at(bottom, 3)] = 1;
  g[at(bottom - 1, 2)] = 1;
  assert.equal(trySwap(g, at(bottom, 0), at(bottom, 1)), null, 'same colour');
  assert.equal(trySwap(g, at(bottom, 3), at(bottom - 1, 3)), null, 'with an empty cell');
  const res = trySwap(g, at(bottom, 2), at(bottom - 1, 2));
  assert.ok(res);
  assert.equal(res.steps[0].cleared.length, 4);
  assert.equal(res.grid.filter((v) => v !== EMPTY).length, 1);
  assert.ok(validSwaps(g).length >= 1);
  assert.equal(resolve(g).steps.length, 0, 'a settled board has nothing to clear');
});

test('solver clears a small board in the fewest swaps', () => {
  const g = blank();
  // Two columns of three with one gem traded: one swap clears everything.
  for (let k = 0; k < 3; k++) {
    g[at(bottom - k, 2)] = 0;
    g[at(bottom - k, 3)] = 1;
  }
  g[at(bottom, 2)] = 1;
  g[at(bottom, 3)] = 0;
  const { moves, proven } = solve(g);
  assert.equal(moves.length, 1);
  assert.ok(proven);
});

test('generated boards clear in par swaps and are repeatable', () => {
  for (const level of [1, 6, 21]) {
    const puzzle = generate(levelSeed(level), levelSpec(level));
    let grid = puzzle.grid;
    assert.equal(findMatches(grid).length, 0, 'no lines at the start');
    for (const [a, b] of puzzle.solution) {
      const res = trySwap(grid, a, b);
      assert.ok(res, `legal swap on level ${level}`);
      grid = res.grid;
    }
    assert.ok(isCleared(grid));
    assert.equal(puzzle.solution.length, puzzle.par);
    assert.deepEqual(generate(levelSeed(level), levelSpec(level)).grid, puzzle.grid);
  }
  assert.ok(generate(99, DAILY_SPEC).par >= 1);
});

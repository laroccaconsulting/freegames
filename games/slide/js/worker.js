// Builds puzzles and finds hints off the main thread.
import * as unblock from './unblock.js';
import * as tiles from './tiles.js';

export function run(type, data) {
  if (type === 'unblock') return unblock.generate(data.seed, data.target);
  if (type === 'tiles') return tiles.generate(data.seed, data.n, data.steps);
  if (type === 'unblock-hint') return unblock.solve(data.puzzle);
  if (type === 'tiles-hint') return tiles.solve(data.board, { limit: 1_500_000 });
  throw new Error(`unknown job ${type}`);
}

self.onmessage = ({ data }) => {
  const { id, type, ...rest } = data;
  self.postMessage({ id, result: run(type, rest) });
};

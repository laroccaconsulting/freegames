// Runs puzzle generation and hints off the main thread so the UI stays smooth.
import { generate } from './levels.js';
import { solve } from './solver.js';

self.onmessage = ({ data }) => {
  const { id, type } = data;
  if (type === 'generate') self.postMessage({ id, result: generate(data.seed, data.colors) });
  if (type === 'solve') self.postMessage({ id, result: solve(data.tubes, { maxNodes: 250000 }) });
};

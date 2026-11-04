// Runs puzzle generation and hints off the main thread so the UI stays smooth.
import { generate, generateAdvanced } from './levels.js';
import { solve } from './solver.js';

self.onmessage = ({ data }) => {
  const { id, type } = data;
  if (type === 'generate') self.postMessage({ id, result: generate(data.seed, data.colors) });
  if (type === 'advanced') self.postMessage({ id, result: generateAdvanced(data.level) });
  if (type === 'solve') self.postMessage({ id, result: solve(data.tubes, { layout: data.layout, moves: data.moves, maxNodes: 250000 }) });
};

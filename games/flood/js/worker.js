// Finds par off the main thread.
import { newBoard, solve } from './flood.js';

self.onmessage = ({ data }) => {
  const b = newBoard(data.n, data.colors, data.seed);
  self.postMessage({ id: data.id, result: { board: b, par: solve(b.n, b.cells).length } });
};

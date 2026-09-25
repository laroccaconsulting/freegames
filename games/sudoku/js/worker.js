// Makes puzzles off the main thread.
import { generate } from './sudoku.js';

self.onmessage = ({ data }) => self.postMessage({ id: data.id, result: generate(data.seed, data.level) });

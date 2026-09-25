// Runs the computer player off the main thread so the board stays smooth.
import { chooseMove, analyse } from './bot.js';

self.onmessage = ({ data }) => {
  const { id, type, state, level, timeMs } = data;
  if (type === 'analyse') {
    const r = analyse(state, { timeMs });
    self.postMessage({ id, result: r && { move: r.move, score: r.score, depth: r.depth, exact: r.exact } });
  } else self.postMessage({ id, result: chooseMove(state, level, { timeMs }) });
};

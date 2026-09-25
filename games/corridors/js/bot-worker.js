// Runs the computer player off the main thread so the board never freezes.
import { chooseMove } from './bot.js';

self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, move: chooseMove(data.state, data.level, { timeMs: data.timeMs }) });
};

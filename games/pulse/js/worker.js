// Runs the bot off the main thread: proving generated levels fair, and
// finding runs to watch. Messages: { id, kind: 'prove', seed, d } and
// { id, kind: 'solve', level: { id } | { seed, d, k } }.
import { work } from './proof.js';

self.onmessage = ({ data }) => self.postMessage({ id: data.id, ...work(data) });

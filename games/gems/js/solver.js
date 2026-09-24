// Finds a short way to clear the board. Depth-first with a shrinking bound:
// every time a solution is found, look for one with fewer swaps. Moves that
// clear the most are tried first. The node budget is counted, not timed, so
// all devices agree on par; `proven` says whether the search finished.
import { validSwaps, trySwap, isCleared, gemsLeft } from './rules.js';

export function solve(grid, { bound = 30, maxNodes = 40000 } = {}) {
  let best = null;
  let nodes = 0;
  let exhausted = false;
  const seen = new Map(); // board → fewest swaps used to reach it
  const path = [];
  function dfs(g, depth) {
    if (isCleared(g)) {
      if (!best || depth < best.length) best = path.slice();
      return;
    }
    const limit = best ? best.length - 1 : bound;
    if (depth >= limit) return;
    if (++nodes > maxNodes) {
      exhausted = true;
      return;
    }
    const key = g.join(',');
    if (seen.has(key) && seen.get(key) <= depth) return;
    seen.set(key, depth);
    const moves = validSwaps(g).map(([a, b]) => {
      const res = trySwap(g, a, b);
      return { a, b, grid: res.grid, left: gemsLeft(res.grid) };
    });
    moves.sort((x, y) => x.left - y.left);
    for (const m of moves) {
      path.push([m.a, m.b]);
      dfs(m.grid, depth + 1);
      path.pop();
      if (exhausted) return;
    }
  }
  dfs(grid, 0);
  return { moves: best, proven: !exhausted, nodes };
}

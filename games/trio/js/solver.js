// Finds a clearing order that keeps the tray as empty as possible.
//
// The tray only depends on which tiles are gone (each type keeps its count
// mod 3), so a search state is the set of removed tiles. We look for any
// clearing order under a tray limit, then tighten the limit until the search
// fails or runs out of budget. Budgets count nodes, not time, so every device
// agrees on par. When the last search ran out of budget rather than failing,
// par is the best found, not a proven minimum (`proven: false`).
import { TRAY } from './rules.js';

export function solve(tiles, covers, { removed: startRemoved, capacity = TRAY, maxNodes = 60000 } = {}) {
  const n = tiles.length;
  const types = tiles.map((t) => t.type);
  const removed = startRemoved ? Uint8Array.from(startRemoved) : new Uint8Array(n);
  const count = new Map();
  for (let i = 0; i < n; i++) if (removed[i]) count.set(types[i], (count.get(types[i]) || 0) + 1);
  let tray = 0;
  for (const c of count.values()) tray += c % 3;
  // How many tiles each tile is holding down, for move ordering.
  const holds = new Int32Array(n);
  for (let i = 0; i < n; i++) for (const j of covers[i]) holds[j]++;

  let nodes = 0;
  function search(limit) {
    const failed = new Set();
    const order = [];
    let left = removed.reduce((s, r) => s + (r ? 0 : 1), 0);
    let exhausted = false;
    const keyOf = () => {
      let s = '';
      for (let i = 0; i < n; i += 30) {
        let w = 0;
        for (let k = i; k < Math.min(n, i + 30); k++) w = w * 2 + removed[k];
        s += w.toString(36) + '.';
      }
      return s;
    };
    function dfs() {
      if (left === 0) return tray === 0;
      if (++nodes > maxNodes) {
        exhausted = true;
        return false;
      }
      const key = keyOf();
      if (failed.has(key)) return false;
      const moves = [];
      const seen = new Set();
      for (let i = 0; i < n; i++) {
        if (removed[i] || !covers[i].every((j) => removed[j])) continue;
        const have = (count.get(types[i]) || 0) % 3;
        const after = have === 2 ? tray - 2 : tray + 1;
        if (after > limit) continue;
        // Free tiles of one type that hold nothing down are interchangeable.
        const sig = holds[i] ? -1 - i : types[i];
        if (sig >= 0 && seen.has(sig)) continue;
        seen.add(sig);
        moves.push({ i, score: (have === 2 ? 1000 : have === 1 ? 500 : 0) + holds[i] * 10 });
      }
      moves.sort((a, b) => b.score - a.score);
      for (const { i } of moves) {
        const t = types[i];
        const have = (count.get(t) || 0) % 3;
        removed[i] = 1;
        count.set(t, (count.get(t) || 0) + 1);
        tray += have === 2 ? -2 : 1;
        left--;
        order.push(i);
        if (dfs()) return true;
        order.pop();
        left++;
        tray -= have === 2 ? -2 : 1;
        count.set(t, count.get(t) - 1);
        removed[i] = 0;
        if (exhausted) return false;
      }
      failed.add(key);
      return false;
    }
    const saved = { removed: removed.slice(), count: new Map(count), tray };
    const ok = dfs();
    // A successful search returns without unwinding; put the start state back.
    removed.set(saved.removed);
    count.clear();
    for (const [k, v] of saved.count) count.set(k, v);
    tray = saved.tray;
    return { ok, order: ok ? order.slice() : null, exhausted };
  }

  const peakOf = (order) => {
    const c = new Map(count);
    let t = tray;
    let peak = t;
    for (const i of order) {
      const have = (c.get(types[i]) || 0) % 3;
      c.set(types[i], (c.get(types[i]) || 0) + 1);
      t += have === 2 ? -2 : 1;
      peak = Math.max(peak, t);
    }
    return peak;
  };

  let best = search(capacity - 1);
  if (!best.ok) return { order: null, peak: null, proven: !best.exhausted, nodes };
  let bestPeak = peakOf(best.order);
  let proven = bestPeak <= 2;
  while (bestPeak > 2) {
    nodes = 0;
    const next = search(bestPeak - 1);
    if (!next.ok) {
      proven = !next.exhausted;
      break;
    }
    best = next;
    bestPeak = peakOf(best.order);
  }
  return { order: best.order, peak: bestPeak, proven: proven || bestPeak <= 2, nodes };
}

// Optimal solver (A*). The heuristic, segments over one per colour, never
// overestimates and changes by at most one per move, so the first solution
// found is the shortest: that is the puzzle's par.
import { CAPACITY, usefulMoves, pour, isSolved, segmentsOver, stateKey } from './rules.js';

class Heap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  // Lower f first; on ties prefer deeper nodes, which reach the goal sooner.
  less(a, b) {
    return a.f < b.f || (a.f === b.f && a.g > b.g);
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

// Returns { moves: [[from, to], …] } for the shortest solution, { moves: null }
// when there is none, or { moves: null, gaveUp: true } past the node budget.
// The budget counts nodes, not time, so every device gets the same answer.
export function solve(tubes, { capacity = CAPACITY, maxNodes = 150000 } = {}) {
  const start = { tubes, g: 0, f: segmentsOver(tubes), parent: null, move: null };
  const best = new Map([[stateKey(tubes), 0]]);
  const open = new Heap();
  open.push(start);
  let expanded = 0;
  while (open.size) {
    const node = open.pop();
    if (isSolved(node.tubes, capacity)) {
      const moves = [];
      for (let n = node; n.parent; n = n.parent) moves.push(n.move);
      return { moves: moves.reverse(), expanded };
    }
    if (best.get(stateKey(node.tubes)) < node.g) continue;
    if (++expanded > maxNodes) return { moves: null, gaveUp: true, expanded };
    for (const move of usefulMoves(node.tubes, capacity)) {
      const next = pour(node.tubes, move[0], move[1], capacity);
      const key = stateKey(next);
      const g = node.g + 1;
      if (best.has(key) && best.get(key) <= g) continue;
      best.set(key, g);
      open.push({ tubes: next, g, f: g + segmentsOver(next), parent: node, move });
    }
  }
  return { moves: null, expanded };
}

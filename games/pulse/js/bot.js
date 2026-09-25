// A bot that finds a way through a level, proving it can be beaten.
// Depth-first search over hold / release, deciding every `every` ticks,
// with states seen before pruned.
import { initState, cloneState, step } from './engine.js';

const keyOf = (s) => `${s.mode}|${s.grav}|${s.speed}|${Math.round(s.y * 12)}|${Math.round(s.vy * 1.5)}|${s.grounded ? 1 : 0}|${s.buffer ? 1 : 0}|${s.used.length}`;

// How long a mistimed copy must survive, in ticks (0.3 s). After that a
// player would have adjusted their next input anyway.
const HORIZON = 72;

// Returns { ok, toggles, ticks, nodes, best } where toggles are the ticks at
// which the button changes (starting released), ready for engine.replay().
//
// `slack` asks for a run that forgives mistimed input: whenever it presses
// or lets go, copies that do so `slack` ticks early and late must survive
// too. So every input has a window at least 2 × slack ticks wide.
// With `need`, only a run that picks up that coin counts.
export function solve(lv, { every = 6, budget = 400000, from = null, need = -1, slack = 0 } = {}) {
  const first = from ? cloneState(from) : initState(lv);
  const seen = new Set();
  // Each frame: the state at a decision point, the hold chosen to reach it,
  // ghost copies still being checked, the parent state, and which of the
  // two choices is tried next.
  const stack = [{ s: first, hold: first.hold, ghosts: [], parent: null, next: 0 }];
  let nodes = 0;
  let best = first.x;
  const needX = need >= 0 ? lv.objects.find((o) => o.coin === need).x + 2 : Infinity;
  const run = (s, hold, ticks, wasHold) => {
    for (let k = 0; k < ticks && !s.dead && !s.won; k++) step(lv, s, hold, k === 0 && hold && !wasHold);
    return s;
  };
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.next > 1 || nodes > budget) {
      stack.pop();
      if (nodes > budget) break;
      continue;
    }
    // Cube and ball: try letting go first, so jumps are short taps like a
    // player's. Flying modes: keep doing what you were doing (calm lines).
    const flying = top.s.mode === 'ship' || top.s.mode === 'wave';
    const prefer = flying ? top.hold : false;
    const hold = top.next === 0 ? prefer : !prefer;
    top.next++;
    nodes++;
    const s = run(cloneState(top.s), hold, every, top.hold);
    if (s.dead) continue;
    // Ghosts carried over follow the same input; new ones start at a toggle.
    const ghosts = [];
    let bad = false;
    for (const g of top.ghosts) {
      const gs = run(cloneState(g.s), hold, every, g.s.hold);
      if (gs.dead) bad = true;
      else if (gs.tick < g.until && !gs.won) ghosts.push({ s: gs, until: g.until });
    }
    if (slack && hold !== top.hold && !bad) {
      const until = s.tick + HORIZON;
      // Late: keep the old input a little longer.
      const late = run(run(cloneState(top.s), top.hold, slack, top.hold), hold, every - slack, top.hold);
      // Early: switch a little sooner, from the previous decision point.
      const early = top.parent && run(run(cloneState(top.parent), top.hold, every - slack, top.parent.hold), hold, slack + every, top.hold);
      for (const g of [late, early]) {
        if (!g) continue;
        if (g.dead) bad = true;
        else ghosts.push({ s: g, until });
      }
    }
    if (bad) continue;
    best = Math.max(best, s.x);
    if (s.x > needX && !s.coins.includes(need)) continue;
    if (s.won) {
      stack.push({ s, hold, ghosts: [], parent: top.s, next: 2 });
      return { ok: true, toggles: toToggles(stack, every), ticks: s.tick, nodes, best };
    }
    const key = `${s.tick}|${keyOf(s)}|${hold ? 1 : 0}|${ghosts.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push({ s, hold, ghosts, parent: top.s, next: 0 });
  }
  return { ok: false, toggles: [], ticks: 0, nodes, best };
}

function toToggles(stack, every) {
  const toggles = [];
  const base = stack[0].s.tick;
  let prev = stack[0].hold;
  for (let i = 1; i < stack.length; i++) {
    if (stack[i].hold !== prev) toggles.push(base + (i - 1) * every);
    prev = stack[i].hold;
  }
  return toggles;
}

// The fairness check: a run exists where every press and release can be
// `slack` ticks early or late (4 ticks ≈ 17 ms) and still work, so no jump
// needs frame-perfect timing. Returns that run's toggles, or null.
export function fair(lv, { slack = 4, every = 8, budget = 1500000 } = {}) {
  const run = solve(lv, { every, slack, budget });
  return run.ok ? run.toggles : null;
}

// Expands toggles into a per-tick hold lookup for watching a replay.
export function holdAt(toggles) {
  return (tick) => {
    let lo = 0;
    let hi = toggles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (toggles[mid] <= tick) lo = mid + 1;
      else hi = mid;
    }
    return lo % 2 === 1;
  };
}

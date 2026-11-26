// Shared helpers for Contraption's level and machine tools (Node only).
// See docs/contraption.md §13 for the workflow these support.
import { LEVELS, levelById } from '../../games/contraption/js/levels.js';
import { simulate, problems, usage } from '../../games/contraption/js/machine.js';

export { LEVELS, levelById, simulate, problems, usage };

export const range = (a, b, s = 1) => {
  const r = [];
  for (let x = a; x <= b + 1e-9; x += s) r.push(Math.round(x * 1000) / 1000);
  return r;
};
const two = (type) => (ax, ay, bx, by) => ({ type, a: [ax, ay], b: [bx, by] });
export const ramp = two('ramp');
export const bouncer = two('bouncer');
export const conv = two('conveyor');
export const lever = (x, y, angle, l1, l2) => ({ type: 'lever', p: [x, y], angle, l1, l2 });
export const weight = (x, y) => ({ type: 'weight', p: [x, y] });
export const motor = (x, y, dir = 1, delay = 0) => ({ type: 'motor', p: [x, y], dir, delay });
export const gear = (x, y, size) => ({ type: 'gear', p: [x, y], size });
export const chain = (a, b) => ({ type: 'chain', a, b });
/** Every combination of the value lists, passed to make(...values). */
export function grid(make, ...lists) {
  const out = [];
  const walk = (i, vals) => {
    if (i === lists.length) return out.push(make(...vals));
    for (const v of lists[i]) walk(i + 1, [...vals, v]);
  };
  walk(0, []);
  return out;
}
export const ramps = (ax, ay, bx, by) => grid(ramp, ax, ay, bx, by);
export const pads = (ax, ay, bx, by) => grid(bouncer, ax, ay, bx, by);

export const withIds = (parts) => parts.map((p, i) => ({ id: `p${i}`, ...p }));

/** Is this machine placeable and within the level's box? */
export function legal(level, parts) {
  return problems(level, parts).size === 0 && usage(level, parts).over.length === 0;
}

/** Run a machine; returns { status, reason, time, run }. */
export function runOnce(level, parts) {
  return simulate(level, withIds(parts));
}

/**
 * Nearby variants of a machine: each number in each part nudged by one
 * step either way (pegs ±1, lever arms ±½, angles ±15°, delays ±½ s).
 * Gears, chains, motors and anything on a driven peg are left alone: being
 * one peg off there unhooks the drive, a visible mistake, not fine tuning.
 * Used to measure a solution's slack.
 */
export function neighbours(parts) {
  const out = [];
  const clone = () => parts.map((p) => JSON.parse(JSON.stringify(p)));
  // Pegs that hold drive parts: moving a belt end off one unhooks it, which
  // the player sees at once, so it is not a matter of fine tuning.
  const driven = new Set(parts.filter((p) => p.type === 'gear' || p.type === 'motor').map((p) => p.p.join(',')));
  parts.forEach((part, i) => {
    const tweak = (fn) => {
      const c = clone();
      fn(c[i]);
      out.push(c);
    };
    if (part.type === 'gear' || part.type === 'chain') return;
    for (const f of ['a', 'b', 'p']) {
      if (!part[f]) continue;
      if (part.type === 'motor') continue;
      if (part.type === 'conveyor' && driven.has(part[f].join(','))) continue;
      if (part.type === 'lever' && driven.has(part.p.join(','))) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tweak((q) => (q[f] = [q[f][0] + dx, q[f][1] + dy]));
    }
    if (part.type === 'lever') {
      for (const f of ['l1', 'l2']) for (const d of [0.5, -0.5]) tweak((q) => (q[f] += d));
      for (const d of [15, -15]) tweak((q) => (q.angle += d));
    }
    // delays count only where timing is the point (the solution waits)
    if (part.type === 'motor' && part.delay) for (const d of [0.5, -0.5]) if (part.delay + d >= 0) tweak((q) => (q.delay += d));
  });
  // a chain must move with its gear, so drop variants that broke one
  return out;
}

/**
 * Slack: the share of a solution's legal neighbours that still win.
 * High slack means a player close to the answer is rewarded, not punished.
 */
export function slack(level, parts = level.solution) {
  let tried = 0;
  let won = 0;
  for (const v of neighbours(parts.map(({ id, ...p }) => p))) {
    const vp = withIds(v);
    if (!legal(level, vp)) continue;
    tried++;
    if (simulate(level, vp).status === 'win') won++;
  }
  return { tried, won, slack: tried ? won / tried : 1 };
}

/** Run candidates; returns { wins: [[time, parts]], tally: {reason: n}, tried }. */
export function search(level, candidates) {
  const wins = [];
  const tally = {};
  let tried = 0;
  for (const c of candidates) {
    const parts = withIds(c);
    if (!legal(level, parts)) continue;
    tried++;
    const r = simulate(level, parts);
    if (r.status === 'win') wins.push([r.time, c]);
    const k = r.status === 'win' ? 'win' : `${r.reason} @x≈${Math.round(r.run.lost?.x ?? -1)}`;
    tally[k] = (tally[k] || 0) + 1;
  }
  wins.sort((a, b) => a[0] - b[0]);
  return { wins, tally, tried };
}

/**
 * Cheap machines that should not win: nothing at all, and one part of each
 * offered type at every peg (default orientations, as the game places them).
 * Only flagged when the level's parts target is above one: a one-part win
 * there means the level does not teach what it says.
 */
export function exploits(level, { stride = 1 } = {}) {
  const found = [];
  if (simulate(level, []).status === 'win') found.push([]);
  if (level.stars.parts <= 1) return found;
  const types = Object.keys(level.parts || {}).filter((t) => t !== 'chain' && t !== 'motor');
  for (const type of types) {
    for (let y = 1; y < level.h; y += stride) {
      for (let x = 1; x < level.w; x += stride) {
        for (const part of singles(type, [x, y])) {
          const parts = withIds([part]);
          if (!legal(level, parts)) continue;
          if (simulate(level, parts).status === 'win') found.push([part]);
        }
      }
    }
  }
  return found;
}

function singles(type, [x, y]) {
  switch (type) {
    case 'ramp':
      return [[3, 1], [-3, 1], [3, 2], [-3, 2], [5, 2], [-5, 2]].map(([dx, dy]) => ramp(x, y, x + dx, y + dy));
    case 'bouncer':
      return [[2, 1], [-2, 1], [2, -1], [-2, -1]].map(([dx, dy]) => bouncer(x, y, x + dx, y + dy));
    case 'conveyor':
      return [conv(x, y, x + 5, y)];
    case 'lever':
      return [lever(x, y, 0, 2, 2), lever(x, y, 0, 1, 3), lever(x, y, 0, 3, 1)];
    case 'weight':
      return [weight(x, y)];
    case 'gear':
      return [gear(x, y, 1)];
    default:
      return [];
  }
}

export function describe(parts) {
  return JSON.stringify(parts.map(({ id, ...p }) => p));
}

/** Among a family's winners, the machines with the most slack (best first). */
export function centre(level, candidates, { top = 5 } = {}) {
  const { wins } = search(level, candidates);
  return wins
    .map(([time, c]) => ({ time, parts: c, ...slack(level, withIds(c)) }))
    .sort((a, b) => b.slack - a.slack || b.won - a.won || a.time - b.time)
    .slice(0, top);
}

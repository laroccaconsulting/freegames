// The bot jobs, shared by the worker and the main-thread fallback.
import { LEVELS, buildLevel, generate } from './levels.js';
import { solve, fair } from './bot.js';

// Generated levels are re-rolled (k = 0, 1, 2…) until one is fair.
export function prove(seed, d) {
  for (let k = 0; k < 40; k++) {
    const toggles = fair(generate(seed, d, k), { budget: 250000 });
    if (toggles) return { k, toggles };
  }
  return { k: -1, toggles: null };
}

export function work(msg) {
  if (msg.kind === 'prove') return prove(msg.seed, msg.d);
  const { level } = msg;
  const def = LEVELS.find((l) => l.id === level.id);
  const lv = def ? buildLevel(def) : generate(level.seed, level.d, level.k);
  // A forgiving run looks like a player's; fall back to any run at all.
  const toggles = fair(lv, { budget: 1500000 });
  if (toggles) return { toggles };
  const run = solve(lv, { budget: 3000000 });
  return { toggles: run.ok ? run.toggles : null };
}

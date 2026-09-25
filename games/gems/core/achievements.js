// Achievements, shared by every game and the games list.
//
// A game lists its achievements in its own achievements.js (plain data):
//
//   export default [
//     { id: 'first-win', title: 'First win', desc: 'Win a game.' },
//     { id: 'ten-wins', title: 'Regular', desc: 'Win 10 games.', goal: 10 },
//   ];
//
// and wires them up with two calls:
//
//   const ach = makeAchievements('slug', ACHIEVEMENTS);
//   ach.unlock('first-win');       // one-off
//   ach.add('ten-wins');           // counts toward a goal, unlocks when reached
//   ach.at('best-score', score);   // progress = the best value seen
//
// A trophy button appears in the game's top bar; it lists the game's
// achievements and links to all of them on the games list. Everything is
// kept in localStorage under one key, so the games list (same site) can read
// every game's progress. scripts/build-sw.mjs gathers each game's list into
// site/achievements.js for the games list.

import { el, openDialog, toast } from './ui.js';

export const KEY = 'freegames:achievements';

// ---------- Pure helpers (unit-tested) ----------

// data: { [slug]: { done: { [id]: time }, count: { [id]: n } } }
export function record(data, slug, def, { add = 0, at = null, now = Date.now() } = {}) {
  const game = data[slug] || { done: {}, count: {} };
  game.done ||= {};
  game.count ||= {};
  if (game.done[def.id]) return { data, unlocked: false };
  let unlocked = false;
  if (def.goal) {
    const before = game.count[def.id] || 0;
    const value = at != null ? Math.max(before, at) : before + add;
    game.count[def.id] = Math.min(value, def.goal);
    unlocked = value >= def.goal;
  } else unlocked = add > 0 || at != null;
  if (unlocked) game.done[def.id] = now;
  return { data: { ...data, [slug]: game }, unlocked };
}

// { done, total } for one game's list.
export function tally(data, slug, defs) {
  const done = data?.[slug]?.done || {};
  return { done: defs.filter((d) => done[d.id]).length, total: defs.length };
}

// ---------- Storage ----------

const memory = { value: {} };
export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return memory.value;
  }
}
function save(data) {
  memory.value = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode: kept for this visit only */
  }
}

// ---------- In the game ----------

const TROPHY =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3.2 3.8M16.5 6h3a3 3 0 0 1-3.2 3.8M12 13.5V17M8.5 20h7M9.5 17h5"/></svg>';

export function makeAchievements(slug, defs, { button = true } = {}) {
  const byId = new Map(defs.map((d) => [d.id, d]));
  let btn = null;

  // Several unlocks from one move share one toast.
  let pending = [];
  const celebrate = (def) => {
    pending.push(def.title);
    refresh();
    if (pending.length > 1) return;
    queueMicrotask(() => {
      const titles = pending;
      pending = [];
      toast(`🏆 ${titles.length > 1 ? `${titles.length} achievements: ` : ''}${titles.join(', ')}`, { duration: 3400, action: { label: 'View', onClick: () => api.open() } });
      try {
        navigator.vibrate?.([20, 40, 20]);
      } catch {
        /* ignore */
      }
    });
  };
  const apply = (id, opts) => {
    const def = byId.get(id);
    if (!def) {
      console.warn(`Unknown achievement ${slug}/${id}`);
      return false;
    }
    const { data, unlocked } = record(load(), slug, def, opts);
    save(data);
    if (unlocked) celebrate(def);
    return unlocked;
  };
  const refresh = () => {
    if (!btn) return;
    const { done, total } = tally(load(), slug, defs);
    btn.querySelector('.ach-count').textContent = `${done}/${total}`;
  };

  const api = {
    unlock: (id) => apply(id, { add: 1 }),
    add: (id, n = 1) => apply(id, { add: n }),
    at: (id, value) => apply(id, { at: value }),
    has: (id) => Boolean(load()[slug]?.done?.[id]),
    open() {
      const data = load()[slug] || { done: {}, count: {} };
      const { done, total } = tally(load(), slug, defs);
      const items = defs.map((d) => {
        const when = data.done?.[d.id];
        const hidden = d.secret && !when;
        const count = data.count?.[d.id] || 0;
        return el(
          'li',
          { class: `ach-item${when ? ' got' : ''}` },
          el('span', { class: 'ach-medal', 'aria-hidden': 'true' }, when ? '🏆' : hidden ? '?' : '🔒'),
          el(
            'span',
            { class: 'ach-text' },
            el('b', {}, hidden ? 'Secret' : d.title),
            el('small', {}, hidden ? 'Keep playing to find this one.' : d.desc),
            d.goal && !when ? el('span', { class: 'ach-bar', role: 'progressbar', 'aria-valuenow': count, 'aria-valuemax': d.goal }, el('i', { style: `width: ${(100 * count) / d.goal}%` }), el('em', {}, `${count}/${d.goal}`)) : null,
            when ? el('em', { class: 'ach-date' }, new Date(when).toLocaleDateString()) : null,
          ),
        );
      });
      openDialog({
        title: 'Achievements',
        className: 'ach-dialog',
        body: el(
          'div',
          {},
          el('p', { class: 'ach-summary' }, `${done} of ${total} unlocked`),
          el('ul', { class: 'ach-list' }, items),
          el('a', { class: 'btn ach-all', href: '../#achievements' }, 'All achievements in every game'),
        ),
      });
    },
  };

  if (button && typeof document !== 'undefined') {
    const bar = document.querySelector('.topbar');
    if (bar && !bar.querySelector('.ach-btn')) {
      btn = el('button', { class: 'ach-btn', 'aria-label': 'Achievements', title: 'Achievements', onclick: () => api.open() }, el('span', { class: 'ach-count' }));
      btn.insertAdjacentHTML('afterbegin', TROPHY);
      // Next to the game's title, so it never crowds the score chips.
      const title = bar.querySelector('.title-btn, .title, .game-switch, h1');
      if (title) title.after(btn);
      else bar.append(btn);
      refresh();
    }
  }
  return api;
}

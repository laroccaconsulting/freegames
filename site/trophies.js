// The games list's Achievements view (#achievements): every game's
// achievements and progress in one place. Definitions come from
// achievements.js (generated from each game by scripts/build-sw.mjs);
// progress is what the games wrote to localStorage (core/achievements.js).

import CATALOGUE from './achievements.js';

const KEY = 'freegames:achievements';

// ---------- Pure helpers (unit-tested) ----------

// Per game: { slug, done, total, items: [{ ...def, when, count }] }, plus totals.
export function summarise(catalogue, data, order = Object.keys(catalogue)) {
  const games = order
    .filter((slug) => catalogue[slug]?.length)
    .map((slug) => {
      const saved = data?.[slug] || {};
      const items = catalogue[slug].map((d) => ({ ...d, when: saved.done?.[d.id] || null, count: saved.count?.[d.id] || 0 }));
      return { slug, items, done: items.filter((i) => i.when).length, total: items.length };
    });
  return { games, done: games.reduce((a, g) => a + g.done, 0), total: games.reduce((a, g) => a + g.total, 0) };
}

// The most recent unlocks across all games, newest first.
export function latest(summary, max = 5) {
  return summary.games
    .flatMap((g) => g.items.filter((i) => i.when).map((i) => ({ ...i, slug: g.slug })))
    .sort((a, b) => b.when - a.when)
    .slice(0, max);
}

// ---------- Page ----------

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
};

export function initTrophies(games) {
  const view = document.getElementById('achievements');
  const link = document.getElementById('trophy-link');
  const info = Object.fromEntries(games.map((g) => [g.slug, g]));
  const order = games.map((g) => g.slug);

  const item = (i) =>
    h(
      'li',
      { class: `trophy${i.when ? ' got' : ''}` },
      h('span', { class: 'trophy-medal', 'aria-hidden': 'true' }, i.when ? '🏆' : i.secret ? '?' : '🔒'),
      h(
        'span',
        {},
        h('b', {}, i.secret && !i.when ? 'Secret' : i.title),
        h('small', {}, i.secret && !i.when ? 'Keep playing to find this one.' : i.desc),
        i.goal && !i.when ? h('span', { class: 'trophy-bar' }, h('i', { style: `width:${(100 * i.count) / i.goal}%` }), h('em', {}, `${i.count}/${i.goal}`)) : null,
      ),
    );

  const render = () => {
    const s = summarise(CATALOGUE, read(), order);
    link.querySelector('b').textContent = `${s.done}/${s.total}`;
    if (view.hidden) return;
    const recent = latest(s);
    view.replaceChildren(
      h('a', { class: 'back', href: '#' }, '← All games'),
      h('h2', {}, 'Achievements'),
      h('p', { class: 'trophy-total' }, `${s.done} of ${s.total} unlocked across ${s.games.length} games`),
      h('div', { class: 'trophy-meter' }, h('i', { style: `width:${(100 * s.done) / Math.max(1, s.total)}%` })),
      recent.length
        ? h('section', { class: 'trophy-recent' }, h('h3', {}, 'Latest'), h('ul', { class: 'trophy-list' }, recent.map((i) => item({ ...i, desc: `${info[i.slug]?.name || i.slug} · ${new Date(i.when).toLocaleDateString()}` }))))
        : h('p', { class: 'muted' }, 'Play any game to start collecting. Tap the trophy in a game’s top bar to see its list.'),
      ...s.games.map((g) =>
        h(
          'details',
          { class: 'trophy-game', open: g.done ? '' : null },
          h('summary', {}, info[g.slug]?.icon ? h('img', { src: info[g.slug].icon, alt: '' }) : null, h('b', {}, info[g.slug]?.name || g.slug), h('span', { class: 'trophy-count' }, `${g.done}/${g.total}`)),
          h('ul', { class: 'trophy-list' }, g.items.map(item)),
          h('a', { class: 'trophy-play', href: `${g.slug}/` }, `Play ${info[g.slug]?.name || g.slug} →`),
        ),
      ),
    );
  };

  const route = () => {
    const on = location.hash === '#achievements';
    view.hidden = !on;
    document.body.classList.toggle('trophy-mode', on);
    render();
    if (on) scrollTo(0, 0);
  };
  addEventListener('hashchange', route);
  addEventListener('pageshow', (e) => e.persisted && render());
  addEventListener('storage', (e) => e.key === KEY && render());
  route();
}

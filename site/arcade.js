// The games list: search, category chips, a "Jump back in" row, and saving
// every game for offline play. The page works without this script (the
// cards are plain links); this only makes it faster to get around.

const RECENT = 'freegames:recent'; // written by each game's core/hub.js
const FILTER = 'freegames:filter';

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
};

// ---------- Pure helpers (unit-tested) ----------

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Does a game match the search text and category? Every word must match
// the start of a word in the name, description or tags.
export function matches(game, query, tag = 'all') {
  if (tag !== 'all' && !game.tags.includes(tag)) return false;
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${game.name} ${game.blurb} ${game.tags.join(' ')} ${game.keywords || ''}`).split(/[^a-z0-9]+/);
  return words.every((w) => hay.some((h) => h.startsWith(w)));
}

// Most recently played first, only games that exist, at most `max`.
export function recentGames(recent, slugs, max = 4) {
  return Object.entries(recent || {})
    .filter(([slug, t]) => slugs.includes(slug) && Number.isFinite(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([slug]) => slug);
}

// ---------- Page ----------

export function init() {
  const cards = [...document.querySelectorAll('.grid a.game')];
  const games = cards.map((a) => ({
    a,
    slug: a.dataset.slug,
    name: a.querySelector('b').textContent,
    blurb: a.querySelector('small').textContent,
    tags: (a.dataset.tags || '').split(' ').filter(Boolean),
    keywords: a.dataset.keywords || '',
  }));
  const search = document.getElementById('search');
  const chips = [...document.querySelectorAll('.chips button')];
  const empty = document.getElementById('empty');
  let tag = read(FILTER, 'all');
  if (!chips.some((c) => c.dataset.tag === tag)) tag = 'all';

  const apply = () => {
    let shown = 0;
    for (const g of games) {
      const on = matches(g, search.value, tag);
      g.a.hidden = !on;
      if (on) shown++;
    }
    for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.tag === tag));
    for (const s of document.querySelectorAll('.game.soon')) s.hidden = !!search.value.trim() || tag !== 'all';
    empty.hidden = shown > 0;
  };
  for (const c of chips) {
    c.addEventListener('click', () => {
      tag = c.dataset.tag;
      write(FILTER, tag);
      apply();
    });
  }
  search.addEventListener('input', apply);
  search.addEventListener('keydown', (e) => {
    // Enter opens the first match; Escape clears.
    if (e.key === 'Enter') {
      const first = games.find((g) => !g.a.hidden);
      if (first) location.href = first.a.href;
    } else if (e.key === 'Escape') {
      search.value = '';
      apply();
    }
  });
  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    }
  });
  apply();

  // Jump back in: the games played most recently.
  const recentRow = document.getElementById('recent');
  const renderRecent = () => {
    const slugs = recentGames(read(RECENT, {}), games.map((g) => g.slug));
    recentRow.hidden = slugs.length === 0;
    const list = recentRow.querySelector('.recent-list');
    list.replaceChildren(
      ...slugs.map((slug) => {
        const g = games.find((x) => x.slug === slug);
        const link = document.createElement('a');
        link.className = 'recent-game';
        link.href = g.a.getAttribute('href');
        link.append(g.a.querySelector('img').cloneNode(), document.createTextNode(g.name));
        return link;
      }),
    );
  };
  renderRecent();
  addEventListener('pageshow', (e) => e.persisted && renderRecent());

  saveForOffline(games);
}

// ---------- Offline ----------

// Registers every game's own service worker from here, so each game caches
// itself now instead of on its first visit. Each worker keeps its game up to
// date afterwards, exactly as if the game had been opened.
function whenActive(reg) {
  if (reg.active) return Promise.resolve();
  const worker = reg.installing || reg.waiting;
  if (!worker) return Promise.reject(new Error('no worker'));
  return new Promise((resolve, reject) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
      else if (worker.state === 'redundant') reject(new Error('install failed'));
    });
  });
}

function saveForOffline(games) {
  const status = document.getElementById('offline');
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !secure) return;
  let ready = 0;
  let failed = 0;
  const total = games.length;
  const show = () => {
    status.hidden = false;
    status.classList.toggle('done', ready === total);
    status.querySelector('span').textContent =
      ready === total ? `All ${total} games work offline` : failed && ready + failed === total ? `${ready} of ${total} games saved for offline. Reload to try the rest.` : `Saving games for offline… ${ready} of ${total}`;
  };
  const run = () => {
    show();
    for (const g of games) {
      navigator.serviceWorker
        .register(`${g.slug}/sw.js`, { scope: `${g.slug}/` })
        .then((reg) => {
          if (navigator.onLine) reg.update().catch(() => {});
          return whenActive(reg);
        })
        .then(() => {
          ready++;
          g.a.classList.add('saved');
          show();
        })
        .catch(() => {
          failed++;
          show();
        });
    }
  };
  // Respect data saver: ask first instead of downloading everything.
  if (navigator.connection?.saveData) {
    status.hidden = false;
    const button = document.createElement('button');
    button.className = 'save-btn';
    button.textContent = 'Save all games for offline play';
    button.addEventListener('click', () => {
      button.remove();
      run();
    });
    status.querySelector('span').replaceChildren(button);
    return;
  }
  // After the page has settled, so first paint isn't slowed down.
  const start = () => setTimeout(run, 400);
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

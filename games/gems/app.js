import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, openDialog, toggle, segmented, el, toast } from './core/ui.js';
import { setSoundEnabled } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { COLS, ROWS, trySwap, validSwaps, isCleared, gemsLeft, adjacent } from './js/rules.js';
import { generate, levelSpec, levelSeed, DAILY_SPEC, LAUNCH_DAY } from './js/levels.js';
import { solve } from './js/solver.js';
import { THEMES, themeById, gemColor } from './js/themes.js';
import { Board } from './js/render.js';
import { sfx, setSoundTheme } from './js/sfx.js';

const store = makeStore('gems');
const settings = makeSettings(store, { skin: 'jewels', sound: true, vibrate: true, effects: true, speed: 'normal' });
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let game = null;

const board = new Board($('canvas'), $('stage'), { onSwap: (a, b) => swap(a, b), onSelect: (i) => i >= 0 && sfx.tap() });
$('canvas').board = board; // reachable from browser tests

// ---------- Settings ----------

function applySettings() {
  const theme = themeById(settings.get('skin'));
  document.body.dataset.skin = theme.id;
  applyTheme(theme.dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.dark ? '#0d0724' : '#fff0f6');
  setSoundEnabled(settings.get('sound'));
  setSoundTheme(theme);
  board.setTheme(theme);
  document.body.classList.toggle('no-effects', !settings.get('effects') || reducedMotion.matches);
  board.setOptions({ effects: settings.get('effects'), reduced: reducedMotion.matches, speed: settings.get('speed') === 'fast' ? 1.6 : 1 });
}
settings.onChange(applySettings);
reducedMotion.addEventListener?.('change', applySettings);
applySettings();

const announce = (text) => ($('announce').textContent = text);
const vibrate = (pattern) => {
  if (settings.get('vibrate') && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not allowed */
    }
  }
};

// ---------- Progress ----------

const progress = () => ({ level: 1, best: {}, solved: 0, perfect: 0, ...store.get('progress') });
const dailyLog = () => store.get('daily', {});
const today = () => dateKey();
const specOf = (g) => (g.mode === 'daily' ? { mode: 'daily', date: g.date } : { mode: 'level', level: g.level });
const specId = (spec) => (spec.mode === 'daily' ? `daily:${spec.date}` : `level:${spec.level}`);

function titleText() {
  if (!game) return 'Gems';
  return game.mode === 'daily' ? `Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : `Level ${game.level}`;
}

// ---------- Loading ----------

function load(spec, { challenge = null, fresh = false } = {}) {
  const id = specId(spec);
  const saved = store.get('game');
  if (!fresh && saved && saved.id === id && !saved.done) {
    game = saved;
    if (challenge) game.challenge = challenge;
  } else {
    const puzzle = spec.mode === 'daily' ? generate(dailySeed('gems', spec.date), DAILY_SPEC) : generate(levelSeed(spec.level), levelSpec(spec.level));
    game = { id, ...spec, start: puzzle.grid, grid: puzzle.grid.slice(), par: puzzle.par, proven: puzzle.proven, history: [], hints: 0, done: false, challenge };
  }
  begin(true);
}

function begin(enter) {
  board.setGrid(game.grid, { enter });
  updateHud();
  save();
  const c = game.challenge;
  $('challenge').hidden = !c;
  if (c) $('challenge').replaceChildren(icon('flag', { size: 16 }), ` Beat ${c} swaps · par is ${game.par}`);
  announce(`${titleText()}. ${gemsLeft(game.grid)} gems. Clear them all in ${game.par} swaps for par.`);
}

const save = () => game && store.set('game', game);

function replay() {
  let grid = game.start.slice();
  for (const [a, b] of game.history) grid = trySwap(grid, a, b).grid;
  return grid;
}

function updateHud() {
  $('title').textContent = titleText();
  const left = game ? gemsLeft(game.grid) : 0;
  const streak = game?.mode === 'daily' ? dailyStreak(dailyLog(), today()) : 0;
  $('subtitle').textContent = game ? `${left} gems left${streak ? ` · ${streak}-day streak` : ''}` : '';
  const moves = game ? game.history.length : 0;
  const movesEl = $('moves');
  if (movesEl.textContent !== String(moves)) {
    movesEl.textContent = moves;
    const chip = movesEl.parentElement;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }
  movesEl.parentElement.classList.toggle('over', !!game && moves > game.par);
  $('par').textContent = game ? game.par : '–';
  $('undo-btn').disabled = !game || !game.history.length || game.done;
  $('restart-btn').disabled = !game || !game.history.length || game.done;
  $('hint-btn').disabled = !game || game.done;
}

// ---------- Playing ----------

async function swap(a, b) {
  if (!game || game.done || board.busy) return;
  const res = trySwap(game.grid, a, b);
  if (!res) {
    sfx.blocked();
    board.bounce(a, b);
    return;
  }
  game.grid = res.grid;
  game.history.push([a, b]);
  const solved = isCleared(res.grid);
  if (solved) game.done = true;
  save();
  updateHud();
  sfx.swap();
  const current = game;
  let total = 0;
  await board.play(a, b, res.steps, {
    onStep: (k, step) => {
      total += step.cleared.length;
      sfx.match(k);
      vibrate(k ? [10, 30, 16] : 12);
      if (k >= 1) board.float(`CASCADE ×${k + 1}`);
      else if (step.cleared.length >= 5) board.float(step.cleared.length >= 6 ? 'DOUBLE!' : 'FIVE!', { color: gemColor(board.theme, step.colors[0]) });
    },
    onLand: () => sfx.land(),
  });
  if (current !== game) return;
  announce(`Cleared ${total} gems${res.steps.length > 1 ? ` in a ${res.steps.length}-step cascade` : ''}. ${gemsLeft(game.grid)} left.`);
  if (solved) win();
  else if (!validSwaps(game.grid).length) {
    sfx.stuck();
    toast('No swaps left', { action: { label: 'Undo', onClick: undo } });
  }
}

function undo() {
  if (!game || game.done || !game.history.length || board.busy) return;
  game.history.pop();
  game.grid = replay();
  board.setGrid(game.grid, { enter: false });
  save();
  updateHud();
  announce(`Undid a swap. ${game.history.length} swaps.`);
}

async function restart() {
  if (!game || game.done || !game.history.length) return;
  const ok = await openDialog({
    title: 'Restart puzzle?',
    body: el('p', {}, 'Put every gem back and start again.'),
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Restart', value: true, primary: true },
    ],
  });
  if (!ok) return;
  game.history = [];
  game.grid = game.start.slice();
  begin(true);
}

function hint() {
  if (!game || game.done || board.busy) return;
  const found = solve(game.grid, { bound: 30, maxNodes: 20000 });
  if (!found.moves?.length) {
    toast('No way to clear from here', { action: { label: 'Undo', onClick: undo } });
    return;
  }
  const [a, b] = found.moves[0];
  board.showHint(a, b);
  game.hints++;
  save();
  sfx.hint();
  announce(`Hint: swap row ${Math.floor(a / COLS) + 1} column ${(a % COLS) + 1} with its neighbour.`);
}

// ---------- Winning ----------

function resultRating() {
  const r = rating(game.history.length, game.par);
  if (game.hints) return { ...r, label: 'Cleared with help', emoji: '💡', icon: 'bulb', tier: Math.min(r.tier, 1) };
  return r;
}

async function win() {
  const moves = game.history.length;
  const r = resultRating();
  const p = progress();
  p.solved++;
  if (r.tier >= 3) p.perfect++;
  if (game.mode === 'level') {
    const prev = p.best[game.level];
    if (!prev || (prev.hints && !game.hints) || (!!prev.hints === !!game.hints && moves < prev.moves)) p.best[game.level] = { moves, hints: game.hints };
    if (game.level === p.level) p.level++;
  } else {
    const log = dailyLog();
    if (!log[game.date]) store.set('daily', { ...log, [game.date]: { moves, par: game.par, hints: game.hints } });
  }
  store.set('progress', p);
  save();
  updateHud();
  announce(`Board cleared in ${moves} swaps. Par ${game.par}. ${r.label}.`);
  await board.celebrate({ onStep: (i) => sfx.marquee(i), onJackpot: () => sfx.jackpot() });
  openResults();
}

function shareLine() {
  const moves = game.history.length;
  const r = resultRating();
  const title = game.mode === 'daily' ? `Gems · Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : `Gems · Level ${game.level}`;
  const text = `${title} ${r.emoji}\n${moves} swaps · par ${game.par} (${overText(moves - game.par)})${game.hints ? ` · 💡${game.hints}` : ''}\n${squares(moves, game.par)}`;
  const params = game.mode === 'daily' ? { d: game.date, m: moves } : { l: game.level, m: moves };
  return { text, url: location.origin + location.pathname + buildHash(params) };
}

function openResults() {
  const moves = game.history.length;
  const r = resultRating();
  const notes = [];
  if (game.mode === 'daily') {
    const streak = dailyStreak(dailyLog(), today());
    if (streak) notes.push(note(`${streak}-day streak`, { icon: 'flame' }));
  }
  if (r.tier === 4) notes.push(note('You beat the solver’s best!', { win: true, icon: 'bird' }));
  if (game.challenge) {
    const diff = Number(game.challenge) - moves;
    notes.push(note(diff > 0 ? `You beat your friend by ${diff}!` : diff === 0 ? 'Tied with your friend' : `Your friend did it in ${game.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
  }
  const actions =
    game.mode === 'level'
      ? [
          { label: r.tier >= 3 ? 'Replay' : 'Try for par', value: 'replay' },
          { label: `Level ${game.level + 1} →`, value: 'next', primary: true },
        ]
      : [
          { label: 'Replay', value: 'replay' },
          { label: `Level ${progress().level} →`, value: 'levels', primary: true },
        ];
  const current = game;
  showResults({
    title: titleText(),
    rating: r,
    reels: [{ label: 'Swaps', value: moves }, { label: 'Par', value: game.par }],
    squares: squares(moves, game.par),
    notes,
    share: shareLine,
    actions,
    sounds: { tick: sfx.tick, stamp: sfx.stamp },
    reduced: reducedMotion.matches,
  }).then((choice) => {
    if (current !== game) return;
    if (choice === 'next') load({ mode: 'level', level: game.level + 1 });
    else if (choice === 'levels') load({ mode: 'level', level: progress().level });
    else if (choice === 'replay') load(specOf(game), { fresh: true, challenge: game.challenge });
  });
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const p = progress();
  const key = today();
  const done = dailyLog()[key];
  const streak = dailyStreak(dailyLog(), key);
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  const input = el('input', { type: 'number', min: 1, max: p.level, value: game?.mode === 'level' ? game.level : p.level, 'aria-label': 'Level number', inputmode: 'numeric' });
  const body = el('div', {},
    el('div', { class: 'menu-list' },
      menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`,
        done ? `Cleared in ${done.moves} (par ${done.par})${streak ? ` · ${streak}-day streak` : ''}` : `Same board for everyone today${streak ? ` · ${streak}-day streak` : ''}`,
        go(() => load({ mode: 'daily', date: key }))),
      menuCard('gem', `Level ${p.level}`, p.level > 1 ? `${p.level - 1} cleared · ${p.perfect} perfect` : 'Start from the beginning', go(() => load({ mode: 'level', level: p.level }))),
    ),
    el('div', { class: 'field' },
      el('span', { class: 'field-label' }, 'Play any level you have reached'),
      el('div', { class: 'level-picker' }, input,
        el('button', { class: 'btn', onclick: go(() => load({ mode: 'level', level: Math.max(1, Math.min(p.level, Math.floor(Number(input.value) || 1))) })) }, 'Play'))),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openThemes) }, withIcon('palette', 'Themes')),
      el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings'))),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openStats) }, withIcon('chart', 'Stats')),
      el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Gems', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openThemes() {
  const current = settings.get('skin');
  const sample = (t) => el('span', { class: 'dots' }, [0, 1, 2, 3, 4, 5].map((k) => el('i', { style: `background:${gemColor(t, k)}` })));
  openDialog({
    title: 'Themes',
    body: el('div', {},
      el('div', { class: 'theme-grid', role: 'radiogroup' },
        THEMES.map((t) =>
          el('label', { class: 'theme-card' },
            el('input', { type: 'radio', name: 'skin', value: t.id, checked: t.id === current, onchange: () => settings.set('skin', t.id), 'aria-label': t.name }),
            el('span', { class: `face ${t.dark ? 'dark' : 'light'}`, style: `background:${t.preview}` }, el('b', {}, t.name), sample(t))))),
      el('p', { class: 'muted' }, 'Every theme has its own gems, sounds and effects.')),
  });
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {},
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Vibration', settings.get('vibrate'), (v) => settings.set('vibrate', v), 'On phones that support it'),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Glow, particles, shake and moving backgrounds'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Cascade speed'),
        segmented('speed', [['normal', 'Normal'], ['fast', 'Fast']], settings.get('speed'), (v) => settings.set('speed', v)))),
  });
}

function openStats() {
  const p = progress();
  const log = dailyLog();
  const days = Object.keys(log);
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
  openDialog({
    title: 'Stats',
    body: el('div', { class: 'stat-grid' },
      stat(p.level - 1, 'Levels'),
      stat(p.solved, 'Cleared'),
      stat(p.perfect, 'Perfect'),
      stat(days.length, 'Dailies'),
      stat(dailyStreak(log, today()), 'Streak'),
      stat(days.filter((d) => log[d].moves <= log[d].par && !log[d].hints).length, 'Daily par')),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    className: 'help',
    body: el('div', {},
      el('p', {}, 'Swipe a gem onto a neighbour — or tap one, then the other — to swap them. A swap must make a line of three or more of a kind.'),
      el('p', {}, 'Lines clear and the gems above fall. Nothing new drops in: every gem you see is all there is. Clear the whole board.'),
      el('p', {}, el('b', {}, 'Par'), ' is the fewest swaps the solver found. Set up cascades to clear more with each swap. Match par for a Perfect.'),
      el('ul', {},
        el('li', {}, 'Undo as much as you like; only the swaps you keep count.'),
        el('li', {}, 'Hints are free. Results that used them are marked as helped.'),
        el('li', {}, 'The daily board is the same for everyone. Share your result to challenge a friend.')),
      el('p', { class: 'muted' }, 'Keys: arrows move, Space picks and swaps, Z undo, H hint.'),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.')),
  });
}

// ---------- Controls ----------

$('undo-btn').addEventListener('click', undo);
$('restart-btn').addEventListener('click', restart);
$('hint-btn').addEventListener('click', hint);
$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);

let focus = -1;
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.altKey || e.ctrlKey) return;
  const arrows = { ArrowUp: -COLS, ArrowDown: COLS, ArrowLeft: -1, ArrowRight: 1 };
  if (arrows[e.key]) {
    if (focus < 0) focus = at0();
    const next = focus + arrows[e.key];
    const sameRow = Math.abs(arrows[e.key]) === 1 ? Math.floor(next / COLS) === Math.floor(focus / COLS) : true;
    if (next >= 0 && next < COLS * ROWS && sameRow) focus = next;
    board.setFocus(focus);
  } else if ((e.key === ' ' || e.key === 'Enter') && focus >= 0) {
    if (board.selected >= 0 && adjacent(board.selected, focus)) {
      const a = board.selected;
      board.select(-1);
      swap(a, focus);
    } else board.select(game.grid[focus] >= 0 ? focus : -1);
  } else if (e.key === 'z' || e.key === 'Z') undo();
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'Escape') board.select(-1);
  else return;
  e.preventDefault();
});
const at0 = () => Math.max(0, game.grid.findIndex((v) => v >= 0));

addHubLink();

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// ---------- Start ----------

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.l) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const challenge = /^\d+$/.test(h.m || '') ? Number(h.m) : null;
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { spec: { mode: 'daily', date: h.d > today() ? today() : h.d }, challenge };
  const level = Math.floor(Number(h.l));
  if (level >= 1) return { spec: { mode: 'level', level }, challenge };
  return null;
}

const link = fromLink();
const saved = store.get('game');
if (link) load(link.spec, { challenge: link.challenge });
else if (saved && !saved.done && saved.grid) load(specOf(saved));
else load({ mode: 'level', level: progress().level });

window.addEventListener('hashchange', () => {
  const next = fromLink();
  if (next) load(next.spec, { challenge: next.challenge });
});

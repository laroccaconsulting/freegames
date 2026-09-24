import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, openDialog, toggle, el, toast } from './core/ui.js';
import { setSoundEnabled } from './core/sound.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { TRAY, coverMap, pick, isFree, isWon, isLost, trayPeak } from './js/rules.js';
import { generate, levelSpec, levelSeed, DAILY_SPEC, LAUNCH_DAY } from './js/levels.js';
import { solve } from './js/solver.js';
import { THEMES, themeById, iconColor } from './js/themes.js';
import { Board } from './js/render.js';
import { sfx, setSoundTheme } from './js/sfx.js';

const store = makeStore('trio');
const settings = makeSettings(store, { skin: 'jewels', sound: true, vibrate: true, effects: true });
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let game = null; // saved puzzle and progress
let covers = [];
let combo = 0;
let sinceMatch = 0;
let queue = [];
let running = false;

const board = new Board($('canvas'), $('stage'), { onTap: (i) => enqueue(i) });
$('canvas').board = board; // reachable from browser tests

// ---------- Settings ----------

function applySettings() {
  const theme = themeById(settings.get('skin'));
  document.body.dataset.skin = theme.id;
  applyTheme(theme.dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.dark ? '#0d0724' : '#f3fbe6');
  setSoundEnabled(settings.get('sound'));
  setSoundTheme(theme);
  board.setTheme(theme);
  document.body.classList.toggle('no-effects', !settings.get('effects') || reducedMotion.matches);
  board.setOptions({ effects: settings.get('effects'), reduced: reducedMotion.matches });
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
  if (!game) return 'Trio';
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
    const puzzle = spec.mode === 'daily' ? generate(dailySeed('trio', spec.date), DAILY_SPEC) : generate(levelSeed(spec.level), levelSpec(spec.level));
    game = {
      id,
      ...spec,
      tiles: puzzle.tiles,
      par: puzzle.par,
      proven: puzzle.proven,
      history: [],
      hints: 0,
      done: false,
      challenge,
    };
  }
  covers = coverMap(game.tiles);
  begin(true);
}

// Rebuilds the rules state by replaying the history.
function replay(history) {
  let state = { types: game.tiles.map((t) => t.type), removed: new Array(game.tiles.length).fill(0), tray: [] };
  for (const i of history) state = pick(state, covers, i);
  return state;
}

let state = null;

function begin(enter) {
  queue = [];
  combo = 0;
  sinceMatch = 0;
  state = replay(game.history);
  board.setPuzzle(game.tiles, covers, state.removed, state.tray, { enter, capacity: TRAY });
  updateHud();
  save();
  const c = game.challenge;
  $('challenge').hidden = !c;
  if (c) $('challenge').replaceChildren(icon('flag', { size: 16 }), ` Beat a peak of ${c} · par is ${game.par}`);
  announce(`${titleText()}. ${game.tiles.length} tiles. Par: never more than ${game.par} in the tray.`);
}

const save = () => game && store.set('game', game);
const peakNow = () => trayPeak(game.tiles.map((t) => t.type), game.history);

function updateHud() {
  $('title').textContent = titleText();
  const sub = $('subtitle');
  const left = game ? game.tiles.length - game.history.length : 0;
  if (!game) sub.textContent = '';
  else if (game.mode === 'daily') {
    const streak = dailyStreak(dailyLog(), today());
    sub.textContent = `${left} tiles left${streak ? ` · ${streak}-day streak` : ''}`;
  } else sub.textContent = `${left} tiles left`;
  const peak = game ? peakNow() : 0;
  const peakEl = $('peak');
  if (peakEl.textContent !== String(peak)) {
    peakEl.textContent = peak;
    const chip = peakEl.parentElement;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }
  peakEl.parentElement.classList.toggle('over', !!game && peak > game.par);
  $('par').textContent = game ? game.par : '–';
  $('undo-btn').disabled = !game || !game.history.length || game.done;
  $('restart-btn').disabled = !game || !game.history.length || game.done;
  $('hint-btn').disabled = !game || game.done;
}

// ---------- Playing ----------

// Taps are queued so fast players never lose one while a tile is in flight.
function enqueue(i) {
  if (!game || game.done || isLost(state)) return;
  // Judge the tap against the board as it will be once queued taps have played.
  const removed = state.removed.slice();
  for (const q of queue) removed[q] = 1;
  if (!isFree(covers, removed, i)) {
    if (!removed[i]) {
      board.shake(i);
      sfx.blocked();
    }
    return;
  }
  queue.push(i);
  board.queue(i);
  if (!running) drain();
}

async function drain() {
  running = true;
  while (queue.length && game && !game.done) {
    const i = queue.shift();
    if (!isFree(covers, state.removed, i)) continue;
    if (isLost(state)) {
      queue = [];
      break;
    }
    await play(i);
  }
  running = false;
}

async function play(i) {
  const next = pick(state, covers, i);
  if (!next) return;
  state = next;
  game.history.push(i);
  sinceMatch++;
  sfx.tap();
  save();
  updateHud();
  const current = game;
  await board.pick(i, next.at, next.cleared, {
    onLanded: () => {
      if (current !== game) return;
      sfx.land(next.at);
      if (next.cleared != null) {
        // A streak: triples taken cleanly, each within three taps of the last.
        combo = sinceMatch <= 3 ? combo + 1 : 0;
        sinceMatch = 0;
        sfx.match(combo);
        board.streak(combo);
        vibrate(combo > 0 ? [10, 30, 16] : 12);
      }
    },
  });
  if (current !== game) return;
  if (isWon(state)) win();
  else if (isLost(state)) lost();
}

function undo() {
  if (!game || game.done || !game.history.length || board.busy) return;
  queue = [];
  const i = game.history.pop();
  state = replay(game.history);
  board.unpick(i, state.tray);
  combo = 0;
  save();
  updateHud();
  announce(`Undid a move. ${game.history.length} tiles taken.`);
}

async function restart() {
  if (!game || game.done || !game.history.length) return;
  const ok = await openDialog({
    title: 'Restart board?',
    body: el('p', {}, 'Put every tile back and start this board again.'),
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Restart', value: true, primary: true },
    ],
  });
  if (!ok) return;
  game.history = [];
  begin(true);
}

function hint() {
  if (!game || game.done || board.busy) return;
  const result = solve(game.tiles, covers, { removed: state.removed, capacity: TRAY });
  if (!result.order?.length) {
    toast('No way to clear from here', { action: { label: 'Undo', onClick: undo } });
    return;
  }
  board.showHint(result.order[0]);
  game.hints++;
  save();
  sfx.hint();
  announce('Hint: the glowing tile.');
}

async function lost() {
  board.shakeTray();
  sfx.full();
  vibrate([30, 60, 30]);
  const choice = await openDialog({
    title: 'Tray full',
    body: el('p', {}, 'No room for another tile. Undo a few moves, or try the board again.'),
    actions: [
      { label: 'Restart', value: 'restart' },
      { label: 'Undo', value: 'undo', primary: true },
    ],
    dismissible: false,
  });
  if (choice === 'undo') undo();
  else {
    game.history = [];
    begin(true);
  }
}

// ---------- Winning ----------

function resultRating() {
  const r = rating(peakNow(), game.par);
  if (game.hints) return { ...r, label: 'Cleared with help', emoji: '💡', icon: 'bulb', tier: Math.min(r.tier, 1) };
  return r;
}

async function win() {
  game.done = true;
  const peak = peakNow();
  const r = resultRating();
  const p = progress();
  p.solved++;
  if (r.tier >= 3) p.perfect++;
  if (game.mode === 'level') {
    const prev = p.best[game.level];
    if (!prev || (prev.hints && !game.hints) || (!!prev.hints === !!game.hints && peak < prev.peak)) p.best[game.level] = { peak, hints: game.hints };
    if (game.level === p.level) p.level++;
  } else {
    const log = dailyLog();
    if (!log[game.date]) store.set('daily', { ...log, [game.date]: { peak, par: game.par, hints: game.hints } });
  }
  store.set('progress', p);
  save();
  updateHud();
  announce(`Board cleared. Peak ${peak}, par ${game.par}. ${r.label}.`);
  await board.celebrate({ onStep: (i) => sfx.marquee(i), onJackpot: () => sfx.jackpot() });
  openResults();
}

function shareLine() {
  const peak = peakNow();
  const r = resultRating();
  const title = game.mode === 'daily' ? `Trio · Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : `Trio · Level ${game.level}`;
  const text = `${title} ${r.emoji}\nTray peak ${peak} · par ${game.par} (${overText(peak - game.par)})${game.hints ? ` · 💡${game.hints}` : ''}\n${squares(peak, game.par)}`;
  const params = game.mode === 'daily' ? { d: game.date, m: peak } : { l: game.level, m: peak };
  return { text, url: location.origin + location.pathname + buildHash(params) };
}

function openResults() {
  const peak = peakNow();
  const r = resultRating();
  const notes = [];
  if (game.mode === 'daily') {
    const streak = dailyStreak(dailyLog(), today());
    if (streak) notes.push(note(`${streak}-day streak`, { icon: 'flame' }));
  }
  if (r.tier === 4) notes.push(note('You beat the solver’s best!', { win: true, icon: 'bird' }));
  if (game.challenge) {
    const diff = Number(game.challenge) - peak;
    notes.push(note(diff > 0 ? `You beat your friend by ${diff}!` : diff === 0 ? 'Tied with your friend' : `Your friend peaked at ${game.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
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
    reels: [{ label: 'Peak', value: peak }, { label: 'Par', value: game.par }],
    squares: squares(peak, game.par),
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
        done ? `Cleared with peak ${done.peak} (par ${done.par})${streak ? ` · ${streak}-day streak` : ''}` : `Same board for everyone today${streak ? ` · ${streak}-day streak` : ''}`,
        go(() => load({ mode: 'daily', date: key }))),
      menuCard('tiles', `Level ${p.level}`, p.level > 1 ? `${p.level - 1} cleared · ${p.perfect} perfect` : 'Start from the beginning', go(() => load({ mode: 'level', level: p.level }))),
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
  openDialog({ title: 'Trio', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openThemes() {
  const current = settings.get('skin');
  const sample = (t) => el('span', { class: 'dots' }, [0, 1, 2, 3, 4, 5].map((k) => el('i', { style: `background:${iconColor(t, k)}` })));
  openDialog({
    title: 'Themes',
    body: el('div', {},
      el('div', { class: 'theme-grid', role: 'radiogroup' },
        THEMES.map((t) =>
          el('label', { class: 'theme-card' },
            el('input', { type: 'radio', name: 'skin', value: t.id, checked: t.id === current, onchange: () => settings.set('skin', t.id), 'aria-label': t.name }),
            el('span', { class: `face ${t.dark ? 'dark' : 'light'}`, style: `background:${t.preview}` }, el('b', {}, t.name), sample(t))))),
      el('p', { class: 'muted' }, 'Every theme has its own tiles, sounds and effects.')),
  });
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {},
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Vibration', settings.get('vibrate'), (v) => settings.set('vibrate', v), 'On phones that support it'),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Glow, particles and moving backgrounds')),
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
      stat(days.filter((d) => log[d].peak <= log[d].par && !log[d].hints).length, 'Daily par')),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    className: 'help',
    body: el('div', {},
      el('p', {}, 'Tap a bright tile to move it to the tray. Three of a kind in the tray clear. Clear the whole board before the tray fills up.'),
      el('p', {}, 'Dimmed tiles are covered. Hold ', el('b', {}, 'X-ray'), ' to see through the stack — nothing is hidden, and every board can be cleared.'),
      el('p', {}, el('b', {}, 'Peak'), ' is the most tiles your tray has held. ', el('b', {}, 'Par'), ' is the lowest peak the solver found. Match it for a Perfect, or beat it for a Birdie.'),
      el('ul', {},
        el('li', {}, 'Undo as much as you like: your peak counts only the moves you keep.'),
        el('li', {}, 'Hints are free. Results that used them are marked as helped.'),
        el('li', {}, 'The daily board is the same for everyone. Share your result to challenge a friend.')),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.')),
  });
}

// ---------- Controls ----------

$('undo-btn').addEventListener('click', undo);
$('restart-btn').addEventListener('click', restart);
$('hint-btn').addEventListener('click', hint);
$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);

// X-ray: hold to look through the stack (or tap to toggle, for keyboards and switch users).
const xray = $('xray-btn');
let xrayHeld = false;
const setXray = (on) => {
  board.setOptions({ xray: on });
  xray.setAttribute('aria-pressed', String(on));
  xray.classList.toggle('on', on);
};
xray.addEventListener('pointerdown', () => {
  xrayHeld = false;
  setXray(true);
  setTimeout(() => (xrayHeld = true), 250);
});
xray.addEventListener('pointerup', () => xrayHeld && setXray(false));
xray.addEventListener('pointerleave', () => xrayHeld && setXray(false));
xray.addEventListener('click', (e) => {
  if (e.detail === 0) setXray(xray.getAttribute('aria-pressed') !== 'true');
});

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.altKey) return;
  if (e.key === 'z' || e.key === 'Z') undo();
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'x' || e.key === 'X') setXray(xray.getAttribute('aria-pressed') !== 'true');
  else return;
  e.preventDefault();
});

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
else if (saved && !saved.done && saved.tiles) load(specOf(saved));
else load({ mode: 'level', level: progress().level });

window.addEventListener('hashchange', () => {
  const next = fromLink();
  if (next) load(next.spec, { challenge: next.challenge });
});

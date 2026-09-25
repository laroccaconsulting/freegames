import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { isHallowsSeason } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, formatTime } from './core/ui.js';
import { medal } from './core/icons.js';
import { sounds, setSoundEnabled } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker, isStandalone } from './core/pwa.js';
import { randomSeed } from './core/rng.js';
import { injectSprite } from './js/art.js';
import { Board } from './js/board.js';
import { celebrate } from './js/celebrate.js';
import { VARIANTS } from './js/variants.js';
import {
  createGame, move, stockAction, undo, hints, bestTarget, nextFoundationMove,
  canAutoFinish, isStuck, serialize, deserialize, variantOf,
} from './js/engine.js';

const store = makeStore('solitaire');
const settings = makeSettings(store, {
  theme: null,
  felt: 'green',
  back: 'red',
  sound: true,
  tapToMove: true,
  autoMove: true,
  fourColor: false,
  leftHanded: false,
  showTimer: true,
  showScore: true,
});
// No theme picked yet: follow the season (Hallows in autumn).
const themeId = () => settings.get('theme') ?? (isHallowsSeason() ? 'hallows' : 'auto');

const FELTS = { green: '#1d6b45', blue: '#1f4f7a', teal: '#17645f', red: '#7a2331', purple: '#4a2f73', charcoal: '#2c3036' };
const BACKS = { red: '#a52a38', blue: '#2a5aa0', green: '#2a7550', purple: '#5d3f94', black: '#30333a', gold: '#b87424' };
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
let game = null;
let busy = false; // true while auto-finish runs
let hintIndex = 0;
let autoTimer = null;
let installPrompt = null;

// ---------- Settings ----------

function applySettings() {
  applyTheme(themeId());
  setSoundEnabled(settings.get('sound'));
  document.body.dataset.felt = settings.get('felt');
  document.body.style.setProperty('--felt', FELTS[settings.get('felt')]);
  boardEl.dataset.back = settings.get('back');
  boardEl.style.setProperty('--back', BACKS[settings.get('back')]);
  boardEl.classList.toggle('four-color', settings.get('fourColor'));
  document.body.classList.toggle('hide-timer', !settings.get('showTimer'));
  document.body.classList.toggle('hide-score', !settings.get('showScore'));
  if (board.leftHanded !== settings.get('leftHanded')) {
    board.leftHanded = settings.get('leftHanded');
    if (game) board.render();
  }
}

// ---------- Stats ----------

const allStats = () => store.get('stats', {});
function statsFor(key) {
  return { played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: null, fewestMoves: null, bestScore: null, ...allStats()[key] };
}
function saveStats(key, s) {
  store.set('stats', { ...allStats(), [key]: s });
}
const modeKey = (g) => variantOf(g).modeKey(g.options);

function recordStart(g) {
  const key = modeKey(g);
  const s = statsFor(key);
  s.played++;
  saveStats(key, s);
}

function recordLoss(g) {
  const key = modeKey(g);
  const s = statsFor(key);
  s.streak = 0;
  saveStats(key, s);
}

function recordWin(g) {
  const key = modeKey(g);
  const s = statsFor(key);
  const records = [];
  s.won++;
  s.played = Math.max(s.played, s.won);
  s.streak++;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  if (s.bestTime == null || g.elapsed < s.bestTime) {
    if (s.bestTime != null) records.push('Fastest time');
    s.bestTime = g.elapsed;
  }
  if (s.fewestMoves == null || g.moves < s.fewestMoves) {
    if (s.fewestMoves != null) records.push('Fewest moves');
    s.fewestMoves = g.moves;
  }
  if (variantOf(g).hasScore && (s.bestScore == null || g.score > s.bestScore)) {
    if (s.bestScore != null) records.push('High score');
    s.bestScore = g.score;
  }
  saveStats(key, s);
  return { stats: s, records };
}

// ---------- Game lifecycle ----------

function save() {
  if (game) store.set('game', serialize(game));
}

function startGame(variantId, options, seed) {
  clearTimeout(autoTimer);
  busy = false;
  const variant = VARIANTS[variantId];
  game = createGame(variantId, options, seed ?? randomSeed(variant.maxSeed));
  store.set('last', { variantId, options: game.options });
  hintIndex = 0;
  board.setGame(game, { deal: !reducedMotion() });
  sounds.deal();
  save();
  updateHud();
}

async function confirmAbandon() {
  if (!game || !game.started || game.won) return true;
  const ok = await openDialog({
    title: 'Start a new game?',
    body: el('p', { class: 'muted' }, 'The game in progress will count as a loss.'),
    actions: [
      { label: 'Keep playing', value: false },
      { label: 'New game', value: true, primary: true },
    ],
  });
  if (ok) recordLoss(game);
  return !!ok;
}

async function newGame(variantId = game.variantId, options = game.options, seed) {
  if (!(await confirmAbandon())) return;
  startGame(variantId, options, seed);
}

// ---------- Actions ----------

function afterAction(events) {
  if (!events) return;
  hintIndex = 0;
  board.clearHighlight();
  if (events.completed?.length) sounds.success();
  else if (events.type === 'deal') sounds.deal();
  else if (events.flipped?.length) sounds.flip();
  else sounds.place();
  if (!wasStartedBefore && game.started) recordStart(game);
  board.render();
  updateHud();
  save();
  if (events.won) {
    onWin();
    return;
  }
  scheduleAuto();
  if (isStuck(game)) {
    toast('No moves left', { action: { label: 'New game', onClick: () => newGame() } });
  }
}

// Tracks whether the game had started before the current action, so the
// first move of a game is what counts it as "played".
let wasStartedBefore = false;
function act(fn) {
  if (busy || !game || game.won) return null;
  wasStartedBefore = game.started;
  const events = fn();
  if (events && events.ok !== false) afterAction(events);
  return events;
}

function tryMove(from, index, to) {
  return !!act(() => move(game, from, index, to));
}

function onTap(pileId, index) {
  if (busy || game.won) return;
  const to = settings.get('tapToMove') ? bestTarget(game, pileId, index) : null;
  if (to) tryMove(pileId, index, to);
  else {
    board.shake(pileId, index);
    sounds.invalid();
  }
}

function onStock() {
  const events = act(() => stockAction(game));
  if (events && events.ok === false && events.message) toast(events.message);
}

function doUndo() {
  if (busy || !game || game.won) return;
  clearTimeout(autoTimer);
  if (!undo(game)) {
    toast('Nothing to undo');
    return;
  }
  hintIndex = 0;
  board.clearHighlight();
  sounds.flip();
  board.render();
  updateHud();
  save();
}

function doHint() {
  if (busy || !game || game.won) return;
  const list = hints(game);
  if (!list.length) {
    toast('No moves available — try Undo or a new game');
    return;
  }
  const h = list[hintIndex % list.length];
  hintIndex++;
  board.highlight(h);
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  const finishBtn = $('auto-btn');
  const finishable = canAutoFinish(game);
  finishBtn.hidden = !finishable;
  if (!settings.get('autoMove')) return;
  if (finishable) {
    autoTimer = setTimeout(autoFinish, 350);
    return;
  }
  const next = nextFoundationMove(game, { safeOnly: true });
  if (next) autoTimer = setTimeout(() => tryMove(next.from, next.index, next.to), 180);
}

function autoFinish() {
  if (busy || !canAutoFinish(game)) return;
  busy = true;
  $('auto-btn').hidden = true;
  const step = () => {
    const next = nextFoundationMove(game, { safeOnly: false });
    if (!next || game.won) {
      busy = false;
      return;
    }
    wasStartedBefore = game.started;
    const events = move(game, next.from, next.index, next.to);
    busy = false;
    afterActionQuiet(events);
    if (!game.won) {
      busy = true;
      setTimeout(step, reducedMotion() ? 20 : 85);
    }
  };
  step();
}

// Same as afterAction but without re-scheduling auto moves (auto-finish drives itself).
function afterActionQuiet(events) {
  if (!events) return;
  sounds.place();
  board.render();
  updateHud();
  save();
  if (events.won) onWin();
}

async function onWin() {
  clearTimeout(autoTimer);
  $('auto-btn').hidden = true;
  updateHud();
  const { stats, records } = recordWin(game);
  save();
  sounds.win();
  await new Promise((r) => setTimeout(r, 450));
  if (!reducedMotion()) {
    await celebrate({
      foundations: board.foundationCardRects(),
      cardWidth: board.m.cw,
      cardHeight: board.m.ch,
      fourColor: settings.get('fourColor'),
    });
  }
  const hasScore = variantOf(game).hasScore;
  const body = el(
    'div',
    { class: 'win' },
    el('div', { class: 'win-trophy', 'aria-hidden': 'true' }, medal('trophy', { size: 72 })),
    records.length > 0 && el('p', { class: 'win-records' }, `New record: ${records.join(' · ')}!`),
    el(
      'div',
      { class: 'stat-grid' },
      stat('Time', formatTime(game.elapsed)),
      stat('Moves', game.moves),
      hasScore ? stat('Score', game.score) : stat('Streak', stats.streak),
      stat('Won', stats.won),
      stat('Win rate', pct(stats.won, stats.played)),
      stat('Best streak', stats.bestStreak),
    ),
  );
  const choice = await openDialog({
    title: 'You won!',
    body,
    className: 'win-dialog',
    actions: [
      { label: 'Close', value: 'close' },
      { label: 'New game', value: 'new', primary: true },
    ],
  });
  if (choice === 'new') startGame(game.variantId, game.options);
}

// ---------- HUD ----------

function updateHud() {
  const variant = variantOf(game);
  $('game-name').textContent = variant.name;
  $('game-mode').textContent = variant.modeLabel(game.options);
  $('game-mode').hidden = !variant.modeLabel(game.options);
  $('time').textContent = formatTime(game.elapsed);
  $('moves').textContent = game.moves;
  $('score').textContent = game.score;
  $('score-chip').hidden = !variant.hasScore;
  $('undo-btn').disabled = !game.history.length || game.won;
  $('deal-no').textContent = `#${game.seed}`;
}

setInterval(() => {
  if (!game || !game.started || game.won || document.hidden) return;
  game.elapsed++;
  $('time').textContent = formatTime(game.elapsed);
  if (game.elapsed % 10 === 0) save();
}, 1000);

document.addEventListener('visibilitychange', () => document.hidden && save());
window.addEventListener('pagehide', save);

// ---------- Dialogs ----------

const stat = (label, value) => el('div', { class: 'stat' }, el('b', {}, value ?? '—'), el('span', {}, label));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

const GAME_INFO = {
  klondike: 'The classic. Build down in alternating colours; move Aces up to the foundations.',
  spider: 'Build runs from King to Ace in one suit to clear them off the table.',
  freecell: 'Every card is face up. Use four free cells to sort the deck. Nearly every deal is winnable.',
};

async function gamePicker() {
  let choice = { variantId: game.variantId, options: { ...game.options } };
  const optionsHost = el('div', { class: 'picker-options' });
  const renderOptions = () => {
    optionsHost.replaceChildren();
    if (choice.variantId === 'klondike') {
      optionsHost.append(
        el('span', { class: 'field-label' }, 'Draw'),
        segmented('draw', [[1, 'Draw 1'], [3, 'Draw 3']], choice.options.draw ?? 1, (v) => (choice.options.draw = Number(v))),
      );
    } else if (choice.variantId === 'spider') {
      optionsHost.append(
        el('span', { class: 'field-label' }, 'Suits'),
        segmented('suits', [[1, '1 suit'], [2, '2 suits'], [4, '4 suits']], choice.options.suits ?? 1, (v) => (choice.options.suits = Number(v))),
      );
    }
  };
  const cards = Object.values(VARIANTS).map((v) =>
    el(
      'label',
      { class: 'picker-card' },
      el('input', {
        type: 'radio',
        name: 'variant',
        value: v.id,
        checked: v.id === choice.variantId,
        onchange: () => {
          const prev = choice.variantId === v.id ? choice.options : {};
          choice = { variantId: v.id, options: { ...v.defaults, ...(v.id === game.variantId ? game.options : prev) } };
          renderOptions();
        },
      }),
      el('span', { class: 'picker-body' }, el('b', {}, v.name), el('small', {}, GAME_INFO[v.id])),
    ),
  );
  renderOptions();
  const result = await openDialog({
    title: 'Choose a game',
    body: el('div', {}, el('div', { class: 'picker' }, cards), optionsHost),
    actions: [{ label: 'Deal', value: 'deal', primary: true }],
  });
  if (result === 'deal') newGame(choice.variantId, choice.options);
}

function statsDialog() {
  const modes = [
    ['klondike-d1', 'Klondike · Draw 1'],
    ['klondike-d3', 'Klondike · Draw 3'],
    ['spider-s1', 'Spider · 1 suit'],
    ['spider-s2', 'Spider · 2 suits'],
    ['spider-s4', 'Spider · 4 suits'],
    ['freecell', 'FreeCell'],
  ];
  let current = modeKey(game);
  const host = el('div');
  const select = el(
    'select',
    { class: 'select', 'aria-label': 'Game', onchange: (e) => ((current = e.target.value), render()) },
    modes.map(([k, label]) => el('option', { value: k, selected: k === current }, label)),
  );
  const render = () => {
    const s = statsFor(current);
    host.replaceChildren(
      el(
        'div',
        { class: 'stat-grid' },
        stat('Played', s.played),
        stat('Won', s.won),
        stat('Win rate', pct(s.won, s.played)),
        stat('Streak', s.streak),
        stat('Best streak', s.bestStreak),
        stat('Best time', s.bestTime != null ? formatTime(s.bestTime) : null),
        stat('Fewest moves', s.fewestMoves),
        !current.startsWith('freecell') && stat('High score', s.bestScore),
      ),
      el(
        'button',
        {
          class: 'link-btn',
          onclick: async () => {
            const ok = await openDialog({
              title: 'Reset statistics?',
              body: el('p', { class: 'muted' }, `This clears ${modes.find((m) => m[0] === current)[1]} statistics.`),
              actions: [{ label: 'Cancel', value: false }, { label: 'Reset', value: true, primary: true }],
            });
            if (ok) {
              const all = allStats();
              delete all[current];
              store.set('stats', all);
              render();
            }
          },
        },
        'Reset these statistics',
      ),
    );
  };
  render();
  openDialog({ title: 'Statistics', body: el('div', {}, select, host) });
}

function swatches(name, colors, current, onChange, cls) {
  return el(
    'div',
    { class: 'swatches' },
    Object.entries(colors).map(([key, color]) =>
      el(
        'label',
        { title: key },
        el('input', { type: 'radio', name, value: key, checked: key === current, 'aria-label': key, onchange: () => onChange(key) }),
        el('span', { class: `swatch ${cls}`, style: `--c:${color}` }),
      ),
    ),
  );
}

function settingsDialog() {
  const set = (k) => (v) => settings.set(k, v);
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'),
        segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), set('theme'))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Table'),
        swatches('felt', FELTS, settings.get('felt'), set('felt'), 'felt-swatch')),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Card back'),
        swatches('back', BACKS, settings.get('back'), set('back'), 'back-swatch')),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Play'),
        toggle('Tap to move', settings.get('tapToMove'), set('tapToMove'), 'Tap a card to send it to the best spot'),
        toggle('Auto-play to foundations', settings.get('autoMove'), set('autoMove'), 'Moves cards up when it is safe, and finishes won games'),
        toggle('Four-colour suits', settings.get('fourColor'), set('fourColor'), 'Easier to tell suits apart on small screens'),
        toggle('Left-handed layout', settings.get('leftHanded'), set('leftHanded'), 'Puts the stock on the right'),
        toggle('Sounds', settings.get('sound'), set('sound')),
        toggle('Show timer', settings.get('showTimer'), set('showTimer')),
        toggle('Show score', settings.get('showScore'), set('showScore')),
      ),
    ),
  });
}

const RULES = {
  klondike: [
    'Goal: move all 52 cards to the four foundations, building up by suit from Ace to King.',
    'On the table, build down in alternating colours (red 6 on black 7). You can move a whole run of face-up cards together.',
    'Only a King (or a run starting with a King) can go into an empty column.',
    'Tap the stock to turn over cards (1 or 3 at a time). When it runs out, tap the empty stock to turn the pile over again.',
    'Scoring: +5 for waste to table, +10 to a foundation, +5 for turning a card over, −15 for moving a card back down, and a time bonus for a quick win.',
  ],
  spider: [
    'Goal: build eight runs from King down to Ace in a single suit. Complete runs leave the table on their own.',
    'Any card can go on a card one rank higher, whatever the suit — but you can only move several cards together when they are all the same suit and in order.',
    'Any card or run can go into an empty column.',
    'Tap the stock to deal one card to every column. Every column needs a card before you can deal.',
    'Scoring: start with 500, −1 per move, +100 for each completed run.',
  ],
  freecell: [
    'Goal: move all cards to the foundations, building up by suit from Ace to King.',
    'On the table, build down in alternating colours. Each free cell (top left) holds one card.',
    'You can move several cards at once when there is room to do it one card at a time through free cells and empty columns.',
    'Any card can go into an empty column. Deals are numbered like the classic Windows game, so you can replay or share them.',
  ],
};

function helpDialog() {
  openDialog({
    title: `How to play ${variantOf(game).name}`,
    body: el(
      'div',
      { class: 'help' },
      el('ul', {}, RULES[game.variantId].map((r) => el('li', {}, r))),
      el('h3', {}, 'Controls'),
      el(
        'ul',
        {},
        el('li', {}, 'Drag cards, or tap a card to send it to the best place.'),
        el('li', {}, 'Hint shows a useful move; tap it again to see another.'),
        el('li', {}, 'Undo as many times as you like.'),
        el('li', {}, 'Keyboard: Z undo · H hint · N new game.'),
      ),
    ),
  });
}

async function dealNumberDialog() {
  const max = variantOf(game).maxSeed;
  const input = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, max, value: game.seed, 'aria-label': 'Deal number' });
  const result = await openDialog({
    title: 'Play a deal number',
    body: el('div', {}, el('p', { class: 'muted' }, `Enter a number from 1 to ${max.toLocaleString()}. The same number always deals the same game.`), input),
    actions: [{ label: 'Deal', value: 'deal', primary: true }],
  });
  if (result !== 'deal') return;
  const n = Math.floor(Number(input.value));
  if (!(n >= 1 && n <= max)) {
    toast(`Pick a number from 1 to ${max.toLocaleString()}`);
    return;
  }
  newGame(game.variantId, game.options, n);
}

function aboutDialog() {
  openDialog({
    title: 'About',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, el('b', {}, 'Free forever. '), 'No ads, no tracking, no accounts. Your games and statistics stay on this device.'),
      el('p', {}, 'Works offline once it has loaded.'),
      !isStandalone() &&
        el(
          'div',
          {},
          el('h3', {}, 'Add it to your home screen'),
          el('ul', {},
            el('li', {}, 'iPhone / iPad: tap Share, then “Add to Home Screen”.'),
            el('li', {}, 'Android: tap the ⋮ menu, then “Install app” or “Add to Home screen”.'),
            el('li', {}, 'Computer: use the install icon in the address bar.'),
          ),
        ),
    ),
  });
}

async function menuDialog() {
  const items = [
    ['game', 'Change game'],
    ['stats', 'Statistics'],
    ['settings', 'Settings'],
    ['help', 'How to play'],
    ['replay', 'Restart this deal'],
    ['number', 'Play a deal number…'],
    installPrompt && ['install', 'Install app'],
    ['about', 'About'],
  ].filter(Boolean);
  let dialog;
  const pick = (value) => dialog.closeWith(value);
  const list = el('div', { class: 'menu-list' }, items.map(([value, label]) => el('button', { class: 'menu-item', onclick: () => pick(value) }, label)));
  const promise = openDialog({ title: 'Menu', body: list, className: 'menu-dialog' });
  dialog = document.querySelector('dialog.menu-dialog');
  const choice = await promise;
  if (choice === 'game') gamePicker();
  else if (choice === 'stats') statsDialog();
  else if (choice === 'settings') settingsDialog();
  else if (choice === 'help') helpDialog();
  else if (choice === 'replay') newGame(game.variantId, game.options, game.seed);
  else if (choice === 'number') dealNumberDialog();
  else if (choice === 'about') aboutDialog();
  else if (choice === 'install' && installPrompt) {
    installPrompt.prompt();
    installPrompt = null;
  }
}

// ---------- Boot ----------

injectSprite();
const board = new Board(boardEl, {
  onMove: tryMove,
  onTap,
  onStock,
  onDragInvalid: () => sounds.invalid(),
});
applySettings();
watchSystemTheme(() => themeId());
offerHallows(store, themeId(), () => settings.set('theme', 'hallows'));
settings.onChange(() => applySettings());

$('game-btn').addEventListener('click', gamePicker);
$('new-btn').addEventListener('click', () => newGame());
$('undo-btn').addEventListener('click', doUndo);
$('hint-btn').addEventListener('click', doHint);
$('auto-btn').addEventListener('click', autoFinish);
$('menu-btn').addEventListener('click', menuDialog);

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  } else if (k === 'h' && !e.metaKey && !e.ctrlKey) doHint();
  else if (k === 'n' && !e.metaKey && !e.ctrlKey) newGame();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

const saved = deserialize(store.get('game'));
if (saved && !saved.won) {
  game = saved;
  board.setGame(game);
  updateHud();
  scheduleAuto();
} else {
  const last = store.get('last') || { variantId: 'klondike', options: { draw: 1 } };
  startGame(VARIANTS[last.variantId] ? last.variantId : 'klondike', last.options);
}

addHubLink();

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

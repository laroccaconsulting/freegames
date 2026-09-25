import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, formatTime } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, shareText } from './core/golf.js';
import { icon, withIcon, medal } from './core/icons.js';
import { randomSeed } from './core/rng.js';
import { SIZES, neighbours, counts, reveal, deduce, generate } from './js/mines.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('mines');
const settings = makeSettings(store, { theme: null, sound: true, chord: true, longPress: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
});

const sfx = {
  open(n) {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.03 + Math.min(n, 30) * 0.004, freq: 2400, q: 1.2, gain: 0.18 });
  },
  flag() {
    const ac = audio();
    if (ac) tone(ac, { freq: 660, duration: 0.08, gain: 0.05, type: 'triangle' });
  },
  boom() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.7, freq: 120, q: 0.4, gain: 0.9 });
    tone(ac, { freq: 60, duration: 0.6, gain: 0.15, type: 'triangle' });
  },
  win: () => sounds.win(),
};

// ---------- Game ----------

// game: { size, daily?, seed, board: { mines, start } | null, open, flags, lost: cell | -1, done, time, hints, undos }
let game = null;
let num = null;
let flagMode = false;
let clock = null;
let explain = null; // { from, cells }

const cellName = (i) => `row ${Math.floor(i / game.w) + 1}, column ${(i % game.w) + 1}`;
const save = () => game && store.set('game', game);

function newGame(size, { daily = null } = {}) {
  const { w, h } = SIZES[size];
  game = { size, w, h, daily, seed: daily ? dailySeed(`mines-${size}`, daily) : randomSeed(), board: null, open: new Array(w * h).fill(false), flags: [], lost: -1, done: false, time: 0, hints: 0, undos: 0, history: [] };
  num = null;
  explain = null;
  store.set('size', size);
  // The daily board starts open in the middle, so everyone plays the same one.
  if (daily) firstClick(Math.floor(h / 2) * w + Math.floor(w / 2));
  build();
  save();
  announce(`${SIZES[size].label}. ${SIZES[size].mines} mines. ${daily ? 'The start is already open.' : 'Tap any square to start: it is always safe.'}`);
}

function firstClick(i) {
  const b = generate(game.size, game.seed, i);
  game.board = { mines: b.mines, start: i };
  num = counts(game.w, game.h, b.mines);
  game.open = reveal(game.w, game.h, num, game.open, i);
}

function restore(saved) {
  game = saved;
  num = game.board ? counts(game.w, game.h, game.board.mines) : null;
  build();
}

// ---------- Moves ----------

function act(i, { flag = false } = {}) {
  if (!game || game.done || game.lost >= 0) return;
  explain = null;
  if (!game.board) {
    if (flag) return;
    firstClick(i);
    sfx.open(game.open.filter(Boolean).length);
    after();
    return;
  }
  if (game.open[i]) {
    if (!flag && settings.get('chord')) chord(i);
    return;
  }
  if (flag || flagMode) {
    toggleFlag(i);
    return;
  }
  if (game.flags.includes(i)) return;
  open([i]);
}

function toggleFlag(i) {
  const flags = game.flags.includes(i) ? game.flags.filter((f) => f !== i) : [...game.flags, i];
  game.flags = flags;
  sfx.flag();
  save();
  render();
}

// Tapping a number whose flags are all placed opens its other neighbours.
function chord(i) {
  const around = neighbours(game.w, game.h, i);
  const flagged = around.filter((j) => game.flags.includes(j)).length;
  if (flagged !== num[i]) return;
  const toOpen = around.filter((j) => !game.open[j] && !game.flags.includes(j));
  if (toOpen.length) open(toOpen);
}

function open(cells) {
  game.history = [...game.history.slice(-50), { open: game.open, flags: game.flags }];
  const mines = new Set(game.board.mines);
  let opened = game.open;
  for (const i of cells) {
    if (mines.has(i)) {
      game.lost = i;
      break;
    }
    opened = reveal(game.w, game.h, num, opened, i);
  }
  const before = game.open.filter(Boolean).length;
  game.open = opened;
  if (game.lost >= 0) {
    countGame(false);
    sfx.boom();
    save();
    render();
    announce('Boom. You hit a mine.');
    setTimeout(lostDialog, reduced.matches ? 200 : 900);
    return;
  }
  sfx.open(opened.filter(Boolean).length - before);
  after();
}

function after() {
  const safe = game.w * game.h - SIZES[game.size].mines;
  if (game.open.filter(Boolean).length === safe) {
    game.done = true;
    game.flags = game.board.mines.slice();
    save();
    render();
    win();
    return;
  }
  save();
  render();
}

function undoLoss() {
  const last = game.history[game.history.length - 1];
  if (!last) return;
  game.open = last.open;
  game.flags = last.flags;
  game.history = game.history.slice(0, -1);
  game.lost = -1;
  game.undos++;
  save();
  render();
}

function lostDialog() {
  openDialog({
    title: 'Boom!',
    body: el('p', {}, 'This board never needed a guess: every square can be worked out from the numbers. Take the move back and try Hint to see why a square is safe.'),
    actions: [
      { label: 'New game', value: 'new' },
      { label: 'Take it back', value: 'undo', primary: true },
    ],
  }).then((v) => {
    if (v === 'undo') undoLoss();
    else if (v === 'new') newGame(game.size);
  });
}

function countGame(won) {
  const stats = store.get('stats', {});
  const s = (stats[game.size] ||= { played: 0, won: 0 });
  s.played++;
  if (won) s.won++;
  store.set('stats', stats);
}

// ---------- Hints ----------

const WHY = {
  full: (a) => `The ${a} already touches all its mines, so its other squares are safe.`,
  all: (a) => `The ${a} needs a mine in every covered square around it.`,
  'subset-safe': (a, b) => `Every covered square next to the ${a} also touches the ${b}, and they need the same number of mines. So the ${b}’s other squares are safe.`,
  'subset-mines': (a, b) => `Every covered square next to the ${a} also touches the ${b}, and the ${b} needs more mines than the ${a}: exactly as many as its other squares. They’re all mines.`,
  'overlap-safe': (a, b) => `The squares the ${a} and ${b} share must hold all the mines the ${b} needs, so the ${b}’s other squares are safe.`,
  'overlap-mines': (a, b) => `The squares the ${a} and ${b} share can hold only some of the ${b}’s mines. The rest must be in its other squares, all of them.`,
  count: () => 'Count the mines: every one is accounted for (or every covered square must be one).',
};

function hint() {
  if (!game || game.done || game.lost >= 0) return;
  if (!game.board) {
    toast('Tap any square to start. The first square is always safe.');
    return;
  }
  const wrongFlag = game.flags.find((f) => !game.board.mines.includes(f));
  if (wrongFlag !== undefined) {
    game.flags = game.flags.filter((f) => f !== wrongFlag);
    explain = { from: [], cells: [wrongFlag] };
    game.hints++;
    save();
    render();
    toast('That flag was wrong, so it’s been taken off.');
    return;
  }
  const d = deduce(game.w, game.h, num, game.open, new Set(game.flags), SIZES[game.size].mines);
  if (!d) return;
  game.hints++;
  const [a, b] = d.why.from.map((i) => num[i]);
  const text = WHY[d.why.kind](a, b);
  explain = { from: d.why.from, cells: d.safe.length ? d.safe : d.mines, safe: d.safe.length > 0 };
  save();
  render();
  toast(`${text} ${d.safe.length ? 'Safe squares are marked.' : 'Flag the marked squares.'}`, { duration: 6500 });
  announce(text);
}

// ---------- Winning ----------

function win() {
  sfx.win();
  const best = store.get('best', {});
  const t = Math.round(game.time);
  const clean = !game.hints && !game.undos;
  const isBest = clean && (!best[game.size] || t < best[game.size]);
  if (isBest) store.set('best', { ...best, [game.size]: t });
  countGame(true);
  if (game.daily) {
    const log = store.get('daily', {});
    if (!log[game.daily]) store.set('daily', { ...log, [game.daily]: { time: t, hints: game.hints, undos: game.undos } });
  }
  const title = game.daily ? `Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : SIZES[game.size].label;
  const text = `Minesweeper · ${title} ${clean ? '💎' : '✅'}\nCleared in ${formatTime(t)}${game.hints ? ` · 💡${game.hints}` : ''}${game.undos ? ` · ↩︎${game.undos}` : ''}`;
  const url = location.origin + location.pathname + (game.daily ? buildHash({ d: game.daily }) : '');
  setTimeout(() => {
    openDialog({
      title: 'Cleared!',
      className: 'results',
      body: el(
        'div',
        {},
        el('div', { class: 'stamp show' }, medal(clean ? 'diamond' : 'check')),
        el('p', { class: 'result-note' }, `Time: ${formatTime(t)}${isBest ? ' · new best!' : best[game.size] ? ` · best ${formatTime(best[game.size])}` : ''}`),
        !clean && el('p', { class: 'result-note' }, `${game.hints ? `Hints: ${game.hints}` : ''}${game.hints && game.undos ? ' · ' : ''}${game.undos ? `Take-backs: ${game.undos}` : ''}`),
        game.daily && el('p', { class: 'result-note' }, icon('flame', { size: 18 }), `${dailyStreak(store.get('daily', {}), dateKey())}-day streak`),
        el('button', { class: 'btn share-btn', onclick: async () => (await shareText(text, url)) === 'copied' && toast('Result copied — paste it anywhere') }, icon('share'), 'Share result'),
      ),
      actions: [
        { label: 'See the board', value: null },
        { label: 'New game', value: 'new', primary: true },
      ],
    }).then((v) => v === 'new' && newGame(game.size));
  }, 700);
}

// ---------- Screen ----------

function build() {
  const grid = el('div', { class: `field-grid ${game.size}`, style: `--w: ${game.w}; --h: ${game.h}`, role: 'grid', 'aria-label': 'Minefield' });
  for (let i = 0; i < game.w * game.h; i++) {
    const cell = el('button', { class: 'sq', dataset: { i } });
    grid.append(cell);
  }
  // Long press flags on touch screens; right-click flags with a mouse.
  let pressTimer = null;
  let pressed = -1;
  let longPressed = false;
  grid.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.sq');
    if (!c) return;
    pressed = Number(c.dataset.i);
    longPressed = false;
    if (e.pointerType === 'touch' && settings.get('longPress')) {
      pressTimer = setTimeout(() => {
        longPressed = true;
        navigator.vibrate?.(15);
        // Long press does the opposite of a tap: flag normally, open in flag mode.
        if (!flagMode) act(pressed, { flag: true });
        else if (game.board && !game.open[pressed] && !game.flags.includes(pressed) && game.lost < 0 && !game.done) open([pressed]);
      }, 380);
    }
  });
  const cancel = () => clearTimeout(pressTimer);
  grid.addEventListener('pointerup', cancel);
  grid.addEventListener('pointerleave', cancel);
  grid.addEventListener('pointercancel', cancel);
  grid.addEventListener('click', (e) => {
    const c = e.target.closest('.sq');
    if (!c || longPressed) return;
    act(Number(c.dataset.i));
  });
  grid.addEventListener('contextmenu', (e) => {
    const c = e.target.closest('.sq');
    if (!c) return;
    e.preventDefault();
    if (!longPressed) act(Number(c.dataset.i), { flag: true });
  });
  $('stage').replaceChildren(el('div', { class: 'field-wrap' }, grid));
  render();
  clearInterval(clock);
  let last = Date.now();
  clock = setInterval(() => {
    const now = Date.now();
    if (game.board && !game.done && game.lost < 0 && document.visibilityState === 'visible') game.time += (now - last) / 1000;
    last = now;
  }, 1000);
}

function render() {
  const grid = document.querySelector('.field-grid');
  const mines = new Set(game.board?.mines || []);
  const showMines = game.lost >= 0 || game.done;
  const from = new Set(explain?.from || []);
  const marked = new Set(explain?.cells || []);
  for (const cell of grid.children) {
    const i = Number(cell.dataset.i);
    const isOpen = game.open[i];
    const flagged = game.flags.includes(i);
    let cls = 'sq';
    let text = '';
    if (isOpen) {
      cls += ' open';
      if (num[i] > 0) {
        text = num[i];
        cls += ` n${num[i]}`;
      }
    } else if (flagged) cls += ' flag';
    if (showMines && mines.has(i) && !flagged) cls += i === game.lost ? ' mine boom' : ' mine';
    if (showMines && flagged && !mines.has(i)) cls += ' wrong';
    if (from.has(i)) cls += ' why';
    if (marked.has(i)) cls += explain.safe ? ' safe-hint' : ' mine-hint';
    if (cell.className !== cls) cell.className = cls;
    if (cell.textContent !== String(text)) cell.textContent = text;
    cell.setAttribute('aria-label', `${cellName(i)}${isOpen ? (num[i] ? `, ${num[i]}` : ', empty') : flagged ? ', flagged' : ', covered'}`);
  }
  const left = SIZES[game.size].mines - game.flags.length;
  $('title').textContent = game.daily ? `Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : 'Minesweeper';
  $('subtitle').textContent = `${SIZES[game.size].label} · no guessing${game.daily ? streakText() : ''}`;
  $('mines-left').textContent = left;
  $('flag-btn').classList.toggle('on', flagMode);
  $('flag-btn').setAttribute('aria-pressed', String(flagMode));
  $('hint-btn').disabled = game.done || game.lost >= 0;
}

const streakText = () => {
  const s = dailyStreak(store.get('daily', {}), dateKey());
  return s ? ` · ${s}-day streak` : '';
};

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = dateKey();
  const best = store.get('best', {});
  const done = store.get('daily', {})[key];
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  const body = el(
    'div',
    {},
    el(
      'div',
      { class: 'menu-list' },
      menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, done ? `Cleared in ${formatTime(done.time)}` : 'Intermediate, same board for everyone', go(() => newGame('intermediate', { daily: key }))),
      ...Object.entries(SIZES).map(([id, s]) => menuCard('mine', s.label, `${s.w}×${s.h}, ${s.mines} mines${best[id] ? ` · best ${formatTime(best[id])}` : ''}`, go(() => newGame(id)))),
    ),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Minesweeper', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Long press to flag', settings.get('longPress'), (v) => settings.set('longPress', v), 'On touch screens'),
      toggle('Tap a number to clear round it', settings.get('chord'), (v) => settings.set('chord', v), 'When all its mines are flagged'),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, 'Open every square that isn’t a mine. A number tells you how many mines touch that square, diagonals included.'),
      el('p', {}, 'Flag a mine with a long press, a right-click, or the Flag button. Tap a number whose mines are all flagged to open the rest of its neighbours.'),
      el('p', {}, el('b', {}, 'No guessing, ever.'), ' Every board here can be solved by logic alone, and your first square is always safe. Stuck? Hint shows a safe square and explains why.'),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('hint-btn').addEventListener('click', hint);
$('new-btn').addEventListener('click', () => newGame(game?.size || 'beginner'));
$('flag-btn').addEventListener('click', () => {
  flagMode = !flagMode;
  render();
  toast(flagMode ? 'Flag mode: taps place flags' : 'Tap mode: taps open squares', { duration: 1400 });
});
$('hint-btn').prepend(icon('bulb', { size: 22 }));
$('new-btn').prepend(icon('infinity', { size: 22 }));
$('menu-btn').prepend(icon('levels', { size: 22 }));
$('flag-btn').prepend(icon('flag', { size: 22 }));

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

const h = parseHash(location.hash);
if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) {
  history.replaceState(null, '', location.pathname + location.search);
  newGame('intermediate', { daily: h.d > dateKey() ? dateKey() : h.d });
} else {
  const saved = store.get('game');
  if (saved && SIZES[saved.size] && Array.isArray(saved.open) && !saved.done) restore(saved);
  else newGame(store.get('size', 'beginner'));
}
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

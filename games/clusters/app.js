import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { randomSeed } from './core/rng.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { newBoard, groupAt, pop, hasMoves, tilesLeft, points, target, CLEAR_BONUS } from './js/clusters.js';

const LAUNCH_DAY = '2026-09-25';
const SIZES = {
  small: { cols: 8, rows: 8, colors: 3, name: 'Small', sub: '8×8, three colours' },
  classic: { cols: 10, rows: 12, colors: 4, name: 'Classic', sub: '10×12, four colours' },
  tricky: { cols: 10, rows: 12, colors: 5, name: 'Tricky', sub: '10×12, five colours' },
};
const store = makeStore('clusters');
const ach = makeAchievements('clusters', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, symbols: false });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const NAMES = ['red', 'yellow', 'green', 'blue', 'purple'];
const SYMBOLS = ['●', '▲', '■', '◆', '★'];

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
  document.body.classList.toggle('symbols', settings.get('symbols'));
});
document.body.classList.toggle('symbols', settings.get('symbols'));

const sfx = {
  pop(n) {
    const ac = audio();
    if (!ac) return;
    const base = 330 * 2 ** (Math.min(n, 24) / 24);
    for (let k = 0; k < Math.min(6, 1 + Math.floor(n / 4)); k++) tone(ac, { freq: base * (1 + k * 0.25), duration: 0.12, gain: 0.045, when: k * 0.04 });
  },
  none: () => sounds.invalid(),
  win: () => sounds.win(),
};

// game: { mode: 'daily' | 'free', date?, seed, size, board, score, history, target, done }
let game = null;
const specId = (g) => (g.mode === 'daily' ? `daily:${g.date}` : `free:${g.size}:${g.seed}`);
const save = () => game && store.set('game', game);
const titleText = () => (!game ? 'Clusters' : game.mode === 'daily' ? `Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : SIZES[game.size].name);

function load(spec, { fresh = false } = {}) {
  const saved = store.get('game');
  if (!fresh && saved && saved.board && specId(saved) === specId(spec) && !saved.done) {
    game = saved;
    build();
    return;
  }
  const size = spec.mode === 'daily' ? 'classic' : spec.size;
  const { cols, rows, colors } = SIZES[size];
  const seed = spec.mode === 'daily' ? dailySeed('clusters', spec.date) : spec.seed;
  const board = newBoard(cols, rows, colors, seed);
  game = { ...spec, size, seed, start: board, board, score: 0, history: [], target: null, done: false };
  build();
  // The target takes a moment on slow phones, so work it out after drawing.
  const g = game;
  setTimeout(() => {
    const key = `target:${specId(g)}`;
    const t = store.get(key) ?? target(board, { seed }).score;
    store.set(key, t);
    g.target = t;
    if (g === game) {
      save();
      hud();
    }
  }, 60);
  save();
  announce(`${titleText()}. ${cols} by ${rows}, ${colors} colours.`);
}

const specOf = (g) => (g.mode === 'daily' ? { mode: 'daily', date: g.date } : { mode: 'free', size: g.size, seed: g.seed });

// ---------- Moves ----------

function tap(i) {
  if (!game || game.done) return;
  const res = pop(game.board, i);
  if (!res) {
    if (game.board.cells[i] >= 0) {
      sfx.none();
      nudge(i);
    }
    return;
  }
  const n = res.popped.length;
  if (n >= 15) ach.unlock('big-group');
  game.history = [...game.history, { board: game.board, score: game.score }];
  game.board = res.board;
  game.score += res.score;
  save();
  sfx.pop(n);
  navigator.vibrate?.(n >= 8 ? 20 : 8);
  for (const id of res.popped) tiles.get(id)?.classList.add('gone');
  floater(i, points(n));
  if (!tilesLeft(res.board)) toast(`Board cleared! +${CLEAR_BONUS}`, { duration: 1800 });
  paint();
  announce(`Popped ${n} for ${points(n)} points.`);
  if (!hasMoves(game.board)) finish();
}

function nudge(i) {
  const t = tiles.get(game.board.ids[i]);
  if (!t || reduced.matches) return;
  t.animate([{ translate: '0 0' }, { translate: '3px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 180 });
}

function undo() {
  if (!game || !game.history.length || game.done) return;
  const last = game.history[game.history.length - 1];
  game.board = last.board;
  game.score = last.score;
  game.history = game.history.slice(0, -1);
  save();
  build();
}

function restart() {
  if (!game) return;
  if (game.done) return load(specOf(game), { fresh: true });
  if (!game.history.length) return;
  game.board = game.start;
  game.score = 0;
  game.history = [];
  save();
  build();
}

// ---------- The end ----------

function resultRating(score, left, tgt) {
  if (!left) return { label: 'Cleared!', emoji: '💎', icon: 'diamond', tier: 4 };
  if (tgt && score > tgt) return { label: 'Beat the target!', emoji: '🐦', icon: 'bird', tier: 3 };
  if (tgt && score >= tgt * 0.8) return { label: 'Great', emoji: '🌟', icon: 'star', tier: 2 };
  if (tgt && score >= tgt * 0.5) return { label: 'Good', emoji: '✅', icon: 'check', tier: 1 };
  return { label: 'Finished', emoji: '👍', icon: 'medal', tier: 0 };
}

function finish() {
  game.done = true;
  const left = tilesLeft(game.board);
  const r = resultRating(game.score, left, game.target);
  const bests = store.get('best', {});
  const key = game.mode === 'daily' ? 'daily' : game.size;
  const newBest = game.score > (bests[key] || 0);
  if (newBest) store.set('best', { ...bests, [key]: game.score });
  if (game.mode === 'daily') {
    const log = store.get('daily', {});
    if (!log[game.date]) store.set('daily', { ...log, [game.date]: { score: game.score, left } });
  }

  ach.unlock('first');
  ach.add('boards-25');
  if (!left) ach.unlock('clear');
  if (!left && game.size === 'tricky') ach.unlock('tricky');
  if (game.target && game.score > game.target) ach.unlock('target');
  if (game.mode === 'daily') {
    ach.unlock('daily');
    const streak = dailyStreak(store.get('daily', {}), dateKey());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  save();
  paint();
  sfx.win();
  const notes = [note(left ? `${left} ${left === 1 ? 'tile' : 'tiles'} left` : `Board cleared: +${CLEAR_BONUS}`, { icon: left ? 'blocks' : 'trophy', win: !left })];
  if (newBest && game.history.length) notes.push(note('New best score', { icon: 'star', win: true }));
  if (game.mode === 'daily') {
    const s = dailyStreak(store.get('daily', {}), dateKey());
    if (s) notes.push(note(`${s}-day streak`, { icon: 'flame' }));
  }
  const current = game;
  const bar = (score, tgt) => {
    const n = Math.max(1, Math.min(10, Math.round((10 * score) / Math.max(1, tgt || score))));
    return '🟩'.repeat(n) + '⬜'.repeat(10 - n);
  };
  setTimeout(
    () =>
      showResults({
        title: titleText(),
        rating: r,
        reels: [{ label: 'Score', value: game.score }, { label: 'Target', value: game.target ?? 0 }],
        notes,
        share: () => ({
          text: `Clusters · ${titleText()} ${r.emoji}\n${game.score} points${left ? ` · ${left} left` : ' · cleared!'} (target ${game.target})\n${bar(game.score, game.target)}`,
          url: location.origin + location.pathname + (game.mode === 'daily' ? buildHash({ d: game.date }) : buildHash({ s: game.size, n: game.seed })),
        }),
        actions: [
          { label: 'Replay', value: 'replay' },
          { label: 'New board →', value: 'next', primary: true },
        ],
        reduced: reduced.matches,
      }).then((v) => {
        if (current !== game) return;
        if (v === 'next') load({ mode: 'free', size: game.size === 'classic' && game.mode === 'daily' ? 'classic' : game.size, seed: randomSeed() });
        else if (v === 'replay') load(specOf(game), { fresh: true });
      }),
    reduced.matches ? 200 : 700,
  );
}

// ---------- Screen ----------

const tiles = new Map(); // tile id -> element
let boardEl = null;

function build() {
  const { cols, rows } = game.board;
  boardEl = el('div', { class: 'board', style: `--cols: ${cols}; --rows: ${rows}`, role: 'grid', 'aria-label': 'Tiles' });
  tiles.clear();
  game.board.ids.forEach((id, k) => {
    if (id < 0) return;
    const color = game.board.cells[k];
    const t = el('button', { class: `tile c${color}`, 'aria-label': NAMES[color], tabindex: -1 }, el('i', {}, SYMBOLS[color]));
    t.dataset.id = id;
    tiles.set(id, t);
    boardEl.append(t);
  });
  boardEl.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    const k = game.board.ids.indexOf(Number(t.dataset.id));
    if (k >= 0) tap(k);
  });
  boardEl.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target.closest('.tile');
    light(t ? game.board.ids.indexOf(Number(t.dataset.id)) : -1);
  });
  boardEl.addEventListener('pointerleave', () => light(-1));
  $('stage').replaceChildren(boardEl);
  paint();
}

// Hovering with a mouse lights up the group and shows what it's worth.
let litIds = [];
function light(k) {
  for (const id of litIds) tiles.get(id)?.classList.remove('lit');
  litIds = [];
  if (k < 0 || !game || game.done) return subtitle();
  const g = groupAt(game.board, k);
  if (g.length < 2) return subtitle();
  litIds = g.map((j) => game.board.ids[j]);
  for (const id of litIds) tiles.get(id)?.classList.add('lit');
  $('subtitle').textContent = `${g.length} tiles · +${points(g.length)}`;
}

function paint() {
  const { cols, cells, ids } = game.board;
  const alive = new Set();
  ids.forEach((id, k) => {
    if (id < 0) return;
    alive.add(id);
    const t = tiles.get(id);
    t.style.setProperty('--c', k % cols);
    t.style.setProperty('--r', Math.floor(k / cols));
    t.className = `tile c${cells[k]}`;
  });
  // Popped tiles finish their animation, then leave.
  for (const [id, t] of tiles) {
    if (alive.has(id)) continue;
    t.classList.add('gone');
    tiles.delete(id);
    setTimeout(() => t.remove(), reduced.matches ? 0 : 300);
  }
  litIds = [];
  boardEl.classList.toggle('over', game.done);
  hud();
}

function subtitle() {
  const left = tilesLeft(game.board);
  $('subtitle').textContent = game.done ? `Finished · ${left} left` : `${SIZES[game.size].colors} colours · ${left} left`;
}

function hud() {
  $('score').textContent = game.score;
  $('target').textContent = game.target ?? '…';
  $('score-chip').classList.toggle('ahead', game.target != null && game.score > game.target);
  $('title').textContent = titleText();
  $('undo-btn').disabled = !game.history.length || game.done;
  subtitle();
}

function floater(k, score) {
  if (reduced.matches || !boardEl) return;
  const size = boardEl.clientWidth / game.board.cols;
  const f = el('div', { class: 'floater', style: `left: ${((k % game.board.cols) + 0.5) * size}px; top: ${(Math.floor(k / game.board.cols) + 0.5) * size}px` }, `+${score}`);
  boardEl.append(f);
  setTimeout(() => f.remove(), 950);
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = dateKey();
  const today = store.get('daily', {})[key];
  const bests = store.get('best', {});
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  openDialog({
    title: 'Clusters',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'menu-list' },
        menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, today ? `Scored ${today.score}${today.left ? '' : ' · cleared'}` : 'Same board for everyone today', go(() => load({ mode: 'daily', date: key }))),
        ...Object.entries(SIZES).map(([id, s]) => menuCard(id === 'small' ? 'grid' : id === 'classic' ? 'blocks' : 'gem', s.name, `${s.sub}${bests[id] ? ` · best ${bests[id]}` : ''}`, go(() => load({ mode: 'free', size: id, seed: randomSeed() })))),
      ),
      el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
    ),
  });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Colour symbols', settings.get('symbols'), (v) => settings.set('symbols', v), 'A shape on every colour, for colour-blind play'),
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
      el('p', {}, 'Tap a group of two or more touching tiles of the same colour to pop it. Tiles above fall down, and empty columns slide together.'),
      el('p', {}, 'A group of ', el('b', {}, 'n'), ' tiles scores (n − 2)², so 5 tiles make 9 points but 12 tiles make 100. Save colours up into big groups. Clear the whole board for a ', el('b', {}, `${CLEAR_BONUS}-point bonus`), '.'),
      el('p', {}, 'The ', el('b', {}, 'target'), ' is the best score our computer player found on this board. Undo as much as you like.'),
      el('p', { class: 'muted' }, 'Keys: Z undoes.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('undo-btn').addEventListener('click', undo);
$('restart-btn').addEventListener('click', restart);
document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === 'z') undo();
  else return;
  e.preventDefault();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.s) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { mode: 'daily', date: h.d > dateKey() ? dateKey() : h.d };
  if (SIZES[h.s] && /^\d+$/.test(h.n || '')) return { mode: 'free', size: h.s, seed: Number(h.n) };
  return null;
}
const link = fromLink();
const saved = store.get('game');
if (link) load(link);
else if (saved && !saved.done && saved.board) load(specOf(saved));
else load({ mode: 'daily', date: dateKey() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

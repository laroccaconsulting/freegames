import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon, medal } from './core/icons.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { newGame, play, choose, over, winner, ends, lineCount } from './js/boxes.js';

const store = makeStore('boxes');
const ach = makeAchievements('boxes', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, opponent: 'normal', size: 4 });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
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

const OPPONENTS = [
  ['easy', 'Easy'],
  ['normal', 'Normal'],
  ['hard', 'Hard'],
  ['friend', 'Friend'],
];
const friend = () => game.opponent === 'friend';
const nameOf = (p) => (friend() ? `Player ${p}` : p === 1 ? 'You' : 'The computer');

const sfx = {
  line() {
    const ac = audio();
    if (ac) tone(ac, { freq: 520, duration: 0.05, gain: 0.04, type: 'triangle' });
  },
  box(n) {
    const ac = audio();
    if (ac) [659.25, 783.99, 1046.5].slice(0, 1 + n).forEach((f, i) => tone(ac, { freq: f, duration: 0.16, gain: 0.05, when: i * 0.06 }));
  },
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (ac) [392, 311.13, 261.63].forEach((f, i) => tone(ac, { freq: f, duration: 0.25, gain: 0.05, when: i * 0.12, type: 'triangle' }));
  },
};

// ---------- Game ----------

// game: { opponent, state, history: [state], last: line, fresh: [box] }
let game = null;
let thinking = null;

function start({ keepFirst = false } = {}) {
  clearTimeout(thinking);
  const size = settings.get('size');
  // Take turns going first, game by game.
  const first = keepFirst && game ? game.state.first : store.get('nextFirst', 1);
  store.set('nextFirst', 3 - first);
  const state = { ...newGame(size, size, first), first };
  game = { opponent: settings.get('opponent'), state, history: [], last: -1, fresh: [] };
  save();
  build();
  next();
}

const save = () => store.set('game', game);

function move(line) {
  const s = game.state;
  if (s.lines[line] || over(s)) return;
  const { state, closed } = play(s, line);
  game.history = [...game.history, s];
  game.state = state;
  game.last = line;
  game.fresh = closed;
  save();
  if (closed.length) {
    sfx.box(closed.length);
    navigator.vibrate?.(15);
  } else sfx.line();
  draw();
  if (over(state)) return finish();
  next();
}

function next() {
  draw();
  const s = game.state;
  if (over(s) || friend() || s.turn !== 2) return;
  thinking = setTimeout(() => move(choose(game.state, game.opponent)), reduced.matches ? 150 : 420);
}

function undo() {
  if (!game.history.length) return;
  clearTimeout(thinking);
  const h = game.history.slice();
  let s = h.pop();
  // Against the computer, go back to the start of your own last turn
  // (which may have taken several lines if you closed boxes).
  if (!friend()) while (h.length && (s.turn !== 1 || h[h.length - 1].turn === 1)) s = h.pop();
  if (!friend() && s.turn !== 1) return;
  game.history = h;
  game.state = s;
  game.last = -1;
  game.fresh = [];
  save();
  draw();
  next();
}

function finish() {
  const s = game.state;
  const w = winner(s);
  if (!friend() && w === 1) {
    ach.unlock('first-win');
    if (game.opponent === 'normal') ach.unlock('beat-normal');
    if (game.opponent === 'hard') ach.unlock('beat-hard');
    ach.add('wins-10');
    ach.add('wins-50');
  }
  if (friend()) ach.unlock('friend');
  if (!friend() && w === 1 && s.w === 6) ach.unlock('big-board');
  if (!friend() && w === 1 && s.score[2] === 0) ach.unlock('shutout');
  const good = friend() || w === 1;
  if (w === 1 || friend()) sfx.win();
  else sfx.lose();
  if (!friend()) {
    const rec = store.get('record', {});
    const r = (rec[game.opponent] ||= { won: 0, lost: 0, tied: 0 });
    r[w === 1 ? 'won' : w === 2 ? 'lost' : 'tied']++;
    store.set('record', rec);
  }
  const title = w === 3 ? 'A tie!' : friend() ? `Player ${w} wins!` : w === 1 ? 'You win!' : 'The computer wins';
  setTimeout(
    () =>
      openDialog({
        title,
        className: 'results',
        body: el('div', {}, el('div', { class: 'stamp show' }, medal(w === 3 ? 'check' : good ? 'trophy' : 'medal')), el('p', { class: 'result-note' }, `${s.score[1]} – ${s.score[2]}`)),
        actions: [
          { label: 'See the board', value: null },
          { label: 'Play again', value: 'again', primary: true },
        ],
      }).then((v) => v === 'again' && start()),
    reduced.matches ? 200 : 800,
  );
}

// ---------- Board ----------

const GAP = 100;
const PAD = 24;
let svg = null;

function build() {
  const { w, h } = game.state;
  const NS = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  svg = make('svg', { class: 'board', viewBox: `0 0 ${w * GAP + PAD * 2} ${h * GAP + PAD * 2}`, role: 'group', 'aria-label': `${w} by ${h} boxes` });
  const boxes = make('g', {});
  for (let b = 0; b < w * h; b++) {
    const r = Math.floor(b / w);
    const c = b % w;
    const g = make('g', { 'data-b': b });
    g.append(make('rect', { class: 'box', x: PAD + c * GAP + 6, y: PAD + r * GAP + 6, width: GAP - 12, height: GAP - 12, rx: 10 }));
    const t = make('text', { class: 'box-mark', x: PAD + c * GAP + GAP / 2, y: PAD + r * GAP + GAP / 2 });
    g.append(t);
    boxes.append(g);
  }
  svg.append(boxes);
  const lines = make('g', {});
  for (let l = 0; l < lineCount(game.state); l++) {
    const { r1, c1, r2, c2, across } = ends(game.state, l);
    const x1 = PAD + c1 * GAP;
    const y1 = PAD + r1 * GAP;
    const x2 = PAD + c2 * GAP;
    const y2 = PAD + r2 * GAP;
    // A generous invisible target around each line, shaped like a diamond
    // so neighbouring lines split the space between them.
    const pts = across ? `${x1 + 8},${y1} ${(x1 + x2) / 2},${y1 - GAP / 2 + 4} ${x2 - 8},${y1} ${(x1 + x2) / 2},${y1 + GAP / 2 - 4}` : `${x1},${y1 + 8} ${x1 + GAP / 2 - 4},${(y1 + y2) / 2} ${x1},${y2 - 8} ${x1 - GAP / 2 + 4},${(y1 + y2) / 2}`;
    const hit = make('polygon', { class: 'hit', points: pts, 'data-l': l, role: 'button', tabindex: -1, 'aria-label': `Line ${l + 1}` });
    const ghost = make('line', { class: 'ghost', x1, y1, x2, y2 });
    const drawnLine = make('line', { class: 'line', x1, y1, x2, y2, 'data-line': l });
    lines.append(hit, ghost, drawnLine);
  }
  svg.append(lines);
  const dots = make('g', {});
  for (let r = 0; r <= h; r++) for (let c = 0; c <= w; c++) dots.append(make('circle', { class: 'dot', cx: PAD + c * GAP, cy: PAD + r * GAP, r: 9 }));
  svg.append(dots);
  svg.addEventListener('click', (e) => {
    const hit = e.target.closest?.('.hit');
    if (!hit || (!friend() && game.state.turn !== 1)) return;
    move(Number(hit.dataset.l));
  });
  $('stage').replaceChildren(svg);
  draw();
}

function draw() {
  const s = game.state;
  for (const line of svg.querySelectorAll('.line')) {
    const l = Number(line.dataset.line);
    const who = s.lines[l];
    line.setAttribute('class', `line${who ? ` p${who}` : ''}${l === game.last ? ' last' : ''}`);
    line.style.display = who ? '' : 'none';
    const hit = line.previousSibling.previousSibling;
    hit.style.display = who ? 'none' : '';
  }
  for (const g of svg.querySelectorAll('[data-b]')) {
    const b = Number(g.dataset.b);
    const who = s.boxes[b];
    g.querySelector('rect').setAttribute('class', `box${who ? ` p${who}` : ''}${game.fresh.includes(b) ? ' new' : ''}`);
    const t = g.querySelector('text');
    t.setAttribute('class', `box-mark${who ? ` p${who}` : ''}`);
    t.textContent = who ? (friend() ? who : who === 1 ? '★' : '●') : '';
  }
  $('score1').textContent = s.score[1];
  $('score2').textContent = s.score[2];
  $('name1').textContent = friend() ? 'P1' : 'You';
  $('name2').textContent = friend() ? 'P2' : 'CPU';
  $('chip1').classList.toggle('turn', !over(s) && s.turn === 1);
  $('chip2').classList.toggle('turn', !over(s) && s.turn === 2);
  const opp = OPPONENTS.find(([id]) => id === game.opponent)[1];
  $('subtitle').textContent = `${friend() ? 'Two players' : `vs ${opp}`} · ${s.w}×${s.h}`;
  let status;
  if (over(s)) status = winner(s) === 3 ? 'A tie!' : `${nameOf(winner(s))} ${friend() || winner(s) === 2 ? 'wins' : 'win'}!`;
  else if (game.fresh.length) status = `${nameOf(s.turn)} closed ${game.fresh.length === 2 ? 'two boxes' : 'a box'}: ${friend() || s.turn === 2 ? 'goes' : 'go'} again`;
  else status = friend() ? `Player ${s.turn}’s turn` : s.turn === 1 ? 'Your turn: tap between two dots' : 'The computer is thinking…';
  $('status').textContent = status;
  $('undo-btn').disabled = !game.history.length || (!friend() && !game.history.some((h) => h.turn === 1));
}

// ---------- Menus ----------

function record() {
  const rec = store.get('record', {});
  return el(
    'div',
    { class: 'stat-grid' },
    ...['easy', 'normal', 'hard'].map((level) => {
      const r = rec[level] || { won: 0, lost: 0 };
      return el('div', { class: 'stat' }, el('b', {}, `${r.won}–${r.lost}`), el('span', {}, `vs ${level[0].toUpperCase() + level.slice(1)}`));
    }),
  );
}

function openMenu() {
  const before = `${settings.get('opponent')}/${settings.get('size')}`;
  openDialog({
    title: 'Dots and Boxes',
    body: el(
      'div',
      {},
      el('p', {}, 'Take turns joining two neighbouring dots. Close the fourth side of a box to win it and go again. Most boxes wins. Near the end, every line gives something away: give away as little as you can.'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Opponent'), segmented('opponent', OPPONENTS, settings.get('opponent'), (v) => settings.set('opponent', v))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Board'), segmented('size', [[3, '3×3'], [4, '4×4'], [5, '5×5'], [6, '6×6']], settings.get('size'), (v) => settings.set('size', Number(v)))),
      record(),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
    actions: [{ label: 'New game', value: 'new' }, { label: 'Done', value: null, primary: true }],
  }).then((v) => {
    if (v === 'new' || `${settings.get('opponent')}/${settings.get('size')}` !== before) start();
  });
}

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('menu-btn').prepend(icon('settings', { size: 22 }));
$('new-btn').addEventListener('click', () => start());
$('new-btn').prepend(icon('flag', { size: 22 }));
$('undo-btn').addEventListener('click', undo);
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey) return;
  if (e.key === 'z') undo();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

const saved = store.get('game');
if (saved?.state && !over(saved.state)) {
  game = saved;
  build();
  next();
} else start();
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openMenu();
}

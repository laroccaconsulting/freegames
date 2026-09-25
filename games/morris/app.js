import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon, medal } from './core/icons.js';
import { COORDS, LINES, newGame, moves, play, choose, inMill, takeable } from './js/morris.js';

const store = makeStore('morris');
const settings = makeSettings(store, { theme: null, sound: true, opponent: 'normal' });
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
const nameOf = (p) => (friend() ? (p === 1 ? 'Light' : 'Dark') : p === 1 ? 'You' : 'The computer');

const sfx = {
  place() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.05, freq: 900, q: 1, gain: 0.2 });
  },
  mill() {
    const ac = audio();
    if (ac) [523.25, 659.25, 783.99].forEach((f, i) => tone(ac, { freq: f, duration: 0.14, gain: 0.05, when: i * 0.06 }));
  },
  take() {
    const ac = audio();
    if (ac) tone(ac, { freq: 220, duration: 0.18, gain: 0.05, type: 'triangle' });
  },
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (ac) [392, 311.13, 261.63].forEach((f, i) => tone(ac, { freq: f, duration: 0.22, gain: 0.05, when: i * 0.12, type: 'triangle' }));
  },
};

// ---------- Game ----------

// game: { opponent, state, history: [state], last: move }
let game = null;
let pick = null; // { from } while choosing where to move, or { from, to } while choosing what to take
let thinking = null;

function start() {
  clearTimeout(thinking);
  const first = store.get('nextFirst', 1);
  store.set('nextFirst', 3 - first);
  game = { opponent: settings.get('opponent'), state: newGame(first), history: [], last: null };
  pick = null;
  save();
  build();
  next();
}
const save = () => store.set('game', game);

function apply(m) {
  const s = game.state;
  game.history = [...game.history, s];
  game.state = play(s, m);
  game.last = m;
  pick = null;
  save();
  if (m.take != null) {
    sfx.mill();
    setTimeout(sfx.take, 180);
    navigator.vibrate?.(20);
  } else sfx.place();
  draw();
  if (game.state.winner) return finish();
  next();
}

function next() {
  draw();
  const s = game.state;
  if (s.winner || friend() || s.turn !== 2) return;
  thinking = setTimeout(() => {
    thinking = null;
    apply(choose(game.state, game.opponent));
  }, reduced.matches ? 150 : 450);
}

// Taps build up a move: (from) → to → (take).
function tap(p) {
  const s = game.state;
  if (s.winner || thinking || (!friend() && s.turn !== 1)) return;
  const legal = moves(s);
  if (pick?.to != null) {
    const m = legal.find((x) => x.from === pick.from && x.to === pick.to && x.take === p);
    if (m) apply(m);
    return;
  }
  if (s.board[p] === s.turn && legal.some((x) => x.from === p)) {
    pick = pick?.from === p ? null : { from: p };
    return draw();
  }
  const from = pick?.from;
  const options = legal.filter((x) => x.to === p && x.from === from);
  if (!options.length) {
    if (pick) {
      pick = null;
      draw();
    }
    return;
  }
  if (options[0].take == null) return apply(options[0]);
  // A mill: show the stone arriving, then ask which piece to take.
  pick = { from, to: p };
  sfx.mill();
  draw();
}

function undo() {
  if (!game.history.length) return;
  clearTimeout(thinking);
  thinking = null;
  const h = game.history.slice();
  let s = h.pop();
  if (!friend()) while (h.length && s.turn !== 1) s = h.pop();
  if (!friend() && s.turn !== 1) return;
  game.history = h;
  game.state = s;
  game.last = null;
  pick = null;
  save();
  draw();
  next();
}

function finish() {
  const s = game.state;
  const w = s.winner;
  if (w === 1 || (friend() && w !== 3)) sfx.win();
  else sfx.lose();
  if (!friend()) {
    const rec = store.get('record', {});
    const r = (rec[game.opponent] ||= { won: 0, lost: 0, drawn: 0 });
    r[w === 1 ? 'won' : w === 2 ? 'lost' : 'drawn']++;
    store.set('record', rec);
  }
  const title = w === 3 ? 'A draw' : friend() ? `${nameOf(w)} wins!` : w === 1 ? 'You win!' : 'The computer wins';
  const why = w === 3 ? 'Fifty moves without a capture.' : s.onBoard[3 - w] + s.inHand[3 - w] < 3 ? 'Down to two pieces.' : 'No moves left.';
  setTimeout(
    () =>
      openDialog({
        title,
        className: 'results',
        body: el('div', {}, el('div', { class: 'stamp show' }, medal(w === 3 ? 'check' : w === 1 || friend() ? 'trophy' : 'medal')), el('p', { class: 'result-note' }, why)),
        actions: [
          { label: 'See the board', value: null },
          { label: 'Play again', value: 'again', primary: true },
        ],
      }).then((v) => v === 'again' && start()),
    reduced.matches ? 200 : 800,
  );
}

// ---------- Board ----------

const NS = 'http://www.w3.org/2000/svg';
const make = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const X = (p) => 8 + COORDS[p][0] * 14;
const Y = (p) => 8 + COORDS[p][1] * 14;
let svg = null;
let stones = [];
let targets = [];

function build() {
  svg = make('svg', { class: 'board', viewBox: '0 0 100 100', role: 'group', 'aria-label': 'Morris board' });
  svg.append(make('rect', { class: 'wood', x: 0, y: 0, width: 100, height: 100, rx: 4 }));
  const lines = make('g', { class: 'lines' });
  for (const [a, , c] of LINES) lines.append(make('line', { x1: X(a), y1: Y(a), x2: X(c), y2: Y(c) }));
  svg.append(lines);
  targets = [];
  stones = [];
  for (let p = 0; p < 24; p++) {
    svg.append(make('circle', { class: 'pt', cx: X(p), cy: Y(p), r: 1.6 }));
    const t = make('circle', { class: 'target', cx: X(p), cy: Y(p), r: 2.2, visibility: 'hidden' });
    targets.push(t);
    svg.append(t);
  }
  for (let p = 0; p < 24; p++) {
    const s = make('circle', { class: 'stone', cx: X(p), cy: Y(p), r: 4.6, visibility: 'hidden' });
    stones.push(s);
    svg.append(s);
  }
  for (let p = 0; p < 24; p++) svg.append(make('circle', { class: 'hit', cx: X(p), cy: Y(p), r: 6.5, 'data-p': p, role: 'button', 'aria-label': `Point ${p + 1}` }));
  svg.addEventListener('click', (e) => {
    const h = e.target.closest?.('.hit');
    if (h) tap(Number(h.dataset.p));
  });
  const hand = (who) => el('div', { class: `hand p${who}`, id: `hand${who}` });
  $('stage').replaceChildren(hand(2), svg, hand(1));
  draw();
}

function draw() {
  const s = game.state;
  // While choosing what to take, show the piece already on its new point.
  const board = s.board.slice();
  if (pick?.to != null) {
    if (pick.from != null) board[pick.from] = 0;
    board[pick.to] = s.turn;
  }
  const canTake = pick?.to != null ? new Set(takeable(board, 3 - s.turn)) : new Set();
  const legal = !s.winner && !thinking && (friend() || s.turn === 1) ? moves(s) : [];
  const dest = new Set(pick && pick.to == null ? legal.filter((m) => m.from === pick.from).map((m) => m.to) : []);
  for (let p = 0; p < 24; p++) {
    const who = board[p];
    const st = stones[p];
    st.setAttribute('visibility', who ? 'visible' : 'hidden');
    const last = game.last && game.last.to === p && !pick;
    st.setAttribute('class', `stone${who ? ` p${who}` : ''}${pick?.from === p && pick.to == null ? ' sel' : ''}${canTake.has(p) ? ' takeable' : ''}${last ? ' last' : ''}${who && inMill(board, p) ? ' mill' : ''}`);
    targets[p].setAttribute('visibility', dest.has(p) ? 'visible' : 'hidden');
  }
  for (const who of [1, 2]) $(`hand${who}`).replaceChildren(...Array.from({ length: s.inHand[who] }, () => el('i')));
  $('score1').textContent = s.onBoard[1] + s.inHand[1];
  $('score2').textContent = s.onBoard[2] + s.inHand[2];
  $('name1').textContent = friend() ? 'Light' : 'You';
  $('name2').textContent = friend() ? 'Dark' : 'CPU';
  $('chip1').classList.toggle('turn', !s.winner && s.turn === 1);
  $('chip2').classList.toggle('turn', !s.winner && s.turn === 2);
  const opp = OPPONENTS.find(([id]) => id === game.opponent)[1];
  $('subtitle').textContent = friend() ? 'Two players' : `vs ${opp}`;
  let status;
  const who = s.turn;
  const you = !friend() && who === 1;
  const verb = (v) => (you ? v : `${v}s`);
  if (s.winner) status = s.winner === 3 ? 'A draw' : `${nameOf(s.winner)} ${!friend() && s.winner === 1 ? 'win' : 'wins'}!`;
  else if (!friend() && who === 2) status = 'The computer is thinking…';
  else if (pick?.to != null) status = `Mill! ${nameOf(who)} ${verb('take')} a piece`;
  else if (s.inHand[who]) status = `${nameOf(who)} ${verb('place')} a piece (${s.inHand[who]} left)`;
  else if (pick) status = 'Now tap where it goes';
  else status = `${nameOf(who)} ${verb('move')}${s.onBoard[who] === 3 ? ': three left, so you can fly anywhere' : ': tap a piece'}`;
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
  const before = settings.get('opponent');
  openDialog({
    title: "Nine Men's Morris",
    body: el(
      'div',
      {},
      el('p', {}, 'Take turns placing your nine pieces on the points. Then take turns moving one piece along a line to a free neighbouring point. Three of yours in a row is a mill: take one of your opponent’s pieces (not from a mill, unless there’s nothing else). With three pieces left you may fly to any free point. Leave your opponent with two pieces, or no move, to win.'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Opponent'), segmented('opponent', OPPONENTS, settings.get('opponent'), (v) => settings.set('opponent', v))),
      record(),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
    actions: [{ label: 'New game', value: 'new' }, { label: 'Done', value: null, primary: true }],
  }).then((v) => {
    if (v === 'new' || settings.get('opponent') !== before) start();
  });
}

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('menu-btn').prepend(icon('settings', { size: 22 }));
$('new-btn').addEventListener('click', start);
$('new-btn').prepend(icon('flag', { size: 22 }));
$('undo-btn').addEventListener('click', undo);
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey) return;
  if (e.key === 'z') undo();
  else if (e.key === 'Escape' && pick?.to == null) {
    pick = null;
    draw();
  }
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

const saved = store.get('game');
if (saved?.state && !saved.state.winner) {
  game = saved;
  build();
  next();
} else start();
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openMenu();
}

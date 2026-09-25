import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { mulberry32, randomSeed } from './core/rng.js';
import { STORE, pitsOf, newGame, legalMoves, play, replay, chooseMove, analyse, explain } from './js/engine.js';

const store = makeStore('mancala');
const settings = makeSettings(store, { theme: null, sound: true, fast: false });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const wait = (ms) => new Promise((r) => setTimeout(r, reduced.matches ? 0 : settings.get('fast') ? ms / 3 : ms));

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
  seed(k) {
    const ac = audio();
    if (ac) tone(ac, { freq: 700 + (k % 7) * 60, duration: 0.05, gain: 0.04, type: 'triangle' });
  },
  store() {
    const ac = audio();
    if (ac) [784, 1046.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.15, gain: 0.05, when: i * 0.07 }));
  },
  capture() {
    const ac = audio();
    if (ac) [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.2, gain: 0.05, when: i * 0.06 }));
  },
  invalid: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Game ----------

// game: { mode, level, human: 0 | 1, seeds, first, moves, hints }
let game = null;
let state = null;
let shown = null; // pits being drawn (differs from state.pits mid-animation)
let busy = false;
let hint = null;

const playerName = (p) => (game.mode === 'bot' ? (p === game.human ? 'You' : 'Computer') : `Player ${p + 1}`);
const canAct = () => !!game && state.winner == null && !busy && (game.mode === 'local' || state.turn === game.human);
const save = () => game && store.set('game', game);

function start({ mode = 'bot', level = 'medium', first = 'you', seeds = 4 }) {
  let human = 0;
  let firstPlayer = 0;
  if (mode === 'bot') {
    const goFirst = first === 'you' || (first === 'alternate' && store.get('lastFirst') !== 'you');
    firstPlayer = goFirst ? 0 : 1;
    store.set('lastFirst', goFirst ? 'you' : 'computer');
  }
  game = { mode, level, human, first, seeds: Number(seeds), firstPlayer, moves: [], hints: 0 };
  state = newGame({ seeds: game.seeds, first: firstPlayer });
  shown = state.pits.slice();
  hint = null;
  document.querySelector('dialog.result-dialog')?.closeWith(null);
  save();
  render();
  maybeBot();
}

async function move(i) {
  if (busy) return;
  const before = state;
  const r = play(state, i);
  busy = true;
  hint = null;
  // Sow one seed at a time.
  shown = before.pits.slice();
  shown[i] = 0;
  render(i);
  for (let k = 0; k < r.path.length; k++) {
    await wait(170);
    shown[r.path[k]]++;
    sfx.seed(k);
    render(r.path[k]);
  }
  if (r.capture) {
    await wait(300);
    sfx.capture();
    toast(`${playerName(before.turn)} ${playerName(before.turn) === 'You' ? 'capture' : 'captures'} ${r.capture.seeds} seeds!`, { duration: 1600 });
  } else if (r.extra) {
    sfx.store();
    toast(`${playerName(before.turn)} ${playerName(before.turn) === 'You' ? 'go' : 'goes'} again`, { duration: 1200 });
  }
  state = r.state;
  shown = state.pits.slice();
  game.moves = state.moves;
  busy = false;
  save();
  render();
  announce(`${playerName(before.turn)} ${playerName(before.turn) === 'You' ? 'play' : 'plays'} pit ${pitsOf(before.turn).indexOf(i) + 1}.${r.extra ? ' Another turn.' : ''}`);
  if (state.winner != null) finished();
  else maybeBot();
}

function tapPit(i) {
  if (!canAct()) {
    if (busy) return;
    if (game.mode === 'bot' && state.turn !== game.human) toast('The computer is thinking…');
    return;
  }
  if (!pitsOf(state.turn).includes(i)) {
    sfx.invalid();
    toast(game.mode === 'bot' ? 'Your pits are the bottom row.' : `${playerName(state.turn)} plays the ${state.turn === 0 ? 'bottom' : 'top'} row.`);
    return;
  }
  if (!state.pits[i]) {
    sfx.invalid();
    return;
  }
  move(i);
}

function undo() {
  if (!game || !game.moves.length || busy) return;
  let moves = game.moves.slice(0, -1);
  const opts = { seeds: game.seeds, first: game.firstPlayer };
  if (game.mode === 'bot') while (moves.length && replay(moves, opts).turn !== game.human) moves = moves.slice(0, -1);
  if (game.mode === 'bot' && replay(moves, opts).turn !== game.human) return;
  state = replay(moves, opts);
  shown = state.pits.slice();
  game.moves = state.moves;
  hint = null;
  save();
  render();
}

async function maybeBot() {
  if (!game || game.mode !== 'bot' || state.winner != null || state.turn === game.human || busy) return;
  const before = state;
  await wait(500);
  if (state !== before) return;
  const m = chooseMove(state, game.level, { random: mulberry32(randomSeed()), timeMs: 700 });
  if (m != null) move(m);
}

function showHint() {
  if (!canAct()) return;
  hint = explain(state, analyse(state, { timeMs: 600 }));
  game.hints++;
  save();
  render();
  announce(hint.text);
}

function finished() {
  const w = state.winner;
  const won = game.mode === 'bot' && w === game.human;
  if (w === -1 || game.mode === 'local' || won) setTimeout(sfx.win, 300);
  if (game.mode === 'bot') {
    const stats = store.get('stats', {});
    const s = (stats[game.level] ||= { played: 0, won: 0, best: 0 });
    s.played++;
    if (won) {
      s.won++;
      s.best = Math.max(s.best, state.pits[STORE[game.human]]);
    }
    store.set('stats', stats);
  }
  setTimeout(() => {
    openDialog({
      title: w === -1 ? 'It’s a draw' : game.mode === 'bot' ? (won ? 'You win!' : 'The computer wins') : `${playerName(w)} wins!`,
      className: 'result-dialog',
      body: el('p', {}, `Final stores: ${playerName(0)} ${state.pits[6]}, ${playerName(1)} ${state.pits[13]}.`),
      actions: [
        { label: 'See the board', value: null },
        { label: 'Play again', value: 'again', primary: true },
      ],
    }).then((v) => v === 'again' && start(game));
  }, 900);
}

// ---------- Screen ----------

function seedsEl(n, cap = 24) {
  const box = el('span', { class: 'seeds' });
  const random = mulberry32(n * 97 + 3);
  for (let k = 0; k < Math.min(n, cap); k++) {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 34;
    box.append(el('i', { class: `seed s${k % 5}`, style: `left: ${50 + Math.cos(a) * r}%; top: ${50 + Math.sin(a) * r}%` }));
  }
  return box;
}

function render(flash = -1) {
  if (!game) return;
  const pits = shown || state.pits;
  const act = canAct();
  const pit = (i, owner) =>
    el(
      'button',
      { class: `pit ${owner === state.turn && act && pits[i] ? 'playable' : ''} ${i === flash ? 'flash' : ''} ${hint && hint.move === i && act ? 'hint' : ''}`, onclick: () => tapPit(i), 'aria-label': `${playerName(owner)}, pit ${pitsOf(owner).indexOf(i) + 1}: ${pits[i]} seeds` },
      seedsEl(pits[i]),
      el('b', {}, pits[i]),
    );
  const storeEl = (p) => el('div', { class: `store ${STORE[p] === flash ? 'flash' : ''}`, 'aria-label': `${playerName(p)}’s store: ${pits[STORE[p]]}` }, seedsEl(pits[STORE[p]], 48), el('b', {}, pits[STORE[p]]), el('small', {}, playerName(p)));
  const top = el('div', { class: 'row top' }, [12, 11, 10, 9, 8, 7].map((i) => pit(i, 1)));
  const bottom = el('div', { class: 'row bottom' }, [0, 1, 2, 3, 4, 5].map((i) => pit(i, 0)));
  $('board').replaceChildren(el('div', { class: 'mc-board' }, storeEl(1), el('div', { class: 'rows' }, top, bottom), storeEl(0)));
  $('subtitle').textContent = game.mode === 'bot' ? `vs computer · ${LEVEL_NAMES[game.level]}` : 'Pass and play';
  $('players').replaceChildren(...[0, 1].map((p) => el('div', { class: `player ${state.winner == null && state.turn === p ? 'turn' : state.winner === p ? 'turn' : ''}` }, el('span', { class: 'player-text' }, el('b', {}, playerName(p)), el('small', {}, `${pits[STORE[p]]} in store`)))));
  $('status').textContent = state.winner != null ? 'Game over.' : hint && act ? hint.text : busy ? '' : game.mode === 'bot' && state.turn !== game.human ? 'The computer is thinking…' : `${playerName(state.turn) === 'You' ? 'Your' : `${playerName(state.turn)}’s`} turn: tap a pit on the ${state.turn === 0 ? 'bottom' : 'top'} row.`;
  $('undo-btn').disabled = !game.moves.length || busy;
  $('hint-btn').disabled = !act;
}

// ---------- Dialogs ----------

function newGameDialog() {
  const setup = { mode: 'bot', level: 'medium', first: 'you', seeds: '4', ...store.get('setup') };
  const rows = {};
  const row = (key, label, control) => (rows[key] = el('div', { class: 'field' }, el('span', { class: 'field-label' }, label), control));
  const update = () => {
    rows.level.hidden = setup.mode !== 'bot';
    rows.first.hidden = setup.mode !== 'bot';
  };
  const set = (key) => (v) => {
    setup[key] = v;
    update();
  };
  const body = el(
    'div',
    { class: 'setup' },
    row('mode', 'Play against', segmented('mode', [['bot', 'Computer'], ['local', 'Pass & play']], setup.mode, set('mode'))),
    row('level', 'Computer', segmented('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], setup.level, set('level'))),
    row('first', 'Who goes first', segmented('first', [['you', 'You'], ['computer', 'Computer'], ['alternate', 'Take turns']], setup.first, set('first'))),
    row('seeds', 'Seeds per pit', segmented('seeds', [['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']], setup.seeds, set('seeds'))),
  );
  update();
  openDialog({ title: 'New game', body, actions: [{ label: 'Start', value: 'start', primary: true }] }).then((v) => {
    if (v !== 'start') return;
    store.set('setup', setup);
    start(setup);
  });
}

function rulesDialog(first = false) {
  return openDialog({
    title: first ? 'Welcome to Mancala' : 'How to play',
    body: el(
      'div',
      { class: 'rules' },
      el('p', {}, 'Tap one of your pits (the bottom row). Its seeds are sown one at a time into the next pits, counterclockwise, including your store on the right, but not your opponent’s.'),
      el('ul', {}, el('li', {}, el('b', {}, 'Last seed in your store:'), ' you go again.'), el('li', {}, el('b', {}, 'Last seed in one of your empty pits:'), ' you capture it and every seed in the pit opposite.')),
      el('p', {}, 'When either row runs out, each player adds what’s left on their own side to their store. The fuller store wins.'),
    ),
    actions: [{ label: first ? 'Play' : 'Got it', value: 'ok', primary: true }],
  });
}

function settingsDialog() {
  openDialog({
    title: 'Settings',
    body: el('div', {}, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)), toggle('Fast sowing', settings.get('fast'), (v) => settings.set('fast', v)), toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v))),
  });
}

// ---------- Wiring ----------

$('new-btn').addEventListener('click', newGameDialog);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('rules-btn').addEventListener('click', () => rulesDialog());
$('settings-btn').addEventListener('click', settingsDialog);
for (const [id, n] of [['hint-btn', 'bulb'], ['rules-btn', 'help'], ['settings-btn', 'settings']]) $(id).prepend(icon(n, { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || !game) return;
  const k = Number(e.key);
  if (k >= 1 && k <= 6) tapPit(pitsOf(state.turn)[k - 1]);
  else if (e.key === 'z') undo();
  else if (e.key === 'h') showHint();
  else if (e.key === 'n') newGameDialog();
  else return;
  e.preventDefault();
});

function resume() {
  const saved = store.get('game');
  if (saved && Array.isArray(saved.moves)) {
    try {
      state = replay(saved.moves, { seeds: saved.seeds, first: saved.firstPlayer });
      game = saved;
      shown = state.pits.slice();
      render();
      maybeBot();
      return;
    } catch {
      /* start fresh */
    }
  }
  start({ ...store.get('setup') });
  if (!store.get('welcomed')) {
    store.set('welcomed', true);
    rulesDialog(true);
  }
}

resume();
addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

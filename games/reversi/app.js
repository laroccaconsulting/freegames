import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { newGame, applyMove, replay, legalMoves, flips, count, name } from './js/engine.js';
import { chooseMove, analyse, explain } from './js/bot.js';

const store = makeStore('reversi');
const settings = makeSettings(store, { theme: null, sound: true, discs: 'stones', showMoves: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const BOT_TIME = { easy: 0, medium: 0, hard: 1000 };
const DISC_NAMES = { stones: ['Black', 'White'], bright: ['Coral', 'Gold'], hallows: ['Pumpkin', 'Moon'] };
const discSet = () => (themeId() === 'hallows' ? 'hallows' : settings.get('discs'));
function applyLook() {
  applyTheme(themeId());
  document.body.dataset.discs = discSet();
}

applyLook();
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => {
  applyLook();
  render();
});
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt' || key === 'discs') applyLook();
  if (key === 'sound') setSoundEnabled(value);
  render();
});

const sfx = {
  place(n) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.05, freq: 1100, q: 1.2, gain: 0.45 });
    for (let i = 0; i < Math.min(n, 8); i++) noiseBurst(ac, { duration: 0.025, freq: 2600 + i * 150, q: 2, gain: 0.12, when: 0.08 + i * 0.045 });
  },
  pass() {
    const ac = audio();
    if (ac) tone(ac, { freq: 330, duration: 0.2, gain: 0.05, type: 'triangle' });
  },
  invalid: () => sounds.invalid(),
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (!ac) return;
    [392, 329.6, 261.6].forEach((freq, i) => tone(ac, { freq, duration: 0.35, gain: 0.06, when: i * 0.14, type: 'triangle' }));
  },
};

// ---------- Game ----------

// game: { mode: 'bot' | 'local', level, human: 1 | 2, first, moves, hints }
let game = null;
let state = null;
let thinking = false;
let botJob = 0;
let hint = null;
let lastFlips = [];

const playerName = (p) => (game?.mode === 'bot' ? (p === game.human ? 'You' : 'Computer') : DISC_NAMES[discSet()][p - 1]);
const canAct = () => !!game && state.winner == null && (game.mode === 'local' || (state.turn === game.human && !thinking));

function buildBoard() {
  const board = el('div', { class: 'rv-board', role: 'grid', 'aria-label': 'Board' });
  for (let i = 0; i < 64; i++) board.append(el('button', { class: 'rv-cell', dataset: { i }, 'aria-label': name(i), onclick: () => humanMove(i) }, el('span', { class: 'rv-disc' })));
  $('board').replaceChildren(board);
}

function start({ mode = 'bot', level = 'medium', first = 'you' }) {
  botJob++;
  thinking = false;
  hint = null;
  lastFlips = [];
  let human = 1;
  if (mode === 'bot') {
    const goFirst = first === 'you' || (first === 'alternate' && store.get('lastFirst') !== 'you');
    human = goFirst ? 1 : 2;
    store.set('lastFirst', goFirst ? 'you' : 'computer');
  }
  game = { mode, level, first, human, moves: [], hints: 0 };
  state = newGame();
  document.querySelector('dialog.result-dialog')?.closeWith(null);
  save();
  render();
  announce(`New game. ${statusText()}`);
  maybeBot();
}

const save = () => game && store.set('game', game);

function humanMove(i) {
  if (!canAct()) {
    if (thinking) toast('The computer is thinking…');
    return;
  }
  if (!flips(state.cells, i, state.turn).length) {
    sfx.invalid();
    if (!state.cells[i]) toast('That square doesn’t flip anything. Dots show where you can play.');
    return;
  }
  commit(i);
}

function commit(i) {
  const who = state.turn;
  lastFlips = flips(state.cells, i, who);
  state = applyMove(state, i);
  game.moves = state.moves.slice();
  hint = null;
  save();
  render();
  sfx.place(lastFlips.length);
  let text = `${playerName(who)} ${playerName(who) === 'You' ? 'play' : 'plays'} ${name(i)}, flipping ${lastFlips.length}.`;
  if (state.winner == null && state.turn === who) {
    text += ` ${playerName(3 - who)} ${playerName(3 - who) === 'You' ? 'have' : 'has'} no move and must pass.`;
    setTimeout(() => {
      sfx.pass();
      toast(`${playerName(3 - who)} ${playerName(3 - who) === 'You' ? 'have' : 'has'} no move: pass`);
    }, 400);
  }
  announce(`${text} ${statusText()}`);
  if (state.winner != null) finished();
  else maybeBot();
}

function undo() {
  if (!game || !game.moves.length || thinking) return;
  let moves = game.moves.slice();
  const drop = () => {
    moves.pop();
    while (moves.length && moves[moves.length - 1] === -1) moves.pop();
  };
  drop();
  if (game.mode === 'bot') while (moves.length && replay(moves).turn !== game.human) drop();
  if (game.mode === 'bot' && replay(moves).turn !== game.human) return;
  botJob++;
  thinking = false;
  hint = null;
  lastFlips = [];
  document.querySelector('dialog.result-dialog')?.closeWith(null);
  state = replay(moves);
  game.moves = state.moves.slice();
  save();
  render();
  maybeBot();
}

function finished() {
  const w = state.winner;
  const a = count(state.cells, 1);
  const b = count(state.cells, 2);
  const won = game.mode === 'bot' && w === game.human;
  if (w === 0 || game.mode === 'local' || won) setTimeout(sfx.win, 300);
  else setTimeout(sfx.lose, 300);
  if (game.mode === 'bot') {
    const stats = store.get('stats', {});
    const s = (stats[game.level] ||= { played: 0, won: 0, streak: 0, best: 0, bestMargin: 0 });
    s.played++;
    if (won) {
      s.won++;
      s.streak++;
      s.best = Math.max(s.best, s.streak);
      s.bestMargin = Math.max(s.bestMargin, Math.abs(a - b));
    } else s.streak = 0;
    store.set('stats', stats);
  }
  const current = state;
  setTimeout(() => {
    if (state !== current) return;
    const title = w === 0 ? 'It’s a draw' : game.mode === 'bot' ? (won ? 'You win!' : 'The computer wins') : `${playerName(w)} wins!`;
    openDialog({
      title,
      className: 'result-dialog',
      body: el('div', { class: 'result' }, el('span', { class: `result-disc ${w ? `p${w}` : 'draw'}` }), el('p', {}, `Final count: ${playerName(1)} ${a}, ${playerName(2)} ${b}.${won && game.hints ? ` You used ${game.hints} hint${game.hints > 1 ? 's' : ''}.` : ''}`)),
      actions: [
        { label: 'See the board', value: null },
        { label: 'Play again', value: 'again', primary: true },
      ],
    }).then((v) => v === 'again' && start(game));
  }, 1200);
}

// ---------- Computer ----------

let worker = null;
const jobs = new Map();
let nextId = 1;

function ask(msg) {
  const local = () => (msg.type === 'analyse' ? analyse(msg.state, { timeMs: msg.timeMs }) : chooseMove(msg.state, msg.level, { timeMs: msg.timeMs }));
  return new Promise((resolve) => {
    if (worker === null) {
      try {
        worker = new Worker(new URL('./js/bot-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          jobs.get(data.id)?.resolve(data.result);
          jobs.delete(data.id);
        };
        worker.onerror = () => {
          worker = false;
          for (const job of jobs.values()) job.resolve(job.local());
          jobs.clear();
        };
      } catch {
        worker = false;
      }
    }
    if (!worker) {
      setTimeout(() => resolve(local()), 30);
      return;
    }
    const id = nextId++;
    jobs.set(id, { resolve, local });
    worker.postMessage({ id, ...msg });
  });
}

function maybeBot() {
  if (!game || game.mode !== 'bot' || state.winner != null || state.turn === game.human) return;
  const job = ++botJob;
  const before = state;
  const started = Date.now();
  thinking = true;
  render();
  ask({ type: 'move', state: before, level: game.level, timeMs: BOT_TIME[game.level] }).then((m) => {
    setTimeout(() => {
      if (job !== botJob || state !== before) return;
      thinking = false;
      if (m != null && flips(state.cells, m, state.turn).length) commit(m);
      else render();
    }, Math.max(0, 600 - (Date.now() - started)));
  });
}

async function showHint() {
  if (!canAct()) return;
  const before = state;
  $('status').textContent = 'Thinking…';
  const result = await ask({ type: 'analyse', state: before, timeMs: 700 });
  if (state !== before) return;
  hint = explain(before, result);
  game.hints++;
  save();
  render();
  announce(hint.text);
}

// ---------- Screen ----------

function statusText() {
  if (!game) return '';
  if (state.winner != null) return state.winner === 0 ? 'Draw.' : `${playerName(state.winner)} ${playerName(state.winner) === 'You' ? 'win' : 'wins'}!`;
  if (hint) return hint.text;
  if (thinking) return 'The computer is thinking…';
  if (game.mode === 'bot') return state.moves.length < 2 ? 'Your turn. Place a disc to trap a line of the computer’s discs.' : 'Your turn.';
  return `${playerName(state.turn)} to play.`;
}

function render() {
  if (!game) return;
  const act = canAct();
  const moves = act ? legalMoves(state) : [];
  const last = [...state.moves].reverse().find((m) => m >= 0);
  const cells = document.querySelectorAll('.rv-cell');
  cells.forEach((cell, i) => {
    const v = state.cells[i];
    const disc = cell.firstChild;
    const was = Number(disc.dataset.p || 0);
    disc.className = `rv-disc ${v ? `p${v}` : ''} ${v && was && was !== v ? 'flip' : ''} ${v && !was ? 'drop' : ''}`;
    disc.dataset.p = v;
    cell.classList.toggle('legal', settings.get('showMoves') && moves.includes(i));
    cell.classList.toggle('last', i === last);
    cell.classList.toggle('hint', !!hint && act && hint.move === i);
    cell.setAttribute('aria-label', `${name(i)}${v ? `, ${playerName(v)}` : moves.includes(i) ? ', can play' : ''}`);
  });
  $('board').classList.toggle('my-turn', act);
  $('subtitle').textContent = game.mode === 'bot' ? `vs computer · ${LEVEL_NAMES[game.level]}` : 'Pass and play';
  $('players').replaceChildren(
    ...[1, 2].map((p) => {
      const turn = state.winner == null ? state.turn === p : state.winner === p;
      return el('div', { class: `player ${turn ? 'turn' : ''}` }, el('span', { class: `player-disc p${p}` }), el('span', { class: 'player-text' }, el('b', {}, playerName(p)), el('small', {}, `${count(state.cells, p)} discs`)));
    }),
  );
  $('status').textContent = statusText();
  $('undo-btn').disabled = !game.moves.length || thinking;
  $('hint-btn').disabled = !act;
}

// ---------- Dialogs ----------

function newGameDialog() {
  const setup = { mode: 'bot', level: 'medium', first: 'you', ...store.get('setup') };
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
    title: first ? 'Welcome to Reversi' : 'How to play',
    body: el(
      'div',
      { class: 'rules' },
      el('p', {}, 'Place a disc so that it traps a straight line of your opponent’s discs (across, up or diagonally) between it and another of yours. Every trapped disc flips to your colour.'),
      el('p', {}, 'If you can’t trap anything, you pass. When neither player can move, whoever has more discs wins.'),
      el('p', {}, el('b', {}, 'Tips')),
      el(
        'ul',
        {},
        el('li', {}, 'Corners can never be flipped. Take them.'),
        el('li', {}, 'Don’t play next to an empty corner: it hands the corner to your opponent.'),
        el('li', {}, 'More discs early is not better. Flip few, and keep your opponent short of moves.'),
      ),
      el('p', { class: 'muted small' }, 'Keyboard: Z undoes, H gives a hint, N starts a new game.'),
    ),
    actions: [{ label: first ? 'Play' : 'Got it', value: 'ok', primary: true }],
  });
}

function statsDialog() {
  const stats = store.get('stats', {});
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
  openDialog({
    title: 'Stats',
    body: el(
      'div',
      {},
      ...['easy', 'medium', 'hard'].map((lv) => {
        const s = stats[lv] || { played: 0, won: 0, best: 0, bestMargin: 0 };
        return el('div', { class: 'field' }, el('span', { class: 'field-label' }, `${LEVEL_NAMES[lv]} computer`), el('div', { class: 'stat-grid' }, stat(s.played, 'Played'), stat(s.played ? `${Math.round((100 * s.won) / s.played)}%` : '–', 'Won'), stat(s.bestMargin ? `+${s.bestMargin}` : '–', 'Best win')));
      }),
    ),
  });
}

function settingsDialog() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Discs'), segmented('discs', [['stones', 'Black & white'], ['bright', 'Coral & gold']], settings.get('discs'), (v) => settings.set('discs', v))),
      toggle('Show where you can play', settings.get('showMoves'), (v) => settings.set('showMoves', v)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
}

// ---------- Wiring ----------

buildBoard();
$('new-btn').addEventListener('click', newGameDialog);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('stats-btn').addEventListener('click', statsDialog);
$('rules-btn').addEventListener('click', () => rulesDialog());
$('settings-btn').addEventListener('click', settingsDialog);
for (const [id, n] of [['hint-btn', 'bulb'], ['stats-btn', 'chart'], ['rules-btn', 'help'], ['settings-btn', 'settings']]) $(id).prepend(icon(n, { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || !game) return;
  if (e.key === 'z' || e.key === 'u') undo();
  else if (e.key === 'h') showHint();
  else if (e.key === 'n') newGameDialog();
  else return;
  e.preventDefault();
});

function resume() {
  const saved = store.get('game');
  if (saved && Array.isArray(saved.moves) && (saved.mode === 'bot' || saved.mode === 'local')) {
    try {
      state = replay(saved.moves);
      game = { hints: 0, ...saved };
      render();
      maybeBot();
      return;
    } catch {
      /* a bad save: start fresh */
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

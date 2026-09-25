import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { SIZES, newGame, applyMove, replay, isLegal, dropRow, threats } from './js/engine.js';
import { chooseMove, analyse, explain } from './js/bot.js';
import { Board } from './js/board.js';

const store = makeStore('four');
const ach = makeAchievements('four', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, discs: 'stones', threats: false });
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

function applyLook() {
  applyTheme(themeId());
  document.body.dataset.discs = discSet();
}
const discSet = () => (themeId() === 'hallows' ? 'hallows' : settings.get('discs'));

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

// ---------- Sounds ----------

const sfx = {
  drop(row) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.06, freq: 900 + row * 120, q: 1.4, gain: 0.5 });
    tone(ac, { freq: 180 + row * 22, duration: 0.12, gain: 0.07, type: 'triangle' });
    noiseBurst(ac, { duration: 0.03, freq: 1400 + row * 120, q: 1.2, gain: 0.18, when: 0.09 });
  },
  invalid: () => sounds.invalid(),
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (!ac) return;
    [392, 329.6, 261.6].forEach((freq, i) => tone(ac, { freq, duration: 0.35, gain: 0.06, when: i * 0.14, type: 'triangle' }));
  },
  draw() {
    const ac = audio();
    if (!ac) return;
    [440, 440].forEach((freq, i) => tone(ac, { freq, duration: 0.25, gain: 0.05, when: i * 0.18, type: 'triangle' }));
  },
};

// ---------- Game ----------

// game: { mode: 'bot' | 'local', level, human: 1 | 2, size, moves, hints }
// The state is rebuilt from the moves, so a saved game can't be corrupted.
let game = null;
let state = null;
let thinking = false;
let botJob = 0;
let hint = null; // { column, text }
let focus = -1;

const board = new Board($('board'), { onColumn: (c) => humanMove(c) });
$('board').current = () => ({ game, state }); // reachable from browser tests

function playerName(p, { you = true } = {}) {
  if (game?.mode === 'bot') return p === game.human ? (you ? 'You' : 'you') : 'Computer';
  return DISC_NAMES[discSet()][p - 1];
}

function canAct() {
  if (!game || state.winner != null) return false;
  return game.mode === 'local' || (state.turn === game.human && !thinking);
}

function start({ mode = 'bot', level = 'medium', first = 'you', size = 'classic' }) {
  botJob++;
  thinking = false;
  hint = null;
  let human = 1;
  if (mode === 'bot') {
    const goFirst = first === 'you' || (first === 'alternate' && !(store.get('lastFirst') === 'you'));
    human = goFirst ? 1 : 2;
    store.set('lastFirst', goFirst ? 'you' : 'computer');
  }
  game = { mode, level, first, human, size, moves: [], hints: 0 };
  state = newGame(SIZES[size] || SIZES.classic);
  closeResult();
  save();
  render();
  announce(`New game. ${statusText()}`);
  maybeBot();
}

const save = () => game && store.set('game', game);
const closeResult = () => document.querySelector('dialog.result-dialog')?.closeWith(null);

function humanMove(c) {
  if (!canAct()) {
    if (thinking) toast('The computer is thinking…');
    return;
  }
  if (!isLegal(state, c)) {
    sfx.invalid();
    return;
  }
  commit(c);
}

function commit(c) {
  const row = dropRow(state, c);
  state = applyMove(state, c);
  game.moves = state.moves;
  hint = null;
  save();
  render();
  setTimeout(() => sfx.drop(row), board.dropTime(row));
  const who = playerName(3 - state.turn);
  announce(`${who} ${who === 'You' ? 'drop' : 'drops'} in column ${c + 1}. ${statusText()}`);
  if (state.winner != null) finished();
  else maybeBot();
}

function undo() {
  if (!game || !game.moves.length || thinking) return;
  let moves = game.moves.slice(0, -1);
  // Against the computer, go back to your own turn.
  if (game.mode === 'bot') {
    const turnAfter = (n) => (n % 2 === 0 ? 1 : 2);
    while (moves.length && turnAfter(moves.length) !== game.human) moves = moves.slice(0, -1);
    if (turnAfter(moves.length) !== game.human) return;
  }
  botJob++;
  thinking = false;
  hint = null;
  closeResult();
  state = replay({ ...SIZES[game.size], first: 1 }, moves);
  game.moves = moves;
  save();
  render();
  announce(`Move undone. ${statusText()}`);
  maybeBot();
}

function finished() {
  const w = state.winner;
  const won = game.mode === 'local' ? w !== 0 : w === game.human;
  if (game.mode === 'bot' && w === game.human) {
    ach.unlock('first-win');
    if (game.level === 'medium') ach.unlock('beat-medium');
    if (game.level === 'hard') ach.unlock('beat-hard');
    ach.add('wins-10');
    ach.add('wins-50');
  }
  if (game.mode === 'local') ach.unlock('friend');
  if (game.mode === 'bot' && w === game.human && (store.get('stats', {})[game.level]?.streak || 0) >= 2) ach.unlock('streak-3');
  if (game.mode === 'bot' && w === game.human && state.cells.filter((c) => c === game.human).length <= 10) ach.unlock('quick');
  if (w === 0) sfx.draw();
  else if (won) setTimeout(sfx.win, 250);
  else setTimeout(sfx.lose, 250);
  if (game.mode === 'bot') {
    const stats = store.get('stats', {});
    const s = (stats[game.level] ||= { played: 0, won: 0, drawn: 0, streak: 0, best: 0 });
    s.played++;
    if (w === game.human) {
      s.won++;
      s.streak++;
      s.best = Math.max(s.best, s.streak);
    } else {
      if (w === 0) s.drawn++;
      s.streak = 0;
    }
    store.set('stats', stats);
  }
  const current = state;
  setTimeout(() => {
    if (state !== current) return;
    openDialog({
      title: w === 0 ? 'It’s a draw' : game.mode === 'bot' ? (w === game.human ? 'You win!' : 'The computer wins') : `${playerName(w)} wins!`,
      className: 'result-dialog',
      body: el('div', { class: 'result' }, w ? el('span', { class: `result-disc p${w}` }) : el('span', { class: 'result-disc draw' }), el('p', {}, resultLine(w))),
      actions: [
        { label: 'See the board', value: null },
        { label: 'Play again', value: 'again', primary: true },
      ],
    }).then((v) => v === 'again' && start(game));
  }, 1100);
}

function resultLine(w) {
  const turns = Math.ceil(state.moves.length / 2);
  if (w === 0) return 'The board is full and nobody made four.';
  if (game.mode === 'bot' && w === game.human) {
    const s = store.get('stats', {})[game.level];
    const helped = game.hints ? ` You used ${game.hints} hint${game.hints > 1 ? 's' : ''}.` : '';
    return `You beat the ${LEVEL_NAMES[game.level].toLowerCase()} computer in ${turns} moves.${helped}${s ? ` Wins at this level: ${s.won} of ${s.played}${s.streak > 1 ? `, ${s.streak} in a row` : ''}.` : ''}`;
  }
  if (game.mode === 'bot') return 'Tip: turn on “Show threats” in Settings to see every cell that would complete four, for both of you.';
  return `${playerName(w)} made four in ${turns} moves.`;
}

// ---------- Computer player ----------

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
  ask({ type: 'move', state: before, level: game.level, timeMs: BOT_TIME[game.level] }).then((c) => {
    setTimeout(() => {
      if (job !== botJob || state !== before) return;
      thinking = false;
      if (c != null && isLegal(state, c)) commit(c);
      else render();
    }, Math.max(0, 500 - (Date.now() - started)));
  });
}

async function showHint() {
  if (!canAct()) return;
  const before = state;
  setStatus('Thinking…');
  const result = await ask({ type: 'analyse', state: before, timeMs: 700 });
  if (state !== before) return;
  const names = { 1: playerName(1), 2: playerName(2) };
  if (game.mode === 'bot') names[3 - game.human] = 'the computer';
  hint = explain(before, result, names);
  game.hints++;
  save();
  render();
  announce(hint.text);
}

// ---------- Screen ----------

function statusText() {
  if (!game) return '';
  if (state.winner === 0) return 'Draw: the board is full.';
  if (state.winner != null) return game.mode === 'bot' ? (state.winner === game.human ? 'You win!' : 'The computer wins.') : `${playerName(state.winner)} wins!`;
  if (hint) return hint.text;
  if (thinking) return 'The computer is thinking…';
  if (game.mode === 'bot') return state.moves.length < 2 ? 'Your turn. Tap a column to drop a disc.' : 'Your turn.';
  return `${playerName(state.turn)} to play.`;
}

function setStatus(text) {
  $('status').textContent = text;
}

function subtitle() {
  if (!game) return '';
  const size = game.size === 'big' ? ' · 9×7' : '';
  return game.mode === 'bot' ? `vs computer · ${LEVEL_NAMES[game.level]}${size}` : `Pass and play${size}`;
}

function renderPlayers() {
  const counts = { 1: 0, 2: 0 };
  for (const v of state.cells) if (v) counts[v]++;
  $('players').replaceChildren(
    ...[1, 2].map((p) => {
      const turn = state.winner == null ? state.turn === p : state.winner === p;
      return el(
        'div',
        { class: `player ${turn ? 'turn' : ''}` },
        el('span', { class: `player-disc p${p}`, 'aria-hidden': 'true' }),
        el('span', { class: 'player-text' }, el('b', {}, playerName(p)), el('small', {}, `${counts[p]} disc${counts[p] === 1 ? '' : 's'}`)),
      );
    }),
  );
}

function render() {
  if (!game) return;
  const act = canAct();
  board.render({
    state,
    canPlay: act,
    threats: settings.get('threats') && state.winner == null ? threats(state) : [],
    hint: hint && act ? hint.column : -1,
    focus: act ? focus : -1,
  });
  $('board').classList.toggle('my-turn', act);
  $('subtitle').textContent = subtitle();
  renderPlayers();
  setStatus(statusText());
  $('undo-btn').disabled = !game.moves.length || thinking;
  $('hint-btn').disabled = !act;
}

// ---------- Dialogs ----------

function newGameDialog() {
  const setup = { mode: 'bot', level: 'medium', first: 'you', size: 'classic', ...store.get('setup') };
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
    row('size', 'Board', segmented('size', [['classic', '7 × 6'], ['big', '9 × 7']], setup.size, set('size'))),
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
    title: first ? 'Welcome to Four in a Row' : 'How to play',
    body: el(
      'div',
      { class: 'rules' },
      el('p', {}, 'Take turns dropping a disc into a column. It falls to the lowest empty space.'),
      el('p', {}, 'The first to line up ', el('b', {}, 'four of their own discs'), ' in a row wins: across, up and down, or diagonally. If the board fills up first, it’s a draw.'),
      el('p', {}, el('b', {}, 'Tips'), ' from the computer:'),
      el(
        'ul',
        {},
        el('li', {}, 'The middle column is part of the most possible fours. Start there.'),
        el('li', {}, 'Before you drop, check the space just above: if your disc lets the other player win on top of it, play elsewhere.'),
        el('li', {}, 'Make two threats at once. Nobody can block both.'),
        el('li', {}, 'Whoever goes first wants threats on odd rows (1st, 3rd, 5th from the bottom); the second player wants them on even rows. Near the end, that decides who is forced to fill the space under a threat.'),
      ),
      el('p', { class: 'muted small' }, 'Keyboard: 1–9 drop in a column, ← → and Enter choose, Z undoes, H gives a hint, N starts a new game.'),
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
        const s = stats[lv] || { played: 0, won: 0, drawn: 0, streak: 0, best: 0 };
        return el(
          'div',
          { class: 'field' },
          el('span', { class: 'field-label' }, `${LEVEL_NAMES[lv]} computer`),
          el('div', { class: 'stat-grid' }, stat(s.played, 'Played'), stat(s.played ? `${Math.round((100 * s.won) / s.played)}%` : '–', 'Won'), stat(s.best, 'Best run')),
        );
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
      toggle('Show threats', settings.get('threats'), (v) => settings.set('threats', v), 'Mark every empty space that would complete four, for both players'),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
}

// ---------- Wiring ----------

$('new-btn').addEventListener('click', newGameDialog);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('stats-btn').addEventListener('click', statsDialog);
$('rules-btn').addEventListener('click', () => rulesDialog());
$('settings-btn').addEventListener('click', settingsDialog);
for (const [id, name] of [['hint-btn', 'bulb'], ['stats-btn', 'chart'], ['rules-btn', 'help'], ['settings-btn', 'settings']]) {
  $(id).prepend(icon(name, { size: 22 }));
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || !game) return;
  const n = state.cols;
  if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) {
    focus = -1;
    humanMove(Number(e.key) - 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const step = e.key === 'ArrowRight' ? 1 : -1;
    focus = focus < 0 ? Math.floor(n / 2) : (focus + step + n) % n;
    render();
  } else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && focus >= 0) {
    humanMove(focus);
  } else if (e.key === 'Escape') {
    focus = -1;
    render();
  } else if (e.key === 'z' || e.key === 'u') undo();
  else if (e.key === 'h') showHint();
  else if (e.key === 'n') newGameDialog();
  else return;
  e.preventDefault();
});

function resume() {
  const saved = store.get('game');
  if (saved && Array.isArray(saved.moves) && SIZES[saved.size] && (saved.mode === 'bot' || saved.mode === 'local')) {
    try {
      state = replay({ ...SIZES[saved.size], first: 1 }, saved.moves);
      game = { hints: 0, ...saved };
      render();
      maybeBot();
      return;
    } catch {
      /* a bad save: start fresh */
    }
  }
  start({ ...store.get('setup'), mode: store.get('setup')?.mode || 'bot' });
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


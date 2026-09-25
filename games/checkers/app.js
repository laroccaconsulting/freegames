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
import { DARK, LIGHT, newGame, legalMoves, applyMove, replay, sameMove, count, squareName } from './js/engine.js';
import { chooseMove, analyse, explain } from './js/bot.js';

const store = makeStore('checkers');
const ach = makeAchievements('checkers', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, discs: 'stones', showMoves: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const DISC_NAMES = { stones: ['Black', 'White'], bright: ['Coral', 'Gold'], hallows: ['Pumpkin', 'Moon'] };
const discSet = () => (themeId() === 'hallows' ? 'hallows' : settings.get('discs'));
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
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
  move() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.05, freq: 900, q: 1.2, gain: 0.45 });
  },
  capture(n) {
    const ac = audio();
    if (!ac) return;
    for (let i = 0; i < n; i++) {
      noiseBurst(ac, { duration: 0.05, freq: 1400, q: 1.2, gain: 0.5, when: i * 0.12 });
      tone(ac, { freq: 330 + i * 110, duration: 0.12, gain: 0.05, when: i * 0.12 });
    }
  },
  crown() {
    const ac = audio();
    if (ac) [659.25, 987.77, 1318.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.2, gain: 0.05, when: i * 0.08 }));
  },
  invalid: () => sounds.invalid(),
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (ac) [392, 329.6, 261.6].forEach((freq, i) => tone(ac, { freq, duration: 0.35, gain: 0.06, when: i * 0.14, type: 'triangle' }));
  },
};

// ---------- Game ----------

// game: { mode: 'bot' | 'local', level, human: DARK | LIGHT, first, moves, hints }
let game = null;
let state = null;
let thinking = false;
let botJob = 0;
let hint = null;
let selected = -1;

const playerName = (p) => (game?.mode === 'bot' ? (p === game.human ? 'You' : 'Computer') : DISC_NAMES[discSet()][p === DARK ? 0 : 1]);
const canAct = () => !!game && state.winner == null && (game.mode === 'local' || (state.turn === game.human && !thinking));

function buildBoard() {
  const board = el('div', { class: 'ck-board', role: 'grid', 'aria-label': 'Board' });
  for (let i = 0; i < 64; i++) {
    const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
    board.append(el('button', { class: `ck-sq ${dark ? 'dark' : ''}`, dataset: { i }, onclick: dark ? () => tap(i) : null, tabindex: dark ? null : -1, 'aria-label': squareName(i) }));
  }
  $('board').replaceChildren(board);
}

function start({ mode = 'bot', level = 'medium', first = 'you' }) {
  botJob++;
  thinking = false;
  hint = null;
  selected = -1;
  let human = DARK;
  if (mode === 'bot') {
    const goFirst = first === 'you' || (first === 'alternate' && store.get('lastFirst') !== 'you');
    human = goFirst ? DARK : LIGHT;
    store.set('lastFirst', goFirst ? 'you' : 'computer');
  }
  game = { mode, level, first, human, moves: [], hints: 0 };
  state = newGame();
  document.querySelector('dialog.result-dialog')?.closeWith(null);
  save();
  render();
  maybeBot();
}

const save = () => game && store.set('game', game);

function tap(i) {
  if (!canAct()) {
    if (thinking) toast('The computer is thinking…');
    return;
  }
  const moves = legalMoves(state);
  if (selected >= 0) {
    const m = moves.filter((x) => x.from === selected && x.path[x.path.length - 1] === i).sort((a, b) => b.captures.length - a.captures.length)[0];
    if (m) {
      commit(m);
      return;
    }
  }
  if (moves.some((m) => m.from === i)) {
    selected = selected === i ? -1 : i;
    render();
    return;
  }
  if (Math.sign(state.cells[i]) === state.turn) {
    sfx.invalid();
    toast(moves[0]?.captures.length ? 'You must capture: a jump is available.' : 'That piece can’t move.');
  }
  selected = -1;
  render();
}

function commit(m) {
  const who = state.turn;
  const wasMan = Math.abs(state.cells[m.from]) === 1;
  state = applyMove(state, m);
  game.moves = state.moves;
  selected = -1;
  hint = null;
  save();
  const to = m.path[m.path.length - 1];
  render(to);
  if (m.captures.length) sfx.capture(m.captures.length);
  else sfx.move();
  if (wasMan && Math.abs(state.cells[to]) === 2) setTimeout(sfx.crown, 200);
  announce(`${playerName(who)} ${m.captures.length ? `jumps ${m.captures.length}` : 'moves'} ${squareName(m.from)} to ${squareName(to)}.`);
  if (state.winner != null) finished();
  else maybeBot();
}

function undo() {
  if (!game || !game.moves.length || thinking) return;
  let moves = game.moves.slice(0, -1);
  if (game.mode === 'bot') while (moves.length && (moves.length % 2 === 0 ? DARK : LIGHT) !== game.human) moves = moves.slice(0, -1);
  if (game.mode === 'bot' && (moves.length % 2 === 0 ? DARK : LIGHT) !== game.human) return;
  botJob++;
  thinking = false;
  hint = null;
  selected = -1;
  state = replay(moves);
  game.moves = state.moves;
  save();
  render();
  maybeBot();
}

function finished() {
  const w = state.winner;
  const won = game.mode === 'bot' && w === game.human;
  if (won) {
    ach.unlock('first-win');
    if (game.level === 'medium') ach.unlock('beat-medium');
    if (game.level === 'hard') ach.unlock('beat-hard');
    ach.add('wins-10');
    ach.add('wins-50');
  }
  if (game.mode === 'local') ach.unlock('friend');
  if (won && (store.get('stats', {})[game.level]?.streak || 0) >= 2) ach.unlock('streak-3');
  if (won && count(state.cells, game.human) === 12) ach.unlock('flawless');
  if (w === 0 || game.mode === 'local' || won) setTimeout(sfx.win, 300);
  else setTimeout(sfx.lose, 300);
  if (game.mode === 'bot') {
    const stats = store.get('stats', {});
    const s = (stats[game.level] ||= { played: 0, won: 0, streak: 0, best: 0 });
    s.played++;
    if (won) {
      s.won++;
      s.streak++;
      s.best = Math.max(s.best, s.streak);
    } else s.streak = 0;
    store.set('stats', stats);
  }
  const current = state;
  setTimeout(() => {
    if (state !== current) return;
    const title = w === 0 ? 'It’s a draw' : game.mode === 'bot' ? (won ? 'You win!' : 'The computer wins') : `${playerName(w)} wins!`;
    const why = w === 0 ? 'Forty moves each without a capture.' : `${playerName(-w)} ${playerName(-w) === 'You' ? 'have' : 'has'} no pieces or no moves left.`;
    openDialog({
      title,
      className: 'result-dialog',
      body: el('div', { class: 'result' }, el('span', { class: `result-disc ${w ? `p${w === DARK ? 1 : 2}` : 'draw'}` }), el('p', {}, why)),
      actions: [
        { label: 'See the board', value: null },
        { label: 'Play again', value: 'again', primary: true },
      ],
    }).then((v) => v === 'again' && start(game));
  }, 1000);
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
  ask({ type: 'move', state: before, level: game.level, timeMs: 1000 }).then((m) => {
    setTimeout(() => {
      if (job !== botJob || state !== before) return;
      thinking = false;
      const legal = m && legalMoves(state).find((x) => sameMove(x, m));
      if (legal) commit(legal);
      else render();
    }, Math.max(0, 600 - (Date.now() - started)));
  });
}

async function showHint() {
  if (!canAct()) return;
  const before = state;
  $('status').textContent = 'Thinking…';
  const result = await ask({ type: 'analyse', state: before, timeMs: 800 });
  if (state !== before) return;
  hint = explain(before, result);
  game.hints++;
  selected = hint.move.from;
  save();
  render();
  announce(hint.text);
}

// ---------- Screen ----------

function statusText() {
  if (state.winner != null) return state.winner === 0 ? 'Draw.' : `${playerName(state.winner)} ${playerName(state.winner) === 'You' ? 'win' : 'wins'}!`;
  if (hint) return hint.text;
  if (thinking) return 'The computer is thinking…';
  const moves = legalMoves(state);
  const must = moves[0]?.captures.length ? ' You must capture.' : '';
  if (game.mode === 'bot') return state.moves.length < 2 ? `Your turn. Tap a piece, then where it goes.${must}` : `Your turn.${must}`;
  return `${playerName(state.turn)} to play.${must}`;
}

function render(fresh = -1) {
  if (!game) return;
  const act = canAct();
  const moves = act ? legalMoves(state) : [];
  const targets = selected >= 0 ? moves.filter((m) => m.from === selected).map((m) => m.path[m.path.length - 1]) : [];
  const last = state.moves[state.moves.length - 1];
  const lastSquares = last ? [last.from, last.path[last.path.length - 1]] : [];
  const movable = new Set(settings.get('showMoves') ? moves.map((m) => m.from) : []);
  for (const sq of document.querySelectorAll('.ck-sq.dark')) {
    const i = Number(sq.dataset.i);
    const v = state.cells[i];
    sq.classList.toggle('sel', i === selected);
    sq.classList.toggle('to', targets.includes(i));
    sq.classList.toggle('last', lastSquares.includes(i));
    sq.classList.toggle('movable', movable.has(i) && i !== selected);
    sq.classList.toggle('hint', !!hint && act && (hint.move.path[hint.move.path.length - 1] === i || hint.move.from === i));
    const want = v ? `${v > 0 ? 'p1' : 'p2'}${Math.abs(v) === 2 ? 'k' : ''}` : '';
    if (sq.dataset.p !== want || i === fresh) {
      sq.dataset.p = want;
      sq.replaceChildren();
      if (v) {
        const piece = el('span', { class: `ck-piece ${v > 0 ? 'p1' : 'p2'} ${i === fresh ? 'fresh' : ''}` });
        if (Math.abs(v) === 2) piece.innerHTML = CROWN;
        sq.append(piece);
      }
    }
    sq.setAttribute('aria-label', `${squareName(i)}${v ? `, ${playerName(Math.sign(v))} ${Math.abs(v) === 2 ? 'king' : 'piece'}` : ''}${targets.includes(i) ? ', move here' : ''}`);
  }
  $('board').classList.toggle('my-turn', act);
  document.querySelector('.ck-board').classList.toggle('flipped', game.mode === 'bot' && game.human === LIGHT);
  $('subtitle').textContent = game.mode === 'bot' ? `vs computer · ${LEVEL_NAMES[game.level]}` : 'Pass and play';
  $('players').replaceChildren(
    ...[DARK, LIGHT].map((p) => {
      const turn = state.winner == null ? state.turn === p : state.winner === p;
      const kings = state.cells.filter((v) => v === 2 * p).length;
      return el('div', { class: `player ${turn ? 'turn' : ''}` }, el('span', { class: `player-disc ${p === DARK ? 'p1' : 'p2'}` }), el('span', { class: 'player-text' }, el('b', {}, playerName(p)), el('small', {}, `${count(state.cells, p)} pieces${kings ? ` · ${kings} king${kings > 1 ? 's' : ''}` : ''}`)));
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
    title: first ? 'Welcome to Checkers' : 'How to play',
    body: el(
      'div',
      { class: 'rules' },
      el('p', {}, 'Pieces move one square diagonally forward onto an empty dark square. Tap a piece, then where it goes.'),
      el('p', {}, el('b', {}, 'Jump'), ' an opponent’s piece by hopping over it to the empty square beyond; it’s captured. If you can jump, you must, and after a jump you keep jumping while you can.'),
      el('p', {}, 'Reach the far row and your piece is crowned a ', el('b', {}, 'king'), ', which moves and jumps backwards too.'),
      el('p', {}, 'Win by capturing every piece, or leaving your opponent with no moves. Dark moves first.'),
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
        const s = stats[lv] || { played: 0, won: 0, best: 0 };
        return el('div', { class: 'field' }, el('span', { class: 'field-label' }, `${LEVEL_NAMES[lv]} computer`), el('div', { class: 'stat-grid' }, stat(s.played, 'Played'), stat(s.played ? `${Math.round((100 * s.won) / s.played)}%` : '–', 'Won'), stat(s.best, 'Best run')));
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
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Pieces'), segmented('discs', [['stones', 'Black & white'], ['bright', 'Coral & gold']], settings.get('discs'), (v) => settings.set('discs', v))),
      toggle('Show which pieces can move', settings.get('showMoves'), (v) => settings.set('showMoves', v)),
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
  else if (e.key === 'Escape') {
    selected = -1;
    render();
  } else return;
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

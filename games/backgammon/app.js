import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { newGame, roll, endTurn, needsRoll, applyStep, legalSteps, turnOver, pipCount, isValidState, count, CHECKERS } from './js/engine.js';
import { choosePlay, LEVELS } from './js/bot.js';
import { Board } from './js/board.js';

const store = makeStore('backgammon');
const settings = makeSettings(store, { theme: null, sound: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
  render();
});

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const RESULT_NAMES = { 1: 'a single game', 2: 'a gammon', 3: 'a backgammon' };
const announce = (text) => ($('announce').textContent = text);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- Sounds ----------

const sfx = {
  roll() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.12, freq: 1200, q: 0.6, gain: 0.3 });
    noiseBurst(ac, { duration: 0.1, freq: 850, q: 0.6, gain: 0.25, when: 0.06 });
  },
  move: () => sounds.place(),
  hit() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.08, freq: 550, q: 0.8, gain: 0.4 });
    tone(ac, { freq: 170, duration: 0.16, gain: 0.1, type: 'triangle' });
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

// game: { mode: 'bot' | 'local', level, human, state, history }
let game = null;
let selected = null; // a legal step's `from`: an index, 'bar', or null
let thinking = false;
let botJob = 0;

const board = new Board($('board-wrap'), { onZone: (zone) => tapZone(zone) });
$('board-wrap').current = () => game; // reachable from browser tests

function playerName(i, { short = false } = {}) {
  if (!game) return i === 0 ? 'Light' : 'Dark';
  if (game.mode === 'bot') return i === game.human ? 'You' : short ? 'Bot' : 'Computer';
  return i === 0 ? 'Light' : 'Dark';
}

const winsText = (i) => (playerName(i) === 'You' ? 'You win!' : `${playerName(i)} wins!`);

function canAct() {
  if (!game || game.state.winner != null || thinking) return false;
  return game.mode !== 'bot' || game.state.turn === game.human;
}

function startLocal({ mode, level = 'medium' }) {
  botJob++;
  thinking = false;
  const human = 0;
  game = { mode, level, human, state: newGame(), history: [] };
  closeResult();
  selected = null;
  save();
  render();
  announce(`New game. ${statusText()}`);
  maybeBot();
}

function save() {
  if (game) store.set('game', { ...game, history: game.history.slice(-200) });
}

const closeResult = () => document.querySelector('dialog.result-dialog')?.closeWith(null);

// ---------- Turn flow ----------

function push() {
  game.history.push(game.state);
}

function afterChange() {
  selected = null;
  save();
  render();
  if (game.state.winner != null) {
    finished();
    return;
  }
  if (turnOver(game.state)) {
    // Cancelled the same way as a bot turn (undo, new game) if it hasn't fired yet.
    const job = botJob;
    setTimeout(() => job === botJob && passTurn(), 550);
  } else {
    maybeBot();
  }
}

function passTurn() {
  if (!game || game.state.winner != null) return;
  push();
  game.state = endTurn(game.state);
  save();
  render();
  maybeBot();
}

function doRoll() {
  if (!canAct() || !needsRoll(game.state)) return;
  push();
  game.state = roll(game.state);
  sfx.roll();
  afterChange();
}

function commitStep(step) {
  if (!canAct()) return;
  const hit = step.to !== 'off' && count(game.state, 1 - game.state.turn, step.to) === 1;
  push();
  game.state = applyStep(game.state, step);
  if (hit) sfx.hit();
  else sfx.move();
  afterChange();
}

// ---------- Computer player ----------

async function maybeBot() {
  if (!game || game.mode !== 'bot' || game.state.winner != null || game.state.turn === game.human) return;
  const job = ++botJob;
  thinking = true;
  render();
  await delay(400);
  if (job !== botJob) return;
  if (needsRoll(game.state)) {
    push();
    game.state = roll(game.state);
    sfx.roll();
    save();
    render();
    await delay(550);
    if (job !== botJob) return;
  }
  const steps = game.state.winner == null ? choosePlay(game.state, game.level) : [];
  for (const step of steps) {
    if (job !== botJob) return;
    const hit = step.to !== 'off' && count(game.state, 1 - game.state.turn, step.to) === 1;
    push();
    game.state = applyStep(game.state, step);
    if (hit) sfx.hit();
    else sfx.move();
    save();
    render();
    if (game.state.winner != null) break;
    await delay(500);
  }
  if (job !== botJob) return;
  thinking = false;
  if (game.state.winner != null) {
    finished();
    return;
  }
  push();
  game.state = endTurn(game.state);
  save();
  render();
  maybeBot();
}

// ---------- Input ----------

function tapZone(zone) {
  if (!canAct() || needsRoll(game.state)) return;
  const s = game.state;
  const steps = legalSteps(s);
  if (!steps.length) return;
  const mover = s.turn;
  const from = zoneToFrom(zone, mover);
  if (selected != null) {
    if (from != null && from === selected) {
      selected = null; // tap the same checker again to deselect
      render();
      return;
    }
    const dest = zoneToDest(zone, mover);
    if (dest !== undefined) {
      const step = steps.find((st) => st.from === selected && st.to === dest);
      if (step) {
        commitStep(step);
        return;
      }
    }
    if (from != null && steps.some((st) => st.from === from)) {
      selected = from;
      render();
      return;
    }
    sfx.invalid();
    selected = null;
    render();
    return;
  }
  if (from != null && steps.some((st) => st.from === from)) {
    selected = from;
    render();
  }
}

function zoneToFrom(zone, mover) {
  if (zone === `bar${mover}`) return 'bar';
  if (typeof zone === 'number') return zone;
  return null;
}

function zoneToDest(zone, mover) {
  if (zone === `off${mover}`) return 'off';
  if (typeof zone === 'number') return zone;
  return undefined;
}

// ---------- Undo ----------

function undo() {
  if (!game || !game.history.length) return;
  botJob++;
  thinking = false;
  if (game.mode === 'bot') {
    do game.state = game.history.pop();
    while (game.history.length && game.state.turn !== game.human);
  } else {
    game.state = game.history.pop();
  }
  selected = null;
  save();
  render();
  announce(`Undone. ${statusText()}`);
  maybeBot();
}

// ---------- Result ----------

function finished() {
  const w = game.state.winner;
  const mine = game.mode === 'local' || w === game.human;
  if (mine) sfx.win();
  else sfx.lose();
  if (game.mode === 'bot') {
    const stats = store.get('stats', {});
    const s = (stats[game.level] ||= { played: 0, won: 0 });
    s.played++;
    if (w === game.human) s.won++;
    store.set('stats', stats);
  }
  setTimeout(() => {
    if (!game || game.state.winner !== w) return;
    openDialog({
      title: winsText(w),
      className: 'result-dialog',
      body: el(
        'div',
        { class: 'result' },
        el('span', { class: 'result-checker', style: `--c: var(--checker-${w})` }),
        el('p', {}, resultLine(w)),
      ),
      actions: [{ label: 'See the board', value: null }, { label: 'Play again', value: 'again', primary: true }],
    }).then((v) => v === 'again' && startLocal(game));
  }, 700);
}

function resultLine(w) {
  const kind = RESULT_NAMES[game.state.result] || 'a single game';
  if (game.mode === 'bot' && w === game.human) {
    const s = store.get('stats', {})[game.level];
    return `You won ${kind} against the ${LEVEL_NAMES[game.level].toLowerCase()} computer.${s ? ` Wins at this level: ${s.won} of ${s.played}.` : ''}`;
  }
  if (game.mode === 'bot') return `The computer won ${kind}.`;
  return `${playerName(w)} won ${kind}.`;
}

// ---------- Screen ----------

function statusText() {
  if (!game) return '';
  const s = game.state;
  if (s.winner != null) return winsText(s.winner);
  if (thinking) return `${playerName(s.turn)} is thinking…`;
  const name = playerName(s.turn);
  const whose = name === 'You' ? 'Your' : `${name}’s`;
  if (needsRoll(s)) return `${whose} turn. ${name === 'You' || game.mode === 'local' ? 'Tap the dice to roll.' : 'Rolling…'}`;
  if (!legalSteps(s).length) return `${whose} turn. No legal moves — turn will pass.`;
  return `${whose} turn. Tap a checker, then where to move it.`;
}

function subtitle() {
  if (!game) return '';
  return game.mode === 'bot' ? `vs computer · ${LEVEL_NAMES[game.level]}` : 'Pass and play';
}

function renderPlayers() {
  const s = game.state;
  $('players').replaceChildren(
    ...[0, 1].map((i) => {
      const turn = s.winner == null ? s.turn === i : s.winner === i;
      return el(
        'div',
        { class: `player p${i} ${turn ? 'turn' : ''}` },
        el('span', { class: 'player-dot', 'aria-hidden': 'true' }),
        el(
          'span',
          { class: 'player-text' },
          el('b', {}, playerName(i, { short: true })),
          el('small', {}, `Pip ${pipCount(s, i)} · Off ${s.off[i]}/${CHECKERS}`),
        ),
      );
    }),
  );
}

function renderDice() {
  const s = game.state;
  const [a, b] = s.rolled || [];
  const shown = s.rolled ? (a === b ? [a, a, a, a] : [a, b]) : [];
  const remaining = s.dice.slice();
  $('dice').replaceChildren(
    ...shown.map((v) => {
      const idx = remaining.indexOf(v);
      const used = idx === -1;
      if (!used) remaining.splice(idx, 1);
      return die(v, used);
    }),
  );
  const showRoll = canAct() && needsRoll(s);
  $('roll-btn').hidden = !showRoll;
  $('roll-btn').disabled = !showRoll;
}

function die(value, used) {
  const pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[value] || [];
  const cells = Array.from({ length: 9 }, (_, i) => el('i', pips.includes(i) ? {} : { style: 'background:transparent' }));
  return el('div', { class: `die ${used ? 'used' : ''}` }, cells);
}

function render() {
  if (!game) return;
  const s = game.state;
  const act = canAct() && !needsRoll(s);
  const steps = act ? legalSteps(s) : [];
  const sources = new Set(steps.map((st) => st.from));
  const targets = selected != null ? new Set(steps.filter((st) => st.from === selected).map((st) => st.to)) : new Set();
  const points = Array.from({ length: 24 }, (_, i) => ({ owner: s.board[i] > 0 ? 0 : s.board[i] < 0 ? 1 : null, count: Math.abs(s.board[i]) }));
  board.render({ points, bar: s.bar, off: s.off, source: selected, sources, targets, mover: s.turn, interactive: act });
  $('board-wrap').classList.toggle('my-turn', act);
  $('subtitle').textContent = subtitle();
  renderPlayers();
  renderDice();
  setStatus(statusText());
  $('undo-btn').disabled = !game.history?.length;
}

function setStatus(text) {
  $('status').textContent = text;
}

// ---------- Dialogs ----------

function newGameDialog() {
  const setup = { mode: 'bot', level: 'medium', ...store.get('setup') };
  const rows = {};
  const row = (key, label, control) => (rows[key] = el('div', { class: 'field' }, el('span', { class: 'field-label' }, label), control));
  const update = () => (rows.level.hidden = setup.mode !== 'bot');
  const set = (key) => (v) => {
    setup[key] = v;
    update();
  };
  const body = el(
    'div',
    { class: 'setup' },
    row('mode', 'Play against', segmented('mode', [['bot', 'Computer'], ['local', 'Pass & play']], setup.mode, set('mode'))),
    row('level', 'Computer', segmented('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], setup.level, set('level'))),
  );
  update();
  openDialog({ title: 'New game', body, actions: [{ label: 'Start', value: 'start', primary: true }] }).then((v) => {
    if (v !== 'start') return;
    store.set('setup', setup);
    startLocal(setup);
  });
}

function rulesDialog(first = false) {
  return openDialog({
    title: first ? 'Welcome to Backgammon' : 'How to play',
    body: el(
      'div',
      { class: 'rules' },
      el('p', {}, 'Race all 15 of your checkers around the board and into your home, then bear them off before your opponent does.'),
      el(
        'ul',
        {},
        el('li', {}, el('b', {}, 'Roll'), ' — tap the dice at the start of your turn.'),
        el('li', {}, el('b', {}, 'Move'), ' — tap a glowing checker, then tap where to move it. Doubles play four times.'),
        el('li', {}, 'Land on a lone enemy checker to hit it onto the bar; it must re-enter before moving anything else.'),
        el('li', {}, 'Two or more of your checkers on a point block it — your opponent can’t land there.'),
        el('li', {}, 'Once every checker of yours is home, bear them off. Win by a single game, a gammon (they bore off none) or a backgammon (…and still have one on the bar or in your home).'),
      ),
    ),
    actions: [{ label: first ? 'Play' : 'Got it', value: 'ok', primary: true }],
  });
}

function settingsDialog() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
}

// ---------- Wiring ----------

$('new-btn').addEventListener('click', newGameDialog);
$('undo-btn').addEventListener('click', undo);
$('rules-btn').addEventListener('click', () => rulesDialog());
$('settings-btn').addEventListener('click', settingsDialog);
$('roll-btn').addEventListener('click', doRoll);
$('dice').addEventListener('click', doRoll);
for (const [id, name] of [['rules-btn', 'help'], ['settings-btn', 'settings']]) {
  $(id).prepend(icon(name, { size: 22 }));
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === 'z' || e.key === 'u') undo();
  else if (e.key === 'n') newGameDialog();
  else if (e.key === ' ' || e.key === 'Enter') doRoll();
});

function resume() {
  const saved = store.get('game');
  if (saved && isValidState(saved.state) && Array.isArray(saved.history) && saved.history.every(isValidState) && (saved.mode === 'bot' || saved.mode === 'local')) {
    game = saved;
    render();
    maybeBot();
    return;
  }
  startLocal({ mode: 'bot', level: 'medium' });
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

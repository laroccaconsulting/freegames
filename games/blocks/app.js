import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { isHallowsSeason } from './core/hallows.js';
import { applyTheme, openDialog, toggle, el, toast, offerHallows } from './core/ui.js';
import { setSoundEnabled } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { randomSeed } from './core/rng.js';
import { dateKey, dailyNumber, dailyStreak, parseHash, buildHash, scoreRating, scoreSquares } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { PIECES, pieceAt, emptyBoard, place, fitsAnywhere, sweep } from './js/rules.js';
import { botScore, bestMove } from './js/bot.js';
import { THEMES, themeById } from './js/themes.js';
import { View } from './js/render.js';
import { sfx, setSoundTheme } from './js/sfx.js';

const LAUNCH_DAY = '2026-09-24';
const DAILY_PIECES = 90;

const store = makeStore('blocks');
const settings = makeSettings(store, { skin: null, sound: true, vibrate: true, effects: true });
// No theme picked yet: follow the season (Hallows in autumn).
const skinId = () => settings.get('skin') ?? (isHallowsSeason() ? 'hallows' : 'neon');
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let game = null;

const view = new View($('canvas'), $('stage'), {
  onPlace: (slot, row, col) => play(slot, row, col),
  onInvalid: () => sfx.invalid(),
  onPickUp: () => sfx.pickUp(),
});
$('canvas').view = view; // reachable from browser tests

// ---------- Settings ----------

function applySettings() {
  const theme = themeById(skinId());
  document.body.dataset.skin = theme.id;
  applyTheme(theme.id === 'hallows' ? 'hallows' : theme.dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.id === 'hallows' ? '#120c22' : theme.dark ? '#0d0724' : '#f6e3c3');
  setSoundEnabled(settings.get('sound'));
  setSoundTheme(theme);
  view.setTheme(theme);
  document.body.classList.toggle('no-effects', !settings.get('effects') || reducedMotion.matches);
  view.setOptions({ effects: settings.get('effects'), reduced: reducedMotion.matches });
}
settings.onChange(applySettings);
reducedMotion.addEventListener?.('change', applySettings);
applySettings();
offerHallows(store, skinId(), () => settings.set('skin', 'hallows'));

const announce = (text) => ($('announce').textContent = text);
const vibrate = (pattern) => {
  if (settings.get('vibrate') && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not allowed */
    }
  }
};
const fmt = (n) => n.toLocaleString();

// ---------- Progress ----------

const records = () => ({ best: 0, zenBest: 0, games: 0, ...store.get('records') });
const dailyLog = () => store.get('daily', {});
const today = () => dateKey();

// The daily seed is the first one on which the bot places all its pieces,
// so every daily can be finished. Its score is the target.
function dailySetup(date) {
  const cached = store.get('dailyTarget');
  if (cached?.date === date) return cached;
  for (let k = 0; ; k++) {
    const seed = `blocks:daily:${date}:${k}`;
    const run = botScore(seed, DAILY_PIECES);
    if (run.complete) {
      const setup = { date, seed, target: run.score };
      store.set('dailyTarget', setup);
      return setup;
    }
  }
}

// ---------- Games ----------

function newGame(mode, { date = null, challenge = null } = {}) {
  let seed;
  let target = null;
  if (mode === 'daily') {
    const setup = dailySetup(date);
    seed = setup.seed;
    target = setup.target;
  } else seed = `blocks:${mode}:${randomSeed()}`;
  game = { mode, date, seed, target, challenge, n: 0, hand: [null, null, null], board: emptyBoard(), score: 0, streak: 0, done: false, undo: [] };
  view.reset();
  view.setBoard(game.board);
  deal();
  begin();
}

function begin() {
  view.reset();
  view.setBoard(game.board);
  view.setHand(game.hand, nextPieces(), { deal: true });
  updateHud(true);
  save();
  const c = game.challenge;
  $('challenge').hidden = !c;
  if (c) $('challenge').replaceChildren(icon('flag', { size: 16 }), ` Beat ${fmt(c)} points`);
  $('undo-btn').hidden = $('hint-btn').hidden = game.mode !== 'zen';
  announce(`${titleText()}. Drag pieces onto the board, or tap a piece and then a square.`);
}

const save = () => game && store.set('game', game);
const limit = () => (game.mode === 'daily' ? DAILY_PIECES : Infinity);

function nextPieces() {
  return [0, 1, 2].map((k) => (game.n + k < limit() ? pieceAt(game.seed, game.n + k) : null));
}

// Deals a fresh hand of three once the last one is used up.
function deal() {
  if (game.hand.some((h) => h != null)) return false;
  if (game.n >= limit()) return false;
  game.hand = nextPieces();
  game.n += 3;
  return true;
}

function titleText() {
  if (!game) return 'Blocks';
  if (game.mode === 'daily') return `Daily #${dailyNumber(game.date, LAUNCH_DAY)}`;
  return game.mode === 'zen' ? 'Zen' : 'Classic';
}

let shownScore = 0;
function updateHud(snap = false) {
  $('title').textContent = titleText();
  const sub = $('subtitle');
  if (game.mode === 'daily') {
    const left = Math.max(0, DAILY_PIECES - game.n + game.hand.filter((h) => h != null).length);
    const streak = dailyStreak(dailyLog(), today());
    sub.textContent = `${left} pieces left${streak ? ` · ${streak}-day streak` : ''}`;
  } else sub.textContent = game.mode === 'zen' ? 'No game over — take your time' : 'Endless';
  $('target-label').textContent = game.mode === 'daily' ? 'Bot' : 'Best';
  const r = records();
  $('target').textContent = fmt(game.mode === 'daily' ? game.target : game.mode === 'zen' ? r.zenBest : r.best);
  // Roll the score up rather than jumping.
  if (snap) shownScore = game.score;
  const el_ = $('score');
  const roll = () => {
    if (shownScore === game.score) return;
    shownScore += Math.max(1, Math.ceil((game.score - shownScore) / 6));
    if (shownScore > game.score) shownScore = game.score;
    el_.textContent = fmt(shownScore);
    requestAnimationFrame(roll);
  };
  el_.textContent = fmt(shownScore);
  roll();
  const beating = game.mode === 'daily' && game.score > game.target;
  el_.parentElement.classList.toggle('ahead', beating);
  $('undo-btn').disabled = !game.undo.length || game.done;
}

function play(slot, row, col) {
  if (!game || game.done || game.hand[slot] == null) return;
  const piece = PIECES[game.hand[slot]];
  const result = place(game.board, piece, row, col, game.streak);
  if (!result) {
    sfx.invalid();
    return;
  }
  if (game.mode === 'zen') game.undo = [...game.undo.slice(-30), { board: game.board, hand: game.hand.slice(), n: game.n, score: game.score, streak: game.streak }];
  game.board = result.board;
  game.hand[slot] = null;
  game.score += result.points;
  game.streak = result.streak;
  if (game.mode === 'zen' && game.score > records().zenBest) store.set('records', { ...records(), zenBest: game.score });
  view.placed(slot, piece, row, col, result);
  sfx.place(piece.cells.length);
  if (result.lines) {
    sfx.clear(result.lines, result.streak - 1);
    vibrate(result.lines > 1 ? [12, 30, 20] : 14);
    const call = result.lines < 2 ? '' : ['DOUBLE!', 'TRIPLE!', 'QUAD!'][result.lines - 2] || 'MEGA!';
    if (call) view.float(call, { big: true });
    if (result.streak > 1) setTimeout(() => view.float(`STREAK ×${result.streak}`, { big: true, color: view.theme.dark ? '#7ef7ff' : '#0072b2' }), 260);
    setTimeout(() => view.float(`+${result.points}`), call ? 120 : 0);
    announce(`Cleared ${result.lines} line${result.lines > 1 ? 's' : ''}. ${result.points} points.`);
  }
  if (deal()) {
    sfx.deal();
    view.setHand(game.hand, nextPieces(), { deal: true });
  } else view.next = nextPieces();
  updateHud();
  save();
  afterMove();
}

function afterMove() {
  const hand = game.hand.filter((h) => h != null);
  if (!hand.length) {
    // Daily: all pieces placed.
    if (game.mode === 'daily' && game.n >= DAILY_PIECES) finish(true);
    return;
  }
  if (hand.some((id) => fitsAnywhere(game.board, PIECES[id]))) return;
  if (game.mode === 'zen') {
    // No game over: clear the fullest row and column until something fits.
    setTimeout(() => {
      let board = game.board;
      const cleared = [];
      do {
        const s = sweep(board);
        board = s.board;
        cleared.push(...s.cleared);
      } while (!hand.some((id) => fitsAnywhere(board, PIECES[id])));
      game.board = board;
      view.clearCells(cleared);
      sfx.sweep();
      save();
    }, 450);
    return;
  }
  finish(false);
}

async function finish(complete) {
  game.done = true;
  save();
  const r = records();
  r.games++;
  const prevBest = r.best;
  if (game.mode === 'classic') r.best = Math.max(r.best, game.score);
  store.set('records', r);
  if (game.mode === 'daily') {
    const log = dailyLog();
    if (!log[game.date]) store.set('daily', { ...log, [game.date]: { score: game.score, target: game.target, complete } });
  }
  updateHud();
  const beat = game.mode === 'daily' ? game.score > game.target : game.score > prevBest && prevBest > 0;
  if (complete || beat) {
    await view.celebrate({ onJackpot: () => sfx.jackpot() });
  } else {
    view.gameOver();
    sfx.over();
    announce('No room for any piece. Game over.');
    await new Promise((res) => setTimeout(res, 1100));
  }
  openResults(complete, prevBest);
}

function resultRating(prevBest) {
  if (game.mode === 'daily') return scoreRating(game.score, game.target);
  if (game.score > prevBest) return { label: prevBest ? 'New best!' : 'First score!', emoji: '🏆', icon: 'trophy', tier: 4 };
  return scoreRating(game.score, prevBest);
}

function shareLine() {
  const r = resultRating(records().best);
  if (game.mode !== 'daily') return { text: `Blocks ${r.emoji}\n${fmt(game.score)} points`, url: location.origin + location.pathname };
  const text = `Blocks · Daily #${dailyNumber(game.date, LAUNCH_DAY)} ${r.emoji}\n${fmt(game.score)} pts · bot ${fmt(game.target)}\n${scoreSquares(game.score, game.target)}`;
  return { text, url: location.origin + location.pathname + buildHash({ d: game.date, m: game.score }) };
}

function openResults(complete, prevBest) {
  const r = resultRating(prevBest);
  const notes = [];
  if (game.mode === 'daily') {
    notes.push(note(complete ? 'All 90 pieces placed!' : 'Ran out of room before the last piece.', { win: complete, icon: complete ? 'check' : 'blocks' }));
    const streak = dailyStreak(dailyLog(), today());
    if (streak) notes.push(note(`${streak}-day streak`, { icon: 'flame' }));
  }
  if (game.challenge) {
    const diff = game.score - Number(game.challenge);
    notes.push(note(diff > 0 ? `You beat your friend by ${fmt(diff)}!` : diff === 0 ? 'Tied with your friend' : `Your friend scored ${fmt(game.challenge)}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
  }
  const other = game.mode === 'daily' ? { label: 'Bot', value: game.target } : { label: 'Best', value: Math.max(prevBest, game.score) };
  showResults({
    title: titleText(),
    rating: r,
    reels: [{ label: 'Score', value: game.score }, other],
    squares: game.mode === 'daily' ? scoreSquares(game.score, game.target) : null,
    notes,
    share: shareLine,
    actions:
      game.mode === 'daily'
        ? [
            { label: 'Replay', value: 'replay' },
            { label: 'Classic →', value: 'classic', primary: true },
          ]
        : [{ label: 'Play again', value: 'again', primary: true }],
    sounds: { tick: sfx.tick, stamp: sfx.stamp },
    reduced: reducedMotion.matches,
  }).then((choice) => {
    if (choice === 'replay') newGame('daily', { date: game.date, challenge: game.challenge });
    else if (choice === 'classic') newGame('classic');
    else if (choice === 'again') newGame(game.mode);
  });
}

function undo() {
  if (!game || game.mode !== 'zen' || !game.undo.length) return;
  const prev = game.undo.pop();
  Object.assign(game, prev);
  view.reset();
  view.setBoard(game.board);
  view.setHand(game.hand, nextPieces());
  updateHud(true);
  save();
}

function hint() {
  if (!game || game.mode !== 'zen') return;
  const move = bestMove(game.board, game.hand, game.streak);
  if (!move) return;
  view.select(move.slot);
  view.cursor = { row: move.row, col: move.col };
  view.moveCursor(0, 0);
  announce('Hint shown. Tap the glowing spot, or press Enter.');
}

async function newGameConfirm() {
  if (game && !game.done && game.score > 0 && game.mode !== 'zen') {
    const ok = await openDialog({
      title: 'Start a new game?',
      body: el('p', {}, 'This game will end.'),
      actions: [
        { label: 'Cancel', value: false },
        { label: 'New game', value: true, primary: true },
      ],
    });
    if (!ok) return;
  }
  newGame(game?.mode === 'daily' ? 'classic' : game?.mode || 'classic');
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = today();
  const done = dailyLog()[key];
  const streak = dailyStreak(dailyLog(), key);
  const r = records();
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  const body = el('div', {},
    el('div', { class: 'menu-list' },
      menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`,
        done ? `Scored ${fmt(done.score)} (bot ${fmt(done.target)})${streak ? ` · ${streak}-day streak` : ''}` : `90 pieces, same for everyone. Beat the bot!${streak ? ` · ${streak}-day streak` : ''}`,
        go(() => newGame('daily', { date: key }))),
      menuCard('infinity', 'Classic', r.best ? `Endless · best ${fmt(r.best)}` : 'Endless — how long can you last?', go(() => newGame('classic'))),
      menuCard('leaf', 'Zen', 'No game over, undo and hints', go(() => newGame('zen'))),
    ),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openThemes) }, withIcon('palette', 'Themes')),
      el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings'))),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openStats) }, withIcon('chart', 'Stats')),
      el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Blocks', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openThemes() {
  const current = skinId();
  openDialog({
    title: 'Themes',
    body: el('div', {},
      el('div', { class: 'theme-grid', role: 'radiogroup' },
        THEMES.map((t) =>
          el('label', { class: 'theme-card' },
            el('input', { type: 'radio', name: 'skin', value: t.id, checked: t.id === current, onchange: () => settings.set('skin', t.id), 'aria-label': t.name }),
            el('span', { class: `face ${t.dark ? 'dark' : 'light'}`, style: `background:${t.preview}` },
              el('b', {}, t.name),
              el('span', { class: 'dots' }, t.colors.slice(0, 6).map((c) => el('i', { style: `background:${c}` }))))))),
      el('p', { class: 'muted' }, 'Every theme has its own blocks, sounds and effects.')),
  });
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {},
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Vibration', settings.get('vibrate'), (v) => settings.set('vibrate', v), 'On phones that support it'),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Glow, particles, shake and moving backgrounds')),
  });
}

function openStats() {
  const r = records();
  const log = dailyLog();
  const days = Object.keys(log);
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
  openDialog({
    title: 'Stats',
    body: el('div', { class: 'stat-grid' },
      stat(fmt(r.best), 'Best'),
      stat(fmt(r.zenBest), 'Zen best'),
      stat(r.games, 'Games'),
      stat(days.length, 'Dailies'),
      stat(dailyStreak(log, today()), 'Streak'),
      stat(days.filter((d) => log[d].score > log[d].target).length, 'Bot beaten')),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    className: 'help',
    body: el('div', {},
      el('p', {}, 'Drag a piece onto the board — or tap a piece, then tap where it should go. Fill a whole row or column to clear it.'),
      el('p', {}, 'Clearing several lines at once, or on placements in a row (a streak), scores much more.'),
      el('ul', {},
        el('li', {}, el('b', {}, 'Next'), ' shows your following three pieces, so you can plan.'),
        el('li', {}, el('b', {}, 'Daily'), ': 90 pieces in the same order for everyone. A bot played them first — beat its score.'),
        el('li', {}, el('b', {}, 'Zen'), ': no game over. When you are stuck, the fullest lines clear themselves.')),
      el('p', { class: 'muted' }, 'Keys: 1–3 pick a piece, arrows move it, Enter places.'),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.')),
  });
}

// ---------- Controls ----------

$('new-btn').addEventListener('click', newGameConfirm);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', hint);
$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.altKey || e.ctrlKey) return;
  const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (/^[1-3]$/.test(e.key)) {
    view.select(Number(e.key) - 1);
    if (!view.cursor) view.moveCursor(0, 0);
  } else if (arrows[e.key]) view.moveCursor(...arrows[e.key]);
  else if (e.key === 'Enter' || e.key === ' ') view.placeAtCursor();
  else if (e.key === 'z' || e.key === 'Z') undo();
  else return;
  e.preventDefault();
});

addHubLink();

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// ---------- Start ----------

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.d)) return null;
  return { date: h.d > today() ? today() : h.d, challenge: /^\d+$/.test(h.m || '') ? Number(h.m) : null };
}

const link = fromLink();
const saved = store.get('game');
if (link) newGame('daily', link);
else if (saved && !saved.done && saved.board) {
  game = saved;
  begin();
} else newGame('classic');

window.addEventListener('hashchange', () => {
  const next = fromLink();
  if (next) newGame('daily', next);
});

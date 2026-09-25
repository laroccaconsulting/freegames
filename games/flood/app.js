import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares, hashSeed } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { newBoard, solve, flood, region, done, levelSpec } from './js/flood.js';

const LAUNCH_DAY = '2026-09-25';
const DAILY = { n: 14, colors: 6 };
const store = makeStore('flood');
const settings = makeSettings(store, { theme: null, sound: true, symbols: false });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const NAMES = ['red', 'yellow', 'green', 'blue', 'purple', 'orange'];
const SYMBOLS = ['●', '▲', '■', '◆', '★', '♥'];

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
  flood(gained, move) {
    const ac = audio();
    if (!ac) return;
    const base = 330 * 2 ** ((move % 12) / 12);
    for (let k = 0; k < Math.min(5, 1 + Math.floor(gained / 6)); k++) tone(ac, { freq: base * (1 + k * 0.25), duration: 0.16, gain: 0.045, when: k * 0.05 });
  },
  none: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Puzzles ----------

let worker = null;
const jobs = new Map();
let nextId = 1;
function make(n, colors, seed) {
  return new Promise((resolve) => {
    const local = () => {
      const b = newBoard(n, colors, seed);
      return { board: b, par: solve(b.n, b.cells).length };
    };
    if (worker === null) {
      try {
        worker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          jobs.get(data.id)?.(data.result);
          jobs.delete(data.id);
        };
        worker.onerror = () => (worker = false);
      } catch {
        worker = false;
      }
    }
    if (!worker) {
      setTimeout(() => resolve(local()), 20);
      return;
    }
    const id = nextId++;
    jobs.set(id, resolve);
    worker.postMessage({ id, n, colors, seed });
  });
}

// game: { mode: 'daily' | 'level', date | level, n, colors, start, cells, history, par, done, challenge }
let game = null;
let token = 0;
const progress = () => ({ level: 1, best: {}, solved: 0, perfect: 0, ...store.get('progress') });
const specId = (s) => (s.mode === 'daily' ? `daily:${s.date}` : `level:${s.level}`);
const save = () => game && store.set('game', game);
const titleText = () => (!game ? 'Flood' : game.mode === 'daily' ? `Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : `Level ${game.level}`);

async function load(spec, { challenge = null, fresh = false } = {}) {
  const t = ++token;
  const saved = store.get('game');
  if (!fresh && saved && specId(saved) === specId(spec) && !saved.done) {
    game = { ...saved, challenge: challenge ?? saved.challenge };
    build();
    return;
  }
  const { n, colors } = spec.mode === 'daily' ? DAILY : levelSpec(spec.level);
  const seed = spec.mode === 'daily' ? dailySeed('flood', spec.date) : hashSeed(`flood:${spec.level}`);
  const cacheKey = `puz:${specId(spec)}`;
  $('stage').replaceChildren(el('p', { class: 'loading' }, 'Mixing colours…'));
  const made = store.get(cacheKey) || (await make(n, colors, seed));
  if (t !== token) return;
  store.set(cacheKey, made);
  game = { ...spec, n, colors, start: made.board.cells, cells: made.board.cells, history: [], par: made.par, done: false, challenge };
  save();
  build();
  announce(`${titleText()}. ${n} by ${n}, ${colors} colours, par ${game.par}.`);
}

// ---------- Moves ----------

function pick(color) {
  if (!game || game.done || game.cells[0] === color) {
    if (game && !game.done) sfx.none();
    return;
  }
  const before = region(game.n, game.cells);
  const next = flood(game.n, game.cells, color);
  const after = region(game.n, next);
  if (after.length === before.length) {
    // Repainting without gaining anything still counts; say so kindly.
    toast('That colour doesn’t touch your area, so nothing new joined.', { duration: 2000 });
  }
  game.history = [...game.history, game.cells];
  game.cells = next;
  save();
  sfx.flood(after.length - before.length, game.history.length);
  paint(new Set(after), new Set(before));
  if (done(next)) win();
}

function undo() {
  if (!game || !game.history.length || game.done) return;
  game.cells = game.history[game.history.length - 1];
  game.history = game.history.slice(0, -1);
  save();
  paint();
}

function restart() {
  if (!game || !game.history.length) return;
  if (game.done) return load(specOf(game), { fresh: true, challenge: game.challenge });
  game.cells = game.start;
  game.history = [];
  save();
  paint();
}

const specOf = (g) => (g.mode === 'daily' ? { mode: 'daily', date: g.date } : { mode: 'level', level: g.level });

function hint() {
  if (!game || game.done) return;
  const moves = solve(game.n, game.cells, { width: 120 });
  if (!moves?.length) return;
  game.hints = (game.hints || 0) + 1;
  save();
  const c = moves[0];
  document.querySelector(`.swatch-btn[data-c="${c}"]`)?.classList.add('hinted');
  toast(`Try ${NAMES[c]}: you can finish in ${moves.length} from here.`, { duration: 3500 });
}

// ---------- Winning ----------

function resultRating() {
  const r = rating(game.history.length, game.par);
  if (game.hints) return { ...r, label: 'Flooded with help', emoji: '💡', icon: 'bulb', tier: Math.min(r.tier, 1) };
  return r;
}

function win() {
  game.done = true;
  const moves = game.history.length;
  const r = resultRating();
  const p = progress();
  p.solved++;
  if (r.tier >= 3) p.perfect++;
  if (game.mode === 'level') {
    const prev = p.best[game.level];
    if (!prev || moves < prev) p.best[game.level] = moves;
    if (game.level === p.level) p.level++;
  } else {
    const log = store.get('daily', {});
    if (!log[game.date]) store.set('daily', { ...log, [game.date]: { moves, par: game.par, hints: game.hints || 0 } });
  }
  store.set('progress', p);
  save();
  sfx.win();
  document.querySelector('.fl-grid')?.classList.add('won');
  const notes = [];
  if (game.mode === 'daily') {
    const s = dailyStreak(store.get('daily', {}), dateKey());
    if (s) notes.push(note(`${s}-day streak`, { icon: 'flame' }));
  }
  if (game.challenge) {
    const diff = Number(game.challenge) - moves;
    notes.push(note(diff > 0 ? `You beat your friend by ${diff}!` : diff === 0 ? 'Tied with your friend' : `Your friend did it in ${game.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
  }
  const current = game;
  setTimeout(
    () =>
      showResults({
        title: titleText(),
        rating: r,
        reels: [{ label: 'Moves', value: moves }, { label: 'Par', value: game.par }],
        squares: squares(moves, game.par),
        notes,
        share: () => ({
          text: `Flood · ${titleText()} ${r.emoji}\n${moves} moves · par ${game.par} (${overText(moves - game.par)})\n${squares(moves, game.par)}`,
          url: location.origin + location.pathname + buildHash(game.mode === 'daily' ? { d: game.date, m: moves } : { l: game.level, m: moves }),
        }),
        actions: [
          { label: 'Replay', value: 'replay' },
          { label: game.mode === 'level' ? `Level ${game.level + 1} →` : `Level ${progress().level} →`, value: 'next', primary: true },
        ],
        reduced: reduced.matches,
      }).then((v) => {
        if (current !== game) return;
        if (v === 'next') load({ mode: 'level', level: game.mode === 'level' ? game.level + 1 : progress().level });
        else if (v === 'replay') load(specOf(game), { fresh: true, challenge: game.challenge });
      }),
    reduced.matches ? 200 : 900,
  );
}

// ---------- Screen ----------

function build() {
  const grid = el('div', { class: 'fl-grid', style: `--n: ${game.n}`, role: 'grid', 'aria-label': 'Board' });
  for (let i = 0; i < game.n * game.n; i++) grid.append(el('button', { class: 'fl-cell', dataset: { i }, tabindex: -1, onclick: () => pick(game.cells[i]) }));
  const swatches = el('div', { class: 'swatches-row' });
  for (let c = 0; c < game.colors; c++) swatches.append(el('button', { class: `swatch-btn c${c}`, dataset: { c }, onclick: () => pick(c), 'aria-label': NAMES[c] }, el('span', { class: 'sym' }, SYMBOLS[c]), el('small', {}, c + 1)));
  $('stage').replaceChildren(el('div', { class: 'grid-wrap' }, grid), swatches);
  paint();
}

function paint(joined = null, had = null) {
  const cells = game.cells;
  const reg = new Set(region(game.n, cells));
  const grid = document.querySelector('.fl-grid');
  grid.classList.toggle('won', game.done);
  for (const cell of grid.children) {
    const i = Number(cell.dataset.i);
    const c = cells[i];
    cell.className = `fl-cell c${c} ${reg.has(i) ? 'mine' : ''}`;
    cell.textContent = SYMBOLS[c];
    if (joined && joined.has(i) && !had.has(i) && !reduced.matches) {
      const d = (Math.floor(i / game.n) + (i % game.n)) * 12;
      cell.style.setProperty('--d', `${d}ms`);
      cell.classList.add('pop');
    }
  }
  for (const b of document.querySelectorAll('.swatch-btn')) {
    b.classList.remove('hinted');
    b.classList.toggle('current', Number(b.dataset.c) === cells[0]);
  }
  const moves = game.history.length;
  $('moves').textContent = moves;
  $('moves').parentElement.classList.toggle('over', moves > game.par);
  $('par').textContent = game.par;
  $('title').textContent = titleText();
  $('subtitle').textContent = `${game.n}×${game.n} · ${game.colors} colours · ${Math.round((100 * reg.size) / (game.n * game.n))}% flooded`;
  $('undo-btn').disabled = !moves || game.done;
  const ch = $('challenge');
  ch.hidden = !game.challenge;
  if (game.challenge) ch.replaceChildren(icon('flag', { size: 16 }), ` Beat ${game.challenge} moves · par is ${game.par}`);
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = dateKey();
  const p = progress();
  const done2 = store.get('daily', {})[key];
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  openDialog({
    title: 'Flood',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'menu-list' },
        menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, done2 ? `Flooded in ${done2.moves} (par ${done2.par})` : '14×14, six colours, same for everyone', go(() => load({ mode: 'daily', date: key }))),
        menuCard('levels', `Level ${p.level}`, p.level > 1 ? `${p.level - 1} solved · ${p.perfect} at par` : 'Start small, grow to 18×18', go(() => load({ mode: 'level', level: p.level }))),
      ),
      el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
    ),
  });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {}, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)), toggle('Colour symbols', settings.get('symbols'), (v) => settings.set('symbols', v), 'A shape on every colour, for colour-blind play'), toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v))),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, 'Your area starts in the top-left corner. Pick a colour (or tap any square of it) and your whole area turns that colour, joining every touching square of the same colour.'),
      el('p', {}, 'Fill the board with one colour. ', el('b', {}, 'Par'), ' is the fewest moves our solver found; match it for a Perfect, beat it for a Birdie.'),
      el('p', { class: 'muted' }, 'Keys: 1–6 pick colours, Z undoes, H hints.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('undo-btn').addEventListener('click', undo);
$('restart-btn').addEventListener('click', restart);
$('hint-btn').addEventListener('click', hint);
$('hint-btn').prepend(icon('bulb', { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = Number(e.key);
  if (k >= 1 && k <= game.colors) pick(k - 1);
  else if (e.key === 'z') undo();
  else if (e.key === 'h') hint();
  else return;
  e.preventDefault();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.l) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const challenge = /^\d+$/.test(h.m || '') ? Number(h.m) : null;
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { spec: { mode: 'daily', date: h.d > dateKey() ? dateKey() : h.d }, challenge };
  if (Number(h.l) >= 1) return { spec: { mode: 'level', level: Math.floor(Number(h.l)) }, challenge };
  return null;
}
const link = fromLink();
const saved = store.get('game');
if (link) load(link.spec, { challenge: link.challenge });
else if (saved && !saved.done && saved.cells) load(specOf(saved));
else load({ mode: 'daily', date: dateKey() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

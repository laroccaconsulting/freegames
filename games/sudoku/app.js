import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, formatTime } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, shareText, hashSeed } from './core/golf.js';
import { icon, withIcon, medal } from './core/icons.js';
import { generate, candidatesOf, nextStep, conflicts, TECHNIQUES, unitName, ROW, COL, BOX } from './js/sudoku.js';

const LAUNCH_DAY = '2026-09-25';
const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const store = makeStore('sudoku');
const settings = makeSettings(store, { theme: null, sound: true, mistakes: 'rules', highlight: true, big: false });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
document.body.classList.toggle('big', settings.get('big'));
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
  document.body.classList.toggle('big', settings.get('big'));
  if (game) render();
});

const sfx = {
  place() {
    const ac = audio();
    if (ac) tone(ac, { freq: 740, duration: 0.09, gain: 0.04 });
  },
  note() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.02, freq: 3000, q: 1.5, gain: 0.1 });
  },
  unit() {
    const ac = audio();
    if (ac) [880, 1174.7].forEach((f, i) => tone(ac, { freq: f, duration: 0.18, gain: 0.04, when: i * 0.07 }));
  },
  bad: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Puzzles ----------

let worker = null;
const jobs = new Map();
let nextId = 1;
function make(seed, level) {
  return new Promise((resolve) => {
    if (worker === null) {
      try {
        worker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          jobs.get(data.id)?.(data.result);
          jobs.delete(data.id);
        };
        worker.onerror = () => {
          worker = false;
        };
      } catch {
        worker = false;
      }
    }
    if (!worker) {
      setTimeout(() => resolve(generate(seed, level)), 20);
      return;
    }
    const id = nextId++;
    jobs.set(id, resolve);
    worker.postMessage({ id, seed, level });
  });
}

// game: { level, daily | n, puzzle, solution, grid, notes, history, hints, time, done }
let game = null;
let sel = 40;
let noting = false;
let loadToken = 0;
let clock = null;

const specId = (s) => `${s.level}:${s.daily ? `d${s.daily}` : `n${s.n}`}`;
const titleOf = (g) => (g.daily ? `Daily #${dailyNumber(g.daily, LAUNCH_DAY)}` : `${LEVEL_NAMES[g.level]} #${g.n}`);
const save = () => game && store.set('game', game);

async function load(spec) {
  const token = ++loadToken;
  const saved = store.get('game');
  if (saved && specId(saved) === specId(spec) && !saved.done) {
    game = saved;
    build();
    return;
  }
  $('loading').hidden = false;
  const seed = spec.daily ? dailySeed('sudoku', spec.daily) : hashSeed(`sudoku-${spec.level}:${spec.n}`);
  const cacheKey = `puz:${specId(spec)}`;
  const made = store.get(cacheKey) || (await make(seed, spec.level));
  if (token !== loadToken) return;
  store.set(cacheKey, made);
  game = { ...spec, puzzle: made.puzzle, solution: made.solution, grid: made.puzzle.slice(), notes: new Array(81).fill(0), history: [], hints: 0, checks: 0, time: 0, done: false };
  sel = game.grid.findIndex((v) => !v);
  save();
  build();
  announce(`${titleOf(game)}. ${game.grid.filter((v) => !v).length} squares to fill.`);
}

// ---------- Moves ----------

function push() {
  game.history = [...game.history.slice(-200), { grid: game.grid, notes: game.notes }];
}

function enter(v) {
  if (!game || game.done || game.puzzle[sel]) return;
  push();
  const grid = game.grid.slice();
  const notes = game.notes.slice();
  if (v && noting && !grid[sel]) {
    notes[sel] ^= 1 << v;
    sfx.note();
  } else {
    grid[sel] = grid[sel] === v ? 0 : v;
    notes[sel] = 0;
    if (grid[sel]) {
      // Clear this number from notes in the same row, column and box.
      for (let j = 0; j < 81; j++) if (ROW(j) === ROW(sel) || COL(j) === COL(sel) || BOX(j) === BOX(sel)) notes[j] &= ~(1 << v);
      const done = [ROW(sel), 9 + COL(sel), 18 + BOX(sel)].some((u) => unitCells(u).every((j) => grid[j]));
      if (done) sfx.unit();
      else sfx.place();
      if (settings.get('mistakes') === 'answer' && grid[sel] !== game.solution[sel]) sfx.bad();
    }
  }
  game.grid = grid;
  game.notes = notes;
  save();
  render();
  if (grid.every((x, i) => x === game.solution[i])) finish();
}

const unitCells = (u) => [...Array(81).keys()].filter((j) => (u < 9 ? ROW(j) === u : u < 18 ? COL(j) === u - 9 : BOX(j) === u - 18));

function undo() {
  if (!game || !game.history.length || game.done) return;
  const last = game.history[game.history.length - 1];
  game.grid = last.grid;
  game.notes = last.notes;
  game.history = game.history.slice(0, -1);
  save();
  render();
}

function fillNotes() {
  if (!game || game.done) return;
  push();
  const cands = candidatesOf(game.grid);
  game.notes = cands.map((m, i) => (game.grid[i] ? 0 : m));
  save();
  render();
  toast('Notes filled in with every number that could fit');
}

// ---------- Hints ----------

const PLACE_TEXT = {
  'naked-single': (s) => `Naked single: every other number is already in this square’s row, column or box, so only ${s.place[1]} fits.`,
  'hidden-single': (s) => `Hidden single: ${s.place[1]} has only one place left in ${unitName(s.unit)}.`,
};
const TECH_TEXT = {
  pointing: (s) => `pointing pair: in ${unitName(s.unit)}, ${s.value} can only go in one line, so it can’t go anywhere else in ${unitName(s.line)}`,
  claiming: (s) => `box line reduction: in ${unitName(s.unit)}, ${s.value} can only go in ${unitName(s.box)}, so it can’t go anywhere else in that box`,
  'naked-pair': (s) => `naked pair: two squares in ${unitName(s.unit)} can only hold ${s.values.join(' and ')}, so no other square there can`,
  'naked-triple': (s) => `naked triple: three squares in ${unitName(s.unit)} share ${s.values.join(', ')}, so no other square there can hold them`,
  'hidden-pair': (s) => `hidden pair: in ${unitName(s.unit)}, ${s.values.join(' and ')} only fit in the same two squares, so those squares hold nothing else`,
  'x-wing': (s) => `X-Wing: ${s.value} fits in just two places in each of two lines, forming a rectangle, so it’s ruled out elsewhere along the rectangle’s other sides`,
};

function hint() {
  if (!game || game.done) return;
  const wrong = game.grid.findIndex((v, i) => v && !game.puzzle[i] && v !== game.solution[i]);
  if (wrong >= 0) {
    push();
    game.grid = game.grid.slice();
    game.grid[wrong] = 0;
    game.hints++;
    sel = wrong;
    save();
    render();
    toast('That number was wrong, so it’s been cleared.', { duration: 3500 });
    return;
  }
  // Work forward from the player's grid until a square can be filled,
  // explaining the technique that made it possible.
  const grid = game.grid.slice();
  const cands = candidatesOf(grid);
  const used = [];
  for (let k = 0; k < 40; k++) {
    const step = nextStep(grid, cands);
    if (!step) break;
    if (step.place) {
      const [i, v] = step.place;
      const why = used.length ? `First, a ${TECH_TEXT[used[used.length - 1].tech](used[used.length - 1])}. Then: ${PLACE_TEXT[step.tech](step)}` : PLACE_TEXT[step.tech](step);
      push();
      game.grid = game.grid.slice();
      game.grid[i] = v;
      game.hints++;
      sel = i;
      save();
      render();
      toast(why, { duration: 8000 });
      announce(why);
      if (game.grid.every((x, j) => x === game.solution[j])) finish();
      return;
    }
    used.push(step);
    for (const [i, v] of step.remove) cands[i] &= ~(1 << v);
  }
  // Beyond these techniques (Expert puzzles): give the answer for one square.
  const i = game.grid.findIndex((v) => !v);
  push();
  game.grid = game.grid.slice();
  game.grid[i] = game.solution[i];
  game.hints++;
  sel = i;
  save();
  render();
  toast('This one needs a trick beyond the usual techniques, so here’s a square to get you going.', { duration: 5000 });
}

// ---------- Winning ----------

function finish() {
  game.done = true;
  save();
  render();
  sfx.win();
  document.querySelector('.su-grid')?.classList.add('solved');
  const t = Math.round(game.time);
  const clean = !game.hints;
  const best = store.get('best', {});
  const isBest = clean && (!best[game.level] || t < best[game.level]);
  if (isBest) store.set('best', { ...best, [game.level]: t });
  const stats = store.get('stats', {});
  const s = (stats[game.level] ||= { solved: 0, clean: 0 });
  s.solved++;
  if (clean) s.clean++;
  store.set('stats', stats);
  if (game.daily) {
    const log = store.get('daily', {});
    if (!log[game.daily]) store.set('daily', { ...log, [game.daily]: { time: t, hints: game.hints } });
  }
  const text = `Sudoku · ${titleOf(game)} (${LEVEL_NAMES[game.level]}) ${clean ? '💎' : '💡'}\nSolved in ${formatTime(t)}${game.hints ? ` with ${game.hints} hint${game.hints > 1 ? 's' : ''}` : ', no hints'}`;
  const url = location.origin + location.pathname + buildHash(game.daily ? { d: game.daily } : { l: game.level, n: game.n });
  setTimeout(() => {
    openDialog({
      title: 'Solved!',
      className: 'results',
      body: el(
        'div',
        {},
        el('div', { class: 'stamp show' }, medal(clean ? 'diamond' : 'check')),
        el('p', { class: 'result-note' }, `Time: ${formatTime(t)}${isBest ? ' · new best!' : best[game.level] ? ` · best ${formatTime(best[game.level])}` : ''}`),
        el('p', { class: 'result-note' }, game.hints ? `Hints: ${game.hints}` : 'No hints'),
        game.daily && el('p', { class: 'result-note' }, icon('flame', { size: 18 }), `${dailyStreak(store.get('daily', {}), dateKey())}-day streak`),
        el('button', { class: 'btn share-btn', onclick: async () => (await shareText(text, url)) === 'copied' && toast('Result copied — paste it anywhere') }, icon('share'), 'Share result'),
      ),
      actions: [
        { label: 'See the grid', value: null },
        { label: 'Next puzzle', value: 'next', primary: true },
      ],
    }).then((v) => v === 'next' && load({ level: game.level, n: nextNumber(game.level) }));
  }, 900);
}

function nextNumber(level) {
  const n = store.get(`next-${level}`, 1);
  store.set(`next-${level}`, n + 1);
  return n;
}

// ---------- Screen ----------

function build() {
  $('loading').hidden = true;
  const grid = el('div', { class: 'su-grid', role: 'grid', 'aria-label': 'Sudoku grid' });
  for (let i = 0; i < 81; i++) {
    const cell = el('button', { class: `su-cell r${ROW(i)} c${COL(i)}`, dataset: { i }, onclick: () => select(i) }, el('b', {}), el('span', { class: 'notes' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => el('i', {}, v))));
    grid.append(cell);
  }
  const pad = el('div', { class: 'pad' });
  for (let v = 1; v <= 9; v++) pad.append(el('button', { class: 'pad-key', dataset: { v }, onclick: () => enter(v) }, el('b', {}, v), el('small', {})));
  const tools = el(
    'div',
    { class: 'pad-tools' },
    el('button', { class: 'pad-key wide', id: 'notes-btn', onclick: () => ((noting = !noting), render()), 'aria-pressed': 'false' }, 'Notes'),
    el('button', { class: 'pad-key wide', onclick: fillNotes }, 'Fill notes'),
    el('button', { class: 'pad-key wide', onclick: () => enter(0), 'aria-label': 'Erase' }, '⌫ Erase'),
  );
  $('stage').replaceChildren($('loading'), el('div', { class: 'grid-wrap' }, grid), pad, tools);
  $('notes-btn').replaceChildren(icon('leaf', { size: 18 }), ' Notes');
  render();
  clearInterval(clock);
  let last = Date.now();
  clock = setInterval(() => {
    const now = Date.now();
    if (game && !game.done && document.visibilityState === 'visible') game.time += (now - last) / 1000;
    last = now;
  }, 1000);
}

function select(i) {
  sel = i;
  render();
}

function render() {
  if (!game) return;
  const { grid, puzzle, notes, solution } = game;
  const mode = settings.get('mistakes');
  const bad = mode === 'off' ? new Set() : mode === 'answer' ? new Set(grid.map((v, i) => (v && v !== solution[i] ? i : -1)).filter((i) => i >= 0)) : conflicts(grid);
  const same = grid[sel];
  const hl = settings.get('highlight');
  for (const cell of document.querySelectorAll('.su-cell')) {
    const i = Number(cell.dataset.i);
    const v = grid[i];
    cell.querySelector('b').textContent = v || '';
    cell.classList.toggle('given', !!puzzle[i]);
    cell.classList.toggle('sel', i === sel && !game.done);
    cell.classList.toggle('peer', hl && !game.done && i !== sel && (ROW(i) === ROW(sel) || COL(i) === COL(sel) || BOX(i) === BOX(sel)));
    cell.classList.toggle('same', hl && !!same && v === same && i !== sel);
    cell.classList.toggle('bad', bad.has(i));
    const ns = cell.querySelectorAll('.notes i');
    ns.forEach((n, k) => n.classList.toggle('on', !v && !!(notes[i] & (1 << (k + 1)))));
    cell.setAttribute('aria-label', `Row ${ROW(i) + 1}, column ${COL(i) + 1}${v ? `, ${v}${puzzle[i] ? ', given' : ''}` : ', empty'}`);
  }
  const counts = new Array(10).fill(0);
  for (const v of grid) counts[v]++;
  for (const k of document.querySelectorAll('.pad-key[data-v]')) {
    const v = Number(k.dataset.v);
    k.querySelector('small').textContent = 9 - counts[v] > 0 ? 9 - counts[v] : '';
    k.classList.toggle('used-up', counts[v] >= 9);
  }
  const nb = $('notes-btn');
  nb?.classList.toggle('on', noting);
  nb?.setAttribute('aria-pressed', String(noting));
  $('left').textContent = grid.filter((v) => !v).length;
  $('title').textContent = titleOf(game);
  $('subtitle').textContent = `${LEVEL_NAMES[game.level]}${game.daily ? streakText() : ''}`;
  $('undo-btn').disabled = !game.history.length || game.done;
  $('hint-btn').disabled = game.done;
}

const streakText = () => {
  const s = dailyStreak(store.get('daily', {}), dateKey());
  return s ? ` · ${s}-day streak` : '';
};

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = dateKey();
  const done = store.get('daily', {})[key];
  const best = store.get('best', {});
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  const blurbs = { easy: 'Singles only: great for a quick one', medium: 'Needs pairs and pointing', hard: 'Hidden pairs, triples, X-Wings', expert: 'Beyond the usual techniques' };
  const body = el(
    'div',
    {},
    el(
      'div',
      { class: 'menu-list' },
      menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, done ? `Solved in ${formatTime(done.time)}` : 'Medium, same puzzle for everyone', go(() => load({ level: 'medium', daily: key }))),
      ...Object.keys(LEVEL_NAMES).map((lv) => menuCard('grid', LEVEL_NAMES[lv], `${blurbs[lv]}${best[lv] ? ` · best ${formatTime(best[lv])}` : ''}`, go(() => load({ level: lv, n: nextNumber(lv) })))),
    ),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(() => window.print()) }, 'Print'), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'Help'))),
  );
  openDialog({ title: 'Sudoku', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Show mistakes'), segmented('mistakes', [['off', 'Never'], ['rules', 'Repeats'], ['answer', 'Wrong numbers']], settings.get('mistakes'), (v) => settings.set('mistakes', v))),
      toggle('Highlight row, column, box and matching numbers', settings.get('highlight'), (v) => settings.set('highlight', v)),
      toggle('Large print', settings.get('big'), (v) => settings.set('big', v), 'Bigger numbers and buttons'),
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
      el('p', {}, 'Fill the grid so every row, every column and every 3×3 box contains 1 to 9 once each. Tap a square, then a number.'),
      el('p', {}, el('b', {}, 'Notes'), ' pencil in the numbers a square might be. Placing a number clears it from the notes around it.'),
      el('p', {}, el('b', {}, 'Hint'), ' fills one square and explains the technique that finds it, from singles up to X-Wings. Levels are graded by the hardest technique a puzzle needs.'),
      el('p', { class: 'muted' }, `Techniques: ${TECHNIQUES.map((t) => t.name).join(', ')}.`),
      el('p', { class: 'muted' }, 'Keys: 1–9 fill, 0 or Backspace clears, arrows move, N toggles notes, H hints, Z undoes. Every puzzle has one solution.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', hint);
$('new-btn').addEventListener('click', () => load({ level: game?.level || 'medium', n: nextNumber(game?.level || 'medium') }));
$('hint-btn').prepend(icon('bulb', { size: 22 }));
$('new-btn').prepend(icon('infinity', { size: 22 }));
$('menu-btn').prepend(icon('levels', { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  const k = Number(e.key);
  if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) undo();
  else if (e.ctrlKey) return;
  else if (moves[e.key]) select(Math.max(0, Math.min(80, sel + moves[e.key])));
  else if (k >= 1 && k <= 9) enter(k);
  else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') enter(0);
  else if (e.key === 'n') {
    noting = !noting;
    render();
  } else if (e.key === 'h') hint();
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
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { level: 'medium', daily: h.d > dateKey() ? dateKey() : h.d };
  if (LEVEL_NAMES[h.l] && Number(h.n) >= 1) return { level: h.l, n: Math.floor(Number(h.n)) };
  return null;
}

const saved = store.get('game');
load(fromLink() || (saved && !saved.done ? saved : { level: 'medium', daily: dateKey() }));
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

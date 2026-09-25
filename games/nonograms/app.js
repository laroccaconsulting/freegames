import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, formatTime } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, shareText, hashSeed } from './core/golf.js';
import { icon, withIcon, medal } from './core/icons.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import * as N from './js/nonogram.js';

const LAUNCH_DAY = '2026-09-25';
const LABELS = { small: '5×5', medium: '10×10', large: '15×15' };
const store = makeStore('nonograms');
const ach = makeAchievements('nonograms', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, autoX: true, showErrors: false });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
  if (puzzle) paint();
});

const sfx = {
  fill() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.03, freq: 1800, q: 1.2, gain: 0.12 });
  },
  cross() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.02, freq: 3400, q: 1.5, gain: 0.08 });
  },
  line() {
    const ac = audio();
    if (ac) tone(ac, { freq: 880, duration: 0.1, gain: 0.035, type: 'triangle' });
  },
  win: () => sounds.win(),
};

// ---------- Puzzles ----------

// spec: { size, daily } or { size, n }
let spec = null;
let puzzle = null;
let play = null; // { cells: [1 | 0 | -1], history, hints, checks, time, done }
let tool = 'fill';
let clock = null;

const specId = (s) => `${s.size}:${s.daily ? `d${s.daily}` : `n${s.n}`}`;
const seedOf = (s) => (s.daily ? dailySeed('nonograms', s.daily) : hashSeed(`nonograms-${s.size}:${s.n}`));
const titleOf = (s) => (s.daily ? `Daily #${dailyNumber(s.daily, LAUNCH_DAY)}` : `${LABELS[s.size]} #${s.n}`);
const today = () => dateKey();

function open(next) {
  spec = { size: 'medium', ...next };
  store.set('last', spec);
  puzzle = N.generate(seedOf(spec), spec.size);
  const saved = store.get(`p:${specId(spec)}`);
  play = { cells: new Array(puzzle.w * puzzle.h).fill(0), history: [], hints: 0, checks: 0, time: 0, done: false, ...saved };
  build();
  $('title').textContent = titleOf(spec);
  announce(`${titleOf(spec)}. ${puzzle.w} by ${puzzle.h}.`);
  startClock();
}

const save = () => spec && store.set(`p:${specId(spec)}`, { ...play, history: play.history.slice(-100) });

function startClock() {
  clearInterval(clock);
  let last = Date.now();
  clock = setInterval(() => {
    const now = Date.now();
    if (!play.done && document.visibilityState === 'visible' && play.history.length) {
      play.time += (now - last) / 1000;
      $('time').textContent = formatTime(play.time);
      if (Math.round(play.time) % 5 === 0) save();
    }
    last = now;
  }, 1000);
  $('time').textContent = formatTime(play.time);
}

// ---------- Board ----------

let cellEls = [];
let rowClues = [];
let colClues = [];
let boardEl = null;

function build() {
  const { w, h } = puzzle;
  const grid = el('div', { class: 'ng-grid', role: 'grid', 'aria-label': `${w} by ${h} grid` });
  cellEls = [];
  for (let i = 0; i < w * h; i++) {
    const r = Math.floor(i / w);
    const c = i % w;
    const cls = `cell${(r + 1) % 5 === 0 && r < h - 1 ? ' r5' : ''}${(c + 1) % 5 === 0 && c < w - 1 ? ' c5' : ''}`;
    const cell = el('div', { class: cls, dataset: { i } });
    cellEls.push(cell);
    grid.append(cell);
  }
  colClues = puzzle.cols.map((runs) => el('div', { class: 'clue' }, ...runs.map((n) => el('span', {}, n))));
  rowClues = puzzle.rows.map((runs) => el('div', { class: 'clue' }, ...runs.map((n) => el('span', {}, n))));
  boardEl = el('div', { class: 'ng', style: `--w: ${w}; --h: ${h}` }, el('div', { class: 'ng-corner' }), el('div', { class: 'ng-top' }, colClues), el('div', { class: 'ng-left' }, rowClues), grid);
  const tools = el('div', { class: 'tools' }, segmented('tool', [['fill', '■ Fill'], ['cross', '✕ Cross']], tool, (v) => (tool = v)));
  $('stage').replaceChildren(boardEl, tools);
  wire(grid);
  size();
  paint();
}

// Cell size from the space available and the widest clues.
function size() {
  if (!boardEl) return;
  const stage = $('stage');
  const { w, h } = puzzle;
  const leftRuns = Math.max(...puzzle.rows.map((r) => r.length));
  const topRuns = Math.max(...puzzle.cols.map((c) => c.length));
  const availW = stage.clientWidth - 24;
  const availH = stage.clientHeight - 70;
  const cell = Math.floor(Math.min(availW / (w + leftRuns * 0.62 + 0.4), availH / (h + topRuns * 0.52 + 0.4), 44));
  boardEl.style.setProperty('--cell', `${Math.max(14, cell)}px`);
}
addEventListener('resize', size);

// Drag to paint: the first cell decides whether this stroke sets or clears,
// and the stroke sticks to the row or column it starts along.
function wire(grid) {
  let stroke = null; // { value, start, axis, touched: Set }
  const cellAt = (e) => {
    const b = grid.getBoundingClientRect();
    const c = Math.floor(((e.clientX - b.left) / b.width) * puzzle.w);
    const r = Math.floor(((e.clientY - b.top) / b.height) * puzzle.h);
    return r >= 0 && c >= 0 && r < puzzle.h && c < puzzle.w ? r * puzzle.w + c : -1;
  };
  grid.addEventListener('pointerdown', (e) => {
    if (play.done) return;
    const i = cellAt(e);
    if (i < 0) return;
    grid.setPointerCapture?.(e.pointerId);
    const want = tool === 'fill' ? 1 : -1;
    // A right-click or a long press could cross; right-click crosses.
    const target = e.button === 2 ? -1 : want;
    stroke = { value: play.cells[i] === target ? 0 : target, start: i, axis: null, before: play.cells.slice() };
    setCell(i);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    let i = cellAt(e);
    if (i < 0) return;
    const w = puzzle.w;
    const [r0, c0] = [Math.floor(stroke.start / w), stroke.start % w];
    const [r, c] = [Math.floor(i / w), i % w];
    if (!stroke.axis && (r !== r0 || c !== c0)) stroke.axis = r === r0 ? 'row' : c === c0 ? 'col' : Math.abs(r - r0) < Math.abs(c - c0) ? 'row' : 'col';
    if (stroke.axis === 'row') i = r0 * w + c;
    else if (stroke.axis === 'col') i = r * w + c0;
    // Fill every cell between the start and here, so fast drags don't skip.
    const [a, b] = stroke.axis === 'row' ? [c0, i % w] : [r0, Math.floor(i / w)];
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) setCell(stroke.axis === 'row' ? r0 * w + k : k * w + c0);
  });
  const end = () => {
    if (!stroke) return;
    if (play.cells.some((v, k) => v !== stroke.before[k])) {
      play.history = [...play.history, stroke.before];
      after();
    }
    stroke = null;
  };
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);
  grid.addEventListener('contextmenu', (e) => e.preventDefault());

  function setCell(i) {
    // Filling never overwrites a cross (and the other way round) mid-stroke,
    // except when clearing.
    const cur = play.cells[i];
    const v = stroke.value;
    if (cur === v) return;
    if (v !== 0 && cur !== 0 && i !== stroke.start) return;
    if (v === 0 && cur !== stroke.before[stroke.start]) return;
    play.cells[i] = v;
    if (v === 1) sfx.fill();
    else if (v === -1) sfx.cross();
    paintCell(i);
  }
}

let lastDone = null;
function after() {
  const done = N.doneLines(puzzle, play.cells);
  // A line that just became complete: cross its leftover cells for you.
  if (settings.get('autoX')) {
    done.rows.forEach((ok, r) => {
      if (ok && !lastDone?.rows[r]) for (let c = 0; c < puzzle.w; c++) if (!play.cells[r * puzzle.w + c]) play.cells[r * puzzle.w + c] = -1;
    });
    done.cols.forEach((ok, c) => {
      if (ok && !lastDone?.cols[c]) for (let r = 0; r < puzzle.h; r++) if (!play.cells[r * puzzle.w + c]) play.cells[r * puzzle.w + c] = -1;
    });
  }
  const newly = lastDone && (done.rows.some((ok, r) => ok && !lastDone.rows[r]) || done.cols.some((ok, c) => ok && !lastDone.cols[c]));
  if (newly) sfx.line();
  save();
  paint();
  if (N.isSolved(puzzle, play.cells)) finish();
}

function paintCell(i) {
  const v = play.cells[i];
  const cell = cellEls[i];
  cell.classList.toggle('on', v === 1);
  cell.classList.toggle('x', v === -1);
  const wrong = (settings.get('showErrors') || showWrong) && ((v === 1 && !puzzle.solution[i]) || (v === -1 && puzzle.solution[i]));
  cell.classList.toggle('wrong', Boolean(wrong));
}

let showWrong = false;
function paint() {
  cellEls.forEach((_, i) => paintCell(i));
  const done = N.doneLines(puzzle, play.cells);
  lastDone = done;
  rowClues.forEach((c, r) => c.classList.toggle('done', done.rows[r]));
  colClues.forEach((c, k) => c.classList.toggle('done', done.cols[k]));
  boardEl.classList.toggle('solved', play.done);
  $('undo-btn').disabled = !play.history.length || play.done;
  $('hint-btn').disabled = play.done;
  $('check-btn').disabled = play.done;
  const filled = play.cells.filter((v) => v === 1).length;
  const total = puzzle.solution.filter(Boolean).length;
  $('subtitle').textContent = `${LABELS[spec.size]} · ${filled}/${total} filled${spec.daily ? streakText() : ''}`;
}
const streakText = () => {
  const s = dailyStreak(store.get('daily', {}), today());
  return s ? ` · ${s}-day streak` : '';
};

// ---------- Tools ----------

function undo() {
  if (!play.history.length || play.done) return;
  play.cells = play.history[play.history.length - 1];
  play.history = play.history.slice(0, -1);
  save();
  paint();
}

function check() {
  const wrong = play.cells.filter((v, i) => (v === 1 && !puzzle.solution[i]) || (v === -1 && puzzle.solution[i])).length;
  play.checks++;
  save();
  if (!wrong) return toast('No mistakes so far.', { duration: 1500 });
  showWrong = true;
  paint();
  toast(`${wrong} ${wrong === 1 ? 'square is' : 'squares are'} wrong, shown in red.`, { duration: 2500 });
  setTimeout(() => {
    showWrong = false;
    paint();
  }, 2500);
}

// A hint finds a square the clues decide from what's correctly marked, and
// fills or crosses it, lighting up the line that tells you.
function hint() {
  if (play.done) return;
  const known = play.cells.map((v, i) => (v === 1 && puzzle.solution[i] ? 1 : v === -1 && !puzzle.solution[i] ? -1 : 0));
  const wrong = play.cells.findIndex((v, i) => v !== 0 && known[i] === 0);
  const before = play.cells.slice();
  let text;
  let cell = -1;
  let line = null;
  if (wrong >= 0) {
    play.cells[wrong] = 0;
    cell = wrong;
    text = 'That square was wrong, so it’s been cleared.';
  } else {
    const { w, h } = puzzle;
    for (let r = 0; r < h && cell < 0; r++) {
      const cur = known.slice(r * w, r * w + w);
      const next = N.solveLine(puzzle.rows[r], cur);
      const c = next.findIndex((v, k) => v !== cur[k]);
      if (c >= 0) [cell, line] = [r * w + c, { row: r }];
    }
    for (let c = 0; c < w && cell < 0; c++) {
      const cur = Array.from({ length: h }, (_, r) => known[r * w + c]);
      const next = N.solveLine(puzzle.cols[c], cur);
      const r = next.findIndex((v, k) => v !== cur[k]);
      if (r >= 0) [cell, line] = [r * w + c, { col: c }];
    }
    if (cell < 0) return;
    play.cells[cell] = puzzle.solution[cell] ? 1 : -1;
    text = `${line.row != null ? `Row ${line.row + 1}` : `Column ${line.col + 1}`}: its clue decides that square.`;
  }
  play.history = [...play.history, before];
  play.hints++;
  toast(text, { duration: 2600 });
  announce(text);
  after();
  const c = cellEls[cell];
  c.classList.remove('hint');
  void c.offsetWidth;
  c.classList.add('hint');
  const clueEl = line ? (line.row != null ? rowClues[line.row] : colClues[line.col]) : null;
  clueEl?.classList.add('lit');
  setTimeout(() => clueEl?.classList.remove('lit'), 1600);
}

function finish() {
  play.done = true;
  save();
  paint();
  sfx.win();
  if (spec.daily) {
    const log = store.get('daily', {});
    if (!log[spec.daily]) store.set('daily', { ...log, [spec.daily]: { time: Math.round(play.time), hints: play.hints } });
  }

  ach.unlock('first');
  ach.add('solved-50');
  if (spec.size === 'large') ach.unlock('large');
  if (!play.hints && spec.size !== 'small') ach.unlock('clean');
  if (spec.size === 'medium' && play.time < 300) ach.unlock('fast');
  if (spec.daily) {
    ach.unlock('daily');
    const streak = dailyStreak(store.get('daily', {}), today());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  const stats = store.get('stats', {});
  const s = (stats[spec.size] ||= { solved: 0, best: null });
  s.solved++;
  if (!play.hints && (!s.best || play.time < s.best)) s.best = Math.round(play.time);
  store.set('stats', stats);
  const clean = !play.hints;
  const text = `Nonograms · ${titleOf(spec)} ${clean ? '💎' : '💡'}\nSolved in ${formatTime(play.time)}${play.hints ? ` with ${play.hints} hint${play.hints > 1 ? 's' : ''}` : ''}`;
  const url = location.origin + location.pathname + buildHash(spec.daily ? { d: spec.daily } : { s: spec.size, n: spec.n });
  setTimeout(
    () =>
      openDialog({
        title: 'Solved!',
        className: 'results',
        body: el(
          'div',
          {},
          el('div', { class: 'stamp show' }, medal(clean ? 'diamond' : 'check')),
          el('p', { class: 'result-note' }, `Time: ${formatTime(play.time)}`),
          el('p', { class: 'result-note' }, play.hints ? `Hints: ${play.hints}` : 'No hints'),
          spec.daily && el('p', { class: 'result-note' }, icon('flame', { size: 18 }), `${dailyStreak(store.get('daily', {}), today())}-day streak`),
          el('button', { class: 'btn share-btn', onclick: async () => (await shareText(text, url)) === 'copied' && toast('Result copied — paste it anywhere') }, icon('share'), 'Share result'),
        ),
        actions: [
          { label: 'See the picture', value: null },
          { label: 'Next puzzle', value: 'next', primary: true },
        ],
      }).then((v) => v === 'next' && open({ size: spec.size, n: nextNumber(spec.size) })),
    reduced.matches ? 200 : 900,
  );
}

function nextNumber(size) {
  const n = store.get(`next-${size}`, 1);
  store.set(`next-${size}`, n + 1);
  return n;
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = today();
  const r = store.get('daily', {})[key];
  const stats = store.get('stats', {});
  let dialog;
  const go = (s) => () => {
    dialog?.closeWith?.(null);
    open(s);
  };
  openDialog({
    title: 'Nonograms',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'menu-list' },
        menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, r ? `Solved in ${formatTime(r.time)}${r.hints ? ' with hints' : ''}` : '10×10, the same for everyone', go({ size: 'medium', daily: key })),
        ...Object.entries(LABELS).map(([size, label]) => menuCard(size === 'small' ? 'grid' : size === 'medium' ? 'tiles' : 'levels', `${label} puzzle`, stats[size]?.solved ? `${stats[size].solved} solved${stats[size].best ? ` · best ${formatTime(stats[size].best)}` : ''}` : { small: 'A quick warm-up', medium: 'The classic size', large: 'A proper picture' }[size], go({ size, n: nextNumber(size) }))),
      ),
      el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openSettings()) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openHelp()) }, withIcon('help', 'How to play'))),
    ),
  });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Cross finished lines', settings.get('autoX'), (v) => settings.set('autoX', v), 'When a line matches its clue, cross its other squares'),
      toggle('Show mistakes', settings.get('showErrors'), (v) => settings.set('showErrors', v), 'Wrong squares turn red straight away'),
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
      el('p', {}, 'Each number is a run of filled squares in that row (read left to right) or column (top to bottom), in order, with at least one empty square between runs. “3 1” means three filled in a row, a gap, then one more.'),
      el('p', {}, 'Tap or drag to fill squares. Switch to ✕ to cross squares you know are empty (or right-click). Drag along a row or column to do several at once.'),
      el('p', {}, 'Every puzzle can be solved one line at a time, without guessing. Finish to reveal the picture.'),
      el('p', { class: 'muted' }, 'Keys: F fill, X cross, Z undo, H hint.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('undo-btn').addEventListener('click', undo);
$('check-btn').addEventListener('click', check);
$('check-btn').prepend(icon('check', { size: 22 }));
$('hint-btn').addEventListener('click', hint);
$('hint-btn').prepend(icon('bulb', { size: 22 }));
document.addEventListener('keydown', (e) => {
  if (!spec || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const setTool = (t) => {
    tool = t;
    document.querySelector(`.tools input[value="${t}"]`)?.click();
  };
  if (e.key === 'z') undo();
  else if (e.key === 'h') hint();
  else if (e.key === 'f') setTool('fill');
  else if (e.key === 'x') setTool('cross');
  else return;
  e.preventDefault();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.s) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { size: 'medium', daily: h.d > today() ? today() : h.d };
  if (LABELS[h.s] && Number(h.n) >= 1) return { size: h.s, n: Math.floor(Number(h.n)) };
  return null;
}
open(fromLink() || store.get('last') || { size: 'medium', daily: today() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

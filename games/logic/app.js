import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, formatTime } from './core/ui.js';
import { setSoundEnabled } from './core/sound.js';
import { sfx } from './js/sfx.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, shareText, hashSeed } from './core/golf.js';
import { icon, withIcon, medal } from './core/icons.js';
import { MODES } from './js/modes.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('logic');
const settings = makeSettings(store, { theme: null, sound: true, autoDots: true, showErrors: true });
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
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
  if (spec) draw();
});

// ---------- Puzzles ----------

// spec: { mode, size, daily } or { mode, size, n }
let spec = null;
let puzzle = null;
let play = null; // { marks, history, hints, checks, time, done }
let view = null; // the mode's view object
let clock = null;

const specId = (s) => `${s.mode}:${s.size}:${s.daily ? `d${s.daily}` : `n${s.n}`}`;
const seedOf = (s) => (s.daily ? dailySeed(`logic-${s.mode}`, s.daily) : hashSeed(`logic-${s.mode}-${s.size}:${s.n}`));
const titleOf = (s) => `${MODES[s.mode].name} ${s.daily ? `· Daily #${dailyNumber(s.daily, LAUNCH_DAY)}` : `#${s.n}`}`;
const today = () => dateKey();

function open(next) {
  const mode = MODES[next.mode];
  spec = { ...next, size: next.size || mode.dailySize };
  store.set('last', spec);
  const cacheKey = `puz:${specId(spec)}`;
  puzzle = store.get(cacheKey) || mode.generate(seedOf(spec), spec.size);
  store.set(cacheKey, puzzle);
  const saved = store.get(`p:${specId(spec)}`);
  play = { marks: mode.blank(puzzle), history: [], hints: 0, checks: 0, time: 0, done: false, ...saved };
  view = mode.view($('stage'), puzzle, {
    get marks() {
      return play.marks;
    },
    settings,
    change: (marks) => change(marks),
    done: () => play.done,
  });
  draw();
  $('title').textContent = mode.name;
  $('subtitle').textContent = `${spec.daily ? `Daily #${dailyNumber(spec.daily, LAUNCH_DAY)}` : `#${spec.n}`} · ${mode.sizes[spec.size].label}${spec.daily ? streakText() : ''}`;
  announce(`${titleOf(spec)}. ${mode.goal}`);
  startClock();
}

const save = () => spec && store.set(`p:${specId(spec)}`, play);
const streakText = () => {
  const s = dailyStreak(store.get(`daily-${spec.mode}`, {}), today());
  return s ? ` · ${s}-day streak` : '';
};

function startClock() {
  clearInterval(clock);
  let last = Date.now();
  clock = setInterval(() => {
    const now = Date.now();
    if (!play.done && document.visibilityState === 'visible') play.time += (now - last) / 1000;
    last = now;
  }, 1000);
}

function change(marks) {
  if (play.done) return;
  play.history = [...play.history.slice(-200), play.marks];
  play.marks = marks;
  save();
  draw();
  if (MODES[spec.mode].isSolved(puzzle, marks)) finish();
}

function undo() {
  if (!play.history.length || play.done) return;
  play.marks = play.history[play.history.length - 1];
  play.history = play.history.slice(0, -1);
  save();
  draw();
}

function restart() {
  if (play.done) {
    store.remove(`p:${specId(spec)}`);
    open(spec);
    return;
  }
  change(MODES[spec.mode].blank(puzzle));
}

function hint() {
  if (play.done) return;
  const h = MODES[spec.mode].hint(puzzle, play.marks);
  if (!h) return;
  play.hints++;
  toast(h.text, { duration: 4200 });
  announce(h.text);
  change(h.marks);
}

function draw() {
  view.draw({ errors: settings.get('showErrors') });
  $('undo-btn').disabled = !play.history.length || play.done;
  $('hint-btn').disabled = play.done;
  const p = MODES[spec.mode].progress?.(puzzle, play.marks);
  $('score').replaceChildren(p ? el('div', { class: 'chip' }, el('small', {}, p.label), el('b', {}, p.value)) : '');
}

function finish() {
  play.done = true;
  save();
  draw();
  sfx.win();
  view.celebrate?.();
  if (spec.daily) {
    const log = store.get(`daily-${spec.mode}`, {});
    if (!log[spec.daily]) store.set(`daily-${spec.mode}`, { ...log, [spec.daily]: { time: Math.round(play.time), hints: play.hints } });
  }
  const stats = store.get('stats', {});
  const s = (stats[spec.mode] ||= { solved: 0, clean: 0, best: {} });
  s.solved++;
  if (!play.hints) {
    s.clean++;
    const b = s.best[spec.size];
    if (!b || play.time < b) s.best[spec.size] = Math.round(play.time);
  }
  store.set('stats', stats);
  const clean = !play.hints;
  const text = `Logic · ${titleOf(spec)} ${clean ? '💎' : '💡'}\nSolved in ${formatTime(play.time)}${play.hints ? ` with ${play.hints} hint${play.hints > 1 ? 's' : ''}` : ', no hints'}`;
  const url = location.origin + location.pathname + buildHash(spec.daily ? { m: spec.mode, d: spec.daily } : { m: spec.mode, s: spec.size, n: spec.n });
  setTimeout(() => {
    openDialog({
      title: 'Solved!',
      className: 'results',
      body: el(
        'div',
        {},
        el('div', { class: 'stamp show' }, medal(clean ? 'diamond' : 'check')),
        el('p', { class: 'result-note' }, `Time: ${formatTime(play.time)}`),
        el('p', { class: 'result-note' }, play.hints ? `Hints: ${play.hints}` : 'No hints'),
        spec.daily && el('p', { class: 'result-note' }, icon('flame', { size: 18 }), `${dailyStreak(store.get(`daily-${spec.mode}`, {}), today())}-day streak`),
        el('button', { class: 'btn share-btn', onclick: async () => (await shareText(text, url)) === 'copied' && toast('Result copied — paste it anywhere') }, icon('share'), 'Share result'),
      ),
      actions: [
        { label: 'See the puzzle', value: null },
        { label: 'Next puzzle', value: 'next', primary: true },
      ],
    }).then((v) => v === 'next' && open({ mode: spec.mode, size: spec.size, n: nextNumber(spec.mode, spec.size) }));
  }, 900);
}

function nextNumber(mode, size) {
  const key = `next-${mode}-${size}`;
  const n = store.get(key, 1);
  store.set(key, n + 1);
  return n;
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = today();
  let dialog;
  const go = (s) => () => {
    dialog?.closeWith?.(null);
    open(s);
  };
  const sections = Object.entries(MODES).map(([id, mode]) => {
    const r = store.get(`daily-${id}`, {})[key];
    const sizes = el(
      'div',
      { class: 'size-row' },
      Object.entries(mode.sizes).map(([size, info]) => el('button', { class: 'btn', onclick: go({ mode: id, size, n: nextNumber(id, size) }) }, info.label)),
    );
    return el(
      'div',
      { class: 'mode-block' },
      menuCard(mode.icon, `${mode.name} · Daily #${dailyNumber(key, LAUNCH_DAY)}`, r ? `Solved in ${formatTime(r.time)}${r.hints ? ' with hints' : ''}` : mode.blurb, go({ mode: id, daily: key })),
      sizes,
    );
  });
  const body = el(
    'div',
    {},
    el('div', { class: 'menu-list' }, sections),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openSettings()) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openHelp()) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Logic', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Show mistakes', settings.get('showErrors'), (v) => settings.set('showErrors', v), 'Marks that break a rule turn red'),
      toggle('Automatic dots', settings.get('autoDots'), (v) => settings.set('autoDots', v), 'Star Battle: grey out squares a star rules out'),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    body: el('div', { class: 'help' }, Object.values(MODES).map((m) => el('p', {}, el('b', {}, `${m.name}. `), m.rules)), el('p', { class: 'muted' }, 'Every puzzle has exactly one answer, and you never need to guess. Free forever, no ads, works offline.')),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('undo-btn').addEventListener('click', undo);
$('restart-btn').addEventListener('click', restart);
$('hint-btn').addEventListener('click', hint);
$('hint-btn').prepend(icon('bulb', { size: 22 }));
$('menu-btn').prepend(icon('levels', { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (!spec || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) undo();
  else if (e.ctrlKey) return;
  else if (e.key === 'h') hint();
  else if (view.key?.(e)) {
    /* handled by the mode */
  } else return;
  e.preventDefault();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

function fromLink() {
  const h = parseHash(location.hash);
  if (!MODES[h.m]) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { mode: h.m, daily: h.d > today() ? today() : h.d };
  if (Number(h.n) >= 1 && MODES[h.m].sizes[h.s]) return { mode: h.m, size: h.s, n: Math.floor(Number(h.n)) };
  return { mode: h.m, daily: today() };
}

open(fromLink() || store.get('last') || { mode: 'stars', daily: today() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}
addEventListener('hashchange', () => {
  const next = fromLink();
  if (next) open(next);
});

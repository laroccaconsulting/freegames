import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares, hashSeed } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import * as P from './js/pipes.js';

const LAUNCH_DAY = '2026-09-25';
const LABELS = { small: '5×5', medium: '7×7', large: '9×11', huge: '11×15' };
const store = makeStore('pipes');
const ach = makeAchievements('pipes', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true });
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
});

const sfx = {
  turn() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.03, freq: 2200, q: 1.4, gain: 0.12 });
  },
  join(n) {
    const ac = audio();
    if (ac) tone(ac, { freq: 330 * 2 ** (Math.min(n, 24) / 24), duration: 0.12, gain: 0.04, type: 'triangle' });
  },
  win: () => sounds.win(),
};

// ---------- Puzzles ----------

// spec: { size, daily } or { size, n }; play: { rot, taps, history, hints, done }
let spec = null;
let puzzle = null;
let play = null;
const specId = (s) => `${s.size}:${s.daily ? `d${s.daily}` : `n${s.n}`}`;
const seedOf = (s) => (s.daily ? dailySeed('pipes', s.daily) : hashSeed(`pipes-${s.size}:${s.n}`));
const titleOf = (s) => (s.daily ? `Daily #${dailyNumber(s.daily, LAUNCH_DAY)}` : `${LABELS[s.size]} #${s.n}`);
const today = () => dateKey();

function open(next) {
  spec = { size: 'medium', ...next };
  store.set('last', spec);
  puzzle = P.generate(seedOf(spec), spec.size);
  puzzle.par = P.par(puzzle);
  const saved = store.get(`p:${specId(spec)}`);
  play = { rot: puzzle.start.slice(), taps: 0, history: [], hints: 0, done: false, ...saved };
  build();
  announce(`${titleOf(spec)}. ${puzzle.w} by ${puzzle.h}. Par ${puzzle.par}.`);
}
const save = () => spec && store.set(`p:${specId(spec)}`, { ...play, history: play.history.slice(-200) });

// ---------- Board ----------

let tiles = [];
let boardEl = null;
let angles = []; // running rotation in degrees, so turns always animate the right way

// One tile's drawing (unrotated): arms from the centre, a hub, and a cap on dead ends.
function tileSvg(mask, source) {
  const arms = [
    [P.UP, 'M50 50V-5'],
    [P.RIGHT, 'M50 50H105'],
    [P.DOWN, 'M50 50V105'],
    [P.LEFT, 'M50 50H-5'],
  ]
    .filter(([d]) => mask & d)
    .map(([, d]) => `<path d="${d}" stroke-width="18" stroke-linecap="butt"/>`)
    .join('');
  const bits = [1, 2, 4, 8].filter((b) => mask & b).length;
  const hub = source ? '<circle class="hub" cx="50" cy="50" r="20" stroke-width="8"/>' : bits === 1 ? '<circle class="cap" cx="50" cy="50" r="17"/>' : '<circle cx="50" cy="50" r="4.5" stroke-width="9"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${arms}${hub}</svg>`;
}

function build() {
  const { w, h } = puzzle;
  boardEl = el('div', { class: 'board', style: `--w: ${w}; --h: ${h}`, role: 'grid', 'aria-label': 'Pipes' });
  tiles = [];
  angles = play.rot.map((r) => r * 90);
  puzzle.solution.forEach((m, i) => {
    const t = el('button', { class: `tile${i === puzzle.source ? ' src' : ''}`, dataset: { i }, 'aria-label': `Row ${Math.floor(i / w) + 1}, column ${(i % w) + 1}` });
    t.innerHTML = tileSvg(m, i === puzzle.source);
    t.style.setProperty('--d', ((Math.abs(Math.floor(i / w) - Math.floor(puzzle.source / w)) + Math.abs((i % w) - (puzzle.source % w))) * 40).toString());
    tiles.push(t);
    boardEl.append(t);
  });
  boardEl.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (t) turn(Number(t.dataset.i), 1);
  });
  boardEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const t = e.target.closest('.tile');
    if (t) turn(Number(t.dataset.i), -1);
  });
  $('stage').replaceChildren(boardEl);
  paint();
}

function turn(i, dir) {
  if (play.done) return;
  const before = P.flow(puzzle, play.rot).filter(Boolean).length;
  play.history = [...play.history, { i, dir }];
  play.rot = play.rot.slice();
  play.rot[i] = (play.rot[i] + dir + 4) % 4;
  angles[i] += dir * 90;
  play.taps++;
  save();
  const after = P.flow(puzzle, play.rot).filter(Boolean).length;
  if (after > before) sfx.join(after);
  else sfx.turn();
  paint();
  if (P.isSolved(puzzle, play.rot)) finish();
}

function paint() {
  const on = P.flow(puzzle, play.rot);
  tiles.forEach((t, i) => {
    t.querySelector('svg').style.transform = `rotate(${angles[i]}deg)`;
    t.classList.toggle('on', on[i]);
  });
  boardEl.classList.toggle('won', play.done);
  $('moves').textContent = play.taps;
  $('moves').parentElement.classList.toggle('over', play.taps > puzzle.par);
  $('par').textContent = puzzle.par;
  $('title').textContent = titleOf(spec);
  const n = on.filter(Boolean).length;
  const s = spec.daily ? dailyStreak(store.get('daily', {}), today()) : 0;
  $('subtitle').textContent = `${LABELS[spec.size]} · ${Math.round((100 * n) / on.length)}% flowing${s ? ` · ${s}-day streak` : ''}`;
  $('undo-btn').disabled = !play.history.length || play.done;
  $('hint-btn').disabled = play.done;
}

// ---------- Tools ----------

function undo() {
  if (!play.history.length || play.done) return;
  const { i, dir } = play.history[play.history.length - 1];
  play.history = play.history.slice(0, -1);
  play.rot = play.rot.slice();
  play.rot[i] = (play.rot[i] - dir + 4) % 4;
  angles[i] -= dir * 90;
  play.taps++;
  save();
  paint();
}

function restart() {
  if (play.done) {
    store.remove(`p:${specId(spec)}`);
    return open(spec);
  }
  play = { rot: puzzle.start.slice(), taps: 0, history: [], hints: play.hints, done: false };
  save();
  build();
}

// A hint turns one wrong tile the right way round, nearest the water first.
function hint() {
  if (play.done) return;
  const left = P.turnsLeft(puzzle, play.rot);
  const on = P.flow(puzzle, play.rot);
  const sx = puzzle.source % puzzle.w;
  const sy = Math.floor(puzzle.source / puzzle.w);
  const dist = (i) => Math.abs((i % puzzle.w) - sx) + Math.abs(Math.floor(i / puzzle.w) - sy);
  const wrong = left.map((t, i) => i).filter((i) => left[i]);
  if (!wrong.length) return;
  wrong.sort((a, b) => Number(on[b]) - Number(on[a]) || dist(a) - dist(b));
  const i = wrong[0];
  play.hints++;
  const t = left[i];
  play.rot = play.rot.slice();
  play.rot[i] = (play.rot[i] + (t <= 2 ? t : -1) + 4) % 4;
  angles[i] += (t <= 2 ? t : -1) * 90;
  play.taps += Math.min(t, 4 - t);
  save();
  tiles[i].classList.add('hinted');
  setTimeout(() => tiles[i].classList.remove('hinted'), 1200);
  sfx.turn();
  paint();
  if (P.isSolved(puzzle, play.rot)) finish();
}

function finish() {
  play.done = true;
  save();
  paint();
  sfx.win();
  const r0 = rating(play.taps, puzzle.par);
  const r = play.hints ? { ...r0, label: 'Connected with help', emoji: '💡', icon: 'bulb', tier: Math.min(r0.tier, 1) } : r0;
  if (spec.daily) {
    const log = store.get('daily', {});
    if (!log[spec.daily]) store.set('daily', { ...log, [spec.daily]: { taps: play.taps, par: puzzle.par, hints: play.hints } });
  }

  ach.unlock('first');
  ach.add('solved-50');
  if (!play.hints && play.taps <= puzzle.par) ach.unlock('par');
  if (spec.size === 'large' || spec.size === 'huge') ach.unlock('large');
  if (spec.size === 'huge') ach.unlock('huge');
  if (spec.daily) {
    ach.unlock('daily');
    const streak = dailyStreak(store.get('daily', {}), today());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  const stats = store.get('stats', {});
  const st = (stats[spec.size] ||= { solved: 0, perfect: 0 });
  st.solved++;
  if (r.tier >= 3) st.perfect++;
  store.set('stats', stats);
  const notes = [];
  if (spec.daily) {
    const s = dailyStreak(store.get('daily', {}), today());
    if (s) notes.push(note(`${s}-day streak`, { icon: 'flame' }));
  }
  setTimeout(
    () =>
      showResults({
        title: titleOf(spec),
        rating: r,
        reels: [{ label: 'Turns', value: play.taps }, { label: 'Par', value: puzzle.par }],
        squares: squares(play.taps, puzzle.par),
        notes,
        share: () => ({
          text: `Pipes · ${titleOf(spec)} ${r.emoji}\n${play.taps} turns · par ${puzzle.par} (${overText(play.taps - puzzle.par)})\n${squares(play.taps, puzzle.par)}`,
          url: location.origin + location.pathname + buildHash(spec.daily ? { d: spec.daily } : { s: spec.size, n: spec.n }),
        }),
        actions: [
          { label: 'See the board', value: null },
          { label: 'Next puzzle →', value: 'next', primary: true },
        ],
        reduced: reduced.matches,
      }).then((v) => v === 'next' && open({ size: spec.size, n: nextNumber(spec.size) })),
    reduced.matches ? 200 : 1100,
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
    title: 'Pipes',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'menu-list' },
        menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, r ? `Connected in ${r.taps} (par ${r.par})` : '7×7, the same for everyone', go({ size: 'medium', daily: key })),
        ...Object.entries(LABELS).map(([size, label]) => menuCard({ small: 'grid', medium: 'tiles', large: 'levels', huge: 'blocks' }[size], `${label} puzzle`, stats[size]?.solved ? `${stats[size].solved} solved · ${stats[size].perfect} at par` : { small: 'A quick one', medium: 'The classic', large: 'A bigger network', huge: 'For a long bus ride' }[size], go({ size, n: nextNumber(size) }))),
      ),
      el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openSettings()) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openHelp()) }, withIcon('help', 'How to play'))),
    ),
  });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {}, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)), toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v))),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, 'Tap a tile to turn it a quarter turn clockwise (right-click turns it back). Water flows from the big round source through every pipe that lines up.'),
      el('p', {}, 'Connect every tile into one network with no loose ends. Par is the fewest turns it takes; match it for a Perfect.'),
      el('p', { class: 'muted' }, 'Every board is one network with no loops, so there is always a way. Keys: Z undoes, H hints.'),
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
  if (!spec || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === 'z') undo();
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

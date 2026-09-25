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
import { MODES, score, allCodes, consistent, nextGuess, solverGuesses, secretFrom } from './js/rules.js';
import { mulberry32 } from './core/rng.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('codebreaker');
const ach = makeAchievements('codebreaker', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, symbols: true });
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
  document.body.classList.toggle('symbols', settings.get('symbols'));
});
document.body.classList.toggle('symbols', settings.get('symbols'));

const COLOR_NAMES = ['red', 'yellow', 'green', 'blue', 'purple', 'orange', 'pink', 'white'];
// A shape per colour, so the game never relies on colour alone.
const SHAPES = [
  'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z',
  'M12 4l8 15H4z',
  'M5 5h14v14H5z',
  'M12 3l9 9-9 9-9-9z',
  'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  'M12 20c-5-3.4-8-6.6-8-9.8C4 7.6 6 6 8.2 6c1.6 0 2.9.8 3.8 2 .9-1.2 2.2-2 3.8-2C18 6 20 7.6 20 10.2c0 3.2-3 6.4-8 9.8z',
  'M8 4h8l4 8-4 8H8l-4-8z',
  'M9 4h6v5h5v6h-5v5H9v-5H4V9h5z',
];

const sfx = {
  peg(c) {
    const ac = audio();
    if (ac) tone(ac, { freq: 440 * 2 ** (c / 8), duration: 0.08, gain: 0.05 });
  },
  submit(exact, near) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.04, freq: 1400, gain: 0.3 });
    for (let i = 0; i < exact; i++) tone(ac, { freq: 880, duration: 0.12, gain: 0.05, when: 0.12 + i * 0.09 });
    for (let i = 0; i < near; i++) tone(ac, { freq: 587, duration: 0.1, gain: 0.04, when: 0.12 + (exact + i) * 0.09 });
  },
  invalid: () => sounds.invalid(),
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (ac) [392, 329.6, 261.6].forEach((freq, i) => tone(ac, { freq, duration: 0.35, gain: 0.06, when: i * 0.14, type: 'triangle' }));
  },
};

// ---------- Puzzles ----------

// spec: { mode: 'classic' | 'hard', daily: date } or { mode, n }
const specId = (s) => `${s.mode}:${s.daily ? `d${s.daily}` : `n${s.n}`}`;
const seedOf = (s) => (s.daily ? dailySeed(`codebreaker-${s.mode}`, s.daily) : hashSeed(`codebreaker-${s.mode}:${s.n}`));
const titleOf = (s) => (s.daily ? `Daily #${dailyNumber(s.daily, LAUNCH_DAY)}` : `Code #${s.n}`);
const today = () => dateKey();

let spec = null;
let game = null; // { secret, par, guesses: [{ guess, result }], current: [], hints, done, won, challenge }

function load(next, { challenge = null, fresh = false } = {}) {
  spec = next;
  store.set('last', spec);
  const mode = MODES[spec.mode];
  const id = specId(spec);
  const saved = store.get(`g:${id}`);
  if (saved && !fresh) game = { ...saved, challenge: challenge ?? saved.challenge };
  else {
    const secret = secretFrom(mode, seedOf(spec));
    const cachedPar = store.get(`par:${id}`);
    const par = cachedPar ?? solverGuesses(mode, secret, seedOf(spec));
    store.set(`par:${id}`, par);
    game = { secret, par, guesses: [], current: [], hints: 0, done: false, won: false, challenge };
  }
  build();
  render();
  announce(`${titleOf(spec)}. ${mode.pegs} pegs, ${mode.colors} colours. Par ${game.par}.`);
}

const save = () => store.set(`g:${specId(spec)}`, game);

// ---------- Board ----------

function peg(c, cls = '') {
  const node = el('span', { class: `peg ${cls} ${c == null ? 'empty' : `c${c}`}` });
  if (c != null) node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SHAPES[c]}"/></svg>`;
  return node;
}

function build() {
  const mode = MODES[spec.mode];
  const rows = el('div', { class: 'rows', id: 'rows', style: `--pegs: ${mode.pegs}` });
  for (let r = 0; r < mode.rows; r++) rows.append(el('div', { class: 'row', dataset: { r } }));
  const palette = el('div', { class: 'palette', id: 'palette' });
  for (let c = 0; c < mode.colors; c++) palette.append(el('button', { class: 'pal', onclick: () => place(c), 'aria-label': COLOR_NAMES[c] }, peg(c), el('small', {}, c + 1)));
  $('stage').replaceChildren(
    rows,
    el('div', { class: 'entry' }, el('div', { class: 'current', id: 'current' }), el('button', { class: 'btn btn-primary', id: 'check', onclick: submit }, 'Check')),
    palette,
  );
}

function place(c) {
  const mode = MODES[spec.mode];
  if (game.done || game.current.length >= mode.pegs) return;
  game.current = [...game.current, c];
  sfx.peg(c);
  save();
  render();
}

function removeAt(i) {
  if (game.done) return;
  game.current = game.current.filter((_, k) => k !== i);
  save();
  render();
}

function submit() {
  const mode = MODES[spec.mode];
  if (game.done) return;
  if (game.current.length < mode.pegs) {
    sfx.invalid();
    toast(`Pick ${mode.pegs} colours first`);
    return;
  }
  const guess = game.current;
  const result = score(game.secret, guess);
  game.guesses = [...game.guesses, { guess, result }];
  game.current = [];
  sfx.submit(result.exact, result.near);
  announce(`${result.exact} right colour in the right place, ${result.near} right colour in the wrong place.`);
  if (result.exact === mode.pegs) {
    game.done = true;
    game.won = true;
  } else if (game.guesses.length >= mode.rows) {
    game.done = true;
  }
  save();
  render();
  if (game.done) finish();
}

async function hint() {
  if (game.done) return;
  const mode = MODES[spec.mode];
  const all = allCodes(mode);
  const remaining = consistent(all, game.guesses);
  const random = mulberry32(game.guesses.length + 1);
  const suggestion = game.guesses.length ? nextGuess(mode, remaining, random, all.length <= 1296 ? all : null) : Array.from({ length: mode.pegs }, (_, i) => (i < mode.pegs / 2 ? 0 : 1));
  game.hints++;
  game.current = suggestion.slice();
  save();
  render();
  const could = remaining.includes(suggestion) || remaining.some((c) => c.join() === suggestion.join());
  const text = remaining.length === 1 ? 'Only one code fits everything so far. It’s filled in for you.' : `${remaining.length} codes still fit your clues. This guess splits them best${could ? ', and it could be the answer' : ', even though it can’t be the answer itself'}.`;
  toast(text, { duration: 5000 });
  announce(text);
}

function render() {
  const mode = MODES[spec.mode];
  const rows = document.querySelectorAll('.row');
  rows.forEach((row, r) => {
    const g = game.guesses[r];
    row.classList.toggle('active', !game.done && r === game.guesses.length);
    if (row.dataset.filled === String(!!g) && g) return;
    row.dataset.filled = String(!!g);
    const pegs = el('div', { class: 'pegs' });
    const code = g ? g.guess : [];
    for (let i = 0; i < mode.pegs; i++) pegs.append(peg(code[i] ?? null));
    const fb = el('div', { class: 'feedback', style: `grid-template-columns: repeat(${Math.ceil(mode.pegs / 2)}, 10px)`, 'aria-label': g ? `${g.result.exact} exact, ${g.result.near} near` : '' });
    for (let i = 0; i < mode.pegs; i++) fb.append(el('i', { class: g ? (i < g.result.exact ? 'exact' : i < g.result.exact + g.result.near ? 'near' : '') : '' }));
    row.replaceChildren(el('small', { class: 'num' }, r + 1), pegs, fb);
    if (g && !reduced.matches) row.classList.add('reveal');
  });
  const cur = $('current');
  cur.replaceChildren(...Array.from({ length: mode.pegs }, (_, i) => el('button', { class: 'slot', onclick: () => removeAt(i), 'aria-label': game.current[i] != null ? `Remove ${COLOR_NAMES[game.current[i]]}` : 'Empty' }, peg(game.current[i] ?? null))));
  $('check').disabled = game.done || game.current.length < mode.pegs;
  $('title').textContent = titleOf(spec);
  $('subtitle').textContent = `${spec.mode === 'hard' ? 'Hard · 5 × 8' : 'Classic · 4 × 6'}${spec.daily ? streakText() : ''}`;
  $('moves').textContent = game.guesses.length;
  $('par').textContent = game.par;
  $('hint-btn').disabled = game.done;
  $('secret').replaceChildren(...game.secret.map((c) => (game.done ? peg(c) : el('span', { class: 'peg hidden' }, '?'))));
}

const streakText = () => {
  const s = dailyStreak(store.get(`daily-${spec.mode}`, {}), today());
  return s ? ` · ${s}-day streak` : '';
};

function resultRating() {
  if (!game.won) return { over: 99, label: 'Not this time', emoji: '🔒', icon: 'medal', tier: 0 };
  const r = rating(game.guesses.length, game.par);
  if (game.hints) return { ...r, label: 'Cracked with help', emoji: '💡', icon: 'bulb', tier: Math.min(r.tier, 1) };
  return r;
}

function finish() {
  const n = game.guesses.length;
  if (spec.daily) {
    const log = store.get(`daily-${spec.mode}`, {});
    if (!log[spec.daily]) store.set(`daily-${spec.mode}`, { ...log, [spec.daily]: { n, par: game.par, won: game.won, hints: game.hints } });
  }
  const stats = store.get('stats', { played: 0, won: 0, perfect: 0, total: 0 });
  stats.played++;
  if (game.won) {
    stats.won++;
    stats.total += n;
    if (n <= game.par && !game.hints) stats.perfect++;
  }

  if (game.won) {
    ach.unlock('first');
    ach.add('cracked-50');
    if (n <= game.par && !game.hints) ach.unlock('par');
    if (spec.mode === 'hard') ach.unlock('hard');
    if (n <= 3) ach.unlock('three');
  }
  if (spec.daily) {
    ach.unlock('daily');
    const streak = dailyStreak(store.get(`daily-${spec.mode}`, {}), today());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  store.set('stats', stats);
  if (game.won) sfx.win();
  else sfx.lose();
  setTimeout(openResults, 700);
}

function shareLine() {
  const r = resultRating();
  const rows = game.guesses.map(({ result }) => '🟢'.repeat(result.exact) + '🟡'.repeat(result.near) + '⚪'.repeat(MODES[spec.mode].pegs - result.exact - result.near)).join('\n');
  const n = game.guesses.length;
  const text = `Code Breaker · ${titleOf(spec)}${spec.mode === 'hard' ? ' (hard)' : ''} ${r.emoji}\n${game.won ? `${n} guesses · par ${game.par} (${overText(n - game.par)})` : 'Not cracked'}${game.hints ? ` · 💡${game.hints}` : ''}\n${rows}`;
  const params = spec.daily ? { m: spec.mode, d: spec.daily, g: game.won ? n : '' } : { m: spec.mode, n: spec.n, g: game.won ? n : '' };
  return { text, url: location.origin + location.pathname + buildHash(params) };
}

function openResults() {
  const n = game.guesses.length;
  const notes = [];
  if (!game.won) notes.push(note('The code is shown at the top.'));
  if (spec.daily) {
    const s = dailyStreak(store.get(`daily-${spec.mode}`, {}), today());
    if (s) notes.push(note(`${s}-day streak`, { icon: 'flame' }));
  }
  if (game.challenge && game.won) {
    const diff = Number(game.challenge) - n;
    notes.push(note(diff > 0 ? `You beat your friend by ${diff}!` : diff === 0 ? 'Tied with your friend' : `Your friend did it in ${game.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
  }
  const current = spec;
  showResults({
    title: titleOf(spec),
    rating: resultRating(),
    reels: [{ label: 'Guesses', value: game.won ? n : 0 }, { label: 'Par', value: game.par }],
    squares: game.won ? squares(n, game.par) : null,
    notes,
    share: shareLine,
    actions: [{ label: 'See the board', value: null }, { label: 'Next code →', value: 'next', primary: true }],
    sounds: {},
    reduced: reduced.matches,
  }).then((v) => v === 'next' && current === spec && load({ mode: spec.mode, n: nextNumber(spec.mode) }));
}

function nextNumber(mode) {
  const n = store.get(`next-${mode}`, 1);
  store.set(`next-${mode}`, n + 1);
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
    load(s);
  };
  const sub = (mode) => {
    const r = store.get(`daily-${mode}`, {})[key];
    return r ? (r.won ? `Cracked in ${r.n} (par ${r.par})` : 'Not cracked today') : 'Same code for everyone today';
  };
  const body = el(
    'div',
    {},
    el(
      'div',
      { class: 'menu-list' },
      menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, sub('classic'), go({ mode: 'classic', daily: key })),
      menuCard('star', `Daily hard #${dailyNumber(key, LAUNCH_DAY)}`, sub('hard'), go({ mode: 'hard', daily: key })),
      menuCard('infinity', 'New code', 'Classic: 4 pegs, 6 colours', go({ mode: 'classic', n: nextNumber('classic') })),
      menuCard('infinity', 'New hard code', '5 pegs, 8 colours', go({ mode: 'hard', n: nextNumber('hard') })),
    ),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openStats()) }, withIcon('chart', 'Stats')), el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openSettings()) }, withIcon('settings', 'Settings'))),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openHelp()) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Code Breaker', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openStats() {
  const s = store.get('stats', { played: 0, won: 0, perfect: 0, total: 0 });
  const stat = (v, l) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l));
  openDialog({ title: 'Stats', body: el('div', { class: 'stat-grid' }, stat(s.played, 'Played'), stat(s.played ? `${Math.round((100 * s.won) / s.played)}%` : '–', 'Cracked'), stat(s.won ? (s.total / s.won).toFixed(1) : '–', 'Avg guesses'), stat(s.perfect, 'At par'), stat(dailyStreak(store.get('daily-classic', {}), today()), 'Streak'), stat(dailyStreak(store.get('daily-hard', {}), today()), 'Hard streak')) });
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Shapes on pegs', settings.get('symbols'), (v) => settings.set('symbols', v), 'Every colour has its own shape, for colour-blind play'),
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
      el('p', {}, 'A secret code of coloured pegs is hidden at the top. Colours can repeat. Pick colours from the bottom row and tap Check.'),
      el('p', {}, 'Each guess gets clues: ', el('span', { class: 'fb-demo exact' }), ' (gold) a peg is the right colour in the right place; ', el('span', { class: 'fb-demo near' }), ' (ring) a peg is the right colour in the wrong place. The clues don’t say which pegs they mean.'),
      el('p', {}, el('b', {}, 'Par'), ' is how many guesses a careful solver needs for this code. Crack it in par for a Perfect. Hints suggest the guess that narrows things down the most.'),
      el('p', { class: 'muted' }, 'Keys: 1–8 pick colours, Backspace removes, Enter checks, H hints.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('hint-btn').addEventListener('click', hint);
$('new-btn').addEventListener('click', () => load({ mode: spec.mode, n: nextNumber(spec.mode) }));
$('hint-btn').prepend(icon('bulb', { size: 22 }));
$('new-btn').prepend(icon('infinity', { size: 22 }));
$('menu-btn').prepend(icon('levels', { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (!spec || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const n = Number(e.key);
  if (n >= 1 && n <= MODES[spec.mode].colors) place(n - 1);
  else if (e.key === 'Backspace') removeAt(game.current.length - 1);
  else if (e.key === 'Enter') submit();
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
  if (h.m !== 'classic' && h.m !== 'hard') return null;
  history.replaceState(null, '', location.pathname + location.search);
  const challenge = /^\d+$/.test(h.g || '') ? Number(h.g) : null;
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { spec: { mode: h.m, daily: h.d > today() ? today() : h.d }, challenge };
  if (Number(h.n) >= 1) return { spec: { mode: h.m, n: Math.floor(Number(h.n)) }, challenge };
  return null;
}

const link = fromLink();
if (link) load(link.spec, { challenge: link.challenge });
else load(store.get('last') || { mode: 'classic', daily: today() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}
addEventListener('hashchange', () => {
  const next = fromLink();
  if (next) load(next.spec, { challenge: next.challenge });
});

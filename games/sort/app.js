import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, openDialog, toggle, segmented, el, toast, hideToast, offerHallows } from './core/ui.js';
import { setSoundEnabled } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { PLAIN, pourAmount, pour, replay, isComplete, isSolved, isOpen, lockOf, hasLegalMove } from './js/rules.js';
import { levelColors, levelSeed, generate, generateAdvanced, DAILY_COLORS, LAUNCH_DAY } from './js/levels.js';
import { solve } from './js/solver.js';
import { THEMES, themeById } from './js/themes.js';
import { Renderer } from './js/render.js';
import { sfx, setSoundTheme } from './js/sfx.js';

const store = makeStore('pour');
const ach = makeAchievements('sort', ACHIEVEMENTS);
const settings = makeSettings(store, {
  skin: null,
  sound: true,
  vibrate: true,
  symbols: null, // null: follow the theme
  patterns: null, // null: follow the theme
  effects: true,
  speed: 'normal',
});
// The newer of the player's pick here and the look chosen on the games list
// (core/hallows.js); with neither, the season's theme (Hallows in autumn).
const skinId = () => themeFor(settings.get('skin'), settings.get('skinAt'), 'neon');
const pickSkin = (id) => {
  settings.set('skinAt', Date.now());
  settings.set('skin', id);
};

const COLOR_NAMES = ['red', 'yellow', 'cyan', 'lime', 'violet', 'orange', 'pink', 'blue', 'green', 'white', 'brown', 'grey'];
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let game = null;
let selected = -1;
let combo = 0;
let loadToken = 0;

const renderer = new Renderer($('canvas'), $('stage'), { onTap: tap });
$('canvas').renderer = renderer; // reachable from browser tests

// ---------- Settings and themes ----------

function applySettings() {
  const theme = themeById(skinId());
  document.body.dataset.skin = theme.id;
  applyTheme(theme.id === 'hallows' ? 'hallows' : theme.dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.id === 'hallows' ? '#120c22' : theme.dark ? '#0d0724' : '#fff6e2');
  setSoundEnabled(settings.get('sound'));
  setSoundTheme(theme);
  renderer.setTheme(theme);
  const effects = settings.get('effects');
  document.body.classList.toggle('no-effects', !effects || reducedMotion.matches);
  renderer.setOptions({
    symbols: settings.get('symbols') ?? !!theme.symbols,
    patterns: settings.get('patterns') ?? !!theme.patterns,
    effects,
    reduced: reducedMotion.matches,
    speed: settings.get('speed') === 'fast' ? 1.6 : 1,
    vibrate: settings.get('vibrate'),
  });
}
settings.onChange(applySettings);
reducedMotion.addEventListener?.('change', applySettings);
applySettings();
offerHallows(store, skinId(), () => pickSkin('hallows'));
onLookChange(applySettings);

const colorName = (c) => (themeById(skinId()).names || COLOR_NAMES)[c] || `colour ${c + 1}`;
const announce = (text) => ($('announce').textContent = text);

// ---------- Background work (puzzle generation and hints) ----------

// Two workers: one builds puzzles (Advanced ones take a few seconds, and the
// next level is built ahead), the other answers solves for hints and the
// dead-end check, so neither waits on the other.
let worker = null; // the solving worker; false when workers are unavailable
const lanes = { solve: null, build: null };
let lookahead = { key: null, result: null };
const pending = new Map();
let nextId = 1;

function runLocal(type, data) {
  if (type === 'generate') return generate(data.seed, data.colors);
  if (type === 'advanced') return generateAdvanced(data.level);
  return solve(data.tubes, { layout: data.layout, moves: data.moves, maxNodes: 250000 });
}

function startWorker(lane) {
  try {
    const w = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data: msg }) => {
      pending.get(msg.id)?.resolve(msg.result);
      pending.delete(msg.id);
    };
    w.onerror = () => {
      lanes.solve = lanes.build = worker = false;
      for (const job of pending.values()) job.resolve(runLocal(job.type, job.data));
      pending.clear();
    };
    return w;
  } catch {
    return false;
  }
}

function run(type, data) {
  return new Promise((resolve) => {
    const lane = type === 'solve' ? 'solve' : 'build';
    if (lanes[lane] === null && worker !== false) lanes[lane] = startWorker(lane);
    if (lane === 'solve') worker = lanes.solve;
    const w = lanes[lane];
    if (!w) {
      setTimeout(() => resolve(runLocal(type, data)), 30);
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, type, data });
    w.postMessage({ id, type, ...data });
  });
}

// Advanced puzzles by level, built ahead so the next one is ready at once.
const built = new Map();
function buildAdvanced(level) {
  if (!built.has(level)) built.set(level, run('advanced', { level }));
  return built.get(level);
}

// ---------- Progress ----------

const progress = () => ({ level: 1, best: {}, solved: 0, perfect: 0, ...store.get('progress') });
// Advanced has its own track: best pours, and in hardcore the fewest lives.
const advanced = () => ({ level: 1, best: {}, lives: {}, solved: 0, perfect: 0, flawless: 0, ...store.get('advanced') });
const dailyLog = () => store.get('daily', {});
const today = () => dateKey();

function specOf(g) {
  if (g.mode === 'daily') return { mode: 'daily', date: g.date };
  if (g.mode === 'advanced') return { mode: 'advanced', level: g.level, hardcore: !!g.hardcore };
  return { mode: 'level', level: g.level };
}
const specId = (spec) => (spec.mode === 'daily' ? `daily:${spec.date}` : spec.mode === 'advanced' ? `adv:${spec.level}${spec.hardcore ? ':hc' : ''}` : `level:${spec.level}`);

function specParams(spec) {
  if (spec.mode === 'daily') return { seed: dailySeed('pour', spec.date), colors: DAILY_COLORS };
  return { seed: levelSeed(spec.level), colors: levelColors(spec.level) };
}

// ---------- Loading puzzles ----------

async function load(spec, { challenge = null, fresh = false } = {}) {
  const token = ++loadToken;
  const id = specId(spec);
  const saved = store.get('game');
  if (!fresh && saved && saved.id === id && !saved.done) {
    game = saved;
    game.solving = false;
    if (challenge) game.challenge = challenge;
    begin();
    return;
  }
  selected = -1;
  const mixing = setTimeout(() => ($('mixing').hidden = false), 180);
  renderer.setTubes([]);
  game = null;
  updateHud();
  let result;
  if (spec.mode === 'advanced') result = await buildAdvanced(spec.level);
  else result = await run('generate', specParams(spec));
  clearTimeout(mixing);
  $('mixing').hidden = true;
  if (token !== loadToken) return;
  game = {
    id,
    ...spec,
    colors: result.colors,
    start: result.tubes,
    tubes: result.tubes.map((t) => t.slice()),
    layout: result.layout || null,
    par: result.par,
    history: [],
    hints: 0,
    extra: false,
    done: false,
    challenge,
  };
  if (spec.hardcore) {
    game.lives = 1;
    game.limit = pourLimit(game.par);
  }
  begin();
}

// Hardcore: going over this many pours costs a life.
const pourLimit = (par) => par + Math.max(2, Math.ceil(par * 0.15));
const layoutOf = (g = game) => g?.layout || PLAIN;
const sizeOf = (g = game) => layoutOf(g).size;
const movesMade = () => game.history.length;

// What each tube shows on top of its liquid: a lock (key colour) or ice.
function tubeStatus() {
  const layout = layoutOf();
  return game.tubes.map((_, i) => {
    const kind = layout.kinds?.[i];
    if (!kind) return { locked: null, ice: 0 };
    return {
      locked: lockOf(game.tubes, i, layout),
      ice: kind.ice ? Math.max(0, kind.ice - movesMade()) : 0,
    };
  });
}
const showStatus = () => game && renderer.setStatus(tubeStatus());

function begin() {
  selected = -1;
  combo = 0;
  renderer.setTubes(game.tubes, { layout: game.layout });
  renderer.setStatus(tubeStatus().map(() => ({ locked: null, ice: 0 })));
  showStatus();
  updateHud();
  save();
  const c = game.challenge;
  $('challenge').hidden = !c;
  if (c) $('challenge').replaceChildren(icon('flag', { size: 16 }), ` Beat ${c} moves · par is ${game.par}`);
  announce(`${titleText()}. ${game.colors} colours, par ${game.par}.${game.hardcore ? ` Hardcore: limit ${game.limit} pours.` : ''}`);
  checkAhead();
  if (game.mode === 'advanced') {
    introduce(game);
    buildAdvanced(game.level + 1);
  }
}

// ---------- Advanced: the twists, explained the first time each appears ----------

const TWISTS = [
  { id: 'small', has: () => true, title: 'Advanced', text: 'Only one spare tube here, plus a small one that holds less. Every level is the hardest of several puzzles, and new twists arrive as you go.' },
  { id: 'hidden', has: (g) => g.start.some((t) => t.some((u) => u < 0)), title: 'Hidden layers', text: 'Liquid marked ? is hidden until it reaches the top of its tube. A hidden unit does not pour along with the colour above it.' },
  { id: 'lock', has: (g) => g.layout?.kinds?.some((k) => k?.key != null), title: 'Locked tubes', text: 'A padlocked tube cannot be poured from or into. It opens once a tube of the padlock’s colour is finished.' },
  { id: 'ice', has: (g) => g.layout?.kinds?.some((k) => k?.ice), title: 'Frozen tubes', text: 'A frozen tube thaws after the number of pours shown on it. Until then it cannot be used.' },
  { id: 'tall', has: (g) => g.layout?.size > 4, title: 'Taller tubes', text: 'These tubes hold more, and each colour has as many units as a tube holds.' },
];

function introduce(g) {
  const seen = store.get('twists', []);
  const fresh = TWISTS.filter((t) => !seen.includes(t.id) && t.has(g));
  if (!fresh.length) return;
  store.set('twists', [...seen, ...fresh.map((t) => t.id)]);
  const twist = fresh.at(-1);
  openDialog({ title: twist.title, body: el('p', {}, twist.text), actions: [{ label: 'Got it', value: true, primary: true }] });
}

function twistsOf(g) {
  const kinds = g.layout?.kinds || [];
  const out = [];
  if (g.layout?.size > 4) out.push('Tall tubes');
  if (g.start.some((t) => t.some((u) => u < 0))) out.push('Hidden');
  if (kinds.some((k) => k?.key != null)) out.push('Locked');
  if (kinds.some((k) => k?.ice)) out.push('Frozen');
  return out;
}

const save = () => game && store.set('game', game);

function titleText() {
  if (!game) return 'Pour';
  if (game.mode === 'daily') return `Daily #${dailyNumber(game.date, LAUNCH_DAY)}`;
  return game.mode === 'advanced' ? `Advanced ${game.level}` : `Level ${game.level}`;
}

function updateHud() {
  $('title').textContent = titleText();
  const sub = $('subtitle');
  if (!game) sub.textContent = '';
  else if (game.mode === 'daily') {
    const d = new Date(`${game.date}T12:00`);
    const streak = dailyStreak(dailyLog(), today());
    sub.textContent = `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${streak ? ` · ${streak}-day streak` : ''}`;
  } else if (game.mode === 'advanced') {
    const twists = twistsOf(game);
    const about = twists.length > 1 ? `${twists.length} twists` : twists.length ? twists[0] : `${game.colors} colours`;
    sub.textContent = game.hardcore ? `Hardcore · life ${game.lives} · par ${game.par}` : `${about} · par ${game.par}`;
  } else {
    const best = progress().best[game.level];
    sub.textContent = `${game.colors} colours${best ? ` · best ${best.moves}` : ''}`;
  }
  const moves = game ? game.history.length : 0;
  const movesEl = $('moves');
  if (movesEl.textContent !== String(moves)) {
    movesEl.textContent = moves;
    const chip = movesEl.parentElement;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }
  const hardcore = !!game?.hardcore;
  movesEl.parentElement.classList.toggle('over', !!game && moves > game.par);
  $('par-label').textContent = hardcore ? 'Limit' : 'Par';
  $('par').textContent = game ? (hardcore ? game.limit : game.par) : '–';
  $('undo-btn').disabled = !game || !game.history.length || game.done || hardcore;
  $('restart-btn').disabled = !game || !game.history.length || game.done;
  $('hint-btn').disabled = !game || game.done || hardcore;
  $('tube-btn').disabled = !game || game.done || game.extra || hardcore;
  document.body.classList.toggle('hardcore', hardcore);
}

// ---------- Playing ----------

function tap(i) {
  if (!game || game.done || game.solving) return;
  renderer.setFocus(-1);
  const tubes = game.tubes;
  if (!isOpen(tubes, i, layoutOf(), movesMade())) {
    renderer.shake(i);
    sfx.invalid();
    explainClosed(i);
    return;
  }
  if (selected < 0) {
    if (!tubes[i].length || isComplete(tubes[i], sizeOf()) || renderer.isBusy(i)) {
      renderer.shake(i);
      sfx.invalid();
      return;
    }
    select(i);
    return;
  }
  if (i === selected) {
    select(-1);
    sfx.deselect();
    return;
  }
  if (renderer.isBusy(i)) return;
  const n = pourAmount(tubes, selected, i, layoutOf(), movesMade());
  if (n) {
    move(selected, i, n);
    return;
  }
  if (tubes[i].length && !isComplete(tubes[i], sizeOf())) select(i);
  else {
    renderer.shake(i);
    sfx.invalid();
  }
}

function explainClosed(i) {
  const st = tubeStatus()[i];
  const text = st.locked != null ? `Locked until a ${colorName(st.locked)} tube is finished` : `Frozen for ${st.ice} more pour${st.ice === 1 ? '' : 's'}`;
  toast(text, { position: 'top', duration: 1800 });
  announce(text);
}

function select(i) {
  selected = i;
  renderer.select(i);
  if (i >= 0) sfx.select();
}

async function move(from, to, n) {
  const color = game.tubes[from].at(-1);
  const before = game.tubes;
  game.tubes = pour(game.tubes, from, to, layoutOf(), movesMade());
  game.history.push([from, to, n]);
  selected = -1;
  renderer.select(-1);
  const solved = isSolved(game.tubes, sizeOf());
  const revealed = before[from].length > n && before[from].at(-n - 1) < 0;
  if (solved) game.solving = true;
  updateHud();
  save();
  announce(`Poured ${colorName(color)} from tube ${from + 1} into tube ${to + 1}. ${game.history.length} moves.`);
  const current = game;
  await renderer.pour(from, to, n, color, {
    onStart: ({ duration, fromLevel, toLevel }) => sfx.pour(duration, fromLevel, toLevel),
    onLanded: () => {
      if (current !== game) return;
      if (revealed) {
        renderer.sync(from, game.tubes[from], { flash: true });
        sfx.select();
      }
      if (before[to].some((u) => u < 0)) renderer.sync(to, game.tubes[to], { flash: true });
      showStatus();
      if (isComplete(game.tubes[to], sizeOf())) {
        renderer.complete(to, combo);
        sfx.complete(combo);
        combo++;
      } else combo = 0;
    },
  });
  if (current !== game) return;
  showStatus();
  if (solved && !game.done) win();
  else if (!solved) checkAhead();
}

// After each move, look ahead in the worker and say so at once if the puzzle
// can no longer be finished, rather than waiting for the player to ask.
// A found solution is kept so Hint can answer without solving again.
const positionKey = () => `${game.tubes.length}|${game.tubes.map((t) => t.join(',')).join('/')}`;
const notice = (message) => toast(message, { position: 'top', duration: 0, action: { label: 'Undo', onClick: undo } });

async function checkAhead() {
  hideToast();
  if (!game || game.done || game.solving) return;
  const hardcore = game.hardcore;
  if (!hasLegalMove(game.tubes, layoutOf(), movesMade())) return hardcore ? loseLife('No moves left.') : notice('No moves left');
  if (hardcore && movesMade() >= game.limit) return loseLife(`That was the last of your ${game.limit} pours.`);
  // Without a worker the solver would block the page, so leave it to Hint.
  if (worker === false) return;
  const current = game;
  const key = positionKey();
  lookahead = { key, result: null };
  const result = await run('solve', { tubes: game.tubes, layout: layoutOf(), moves: movesMade() });
  if (current !== game || lookahead.key !== key || positionKey() !== key || game.done || game.solving) return;
  lookahead.result = result;
  if (result.gaveUp) return;
  if (hardcore) {
    if (!result.moves) loseLife('There is no way to finish from here.');
    else if (movesMade() + result.moves.length > game.limit) loseLife(`It can’t be finished within ${game.limit} pours from here.`);
  } else if (!result.moves) notice('No way to finish from here');
}

// Hardcore: a dead end costs a life and starts the puzzle again.
async function loseLife(reason) {
  const current = game;
  game.solving = true;
  sfx.invalid();
  await new Promise((r) => setTimeout(r, 450));
  if (current !== game) return;
  await openDialog({
    title: 'Life lost',
    body: el('div', {}, el('p', {}, reason), el('p', { class: 'muted' }, `Starting again on life ${game.lives + 1}.`)),
    actions: [{ label: 'Try again', value: true, primary: true }],
  });
  if (current !== game) return;
  game.lives++;
  game.solving = false;
  game.tubes = game.start.map((t) => t.slice());
  game.history = [];
  begin();
}

function undo() {
  if (!game || game.done || game.solving || !game.history.length || renderer.busy) return;
  const [from, to, n] = game.history.pop();
  const color = game.tubes[to].at(-1);
  // Replaying keeps hidden units hidden again and frozen tubes frozen.
  game.tubes = replay(game.start, game.history, layoutOf());
  select(-1);
  combo = 0;
  renderer.uncap(to);
  renderer.sync(from, game.tubes[from].slice(0, -n));
  const current = game;
  renderer.pour(to, from, n, color, { onStart: ({ duration }) => sfx.pour(duration * 0.8, 2, 3) }).then(() => {
    if (current !== game) return;
    renderer.sync(from, game.tubes[from]);
    renderer.sync(to, game.tubes[to]);
  });
  showStatus();
  updateHud();
  save();
  announce(`Undid a move. ${game.history.length} moves.`);
  checkAhead();
}

async function restart() {
  if (!game || game.done || game.solving || !game.history.length) return;
  const ok = await openDialog({
    title: 'Restart puzzle?',
    body: el('p', {}, game.hardcore ? 'Start again from the beginning. In hardcore this uses a life.' : 'Start this puzzle again from the beginning.'),
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Restart', value: true, primary: true },
    ],
  });
  if (!ok) return;
  if (game.hardcore) game.lives++;
  game.tubes = game.start.map((t) => t.slice());
  game.history = [];
  begin();
}

async function hint() {
  if (!game || game.done || game.solving || game.hardcore) return;
  $('hint-btn').disabled = true;
  const current = game;
  const key = positionKey();
  const result = lookahead.key === key && lookahead.result ? lookahead.result : await run('solve', { tubes: game.tubes, layout: layoutOf(), moves: movesMade() });
  updateHud();
  if (current !== game) return;
  if (result.moves?.length) {
    const [from, to] = result.moves[0];
    select(-1);
    renderer.showHint(from, to);
    game.hints++;
    save();
    sfx.hint();
    announce(`Hint: pour tube ${from + 1} into tube ${to + 1}.`);
  } else if (result.gaveUp) toast('Too tangled to see ahead — try a different move', { position: 'top' });
  else notice('No way to finish from here');
}

async function addTube() {
  if (!game || game.done || game.extra || game.hardcore) return;
  if (!store.get('tubeExplained')) {
    const ok = await openDialog({
      title: 'Add an empty tube?',
      body: el('p', {}, 'One extra tube makes any puzzle easier. It is free here — your result is just marked as helped, so par stays honest.'),
      actions: [
        { label: 'Cancel', value: false },
        { label: 'Add tube', value: true, primary: true },
      ],
    });
    if (!ok) return;
    store.set('tubeExplained', true);
  }
  game.tubes = [...game.tubes, []];
  game.extra = true;
  renderer.addTube();
  updateHud();
  save();
  checkAhead();
}

// ---------- Winning ----------

// Hardcore is scored by lives: finishing on the first one is Flawless.
function livesRating(lives) {
  if (lives === 1) return { over: 0, label: 'Flawless', emoji: '💎', icon: 'diamond', tier: 3 };
  if (lives === 2) return { over: 1, label: 'Second life', emoji: '🌟', icon: 'star', tier: 2 };
  if (lives <= 4) return { over: lives - 1, label: `${lives} lives`, emoji: '✅', icon: 'check', tier: 1 };
  return { over: lives - 1, label: `${lives} lives`, emoji: '👍', icon: 'medal', tier: 0 };
}

function resultRating() {
  if (game.hardcore) return livesRating(game.lives);
  const r = rating(game.history.length, game.par);
  if (game.hints || game.extra) return { ...r, label: 'Solved with help', emoji: game.extra ? '🧪' : '💡', icon: game.extra ? 'flask' : 'bulb', tier: Math.min(r.tier, 1) };
  return r;
}

async function win() {
  game.done = true;
  game.solving = false;
  select(-1);
  const moves = game.history.length;
  const assisted = !!(game.hints || game.extra);
  const r = resultRating();
  if (game.mode === 'advanced') return winAdvanced(r);
  const p = progress();
  p.solved++;
  if (r.tier === 3) p.perfect++;
  if (game.mode === 'level') {
    const prev = p.best[game.level];
    const better = !prev || (prev.assisted && !assisted) || (prev.assisted === assisted && moves < prev.moves);
    if (better) p.best[game.level] = { moves, assisted };
    if (game.level === p.level) p.level++;
  } else {
    const log = dailyLog();
    if (!log[game.date]) store.set('daily', { ...log, [game.date]: { moves, par: game.par, hints: game.hints, extra: game.extra } });
  }

  ach.unlock('first');
  ach.add('solved-50');
  if (r.tier >= 3) ach.unlock('perfect');
  ach.at('birdie', p.perfect + advanced().perfect);
  ach.at('level-10', game.mode === 'level' ? p.level - 1 : 0);
  ach.at('level-25', game.mode === 'level' ? p.level - 1 : 0);
  if (game.mode === 'daily') {
    ach.unlock('daily');
    const streak = dailyStreak(dailyLog(), today());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  if (game.mode === 'level' && game.level >= 20 && !game.extra) ach.unlock('no-extra');
  store.set('progress', p);
  save();
  updateHud();
  announce(`Solved in ${moves} moves. Par ${game.par}. ${r.label}.`);
  await renderer.celebrate({ onStep: (i) => sfx.marquee(i), onJackpot: () => sfx.jackpot() });
  openResults();
}

async function winAdvanced(r) {
  const moves = game.history.length;
  const assisted = !!(game.hints || game.extra);
  const a = advanced();
  a.solved++;
  if (!game.hardcore && r.tier === 3) a.perfect++;
  const prev = a.best[game.level];
  if (!prev || (prev.assisted && !assisted) || (prev.assisted === assisted && moves < prev.moves)) a.best[game.level] = { moves, assisted };
  if (game.hardcore) {
    if (!a.lives[game.level] || game.lives < a.lives[game.level]) a.lives[game.level] = game.lives;
    if (game.lives === 1) a.flawless++;
  }
  if (game.level === a.level) a.level++;
  store.set('advanced', a);

  ach.unlock('first');
  ach.add('solved-50');
  ach.unlock('advanced');
  if (!game.hardcore && r.tier >= 3) ach.unlock('perfect');
  ach.at('birdie', progress().perfect + a.perfect);
  ach.at('advanced-10', a.level - 1);
  ach.at('advanced-25', a.level - 1);
  ach.at('advanced-50', a.level - 1);
  const twists = twistsOf(game);
  if (twists.includes('Hidden')) ach.unlock('hidden');
  if (twists.includes('Locked')) ach.unlock('locked');
  if (twists.includes('Frozen')) ach.unlock('frozen');
  if (game.hardcore) {
    ach.unlock('hardcore');
    ach.at('flawless-10', a.flawless);
    if (game.lives === 1) ach.unlock('flawless');
  }
  save();
  updateHud();
  announce(game.hardcore ? `Solved on life ${game.lives}. ${r.label}.` : `Solved in ${moves} moves. Par ${game.par}. ${r.label}.`);
  await renderer.celebrate({ onStep: (i) => sfx.marquee(i), onJackpot: () => sfx.jackpot() });
  openResults();
}

function shareLine() {
  const moves = game.history.length;
  const r = resultRating();
  const title = game.mode === 'daily' ? `Pour · Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : game.mode === 'advanced' ? `Pour · Advanced ${game.level}${game.hardcore ? ' · Hardcore' : ''}` : `Pour · Level ${game.level}`;
  const extras = `${game.hints ? ` · 💡${game.hints}` : ''}${game.extra ? ' · 🧪' : ''}`;
  const text = game.hardcore
    ? `${title} ${r.emoji}\n${game.lives === 1 ? 'First life' : `${game.lives} lives`} · ${moves} pours · par ${game.par}`
    : `${title} ${r.emoji}\n${moves} moves · par ${game.par} (${overText(moves - game.par)})${extras}\n${squares(moves, game.par)}`;
  const params = game.mode === 'daily' ? { d: game.date, m: moves } : game.mode === 'advanced' ? { a: game.level, m: game.hardcore ? null : moves } : { l: game.level, m: moves };
  return { text, url: location.origin + location.pathname + buildHash(params) };
}

function openResults() {
  const moves = game.history.length;
  const notes = [];
  if (game.mode === 'daily') {
    const streak = dailyStreak(dailyLog(), today());
    if (streak) notes.push(note(`${streak}-day streak`, { icon: 'flame' }));
  } else if (game.mode === 'advanced') {
    const a = advanced();
    if (game.hardcore && a.lives[game.level] < game.lives) notes.push(note(`Your best here: life ${a.lives[game.level]}`));
    else if (!game.hardcore && a.best[game.level]?.moves < moves) notes.push(note(`Your best here: ${a.best[game.level].moves}`));
  } else {
    const best = progress().best[game.level];
    if (best && best.moves < moves) notes.push(note(`Your best here: ${best.moves}`));
  }
  if (game.challenge) {
    const diff = Number(game.challenge) - moves;
    notes.push(note(diff > 0 ? `You beat your friend by ${diff}!` : diff === 0 ? 'Tied with your friend' : `Your friend did it in ${game.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
  }
  const r = resultRating();
  const actions =
    game.mode === 'level' || game.mode === 'advanced'
      ? [
          { label: r.tier === 3 ? 'Replay' : game.hardcore ? 'Try again' : 'Try for par', value: 'replay' },
          { label: `${game.mode === 'advanced' ? 'Advanced' : 'Level'} ${game.level + 1} →`, value: 'next', primary: true },
        ]
      : [
          { label: 'Replay', value: 'replay' },
          { label: `Level ${progress().level} →`, value: 'levels', primary: true },
        ];
  const current = game;
  showResults({
    title: titleText(),
    rating: r,
    reels: game.hardcore ? [{ label: 'Lives', value: game.lives }, { label: 'Pours', value: moves }] : [{ label: 'Moves', value: moves }, { label: 'Par', value: game.par }],
    squares: game.hardcore ? '' : squares(moves, game.par),
    notes,
    share: shareLine,
    actions,
    sounds: { tick: sfx.tick, stamp: sfx.stamp },
    reduced: reducedMotion.matches,
  }).then((choice) => {
    if (current !== game) return;
    if (choice === 'next') load({ ...specOf(game), level: game.level + 1 });
    else if (choice === 'levels') load({ mode: 'level', level: progress().level });
    else if (choice === 'replay') load(specOf(game), { fresh: true, challenge: game.challenge });
  });
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const p = progress();
  const a = advanced();
  const hardcore = !!store.get('hardcore');
  const key = today();
  const done = dailyLog()[key];
  const streak = dailyStreak(dailyLog(), key);
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  const input = el('input', { type: 'number', min: 1, max: p.level, value: game?.mode === 'level' ? game.level : p.level, 'aria-label': 'Level number', inputmode: 'numeric' });
  const body = el('div', {},
    el('div', { class: 'menu-list' },
      menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`,
        done ? `Solved in ${done.moves} (par ${done.par})${streak ? ` · ${streak}-day streak` : ''}` : `Same puzzle for everyone today${streak ? ` · ${streak}-day streak` : ''}`,
        go(() => load({ mode: 'daily', date: key }))),
      menuCard('tube', `Level ${p.level}`, p.level > 1 ? `${p.level - 1} solved · ${p.perfect} perfect` : 'Start from the beginning', go(() => load({ mode: 'level', level: p.level }))),
      menuCard(hardcore ? 'flame' : 'key', `Advanced ${a.level}${hardcore ? ' · Hardcore' : ''}`,
        a.level > 1 ? `${a.level - 1} solved${hardcore ? ` · ${a.flawless} flawless` : ` · ${a.perfect} perfect`}` : 'One spare tube, hidden layers, locks and ice',
        go(() => load({ mode: 'advanced', level: a.level, hardcore }))),
    ),
    toggle('Hardcore', hardcore, (v) => store.set('hardcore', v), 'Advanced only: no undo or hints, and a dead end or too many pours costs a life'),
    el('div', { class: 'field' },
      el('span', { class: 'field-label' }, 'Play any level you have reached'),
      el('div', { class: 'level-picker' }, input,
        el('button', { class: 'btn', onclick: go(() => {
          const n = Math.max(1, Math.min(p.level, Math.floor(Number(input.value) || 1)));
          load({ mode: 'level', level: n });
        }) }, 'Play'),
        a.level > 1 && el('button', { class: 'btn', onclick: go(() => {
          const n = Math.max(1, Math.min(a.level, Math.floor(Number(input.value) || 1)));
          load({ mode: 'advanced', level: n, hardcore: !!store.get('hardcore') });
        }) }, 'Advanced'))),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openThemes) }, withIcon('palette', 'Themes')),
      el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings'))),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openStats) }, withIcon('chart', 'Stats')),
      el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Pour', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openThemes() {
  const current = skinId();
  const grid = el('div', { class: 'theme-grid', role: 'radiogroup' },
    THEMES.map((t) =>
      el('label', { class: 'theme-card' },
        el('input', { type: 'radio', name: 'skin', value: t.id, checked: t.id === current, onchange: () => pickSkin(t.id), 'aria-label': t.name }),
        el('span', { class: `face ${t.dark ? 'dark' : 'light'}`, style: `background:${t.preview}` },
          el('b', {}, t.name),
          el('span', { class: 'dots' }, t.colors.slice(0, 6).map((c) => el('i', { style: `background:${c}` })))))),
  );
  openDialog({ title: 'Themes', body: el('div', {}, grid, el('p', { class: 'muted' }, 'Every theme has its own colours, sounds and effects.')) });
}

function openSettings() {
  const theme = themeById(skinId());
  openDialog({
    title: 'Settings',
    body: el('div', {},
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Vibration', settings.get('vibrate'), (v) => settings.set('vibrate', v), 'On phones that support it'),
      toggle('Colour symbols', settings.get('symbols') ?? !!theme.symbols, (v) => settings.set('symbols', v), 'A shape on each colour, for colour-blind play'),
      toggle('Patterns', settings.get('patterns') ?? !!theme.patterns, (v) => settings.set('patterns', v), 'Stripes, dots and checks on the liquids, for grayscale screens'),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Glow, particles and moving backgrounds'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Pour speed'),
        segmented('speed', [['normal', 'Normal'], ['fast', 'Fast']], settings.get('speed'), (v) => settings.set('speed', v))),
    ),
  });
}

function openStats() {
  const p = progress();
  const log = dailyLog();
  const days = Object.keys(log);
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
  openDialog({
    title: 'Stats',
    body: el('div', { class: 'stat-grid' },
      stat(p.level - 1, 'Levels'),
      stat(p.solved, 'Solved'),
      stat(p.perfect, 'Perfect'),
      stat(days.length, 'Dailies'),
      stat(dailyStreak(log, today()), 'Streak'),
      stat(days.filter((d) => log[d].moves <= log[d].par && !log[d].hints && !log[d].extra).length, 'Daily par'),
      stat(advanced().level - 1, 'Advanced'),
      stat(advanced().perfect, 'Adv. perfect'),
      stat(advanced().flawless, 'Flawless')),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    className: 'help',
    body: el('div', {},
      el('p', {}, 'Tap a tube, then tap another to pour. Liquid only lands on the same colour or in an empty tube. Fill every tube with a single colour.'),
      el('p', {}, el('b', {}, 'Par'), ' is the fewest pours that can solve the puzzle — worked out on your device. Match it for a Perfect.'),
      el('ul', {},
        el('li', {}, 'Undo as much as you like; your score is the pours in your final solution.'),
        el('li', {}, 'Hints and the extra tube are free. Results that used them are marked as helped.'),
        el('li', {}, 'The daily puzzle is the same for everyone. Share your result to challenge a friend.')),
      el('p', {}, el('b', {}, 'Advanced'), ' is a second track with one spare tube and a small one. Twists arrive as you go: hidden layers, locked tubes, frozen tubes and taller tubes.'),
      el('p', {}, el('b', {}, 'Hardcore'), ' (Advanced only) turns off undo and hints. A dead end, going over the pour limit or a restart costs a life; your score is how many lives it took.'),
      el('p', { class: 'muted' }, 'Keys: ← → choose, Space pour, Z undo, H hint.'),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.')),
  });
}

// ---------- Controls ----------

$('undo-btn').addEventListener('click', undo);
$('restart-btn').addEventListener('click', restart);
$('hint-btn').addEventListener('click', hint);
$('tube-btn').addEventListener('click', addTube);
$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);

let focus = -1;
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.altKey) return;
  const n = game?.tubes.length || 0;
  if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) undo();
  else if (e.ctrlKey) return;
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    focus = focus < 0 ? Math.max(0, selected) : (focus + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    renderer.setFocus(focus);
  } else if ((e.key === ' ' || e.key === 'Enter') && focus >= 0) {
    e.preventDefault();
    tap(focus);
    renderer.setFocus(focus);
  } else if (e.key === 'Escape' && selected >= 0) select(-1);
  else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) tap(Number(e.key) - 1);
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
  if (!h.d && !h.l && !h.a) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const challenge = /^\d+$/.test(h.m || '') ? Number(h.m) : null;
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { spec: { mode: 'daily', date: h.d > today() ? today() : h.d }, challenge };
  const adv = Math.floor(Number(h.a));
  if (adv >= 1) return { spec: { mode: 'advanced', level: adv, hardcore: false }, challenge };
  const level = Math.floor(Number(h.l));
  if (level >= 1) return { spec: { mode: 'level', level }, challenge };
  return null;
}

const link = fromLink();
const saved = store.get('game');
if (link) load(link.spec, { challenge: link.challenge });
else if (saved && !saved.done && saved.tubes) load(specOf(saved));
else load({ mode: 'level', level: progress().level });

window.addEventListener('hashchange', () => {
  const next = fromLink();
  if (next) load(next.spec, { challenge: next.challenge });
});

import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, openDialog, toggle, segmented, el, toast, offerHallows } from './core/ui.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { audio, setSoundEnabled } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { randomSeed } from './core/rng.js';
import { dateKey, dailyNumber, dailyStreak, parseHash, buildHash, shareText } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon } from './core/icons.js';
import { TICK, initState, cloneState, step, percent } from './js/engine.js';
import { LEVELS, DIFFICULTIES, buildLevel, generate } from './js/levels.js';
import { solve, fair, holdAt } from './js/bot.js';
import { View, drawCube, FACES } from './js/render.js';
import { Music } from './js/music.js';
import { sfx, setSfxEnabled } from './js/sfx.js';

const LAUNCH_DAY = '2026-09-25';
const COLORS = ['#ffd23a', '#3ae8ff', '#ff4fd8', '#5dff8f', '#ff7a3a', '#ff3d5a', '#a45bff', '#3a6bff', '#00c2a8', '#ff9ecf', '#ffffff', '#262626'];
const DICE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>';
const DIFF_COLORS = { 1: '#5dff8f', 2: '#3ae8ff', 3: '#ffd23a', 4: '#ff7a3a', 5: '#ff4fd8' };

const store = makeStore('pulse');
const settings = makeSettings(store, {
  music: true,
  sound: true,
  vibrate: true,
  effects: true,
  pct: true,
  hitboxes: false,
  primary: '#ff4fd8',
  secondary: '#3ae8ff',
  face: 0,
  genDiff: 1,
  theme: null,
});
// The newer of the player's pick here and the look chosen on the games list
// (core/hallows.js); with neither, the season's theme (Hallows in autumn).
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'classic');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const view = new View($('canvas'));
const music = new Music();
$('canvas').view = view; // reachable from browser tests

function applySettings() {
  const hallows = themeId() === 'hallows';
  applyTheme(hallows ? 'hallows' : 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hallows ? '#120c22' : '#101238');
  view.setHallows(hallows);
  setSoundEnabled(settings.get('sound') || settings.get('music'));
  setSfxEnabled(settings.get('sound'));
  view.fx = { effects: settings.get('effects'), reduced: reducedMotion.matches, hitboxes: false };
  view.setSkin({ primary: settings.get('primary'), secondary: settings.get('secondary'), face: settings.get('face') });
  document.body.classList.toggle('hide-pct', !settings.get('pct'));
  drawIconPreview($('icon-preview'));
}
settings.onChange((key, value) => {
  applySettings();
  if (key === 'music' && !value) music.stop();
  if (key === 'music' && value && game && !game.paused) startMusic();
});
reducedMotion.addEventListener?.('change', applySettings);
onLookChange(applySettings);
offerHallows(store, themeId(), () => pickTheme('hallows'));

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

// ---------- Records ----------

const progress = () => store.get('progress', {});
const recordOf = (id) => ({ best: 0, practice: 0, attempts: 0, jumps: 0, done: false, coins: [], doneIn: 0, ...progress()[id] });
function saveRecord(id, rec) {
  store.set('progress', { ...progress(), [id]: rec });
}
const totals = () => ({ attempts: 0, jumps: 0, ...store.get('totals') });
function addTotals(delta) {
  const t = totals();
  for (const [k, v] of Object.entries(delta)) t[k] = (t[k] || 0) + v;
  store.set('totals', t);
}
const today = () => dateKey();

// ---------- Levels ----------

const built = new Map();
const solutions = new Map();

// Bot jobs run in a worker so the menu never stutters; if workers are not
// available the same code runs here.
let worker = null;
const jobs = new Map();
let jobId = 0;
const runHere = (msg) => import('./js/proof.js').then(({ work }) => work(msg));
try {
  worker = new Worker('./js/worker.js', { type: 'module' });
  worker.onmessage = ({ data }) => {
    jobs.get(data.id)?.resolve(data);
    jobs.delete(data.id);
  };
  worker.onerror = () => {
    worker = null;
    for (const { msg, resolve } of jobs.values()) runHere(msg).then(resolve);
    jobs.clear();
  };
} catch {
  worker = null;
}
function ask(msg) {
  if (!worker) return runHere(msg);
  return new Promise((resolve) => {
    const id = ++jobId;
    jobs.set(id, { msg, resolve });
    worker.postMessage({ ...msg, id });
  });
}

const genKey = (seed, d) => `gen:${seed}:${d}`;

// A generated level is re-rolled until the bot beats it fairly (see
// bot.fair). Which re-roll worked is remembered, so it is only proven once.
async function provenLevel(seed, d) {
  const key = genKey(seed, d);
  if (built.has(key)) return built.get(key);
  const proven = store.get('proven', {});
  let k = proven[key];
  if (k == null) {
    const res = await ask({ kind: 'prove', seed, d });
    k = res.k;
    if (res.toggles) solutions.set(key, res.toggles);
    const keep = Object.entries(proven).slice(-30);
    store.set('proven', { ...Object.fromEntries(keep), [key]: k });
  }
  const lv = k >= 0 ? generate(seed, d, k) : generate(seed, 0);
  lv.id = key;
  lv.gen = { seed, d, k };
  built.set(key, lv);
  return lv;
}

// The daily cycles Normal, Easy, Normal, Hard.
const dailyDiff = (date) => [1, 0, 1, 2][(((dailyNumber(date, LAUNCH_DAY) - 1) % 4) + 4) % 4];
const dailyName = (date) => `Daily #${dailyNumber(date, LAUNCH_DAY)}`;

async function levelFor(entry) {
  if (entry.kind === 'level') {
    if (!built.has(entry.id)) built.set(entry.id, buildLevel(entry.def));
    return built.get(entry.id);
  }
  if (entry.kind === 'daily') {
    const lv = await provenLevel(`daily:${entry.date}`, dailyDiff(entry.date));
    lv.dailyName = dailyName(entry.date);
    return lv;
  }
  return provenLevel(`r${entry.seed}`, entry.diff);
}
const idOf = (entry) => (entry.kind === 'level' ? entry.id : entry.kind === 'daily' ? genKey(`daily:${entry.date}`, dailyDiff(entry.date)) : genKey(`r${entry.seed}`, entry.diff));

async function solutionFor(lv) {
  if (!solutions.has(lv.id)) {
    const res = await ask({ kind: 'solve', level: lv.gen || { id: lv.id } });
    solutions.set(lv.id, res.toggles);
  }
  return solutions.get(lv.id);
}

// ---------- Playing ----------

let game = null;
$('canvas').app = { get game() { return game; }, start: (i, opts) => start(entries[i], opts) }; // for browser tests
const pointers = new Set();
const keys = new Set();
const holding = () => pointers.size > 0 || keys.size > 0;

// Presses and releases are timestamped and applied at the tick they really
// happened, not at the next frame, so timing does not depend on frame rate.
const inputs = [];
let simHold = false;
function inputChanged(e, was) {
  const now = performance.now();
  let t = e?.timeStamp;
  if (!(t > now - 1000 && t <= now + 5)) t = now;
  const hold = holding();
  if (hold !== was) inputs.push({ t, hold });
}

function startMusic() {
  if (!game || !settings.get('music')) return;
  music.play(game.lv.song, { practice: game.practice });
}

let starting = null;
async function start(entry, opts = {}) {
  const token = (starting = {});
  const slow = setTimeout(() => toast('Building the level…'), 200);
  const lv = await levelFor(entry);
  const toggles = opts.watch ? await solutionFor(lv) : null;
  clearTimeout(slow);
  if (starting !== token) return;
  begin(entry, lv, { ...opts, toggles });
  solutionFor(lv); // ready for "Watch a run"
}

function begin(entry, lv, { practice = false, watch = false, toggles = null }) {
  const rec = recordOf(lv.id);
  game = {
    entry,
    lv,
    practice,
    watch: watch ? holdAt(toggles || []) : null,
    attempt: rec.attempts + 1,
    session: 1,
    jumps: 0,
    st: initState(lv),
    clock: null,
    time: 0,
    deadT: 0,
    winT: 0,
    paused: false,
    checkpoints: [],
    cand: null,
    sinceCp: 0,
    lastHold: false,
  };
  view.setLevel(lv);
  view.reset();
  document.body.classList.remove('in-menu');
  document.body.classList.toggle('practice', practice);
  $('practice-tools').hidden = !practice || !!watch;
  $('progress-best').style.width = `${practice ? rec.practice : rec.best}%`;
  if (!watch) countAttempt();
  startMusic();
  pointers.clear();
  keys.clear();
  inputs.length = 0;
  simHold = false;
  if (watch) banner('Watch and learn', 'practice', 1600);
  else if (practice) banner('Practice mode', 'practice', 1400);
  announce(`${lv.dailyName || lv.name}. ${practice ? 'Practice mode. ' : ''}Tap or press space to jump.`);
  if (!store.get('rotateTip') && innerHeight > innerWidth && matchMedia('(pointer: coarse)').matches) {
    store.set('rotateTip', true);
    setTimeout(() => toast('Tip: turn your phone sideways to see further ahead'), 1200);
  }
}

function countAttempt() {
  if (game.watch) return;
  const rec = recordOf(game.lv.id);
  rec.attempts++;
  game.attempt = rec.attempts;
  saveRecord(game.lv.id, rec);
  addTotals({ attempts: 1 });
  if (game.entry.kind === 'daily' && !game.practice) {
    const log = dailyLog();
    const day = { attempts: 0, best: 0, done: false, ...log[game.entry.date] };
    if (!day.done) day.attempts++;
    store.set('daily', { ...log, [game.entry.date]: day });
  }
}

function respawn() {
  game.session++;
  const cp = game.practice && game.checkpoints[game.checkpoints.length - 1];
  if (cp) {
    game.st = cloneState(cp.state);
    game.st.buffer = false;
    game.time = cp.time;
  } else {
    game.st = initState(game.lv);
    game.time = 0;
  }
  game.deadT = 0;
  game.cand = null;
  game.sinceCp = 0;
  view.reset();
  countAttempt();
  if (!game.practice || !music.playing) startMusic();
}

function tick(time) {
  const st = game.st;
  let hold;
  let press = false;
  while (inputs.length && inputs[0].t <= time) {
    const e = inputs.shift();
    if (e.hold && !simHold) press = true;
    simHold = e.hold;
  }
  if (game.watch) {
    hold = game.watch(st.tick);
    press = hold && !game.lastHold;
  } else hold = simHold || press; // a tap shorter than a tick still counts
  game.lastHold = hold;
  const events = [];
  step(game.lv, st, hold, press, events);
  game.time += TICK;
  for (const e of events) handle(e);
  if (game.practice && !game.watch && !st.dead && !st.won) autoCheckpoint();
}

// Practice checkpoints drop by themselves every couple of seconds, but
// only count once you have lived a moment past them (so they are never
// placed where you are already doomed).
function autoCheckpoint() {
  const st = game.st;
  game.sinceCp += TICK;
  const stable = st.mode === 'ship' || st.mode === 'wave' || st.grounded;
  if (!game.cand && game.sinceCp >= 2 && stable) game.cand = { state: cloneState(st), time: game.time, x: st.x, y: st.y };
  if (game.cand && game.time - game.cand.time >= 0.6) {
    game.checkpoints.push(game.cand);
    game.cand = null;
    game.sinceCp = 0;
  }
}

function placeCheckpoint() {
  if (!game?.practice || game.st.dead || game.st.won || game.paused) return;
  const st = game.st;
  game.checkpoints.push({ state: cloneState(st), time: game.time, x: st.x, y: st.y });
  game.cand = null;
  game.sinceCp = 0;
  sfx.checkpoint();
}
function removeCheckpoint() {
  if (!game?.practice || !game.checkpoints.length) return;
  game.checkpoints.pop();
  game.cand = null;
  game.sinceCp = 0;
  sfx.tick();
}

function handle(e) {
  const st = game.st;
  switch (e.type) {
    case 'jump':
      game.jumps++;
      break;
    case 'orb':
    case 'pad':
      view.ringAt(e.obj.x + 0.5, e.obj.y + 0.5, e.type === 'orb' ? '#ffffff' : '#ffe14a', 1.2);
      break;
    case 'portal':
      view.ringAt(st.x, st.y, '#ffffff', 2);
      sfx.portal();
      break;
    case 'coin':
      view.burst(e.obj.x + 0.5, e.obj.y + 0.5, { n: 16, colors: ['#ffcc2a', '#fff5c2'], speed: 5, size: 0.14 });
      sfx.coin();
      break;
    case 'die':
      onDie();
      break;
    case 'win':
      onWin();
      break;
  }
}

function onDie() {
  const st = game.st;
  view.explode(st);
  sfx.die();
  vibrate(35);
  game.cand = null;
  if (!game.practice) music.stop(0.12);
  if (game.watch) return;
  addTotals({ jumps: game.jumps });
  const rec = recordOf(game.lv.id);
  rec.jumps += game.jumps;
  game.jumps = 0;
  const pct = percent(game.lv, st);
  const key = game.practice ? 'practice' : 'best';
  if (pct > rec[key]) {
    if (rec[key] > 0 && !game.practice && pct >= 10) banner(`New best! ${pct}%`, 'practice', 1100);
    rec[key] = pct;
    $('progress-best').style.width = `${pct}%`;
  }
  saveRecord(game.lv.id, rec);
  if (game.entry.kind === 'daily' && !game.practice) {
    const log = dailyLog();
    const day = { attempts: 0, best: 0, done: false, ...log[game.entry.date] };
    day.best = Math.max(day.best, pct);
    store.set('daily', { ...log, [game.entry.date]: day });
  }
}

function onWin() {
  sfx.complete();
  vibrate([20, 40, 20]);
  banner(game.watch ? 'That is how it is done' : game.practice ? 'Practice complete!' : 'Level complete!', game.watch || game.practice ? 'practice' : '', 2400);
  setTimeout(() => music.stop(1.2), 1400);
  if (game.watch) return;
  addTotals({ jumps: game.jumps });
  const rec = recordOf(game.lv.id);
  rec.jumps += game.jumps;
  game.jumps = 0;
  if (game.practice) rec.practice = 100;
  else {
    game.first = !rec.done;
    if (!rec.done) rec.doneIn = rec.attempts;
    rec.done = true;
    rec.best = 100;
    const coins = new Set([...(rec.coins || []), ...game.st.coins]);
    game.newCoins = game.st.coins.filter((c) => !(rec.coins || []).includes(c)).length;
    rec.coins = [...coins].sort();
    if (game.entry.kind === 'daily') {
      const log = dailyLog();
      const day = { attempts: 0, best: 0, done: false, ...log[game.entry.date] };
      day.best = 100;
      day.done = true;
      store.set('daily', { ...log, [game.entry.date]: day });
    }
    if (game.entry.kind === 'random') addTotals({ generated: 1 });
  }
  saveRecord(game.lv.id, rec);
}

let bannerTimer = null;
function banner(text, cls = '', ms = 1500) {
  const b = $('banner');
  b.hidden = false;
  b.className = `banner ${cls}`;
  b.textContent = text;
  // Restart the pop-in animation.
  void b.offsetWidth;
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (b.hidden = true), ms);
}

const TICK_MS = TICK * 1000;

function update(dt, now) {
  const st = game.st;
  if (st.dead) {
    game.deadT += dt;
    if (game.deadT > (game.practice ? 0.55 : 0.95)) respawn();
    return;
  }
  if (st.won) {
    game.winT += dt;
    if (game.winT < 2.4 && Math.random() < dt * 5) view.firework(game.lv.length - 4 + Math.random() * 6, 2 + Math.random() * 6);
    if (game.winT > 2.3 && !game.shown) {
      game.shown = true;
      openComplete();
    }
    return;
  }
  // Catch the simulation up to this frame (and resync after a stall).
  if (game.clock == null || now - game.clock > 200) game.clock = now - TICK_MS;
  while (game.clock + TICK_MS <= now && !game.st.dead && !game.st.won) {
    game.clock += TICK_MS;
    tick(game.clock);
  }
}

function beatTime() {
  if (music.playing && music.ac) return music.ac.currentTime - music.start;
  return game ? game.time : performance.now() / 1000;
}

function drawGame(dt) {
  const st = game.st;
  const pct = percent(game.lv, st);
  $('progress-fill').style.width = `${pct}%`;
  $('pct').textContent = `${pct}%`;
  view.fx.hitboxes = game.practice && settings.get('hitboxes');
  const bpm = game.lv.song.bpm * (game.practice ? 0.75 : 1);
  view.draw(st, {
    dt,
    t: beatTime(),
    bpm,
    attempt: game.attempt,
    showAttempt: !game.watch,
    checkpoints: game.practice ? game.checkpoints : null,
    winT: st.won ? Math.min(1, game.winT * 1.2) : null,
  });
}

// ---------- The menu's background: the bot plays the chosen level ----------

let attract = null;
let attractTimer = null;

function setAttract(entry) {
  clearTimeout(attractTimer);
  attractTimer = setTimeout(async () => {
    const lv = await levelFor(entry);
    if (game || entries[selected] !== entry) return;
    const toggles = await solutionFor(lv);
    if (game || entries[selected] !== entry) return;
    view.setLevel(lv);
    view.reset();
    attract = { lv, st: initState(lv), hold: toggles ? holdAt(toggles) : () => false, acc: 0, deadT: 0, last: false };
    if (entry.kind !== 'level') refreshCard(entry);
  }, 120);
}

function updateAttract(dt) {
  const a = attract;
  if (a.st.dead || a.st.won) {
    a.deadT += dt;
    if (a.st.won && a.deadT < 1.5 && Math.random() < dt * 4) view.firework(a.lv.length - 4 + Math.random() * 6, 2 + Math.random() * 6);
    if (a.deadT > 1.8) {
      a.st = initState(a.lv);
      a.deadT = 0;
      view.reset();
    }
    return;
  }
  a.acc += dt;
  while (a.acc >= TICK && !a.st.dead && !a.st.won) {
    const hold = a.hold(a.st.tick);
    const events = [];
    step(a.lv, a.st, hold, hold && !a.last, events);
    a.last = hold;
    if (events.some((e) => e.type === 'die')) view.explode(a.st);
    a.acc -= TICK;
  }
}

// ---------- Main loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game) {
    if (!game.paused) update(dt, now);
    drawGame(game.paused ? 0 : dt);
  } else if (attract) {
    updateAttract(dt);
    view.draw(attract.st, { dt, t: now / 1000, bpm: attract.lv.song.bpm, showAttempt: false, winT: attract.st.won ? Math.min(1, attract.deadT) : null });
  }
  requestAnimationFrame(frame);
}

// ---------- Input ----------

const input = $('input');
input.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio();
  const was = holding();
  pointers.add(e.pointerId);
  inputChanged(e, was);
  try {
    input.setPointerCapture(e.pointerId);
  } catch {
    /* ok */
  }
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  input.addEventListener(type, (e) => {
    const was = holding();
    pointers.delete(e.pointerId);
    inputChanged(e, was);
  });
}
input.addEventListener('contextmenu', (e) => e.preventDefault());

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  if (!game) {
    if (e.key === 'ArrowLeft') selectCard(selected - 1, true);
    else if (e.key === 'ArrowRight') selectCard(selected + 1, true);
    else if (e.key === 'Enter' || e.code === 'Space') {
      if (document.activeElement?.closest?.('.card, .menu-bar, .topbar')) return;
      start(entries[selected]);
    } else return;
    e.preventDefault();
    return;
  }
  if (JUMP_KEYS.has(e.code)) {
    e.preventDefault();
    if (e.repeat) return;
    audio();
    const was = holding();
    keys.add(e.code);
    inputChanged(e, was);
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault();
    pause();
  } else if (e.code === 'KeyR' && !game.st.won) {
    e.preventDefault();
    if (!game.st.dead) respawn();
  } else if (e.code === 'KeyZ') placeCheckpoint();
  else if (e.code === 'KeyX') removeCheckpoint();
});
document.addEventListener('keyup', (e) => {
  const was = holding();
  keys.delete(e.code);
  inputChanged(e, was);
});
function releaseAll() {
  const was = holding();
  keys.clear();
  pointers.clear();
  inputChanged(null, was);
}
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.paused && !game.st.won) pause();
});

$('pause-btn').addEventListener('click', () => pause());
$('cp-add').addEventListener('click', placeCheckpoint);
$('cp-del').addEventListener('click', removeCheckpoint);
for (const id of ['pause-btn', 'cp-add', 'cp-del']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());

// ---------- Pause and results ----------

async function pause() {
  if (!game || game.paused || game.shown) return;
  game.paused = true;
  releaseAll();
  try {
    music.ac?.suspend();
  } catch {
    /* ignore */
  }
  const rec = recordOf(game.lv.id);
  let dialog;
  const act = (value) => () => dialog.closeWith(value);
  const canWatch = !game.watch && solutions.get(game.lv.id);
  const body = el('div', {},
    el('p', { class: 'pause-info' },
      el('span', {}, game.watch ? 'Watching the bot' : `Attempt ${game.attempt}`),
      el('span', {}, `Best ${rec.best}% · Practice ${rec.practice}%`)),
    el('div', { class: 'pause-grid' },
      el('button', { class: 'btn btn-primary wide', onclick: act('resume') }, 'Resume'),
      el('button', { class: 'btn', onclick: act('restart') }, 'Restart'),
      el('button', { class: 'btn', onclick: act('practice') }, game.practice || game.watch ? 'Normal mode' : 'Practice'),
      canWatch && el('button', { class: 'btn', onclick: act('watch') }, 'Watch a run'),
      el('button', { class: `btn ${canWatch ? '' : 'wide'}`, onclick: act('menu') }, 'Menu')),
    toggle('Music', settings.get('music'), (v) => settings.set('music', v)),
    toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    game.practice && toggle('Show hitboxes', settings.get('hitboxes'), (v) => settings.set('hitboxes', v), 'In practice mode'),
  );
  const done = openDialog({ title: game.lv.dailyName || game.lv.name, body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
  const choice = await done;
  try {
    music.ac?.resume();
  } catch {
    /* ignore */
  }
  if (!game) return;
  game.paused = false;
  game.clock = null;
  inputs.length = 0;
  last = performance.now();
  if (choice === 'restart') start(game.entry, { practice: game.practice });
  else if (choice === 'practice') start(game.entry, { practice: !game.practice && !game.watch });
  else if (choice === 'watch') start(game.entry, { watch: true });
  else if (choice === 'menu') toMenu();
  else if (settings.get('music') && !music.playing && !game.st.dead) startMusic();
}

function toMenu() {
  music.stop(0.3);
  game = null;
  document.body.classList.add('in-menu');
  document.body.classList.remove('practice');
  $('banner').hidden = true;
  renderCards();
  setAttract(entries[selected]);
}

function rating(attempts) {
  if (attempts <= 1) return { label: 'Flawless!', emoji: '🏆', icon: 'trophy', tier: 4 };
  if (attempts <= 3) return { label: 'Brilliant', emoji: '💎', icon: 'diamond', tier: 3 };
  if (attempts <= 10) return { label: 'Great', emoji: '🌟', icon: 'star', tier: 2 };
  if (attempts <= 40) return { label: 'Cleared', emoji: '✅', icon: 'check', tier: 1 };
  return { label: 'Never gave up', emoji: '💪', icon: 'medal', tier: 1 };
}

const squaresFor = (pct) => '🟩'.repeat(Math.round(pct / 10)) + '⬜'.repeat(10 - Math.round(pct / 10));

function shareLine(entry) {
  const base = location.origin + location.pathname;
  if (entry.kind === 'daily') {
    const day = { attempts: 0, best: 0, ...dailyLog()[entry.date] };
    const n = dailyNumber(entry.date, LAUNCH_DAY);
    const head = day.done ? `Pulse · Daily #${n} ${rating(day.attempts).emoji}\nCleared in ${day.attempts} attempt${day.attempts === 1 ? '' : 's'}` : `Pulse · Daily #${n}\nReached ${day.best}% in ${day.attempts} attempts`;
    return { text: `${head}\n${squaresFor(day.best)}`, url: base + buildHash({ d: entry.date, m: day.done ? day.attempts : '' }) };
  }
  const lv = built.get(idOf(entry));
  const rec = recordOf(idOf(entry));
  return { text: `Pulse · "${lv?.name || 'a new level'}" (${DIFFICULTIES[entry.diff].name})\n${rec.done ? `Cleared in ${rec.doneIn} attempts. Can you do better?` : 'Try this level!'}`, url: base + buildHash({ s: entry.seed, l: entry.diff }) };
}

function openComplete() {
  const { entry, lv } = game;
  if (game.watch) {
    game.shown = false;
    start(entry);
    return;
  }
  const rec = recordOf(lv.id);
  if (game.practice) {
    openDialog({
      title: 'Practice complete',
      body: el('div', {}, el('p', {}, `You reached the end with ${game.checkpoints.length} checkpoint${game.checkpoints.length === 1 ? '' : 's'}. Ready to try it in one go?`)),
      actions: [
        { label: 'Menu', value: 'menu' },
        { label: 'Play for real', value: 'play', primary: true },
      ],
      dismissible: false,
    }).then((v) => (v === 'play' ? start(entry) : toMenu()));
    return;
  }
  const daily = entry.kind === 'daily' ? dailyLog()[entry.date] : null;
  const attempts = daily ? daily.attempts : rec.doneIn || rec.attempts;
  const notes = [];
  if (lv.coins) {
    const got = game.st.coins.length;
    notes.push(note(got ? `${got} of ${lv.coins} coins${game.newCoins ? ` · ${game.newCoins} new` : ''}` : `${rec.coins.length} of ${lv.coins} coins found`, { win: got > 0, icon: 'star' }));
  }
  if (!game.first) notes.push(note(`Played ${rec.attempts} times in all`, { icon: 'flag' }));
  if (daily) {
    const streak = dailyStreak(Object.fromEntries(Object.entries(dailyLog()).filter(([, d]) => d.done)), today());
    if (streak > 1) notes.push(note(`${streak}-day streak`, { icon: 'flame' }));
    if (entry.challenge) {
      const diff = entry.challenge - daily.attempts;
      notes.push(note(diff > 0 ? `You beat your friend by ${diff} attempt${diff === 1 ? '' : 's'}!` : diff === 0 ? 'Tied with your friend' : `Your friend took ${entry.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : 'flag' }));
    }
  }
  const idx = entries.indexOf(entry);
  const next = entry.kind === 'level' && idx + 1 < LEVELS.length ? idx + 1 : -1;
  const actions = [{ label: 'Menu', value: 'menu' }, { label: 'Replay', value: 'replay' }];
  if (next >= 0) actions.push({ label: 'Next level', value: 'next', primary: true });
  else if (entry.kind === 'random') actions.push({ label: 'New level', value: 'new', primary: true });
  else actions[1].primary = true;
  showResults({
    title: lv.dailyName || lv.name,
    rating: rating(game.first || daily ? attempts : 99),
    reels: [
      { label: game.first || daily ? 'Attempts' : 'Attempt', value: game.first || daily ? attempts : game.attempt },
      { label: 'Jumps', value: recordOf(lv.id).jumps },
    ],
    squares: daily ? squaresFor(100) : null,
    notes,
    share: entry.kind === 'level' ? null : () => shareLine(entry),
    actions,
    sounds: { tick: sfx.tick, stamp: sfx.stamp },
    reduced: reducedMotion.matches,
  }).then((choice) => {
    if (choice === 'replay') start(entry);
    else if (choice === 'next') {
      selected = next;
      store.set('selected', selected);
      start(entries[next]);
    } else if (choice === 'new') {
      rerollRandom();
      start(entries[selected]);
    } else toMenu();
  });
}

// ---------- Menu ----------

const dailyLog = () => store.get('daily', {});
let randomEntry = { kind: 'random', seed: store.get('randomSeed') || randomSeed(), diff: settings.get('genDiff') };
let entries = [];
let selected = Math.min(store.get('selected', 0), LEVELS.length + 1);

function buildEntries(challenge = null) {
  entries = [
    ...LEVELS.map((def) => ({ kind: 'level', id: def.id, def })),
    { kind: 'daily', date: today(), challenge },
    randomEntry,
  ];
}

function rerollRandom() {
  randomEntry.seed = randomSeed();
  store.set('randomSeed', randomEntry.seed);
}

const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
function meter(label, pct, cls = '') {
  return el('div', { class: `meter ${cls}` }, el('span', {}, label), el('span', { class: 'track' }, el('i', { style: `width:${pct}%` })), el('b', {}, `${pct}%`));
}

function card(entry, i) {
  let head;
  let body;
  let actions;
  const go = (opts) => () => start(entry, opts);
  const play = (label = 'Play') => el('button', { class: 'btn btn-primary', onclick: go({}) }, label);
  const practice = el('button', { class: 'btn', onclick: go({ practice: true }) }, 'Practice');
  if (entry.kind === 'level') {
    const def = entry.def;
    const rec = recordOf(def.id);
    head = [
      el('span', { class: 'diff', style: `--diff:${DIFF_COLORS[def.stars]}` }, def.stars),
      el('div', {}, el('h2', {}, def.name), el('div', { class: 'sub' }, def.label, el('span', { class: 'stars', 'aria-label': `${def.stars} of 5` }, stars(def.stars)))),
      el('div', { class: 'coins', 'aria-label': `${rec.coins.length} of 3 coins` }, [0, 1, 2].map((c) => el('i', { class: rec.coins.includes(c) ? 'got' : '' }))),
    ];
    body = [meter('Normal', rec.best), meter('Practice', rec.practice, 'practice')];
    actions = [practice, play(rec.done ? 'Play again' : 'Play')];
  } else if (entry.kind === 'daily') {
    const n = dailyNumber(entry.date, LAUNCH_DAY);
    const day = { attempts: 0, best: 0, done: false, ...dailyLog()[entry.date] };
    const d = dailyDiff(entry.date);
    const streak = dailyStreak(Object.fromEntries(Object.entries(dailyLog()).filter(([, x]) => x.done)), entry.date);
    head = [
      el('span', { class: 'diff', style: `--diff:${DIFF_COLORS[DIFFICULTIES[d].stars]}` }, '#'),
      el('div', {}, el('h2', {}, `Daily #${n}`), el('div', { class: 'sub' }, `${DIFFICULTIES[d].name} · same level for everyone today`)),
    ];
    const info = day.done ? `Cleared in ${day.attempts} attempt${day.attempts === 1 ? '' : 's'}` : day.attempts ? `${day.attempts} attempts so far` : 'A new level every day';
    body = [
      meter('Best', day.best),
      el('div', { class: 'sub' }, info, streak ? ` · ${streak}-day streak` : '', entry.challenge ? ` · Friend: ${entry.challenge} attempts` : ''),
    ];
    actions = [practice, play(), day.attempts > 0 ? el('button', { class: 'btn square', 'aria-label': 'Share', title: 'Share', onclick: () => shareEntry(entry) }, icon('share')) : null];
  } else {
    const lvName = built.get(idOf(entry))?.name;
    head = [
      el('span', { class: 'diff', style: `--diff:${DIFF_COLORS[DIFFICULTIES[entry.diff].stars]}` }, '?'),
      el('div', {}, el('h2', {}, lvName || 'Endless levels'), el('div', { class: 'sub' }, 'A new level whenever you like · every one proven beatable')),
    ];
    const seg = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Difficulty' },
      DIFFICULTIES.map((dd, k) => el('label', {}, el('input', { type: 'radio', name: 'gen-diff', value: k, checked: k === entry.diff, onchange: () => {
        entry.diff = k;
        settings.set('genDiff', k);
        refreshCard(entry);
        setAttract(entry);
      } }), el('span', {}, dd.name))));
    body = [seg];
    actions = [
      el('button', { class: 'btn square', 'aria-label': 'Another level', title: 'Another level', onclick: () => {
        rerollRandom();
        refreshCard(entry);
        setAttract(entry);
      } }, el('span', { html: DICE })),
      practice,
      play(),
      el('button', { class: 'btn square', 'aria-label': 'Share this level', title: 'Share this level', onclick: () => shareEntry(entry) }, icon('share')),
    ];
  }
  return el('article', { class: `card ${i === selected ? 'active' : ''}`, role: 'listitem', dataset: { i } },
    el('div', { class: 'card-head' }, head),
    body,
    el('div', { class: 'card-actions' }, actions));
}

async function shareEntry(entry) {
  const { text, url } = shareLine(entry);
  const how = await shareText(text, url);
  if (how === 'copied') toast('Copied — paste it anywhere');
  else if (how === 'failed') toast('Could not share on this device');
}

function renderCards() {
  const cards = $('cards');
  const scroll = cards.scrollLeft;
  cards.replaceChildren(...entries.map(card));
  cards.scrollLeft = scroll;
  $('dots').replaceChildren(...entries.map((_, i) => el('i', { class: i === selected ? 'on' : '' })));
  $('prev').disabled = selected === 0;
  $('next').disabled = selected === entries.length - 1;
}

// Redraws one card in place (e.g. once a generated level has its name).
function refreshCard(entry) {
  const i = entries.indexOf(entry);
  $('cards').children[i]?.replaceWith(card(entry, i));
}

function selectCard(i, scroll = false) {
  i = Math.max(0, Math.min(entries.length - 1, i));
  const changed = i !== selected;
  selected = i;
  store.set('selected', i);
  const cards = [...$('cards').children];
  cards.forEach((c, k) => c.classList.toggle('active', k === i));
  [...$('dots').children].forEach((d, k) => d.classList.toggle('on', k === i));
  $('prev').disabled = i === 0;
  $('next').disabled = i === entries.length - 1;
  if (scroll) scrollLock = performance.now() + 700;
  if (scroll) cards[i]?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  if (changed || !attract) setAttract(entries[i]);
}

let scrollTimer = null;
let scrollLock = 0; // ignore the scrolling we start ourselves
$('cards').addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    if (performance.now() < scrollLock) return;
    const box = $('cards').getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let best = 0;
    let dist = Infinity;
    [...$('cards').children].forEach((c, k) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < dist) {
        dist = d;
        best = k;
      }
    });
    if (best !== selected) selectCard(best);
  }, 90);
});
$('prev').addEventListener('click', () => selectCard(selected - 1, true));
$('next').addEventListener('click', () => selectCard(selected + 1, true));

// ---------- Dialogs ----------

function drawIconPreview(canvas, face = settings.get('face'), P = settings.get('primary'), S = settings.get('secondary')) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  drawCube(ctx, P, S, face, size * 0.8, true);
}

function swatchRow(key) {
  return el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': key === 'primary' ? 'Main colour' : 'Second colour' },
    COLORS.map((c) => el('label', {},
      el('input', { type: 'radio', name: key, value: c, checked: settings.get(key) === c, 'aria-label': c, onchange: () => {
        settings.set(key, c);
        refreshKit();
      } }),
      el('span', { class: 'swatch', style: `background:${c}` }))));
}

let refreshKit = () => {};
function openIcons() {
  const preview = el('canvas', { class: 'preview', width: 192, height: 192, 'aria-hidden': 'true' });
  const faces = FACES.map((name, k) => {
    const c = el('canvas', { width: 96, height: 96, 'aria-hidden': 'true' });
    return { c, label: el('label', {}, el('input', { type: 'radio', name: 'face', value: k, checked: settings.get('face') === k, 'aria-label': name, onchange: () => {
      settings.set('face', k);
      refreshKit();
    } }), c) };
  });
  refreshKit = () => {
    drawIconPreview(preview);
    faces.forEach(({ c }, k) => drawIconPreview(c, k));
  };
  refreshKit();
  openDialog({
    title: 'Your icon',
    className: 'icon-kit',
    body: el('div', {}, preview,
      el('h3', {}, 'Face'), el('div', { class: 'faces' }, faces.map((f) => f.label)),
      el('h3', {}, 'Main colour'), swatchRow('primary'),
      el('h3', {}, 'Second colour'), swatchRow('secondary')),
  });
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'),
        segmented('theme', [['classic', 'Neon'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Music', settings.get('music'), (v) => settings.set('music', v)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Vibration', settings.get('vibrate'), (v) => settings.set('vibrate', v), 'On phones that support it'),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Glow, particles, beat pulse and shake'),
      toggle('Show percentage', settings.get('pct'), (v) => settings.set('pct', v)),
      toggle('Hitboxes in practice', settings.get('hitboxes'), (v) => settings.set('hitboxes', v), 'See exactly what counts as a hit')),
  });
}

function openStats() {
  const t = totals();
  const p = progress();
  const done = LEVELS.filter((l) => p[l.id]?.done).length;
  const coins = LEVELS.reduce((n, l) => n + (p[l.id]?.coins?.length || 0), 0);
  const dailies = Object.values(dailyLog()).filter((d) => d.done).length;
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
  openDialog({
    title: 'Stats',
    body: el('div', { class: 'stat-grid' },
      stat(t.attempts.toLocaleString(), 'Attempts'),
      stat(t.jumps.toLocaleString(), 'Jumps'),
      stat(`${done}/${LEVELS.length}`, 'Levels'),
      stat(`${coins}/${LEVELS.length * 3}`, 'Coins'),
      stat(dailies, 'Dailies'),
      stat(t.generated || 0, 'Endless')),
  });
}

function openHelp() {
  const item = (style, cls, text) => [el('i', { class: cls, style }), el('span', {}, text)];
  openDialog({
    title: 'How to play',
    className: 'help',
    body: el('div', {},
      el('p', {}, 'Tap, click or press space to jump. Hold to keep jumping. Time it to the music and do not touch the spikes!'),
      el('div', { class: 'legend' },
        item('background:#ffe14a', '', 'Yellow orb: tap while touching it to jump again in mid-air.'),
        item('background:#36d6ff', '', 'Blue orb or pad: flips gravity.'),
        item('background:#ffe14a', 'pad', 'Pads launch you when you touch them.'),
        item('border-color:#ff4fd8', 'portal', 'Ship: hold to fly up, let go to glide down.'),
        item('border-color:#ff7a3a', 'portal', 'Ball: tap to flip between floor and ceiling.'),
        item('border-color:#3ae8ff', 'portal', 'Wave: hold to zig up, let go to zag down.'),
        item('border-color:#ffd23a', 'portal', 'Yellow and blue portals turn gravity upside down and back.')),
      el('p', {}, el('b', {}, 'Practice'), ' drops checkpoints as you go (or place them yourself with the diamond button or Z). Nothing you do in practice counts against you.'),
      el('p', {}, el('b', {}, 'Every level can be beaten.'), ' A bot plays each one before you do — pause and choose “Watch a run” to see how.'),
      el('p', { class: 'muted' }, 'Keys: space / ↑ / W jump · Esc pause · R restart · Z / X add or remove a checkpoint.'),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.')),
  });
}

$('settings-btn').addEventListener('click', openSettings);
$('icons-btn').addEventListener('click', openIcons);
$('stats-btn').addEventListener('click', openStats);
$('help-btn').addEventListener('click', openHelp);

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// ---------- Start ----------

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.s) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (h.s && /^\d+$/.test(h.s)) return { seed: Number(h.s), diff: Math.max(0, Math.min(3, Number(h.l) || 0)) };
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { date: h.d > today() ? today() : h.d, challenge: /^\d+$/.test(h.m || '') ? Number(h.m) : null };
  return null;
}

function openFromLink(link) {
  if (!link) return;
  if (link.seed) {
    randomEntry.seed = link.seed;
    randomEntry.diff = link.diff;
    selected = entries.length - 1;
  } else {
    entries[LEVELS.length] = { kind: 'daily', date: link.date, challenge: link.challenge };
    selected = LEVELS.length;
  }
  renderCards();
  selectCard(selected, true);
}

applySettings();
buildEntries();
renderCards();
requestAnimationFrame(() => selectCard(selected, true));
openFromLink(fromLink());
setAttract(entries[selected]);
requestAnimationFrame(frame);

window.addEventListener('hashchange', () => {
  const link = fromLink();
  if (link && !game) openFromLink(link);
});

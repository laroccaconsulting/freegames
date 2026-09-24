import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, openDialog, toggle, segmented, el, toast } from './core/ui.js';
import { setSoundEnabled } from './core/sound.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares, shareText } from './core/golf.js';
import { CAPACITY, pourAmount, pour, isComplete, isSolved, hasLegalMove } from './js/rules.js';
import { levelColors, levelSeed, generate, DAILY_COLORS, LAUNCH_DAY } from './js/levels.js';
import { solve } from './js/solver.js';
import { THEMES, themeById } from './js/themes.js';
import { Renderer } from './js/render.js';
import { sfx, setSoundTheme } from './js/sfx.js';

const store = makeStore('pour');
const settings = makeSettings(store, {
  skin: 'neon',
  sound: true,
  vibrate: true,
  symbols: null, // null: follow the theme
  effects: true,
  speed: 'normal',
});

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
  const theme = themeById(settings.get('skin'));
  document.body.dataset.skin = theme.id;
  applyTheme(theme.dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.dark ? '#0d0724' : '#fff6e2');
  setSoundEnabled(settings.get('sound'));
  setSoundTheme(theme);
  renderer.setTheme(theme);
  const effects = settings.get('effects');
  document.body.classList.toggle('no-effects', !effects || reducedMotion.matches);
  renderer.setOptions({
    symbols: settings.get('symbols') ?? !!theme.symbols,
    effects,
    reduced: reducedMotion.matches,
    speed: settings.get('speed') === 'fast' ? 1.6 : 1,
    vibrate: settings.get('vibrate'),
  });
}
settings.onChange(applySettings);
reducedMotion.addEventListener?.('change', applySettings);
applySettings();

const colorName = (c) => (themeById(settings.get('skin')).names || COLOR_NAMES)[c] || `colour ${c + 1}`;
const announce = (text) => ($('announce').textContent = text);

// ---------- Background work (puzzle generation and hints) ----------

let worker = null;
const pending = new Map();
let nextId = 1;

function runLocal(type, data) {
  return type === 'generate' ? generate(data.seed, data.colors) : solve(data.tubes, { maxNodes: 250000 });
}

function run(type, data) {
  return new Promise((resolve) => {
    if (worker === null) {
      try {
        worker = new Worker(new URL('./js/worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data: msg }) => {
          pending.get(msg.id)?.resolve(msg.result);
          pending.delete(msg.id);
        };
        worker.onerror = () => {
          worker = false;
          for (const job of pending.values()) job.resolve(runLocal(job.type, job.data));
          pending.clear();
        };
      } catch {
        worker = false;
      }
    }
    if (!worker) {
      setTimeout(() => resolve(runLocal(type, data)), 30);
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, type, data });
    worker.postMessage({ id, type, ...data });
  });
}

// ---------- Progress ----------

const progress = () => ({ level: 1, best: {}, solved: 0, perfect: 0, ...store.get('progress') });
const dailyLog = () => store.get('daily', {});
const today = () => dateKey();

function specOf(g) {
  return g.mode === 'daily' ? { mode: 'daily', date: g.date } : { mode: 'level', level: g.level };
}
const specId = (spec) => (spec.mode === 'daily' ? `daily:${spec.date}` : `level:${spec.level}`);

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
    if (challenge) game.challenge = challenge;
    begin();
    return;
  }
  selected = -1;
  const mixing = setTimeout(() => ($('mixing').hidden = false), 180);
  renderer.setTubes([]);
  game = null;
  updateHud();
  const { seed, colors } = specParams(spec);
  const result = await run('generate', { seed, colors });
  clearTimeout(mixing);
  $('mixing').hidden = true;
  if (token !== loadToken) return;
  game = {
    id,
    ...spec,
    colors,
    start: result.tubes,
    tubes: result.tubes.map((t) => t.slice()),
    par: result.par,
    history: [],
    hints: 0,
    extra: false,
    done: false,
    challenge,
  };
  begin();
}

function begin() {
  selected = -1;
  combo = 0;
  renderer.setTubes(game.tubes);
  updateHud();
  save();
  const c = game.challenge;
  $('challenge').hidden = !c;
  if (c) $('challenge').textContent = `🏁 Beat ${c} moves · par is ${game.par}`;
  announce(`${titleText()}. ${game.colors} colours, par ${game.par}.`);
}

const save = () => game && store.set('game', game);

function titleText() {
  if (!game) return 'Pour';
  return game.mode === 'daily' ? `Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : `Level ${game.level}`;
}

function updateHud() {
  $('title').textContent = titleText();
  const sub = $('subtitle');
  if (!game) sub.textContent = '';
  else if (game.mode === 'daily') {
    const d = new Date(`${game.date}T12:00`);
    const streak = dailyStreak(dailyLog(), today());
    sub.textContent = `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${streak ? ` · 🔥 ${streak}` : ''}`;
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
  movesEl.parentElement.classList.toggle('over', !!game && moves > game.par);
  $('par').textContent = game ? game.par : '–';
  $('undo-btn').disabled = !game || !game.history.length || game.done;
  $('restart-btn').disabled = !game || !game.history.length || game.done;
  $('hint-btn').disabled = !game || game.done;
  $('tube-btn').disabled = !game || game.done || game.tubes.length > game.colors + 2;
}

// ---------- Playing ----------

function tap(i) {
  if (!game || game.done || game.solving) return;
  renderer.setFocus(-1);
  const tubes = game.tubes;
  if (selected < 0) {
    if (!tubes[i].length || isComplete(tubes[i]) || renderer.isBusy(i)) {
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
  const n = pourAmount(tubes, selected, i);
  if (n) {
    move(selected, i, n);
    return;
  }
  if (tubes[i].length && !isComplete(tubes[i])) select(i);
  else {
    renderer.shake(i);
    sfx.invalid();
  }
}

function select(i) {
  selected = i;
  renderer.select(i);
  if (i >= 0) sfx.select();
}

async function move(from, to, n) {
  const color = game.tubes[from].at(-1);
  game.tubes = pour(game.tubes, from, to);
  game.history.push([from, to, n]);
  selected = -1;
  renderer.select(-1);
  const solved = isSolved(game.tubes);
  if (solved) game.solving = true;
  updateHud();
  save();
  announce(`Poured ${colorName(color)} from tube ${from + 1} into tube ${to + 1}. ${game.history.length} moves.`);
  const current = game;
  await renderer.pour(from, to, n, color, {
    onStart: ({ duration, fromLevel, toLevel }) => sfx.pour(duration, fromLevel, toLevel),
    onLanded: () => {
      if (current !== game) return;
      if (isComplete(game.tubes[to])) {
        renderer.complete(to, combo);
        sfx.complete(combo);
        combo++;
      } else combo = 0;
    },
  });
  if (current !== game) return;
  if (solved && !game.done) win();
  else if (!solved && !renderer.busy && !hasLegalMove(game.tubes))
    toast('No moves left', { action: { label: 'Undo', onClick: undo } });
}

function undo() {
  if (!game || game.done || game.solving || !game.history.length || renderer.busy) return;
  const [from, to, n] = game.history.pop();
  const color = game.tubes[to].at(-1);
  const tubes = game.tubes.slice();
  tubes[from] = tubes[from].concat(tubes[to].slice(-n));
  tubes[to] = tubes[to].slice(0, -n);
  game.tubes = tubes;
  select(-1);
  combo = 0;
  renderer.uncap(to);
  renderer.pour(to, from, n, color, { onStart: ({ duration }) => sfx.pour(duration * 0.8, 2, 3) });
  updateHud();
  save();
  announce(`Undid a move. ${game.history.length} moves.`);
}

async function restart() {
  if (!game || game.done || !game.history.length) return;
  const ok = await openDialog({
    title: 'Restart puzzle?',
    body: el('p', {}, 'Start this puzzle again from the beginning.'),
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Restart', value: true, primary: true },
    ],
  });
  if (!ok) return;
  game.tubes = game.start.map((t) => t.slice());
  game.history = [];
  begin();
}

async function hint() {
  if (!game || game.done || game.solving) return;
  $('hint-btn').disabled = true;
  const current = game;
  const result = await run('solve', { tubes: game.tubes });
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
  } else if (result.gaveUp) toast('Too tangled to see ahead — try a different move');
  else toast('No way to finish from here', { action: { label: 'Undo', onClick: undo } });
}

async function addTube() {
  if (!game || game.done || game.tubes.length > game.colors + 2) return;
  if (!store.get('tubeExplained')) {
    const ok = await openDialog({
      title: 'Add an empty tube?',
      body: el('p', {}, 'One extra tube makes any puzzle easier. It is free here — your result is just marked 🧪 so par stays honest.'),
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
}

// ---------- Winning ----------

function resultRating() {
  const r = rating(game.history.length, game.par);
  if (game.hints || game.extra) return { ...r, label: 'Solved with help', emoji: game.extra ? '🧪' : '💡', tier: Math.min(r.tier, 1) };
  return r;
}

async function win() {
  game.done = true;
  game.solving = false;
  select(-1);
  const moves = game.history.length;
  const assisted = !!(game.hints || game.extra);
  const r = resultRating();
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
  store.set('progress', p);
  save();
  updateHud();
  announce(`Solved in ${moves} moves. Par ${game.par}. ${r.label}.`);
  await renderer.celebrate({ onStep: (i) => sfx.marquee(i), onJackpot: () => sfx.jackpot() });
  showResults();
}

function shareLine() {
  const moves = game.history.length;
  const r = resultRating();
  const title = game.mode === 'daily' ? `Pour · Daily #${dailyNumber(game.date, LAUNCH_DAY)}` : `Pour · Level ${game.level}`;
  const extras = `${game.hints ? ` · 💡${game.hints}` : ''}${game.extra ? ' · 🧪' : ''}`;
  const text = `${title} ${r.emoji}\n${moves} moves · par ${game.par} (${overText(moves - game.par)})${extras}\n${squares(moves, game.par)}`;
  const params = game.mode === 'daily' ? { d: game.date, m: moves } : { l: game.level, m: moves };
  return { text, url: location.origin + location.pathname + buildHash(params) };
}

// A number on spinning reels, like a fruit machine.
function reel(value) {
  const digits = String(value).split('');
  const strips = digits.map((d, i) => {
    const strip = el('span', { class: 'strip' });
    for (let k = 0; k < 30; k++) strip.append(el('span', {}, k % 10));
    strip.dataset.stop = 20 + Number(d);
    strip.style.setProperty('--spin', `${0.9 + i * 0.35}s`);
    return strip;
  });
  const node = el('span', { class: 'reel', 'aria-label': String(value) }, strips);
  node.spin = () => strips.forEach((s) => (s.style.transform = `translateY(${-s.dataset.stop * 1.15}em)`));
  node.duration = 0.9 + (digits.length - 1) * 0.35;
  return node;
}

async function showResults() {
  const moves = game.history.length;
  const r = resultRating();
  const reduced = reducedMotion.matches;
  const stamp = el('div', { class: 'stamp' }, el('span', { class: 'emoji' }, r.emoji), el('span', { class: 'label' }, r.label));
  const movesReel = reel(moves);
  const parReel = reel(game.par);
  const notes = [];
  if (game.mode === 'daily') {
    const streak = dailyStreak(dailyLog(), today());
    if (streak) notes.push(el('p', { class: 'result-note' }, `🔥 ${streak}-day streak`));
  } else {
    const best = progress().best[game.level];
    if (best && best.moves < moves) notes.push(el('p', { class: 'result-note' }, `Your best here: ${best.moves}`));
  }
  if (game.challenge) {
    const diff = Number(game.challenge) - moves;
    notes.push(
      el('p', { class: `result-note ${diff > 0 ? 'win' : ''}` },
        diff > 0 ? `🏆 You beat your friend by ${diff}!` : diff === 0 ? '🤝 Tied with your friend' : `Your friend did it in ${game.challenge}`),
    );
  }
  const share = el('button', { class: 'btn share-btn' }, '📤 Share result');
  share.addEventListener('click', async () => {
    const { text, url } = shareLine();
    const how = await shareText(text, url);
    if (how === 'copied') toast('Result copied — paste it anywhere');
    else if (how === 'failed') toast('Could not share on this device');
  });
  const body = el('div', {},
    stamp,
    el('div', { class: 'reels' },
      el('div', { class: 'reel-box' }, el('small', {}, 'Moves'), movesReel),
      el('div', { class: 'reel-box' }, el('small', {}, 'Par'), parReel)),
    el('p', { class: 'squares' }, squares(moves, game.par)),
    notes,
    share,
  );
  const actions =
    game.mode === 'level'
      ? [
          { label: r.tier === 3 ? 'Replay' : 'Try for par', value: 'replay' },
          { label: `Level ${game.level + 1} →`, value: 'next', primary: true },
        ]
      : [
          { label: 'Replay', value: 'replay' },
          { label: `Level ${progress().level} →`, value: 'levels', primary: true },
        ];
  const dialogDone = openDialog({ title: titleText(), body, actions, className: 'results' });

  // Spin the reels, tick as they slow, then stamp the rating.
  const spinFor = Math.max(movesReel.duration, parReel.duration + 0.2) * 1000;
  if (reduced) {
    movesReel.spin();
    parReel.spin();
    stamp.classList.add('show');
  } else {
    setTimeout(() => {
      movesReel.spin();
      setTimeout(() => parReel.spin(), 200);
    }, 60);
    let t = 0;
    const tick = () => {
      t += 70 + t * 0.12;
      if (t < spinFor - 120) {
        sfx.tick();
        setTimeout(tick, 70 + t * 0.12);
      }
    };
    setTimeout(tick, 80);
    setTimeout(() => {
      stamp.classList.add('show');
      setTimeout(() => sfx.stamp(r.tier), 180);
    }, spinFor + 80);
  }

  const choice = await dialogDone;
  if (choice === 'next') load({ mode: 'level', level: game.level + 1 });
  else if (choice === 'levels') load({ mode: 'level', level: progress().level });
  else if (choice === 'replay') load(specOf(game), { fresh: true, challenge: game.challenge });
}

// ---------- Menus ----------

function menuCard(icon, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'icon' }, icon), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const p = progress();
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
      menuCard('📅', `Daily #${dailyNumber(key, LAUNCH_DAY)}`,
        done ? `Solved in ${done.moves} (par ${done.par})${streak ? ` · 🔥 ${streak}` : ''}` : `Same puzzle for everyone today${streak ? ` · 🔥 ${streak}` : ''}`,
        go(() => load({ mode: 'daily', date: key }))),
      menuCard('🧪', `Level ${p.level}`, p.level > 1 ? `${p.level - 1} solved · ${p.perfect} perfect` : 'Start from the beginning', go(() => load({ mode: 'level', level: p.level }))),
    ),
    el('div', { class: 'field' },
      el('span', { class: 'field-label' }, 'Play any level you have reached'),
      el('div', { class: 'level-picker' }, input,
        el('button', { class: 'btn', onclick: go(() => {
          const n = Math.max(1, Math.min(p.level, Math.floor(Number(input.value) || 1)));
          load({ mode: 'level', level: n });
        }) }, 'Play'))),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openThemes) }, '🎨 Themes'),
      el('button', { class: 'btn', onclick: go(openSettings) }, '⚙︎ Settings')),
    el('div', { class: 'menu-row' },
      el('button', { class: 'btn', onclick: go(openStats) }, '📊 Stats'),
      el('button', { class: 'btn', onclick: go(openHelp) }, '❔ How to play')),
  );
  openDialog({ title: 'Pour', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openThemes() {
  const current = settings.get('skin');
  const grid = el('div', { class: 'theme-grid', role: 'radiogroup' },
    THEMES.map((t) =>
      el('label', { class: 'theme-card' },
        el('input', { type: 'radio', name: 'skin', value: t.id, checked: t.id === current, onchange: () => settings.set('skin', t.id), 'aria-label': t.name }),
        el('span', { class: `face ${t.dark ? 'dark' : 'light'}`, style: `background:${t.preview}` },
          el('b', {}, t.name),
          el('span', { class: 'dots' }, t.colors.slice(0, 6).map((c) => el('i', { style: `background:${c}` })))))),
  );
  openDialog({ title: 'Themes', body: el('div', {}, grid, el('p', { class: 'muted' }, 'Every theme has its own colours, sounds and effects.')) });
}

function openSettings() {
  const theme = themeById(settings.get('skin'));
  openDialog({
    title: 'Settings',
    body: el('div', {},
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Vibration', settings.get('vibrate'), (v) => settings.set('vibrate', v), 'On phones that support it'),
      toggle('Colour symbols', settings.get('symbols') ?? !!theme.symbols, (v) => settings.set('symbols', v), 'A shape on each colour, for colour-blind play'),
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
      stat(days.filter((d) => log[d].moves <= log[d].par && !log[d].hints && !log[d].extra).length, 'Daily par')),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    className: 'help',
    body: el('div', {},
      el('p', {}, 'Tap a tube, then tap another to pour. Liquid only lands on the same colour or in an empty tube. Fill every tube with a single colour.'),
      el('p', {}, el('b', {}, 'Par'), ' is the fewest pours that can solve the puzzle — worked out on your device. Match it for 💎 Perfect.'),
      el('ul', {},
        el('li', {}, 'Undo as much as you like; your score is the pours in your final solution.'),
        el('li', {}, 'Hints and the extra tube are free. Results that used them are marked 💡 or 🧪.'),
        el('li', {}, 'The daily puzzle is the same for everyone. Share your result to challenge a friend.')),
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

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// ---------- Start ----------

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.l) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const challenge = /^\d+$/.test(h.m || '') ? Number(h.m) : null;
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { spec: { mode: 'daily', date: h.d > today() ? today() : h.d }, challenge };
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

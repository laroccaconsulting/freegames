import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import * as unblock from './js/unblock.js';
import * as tiles from './js/tiles.js';
import { Renderer } from './js/render.js';

const LAUNCH_DAY = '2026-09-25';
const DAILY_PAR = 18;

const store = makeStore('slide');
const ach = makeAchievements('slide', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, home: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
  document.body.classList.toggle('show-home', settings.get('home'));
});
document.body.classList.toggle('show-home', settings.get('home'));

// ---------- Sounds ----------

const sfx = {
  slide(dist = 1) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.05 + dist * 0.025, freq: 700, q: 0.8, gain: 0.25 });
    noiseBurst(ac, { duration: 0.035, freq: 1500, q: 1.5, gain: 0.3, when: 0.06 + dist * 0.03 });
  },
  tile(count = 1) {
    const ac = audio();
    if (!ac) return;
    for (let i = 0; i < count; i++) noiseBurst(ac, { duration: 0.03, freq: 2200 - i * 150, q: 1.4, gain: 0.25, when: i * 0.035 });
  },
  select() {
    const ac = audio();
    if (ac) tone(ac, { freq: 1320, duration: 0.05, gain: 0.03 });
  },
  invalid: () => sounds.invalid(),
  win: () => sounds.win(),
  tick() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.015, freq: 4200, q: 2, gain: 0.08 });
  },
  stamp(tier) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.09, freq: 300, q: 0.7, gain: 0.5 });
    if (tier >= 3) [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(ac, { freq: f, duration: 0.4, gain: 0.05, when: 0.05 + i * 0.07 }));
  },
};

// ---------- Background work ----------

let worker = null;
const pending = new Map();
let nextId = 1;

function runLocal(type, data) {
  if (type === 'unblock') return unblock.generate(data.seed, data.target);
  if (type === 'tiles') return tiles.generate(data.seed, data.n, data.steps);
  if (type === 'unblock-hint') return unblock.solve(data.puzzle);
  return tiles.solve(data.board, { limit: 1_500_000 });
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
      setTimeout(() => resolve(runLocal(type, data)), 20);
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, type, data });
    worker.postMessage({ id, type, ...data });
  });
}

// ---------- Puzzles ----------

// spec: { kind: 'unblock', mode: 'daily', date } | { kind: 'unblock', mode: 'level', level }
//     | { kind: 'tiles', n: 3 | 4, mode: 'level', level }
const trackOf = (spec) => (spec.kind === 'tiles' ? `tiles${spec.n}` : 'unblock');
const specId = (spec) => (spec.mode === 'daily' ? `daily:${spec.date}` : `${trackOf(spec)}:${spec.level}`);
const specOf = (g) => (g.mode === 'daily' ? { kind: 'unblock', mode: 'daily', date: g.date } : { kind: g.kind, n: g.n, mode: 'level', level: g.level });

const emptyTrack = () => ({ level: 1, best: {}, solved: 0, perfect: 0 });
const progress = () => {
  const p = store.get('progress') || {};
  for (const t of ['unblock', 'tiles3', 'tiles4']) p[t] = { ...emptyTrack(), ...p[t] };
  return p;
};
const dailyLog = () => store.get('daily', {});
const today = () => dateKey();

function jobFor(spec) {
  if (spec.mode === 'daily') return ['unblock', { seed: dailySeed('slide', spec.date), target: DAILY_PAR }];
  if (spec.kind === 'unblock') return ['unblock', { seed: unblock.levelSeed(spec.level), target: unblock.levelTarget(spec.level) }];
  return ['tiles', { seed: tiles.levelSeed(spec.n, spec.level), n: spec.n, steps: tiles.levelSteps(spec.n, spec.level) }];
}

// Generated puzzles are remembered, so replaying a level is instant.
async function build(spec) {
  const id = specId(spec);
  const cache = store.get('cache', []);
  const hit = cache.find((c) => c.id === id);
  if (hit) return hit.result;
  const result = await run(...jobFor(spec));
  store.set('cache', [{ id, result }, ...cache.filter((c) => c.id !== id)].slice(0, 24));
  return result;
}

// ---------- Game ----------

// game: { id, kind, mode, level, n, date, start, cur, par, history: [{ cur, cost }], hints, done, challenge }
let game = null;
let loadToken = 0;
let busy = false;
let hintMove = null;

const renderer = new Renderer($('board'), {
  onMove: (move) => moveBlock(move),
  onTap: (i) => tapTile(i),
  onSelect: () => sfx.select(),
});
$('board').current = () => game; // reachable from browser tests

const movesOf = (g) => g.history.reduce((s, h) => s + h.cost, 0);

async function load(spec, { challenge = null, fresh = false } = {}) {
  const token = ++loadToken;
  const id = specId(spec);
  const saved = store.get('game');
  hintMove = null;
  if (!fresh && saved && saved.id === id && !saved.done && saved.cur) {
    game = { ...saved, challenge: challenge ?? saved.challenge };
    begin(true);
    return;
  }
  renderer.clear();
  game = null;
  updateHud();
  const mixing = setTimeout(() => ($('mixing').hidden = false), 150);
  const result = await build(spec);
  clearTimeout(mixing);
  $('mixing').hidden = true;
  if (token !== loadToken) return;
  const start = spec.kind === 'tiles' ? result.board : result.puzzle;
  game = { id, ...spec, start, cur: start, par: result.par, history: [], hints: 0, done: false, challenge };
  begin(true);
}

function begin(fresh) {
  hintMove = null;
  draw({ fresh });
  updateHud();
  save();
  const c = game.challenge;
  $('challenge').hidden = !c;
  if (c) $('challenge').replaceChildren(icon('flag', { size: 16 }), ` Beat ${c} moves · par is ${game.par}`);
  announce(`${titleText()}. Par ${game.par}.`);
}

function draw({ fresh = false } = {}) {
  if (game.kind === 'tiles') {
    renderer.setTiles(game.cur, { fresh });
    renderer.showTilesHint(hintMove);
  } else {
    renderer.setUnblock(game.cur, { fresh });
    renderer.showUnblockHint(hintMove);
  }
}

const save = () => game && store.set('game', game);

function titleText(g = game) {
  if (!g) return 'Slide';
  if (g.mode === 'daily') return `Daily #${dailyNumber(g.date, LAUNCH_DAY)}`;
  return g.kind === 'tiles' ? `Tiles ${g.n}×${g.n} · ${g.level}` : `Unblock ${g.level}`;
}

function updateHud() {
  $('title').textContent = titleText();
  const sub = $('subtitle');
  if (!game) sub.textContent = '';
  else if (game.mode === 'daily') {
    const d = new Date(`${game.date}T12:00`);
    const streak = dailyStreak(dailyLog(), today());
    sub.textContent = `Unblock · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${streak ? ` · ${streak}-day streak` : ''}`;
  } else {
    const best = progress()[trackOf(game)].best[game.level];
    sub.textContent = best ? `Best ${best.moves}${best.assisted ? ' (helped)' : ''}` : game.kind === 'tiles' ? 'Put the tiles in order' : 'Slide the gold block out';
  }
  const moves = game ? movesOf(game) : 0;
  const movesEl = $('moves');
  if (movesEl.textContent !== String(moves)) {
    movesEl.textContent = moves;
    movesEl.parentElement.classList.remove('bump');
    void movesEl.offsetWidth;
    movesEl.parentElement.classList.add('bump');
  }
  movesEl.parentElement.classList.toggle('over', !!game && moves > game.par);
  $('par').textContent = game ? game.par : '–';
  $('undo-btn').disabled = !game || !game.history.length || game.done;
  $('restart-btn').disabled = !game || !game.history.length;
  $('hint-btn').disabled = !game || game.done;
  $('status').textContent = statusText();
}

function statusText() {
  if (!game) return '';
  if (game.done) return 'Solved!';
  if (game.kind === 'tiles') return game.history.length ? '' : 'Tap a tile next to the gap, or in line with it, to slide.';
  return game.history.length ? '' : 'Drag the blocks, or tap one to see where it can go. Get the gold block out through the gap.';
}

function moveBlock(move) {
  if (!game || game.done || busy || game.kind !== 'unblock') return;
  if (!unblock.isLegalMove(game.cur, move)) {
    sfx.invalid();
    draw();
    return;
  }
  const dist = Math.abs(move.to - game.cur.blocks[move.b].pos);
  game.history.push({ cur: game.cur, cost: 1 });
  game.cur = unblock.applyMove(game.cur, move);
  hintMove = null;
  draw();
  sfx.slide(dist);
  afterMove();
}

function tapTile(i) {
  if (!game || game.done || busy || game.kind !== 'tiles') return;
  const r = tiles.tap(game.cur, i);
  if (!r) {
    renderer.wiggle(i);
    sfx.invalid();
    return;
  }
  game.history.push({ cur: game.cur, cost: r.moved.length });
  game.cur = r.board;
  hintMove = null;
  draw();
  sfx.tile(r.moved.length);
  afterMove();
}

function afterMove() {
  const solved = game.kind === 'tiles' ? tiles.isSolved(game.cur) : unblock.isSolved(game.cur);
  updateHud();
  save();
  if (solved) win();
}

function undo() {
  if (!game || !game.history.length || game.done || busy) return;
  game.cur = game.history.pop().cur;
  hintMove = null;
  draw();
  sfx.select();
  updateHud();
  save();
}

function restart() {
  if (!game || !game.history.length || busy) return;
  if (game.done) {
    load(specOf(game), { fresh: true, challenge: game.challenge });
    return;
  }
  game.history = [];
  game.cur = game.start;
  hintMove = null;
  draw();
  updateHud();
  save();
}

async function hint() {
  if (!game || game.done || busy) return;
  const g = game;
  const before = g.cur;
  let text;
  if (g.kind === 'unblock') {
    const path = await run('unblock-hint', { puzzle: before });
    if (game !== g || g.cur !== before || !path?.length) return;
    hintMove = path[0];
    const b = before.blocks[hintMove.b];
    const d = hintMove.to - b.pos;
    const dir = b.h ? (d < 0 ? 'left' : 'right') : d < 0 ? 'up' : 'down';
    text = `Slide the ${hintMove.b === 0 ? 'gold block' : 'marked block'} ${dir}${Math.abs(d) > 1 ? ` ${Math.abs(d)} spaces` : ''}. The shortest solution from here takes ${path.length} move${path.length > 1 ? 's' : ''}.`;
  } else {
    let path = await run('tiles-hint', { board: before });
    if (game !== g || g.cur !== before) return;
    if (!path?.length) path = [greedyTile(before)];
    hintMove = path[0];
    text = path.length > 1 ? `Slide the marked tile. You can finish in ${path.length} moves from here.` : 'Slide the marked tile.';
  }
  g.hints++;
  draw();
  updateHud();
  $('status').textContent = text;
  announce(text);
  save();
}

// When the full search is too slow: the neighbour of the gap whose move helps most.
function greedyTile(board) {
  const { n } = board;
  const gap = board.tiles.indexOf(0);
  const options = [gap - n, gap + n, gap - 1, gap + 1].filter((i) => i >= 0 && i < n * n && tiles.slideLine(board, i).length === 1);
  let best = options[0];
  let score = Infinity;
  for (const i of options) {
    const s = tiles.heuristic(tiles.tap(board, i).board);
    if (s < score) [best, score] = [i, s];
  }
  return best;
}

// ---------- Winning ----------

function resultRating() {
  const r = rating(movesOf(game), game.par);
  if (game.hints) return { ...r, label: 'Solved with help', emoji: '💡', icon: 'bulb', tier: Math.min(r.tier, 1) };
  return r;
}

async function win() {
  game.done = true;
  busy = true;
  const moves = movesOf(game);
  const assisted = !!game.hints;
  const r = resultRating();
  const p = progress();
  if (game.mode === 'level') {
    const t = p[trackOf(game)];
    t.solved++;
    if (r.tier >= 3) t.perfect++;
    const prev = t.best[game.level];
    if (!prev || (prev.assisted && !assisted) || (prev.assisted === assisted && moves < prev.moves)) t.best[game.level] = { moves, assisted };
    if (game.level === t.level) t.level++;
  } else {
    const log = dailyLog();
    if (!log[game.date]) store.set('daily', { ...log, [game.date]: { moves, par: game.par, hints: game.hints } });
  }

  ach.unlock('first');
  ach.add('solved-50');
  if (r.tier >= 3) ach.unlock('perfect');
  if (r.tier >= 4) ach.unlock('birdie');
  ach.at('level-10', game.mode === 'level' ? p[trackOf(game)].level - 1 : 0);
  ach.at('level-25', game.mode === 'level' ? p[trackOf(game)].level - 1 : 0);
  if (game.mode === 'daily') {
    ach.unlock('daily');
    const streak = dailyStreak(dailyLog(), today());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  if (game.kind === 'tiles' && game.n === 5) ach.unlock('tiles-5');
  store.set('progress', p);
  save();
  updateHud();
  announce(`Solved in ${moves} moves. Par ${game.par}. ${r.label}.`);
  if (game.kind === 'unblock') await renderer.exitKey();
  sfx.win();
  if (game.kind === 'tiles') await renderer.waveTiles();
  busy = false;
  openResults();
}

function shareLine() {
  const moves = movesOf(game);
  const r = resultRating();
  const title = `Slide · ${titleText()}`;
  const text = `${title} ${r.emoji}\n${moves} moves · par ${game.par} (${overText(moves - game.par)})${game.hints ? ` · 💡${game.hints}` : ''}\n${squares(moves, game.par)}`;
  const params = game.mode === 'daily' ? { d: game.date, m: moves } : game.kind === 'tiles' ? { t: `${game.n}-${game.level}`, m: moves } : { u: game.level, m: moves };
  return { text, url: location.origin + location.pathname + buildHash(params) };
}

function openResults() {
  const moves = movesOf(game);
  const notes = [];
  if (game.mode === 'daily') {
    const streak = dailyStreak(dailyLog(), today());
    if (streak) notes.push(note(`${streak}-day streak`, { icon: 'flame' }));
  } else {
    const best = progress()[trackOf(game)].best[game.level];
    if (best && best.moves < moves) notes.push(note(`Your best here: ${best.moves}`));
  }
  if (game.challenge) {
    const diff = Number(game.challenge) - moves;
    notes.push(note(diff > 0 ? `You beat your friend by ${diff}!` : diff === 0 ? 'Tied with your friend' : `Your friend did it in ${game.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
  }
  const r = resultRating();
  const next = game.mode === 'level' ? { ...specOf(game), level: game.level + 1 } : { kind: 'unblock', mode: 'level', level: progress().unblock.level };
  const current = game;
  showResults({
    title: titleText(),
    rating: r,
    reels: [{ label: 'Moves', value: moves }, { label: 'Par', value: game.par }],
    squares: squares(moves, game.par),
    notes,
    share: shareLine,
    actions: [
      { label: r.tier >= 3 ? 'Replay' : 'Try for par', value: 'replay' },
      { label: `${titleText({ ...next })} →`, value: 'next', primary: true },
    ],
    sounds: { tick: sfx.tick, stamp: sfx.stamp },
    reduced: reducedMotion.matches,
  }).then((choice) => {
    if (current !== game) return;
    if (choice === 'next') load(next);
    else if (choice === 'replay') load(specOf(game), { fresh: true, challenge: game.challenge });
  });
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
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
  const trackCard = (name, spec, label, sub) => {
    const t = p[trackOf(spec)];
    return menuCard(name, `${label} · level ${t.level}`, t.level > 1 ? `${t.level - 1} solved · ${t.perfect} at par` : sub, go(() => load({ ...spec, level: t.level })));
  };
  const body = el(
    'div',
    {},
    el(
      'div',
      { class: 'menu-list' },
      menuCard(
        'calendar',
        `Daily #${dailyNumber(key, LAUNCH_DAY)}`,
        done ? `Solved in ${done.moves} (par ${done.par})${streak ? ` · ${streak}-day streak` : ''}` : `Same Unblock puzzle for everyone today${streak ? ` · ${streak}-day streak` : ''}`,
        go(() => load({ kind: 'unblock', mode: 'daily', date: key })),
      ),
      trackCard('key', { kind: 'unblock', mode: 'level' }, 'Unblock', 'Slide the gold block out'),
      trackCard('blocks', { kind: 'tiles', n: 3, mode: 'level' }, 'Tiles 3×3', 'The quick one: 8 tiles'),
      trackCard('grid', { kind: 'tiles', n: 4, mode: 'level' }, 'Tiles 4×4', 'The classic fifteen'),
    ),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openLevels) }, withIcon('levels', 'Levels')), el('button', { class: 'btn', onclick: go(openStats) }, withIcon('chart', 'Stats'))),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Slide', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openLevels() {
  const p = progress();
  let track = game && game.mode === 'level' ? trackOf(game) : 'unblock';
  const input = el('input', { type: 'number', min: 1, inputmode: 'numeric', 'aria-label': 'Level number' });
  const setTrack = (t) => {
    track = t;
    input.max = p[t].level;
    input.value = game && trackOf(game) === t && game.mode === 'level' ? game.level : p[t].level;
  };
  setTrack(track);
  let dialog;
  const play = () => {
    const n = Math.max(1, Math.min(p[track].level, Math.floor(Number(input.value) || 1)));
    dialog?.closeWith?.(null);
    load(track === 'unblock' ? { kind: 'unblock', mode: 'level', level: n } : { kind: 'tiles', n: track === 'tiles3' ? 3 : 4, mode: 'level', level: n });
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && play());
  openDialog({
    title: 'Levels',
    body: el(
      'div',
      {},
      segmented('track', [['unblock', 'Unblock'], ['tiles3', 'Tiles 3×3'], ['tiles4', 'Tiles 4×4']], track, setTrack),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Play any level you have reached'), el('div', { class: 'level-picker' }, input, el('button', { class: 'btn btn-primary', onclick: play }, 'Play'))),
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
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Mark tiles in place', settings.get('home'), (v) => settings.set('home', v), 'Tiles already in the right spot get a tint'),
    ),
  });
}

function openStats() {
  const p = progress();
  const log = dailyLog();
  const days = Object.keys(log);
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
  const row = (label, t) => el('div', { class: 'field' }, el('span', { class: 'field-label' }, label), el('div', { class: 'stat-grid' }, stat(t.level - 1, 'Levels'), stat(t.solved, 'Solved'), stat(t.perfect, 'At par')));
  openDialog({
    title: 'Stats',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'field' },
        el('span', { class: 'field-label' }, 'Daily'),
        el('div', { class: 'stat-grid' }, stat(days.length, 'Played'), stat(dailyStreak(log, today()), 'Streak'), stat(days.filter((d) => log[d].moves <= log[d].par && !log[d].hints).length, 'At par')),
      ),
      row('Unblock', p.unblock),
      row('Tiles 3×3', p.tiles3),
      row('Tiles 4×4', p.tiles4),
    ),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    className: 'help',
    body: el(
      'div',
      {},
      el('p', {}, el('b', {}, 'Unblock.'), ' Blocks slide along their length: across blocks left and right, upright blocks up and down. Clear a path and slide the gold block out through the gap on the right. Moving one block any distance is one move.'),
      el('p', {}, el('b', {}, 'Tiles.'), ' Tap a tile in line with the gap to slide it (and any tiles between) into the gap. Put the numbers in order, reading across, with the gap in the bottom-right corner. Each tile that slides is one move.'),
      el('p', {}, el('b', {}, 'Par'), ' is the fewest moves that can solve the puzzle, worked out on your device. Match it for a Perfect.'),
      el('ul', {}, el('li', {}, 'Undo as much as you like; your score is the moves in your final solution.'), el('li', {}, 'Hints are free. Results that used them are marked as helped.'), el('li', {}, 'The daily puzzle is the same for everyone. Share your result to challenge a friend.')),
      el('p', { class: 'muted' }, 'Keys: Tab picks a block, arrows slide it; on Tiles, arrows slide a tile into the gap. Z undoes, H hints, R restarts.'),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.'),
    ),
  });
}

// ---------- Controls ----------

$('undo-btn').addEventListener('click', undo);
$('restart-btn').addEventListener('click', restart);
$('hint-btn').addEventListener('click', hint);
$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('hint-btn').prepend(icon('bulb', { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.altKey || !game) return;
  const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) undo();
  else if (e.ctrlKey) return;
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (arrows[e.key] && game.kind === 'tiles') {
    // The arrow says which way a tile moves: the tile on the other side of the gap.
    const [dr, dc] = arrows[e.key];
    const { n } = game.cur;
    const gap = game.cur.tiles.indexOf(0);
    const r = Math.floor(gap / n) - dr;
    const c = (gap % n) - dc;
    if (r >= 0 && r < n && c >= 0 && c < n) tapTile(r * n + c);
    else sfx.invalid();
  } else if (arrows[e.key] && game.kind === 'unblock') {
    const i = Number(document.activeElement?.closest?.('.ub-block')?.dataset.i ?? renderer.selected);
    if (!(i >= 0)) return;
    const b = game.cur.blocks[i];
    const [dr, dc] = arrows[e.key];
    const d = b.h ? dc : dr;
    if (!d) return;
    moveBlock({ b: i, to: b.pos + d });
    requestAnimationFrame(() => renderer.blocks?.[i]?.focus());
  } else return;
  e.preventDefault();
});

addHubLink();

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// ---------- Start ----------

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.u && !h.t) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const challenge = /^\d+$/.test(h.m || '') ? Number(h.m) : null;
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { spec: { kind: 'unblock', mode: 'daily', date: h.d > today() ? today() : h.d }, challenge };
  if (h.u && Number(h.u) >= 1) return { spec: { kind: 'unblock', mode: 'level', level: Math.floor(Number(h.u)) }, challenge };
  const m = /^([34])-(\d+)$/.exec(h.t || '');
  if (m && Number(m[2]) >= 1) return { spec: { kind: 'tiles', n: Number(m[1]), mode: 'level', level: Number(m[2]) }, challenge };
  return null;
}

const link = fromLink();
const saved = store.get('game');
if (link) load(link.spec, { challenge: link.challenge });
else if (saved && !saved.done && saved.cur) load(specOf(saved));
else {
  load({ kind: 'unblock', mode: 'level', level: progress().unblock.level });
  if (!store.get('welcomed')) {
    store.set('welcomed', true);
    openHelp();
  }
}

addEventListener('hashchange', () => {
  const next = fromLink();
  if (next) load(next.spec, { challenge: next.challenge });
});

import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, formatTime } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, shareText, parseHash, buildHash } from './core/golf.js';
import { icon, withIcon, medal } from './core/icons.js';
import { randomSeed } from './core/rng.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { LAYOUTS, geometry, isFree, deal, reshuffle, moves, matches } from './js/mahjong.js';
import { faceSvg, faceName } from './js/faces.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('mahjong');
const ach = makeAchievements('mahjong', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, showFree: true, layout: 'pyramid' });
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
  if (game) render();
});

const sfx = {
  pick() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.03, freq: 2400, q: 1.5, gain: 0.25 });
  },
  pair(n) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.05, freq: 1600, q: 1, gain: 0.4 });
    tone(ac, { freq: 587 * 2 ** ((n % 8) / 12), duration: 0.2, gain: 0.05, when: 0.04 });
  },
  bad: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Game ----------

// game: { layout, daily, n, seed, faces, present, removed: [[a, b]], hints, shuffles, time, done }
let game = null;
let geo = null;
let selected = -1;
let hintPair = null;
let clock = null;
const save = () => game && store.set('game', game);

function newGame(spec) {
  const layout = spec.layout;
  const seed = spec.daily ? dailySeed(`mahjong-${layout}`, spec.daily) : spec.seed ?? randomSeed();
  game = { ...spec, layout, seed, faces: deal(layout, seed), present: LAYOUTS[layout].positions.map(() => true), removed: [], hints: 0, shuffles: 0, time: 0, done: false };
  geo = geometry(LAYOUTS[layout].positions);
  selected = -1;
  hintPair = null;
  save();
  build();
  announce(`${LAYOUTS[layout].name}. ${game.faces.length} tiles. Every deal can be won.`);
}

function restore(saved) {
  game = saved;
  geo = geometry(LAYOUTS[game.layout].positions);
  build();
}

function tap(i) {
  if (game.done || !game.present[i]) return;
  if (!isFree(geo, game.present, i)) {
    sfx.bad();
    shake(i);
    return;
  }
  hintPair = null;
  if (selected === i) {
    selected = -1;
  } else if (selected >= 0 && matches(game.faces[selected], game.faces[i])) {
    const pair = [selected, i];
    game.present = game.present.slice();
    game.present[pair[0]] = false;
    game.present[pair[1]] = false;
    game.removed = [...game.removed, pair];
    selected = -1;
    sfx.pair(game.removed.length);
    save();
    vanish(pair);
    announce(`Matched ${faceName(game.faces[pair[0]])}.`);
    if (!game.present.some(Boolean)) return win();
    if (!moves(geo, game.faces, game.present).length) setTimeout(stuck, 500);
    return;
  } else {
    selected = i;
    sfx.pick();
  }
  render();
}

function undo() {
  if (!game || !game.removed.length || game.done) return;
  const [a, b] = game.removed[game.removed.length - 1];
  game.removed = game.removed.slice(0, -1);
  game.present = game.present.slice();
  game.present[a] = true;
  game.present[b] = true;
  selected = -1;
  hintPair = null;
  save();
  render();
}

function hint() {
  if (!game || game.done) return;
  const m = moves(geo, game.faces, game.present);
  if (!m.length) return stuck();
  hintPair = m[game.hints % m.length];
  game.hints++;
  save();
  render();
  toast(`${m.length} matching pair${m.length === 1 ? '' : 's'} free right now.`, { duration: 2200 });
}

function doShuffle() {
  const faces = reshuffle(game.layout, game.faces, game.present, game.seed + game.shuffles * 97 + 1);
  if (!faces) {
    toast('Couldn’t find a winnable shuffle. Try undoing a few moves.');
    return;
  }
  game.faces = faces;
  game.shuffles++;
  selected = -1;
  hintPair = null;
  save();
  render();
  toast('Shuffled: the tiles left can still all be matched.');
}

function stuck() {
  if (game.done) return;
  openDialog({
    title: 'No moves left',
    body: 'No free tiles match. You can undo, or shuffle what’s left into another winnable arrangement.',
    actions: [
      { label: 'Undo', value: 'undo' },
      { label: 'Shuffle', value: 'shuffle', primary: true },
    ],
  }).then((v) => (v === 'undo' ? undo() : v === 'shuffle' ? doShuffle() : null));
}

function win() {
  game.done = true;
  save();
  render();
  sfx.win();
  const t = Math.round(game.time);
  const clean = !game.hints && !game.shuffles;
  const best = store.get('best', {});
  const isBest = clean && (!best[game.layout] || t < best[game.layout]);
  if (isBest) store.set('best', { ...best, [game.layout]: t });

  ach.unlock('first');
  ach.add('cleared-25');
  if (game.layout === 'turtle') ach.unlock('turtle');
  if (game.layout === 'pyramid') ach.unlock('pyramid');
  if (game.layout === 'turtle' && clean) ach.unlock('clean');
  if (game.layout === 'turtle' && t < 480) ach.unlock('fast');
  if (game.daily) {
    ach.unlock('daily');
    const streak = dailyStreak(store.get('daily', {}), dateKey());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  const stats = store.get('stats', {});
  stats[game.layout] = (stats[game.layout] || 0) + 1;
  store.set('stats', stats);
  if (game.daily) {
    const log = store.get('daily', {});
    if (!log[game.daily]) store.set('daily', { ...log, [game.daily]: { time: t, hints: game.hints, shuffles: game.shuffles } });
  }
  const title = game.daily ? `Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : LAYOUTS[game.layout].name;
  const text = `Mahjong · ${title} ${clean ? '💎' : '✅'}\nCleared in ${formatTime(t)}${game.hints ? ` · 💡${game.hints}` : ''}${game.shuffles ? ` · 🔀${game.shuffles}` : ''}`;
  setTimeout(() => {
    openDialog({
      title: 'Board cleared!',
      className: 'results',
      body: el(
        'div',
        {},
        el('div', { class: 'stamp show' }, medal(clean ? 'diamond' : 'check')),
        el('p', { class: 'result-note' }, `Time: ${formatTime(t)}${isBest ? ' · new best!' : best[game.layout] ? ` · best ${formatTime(best[game.layout])}` : ''}`),
        !clean && el('p', { class: 'result-note' }, `${game.hints ? `Hints: ${game.hints}` : ''}${game.hints && game.shuffles ? ' · ' : ''}${game.shuffles ? `Shuffles: ${game.shuffles}` : ''}`),
        game.daily && el('p', { class: 'result-note' }, icon('flame', { size: 18 }), `${dailyStreak(store.get('daily', {}), dateKey())}-day streak`),
        el('button', { class: 'btn share-btn', onclick: async () => (await shareText(text, location.origin + location.pathname + (game.daily ? buildHash({ d: game.daily, l: game.layout }) : ''))) === 'copied' && toast('Result copied') }, icon('share'), 'Share result'),
      ),
      actions: [
        { label: 'Admire it', value: null },
        { label: 'New deal', value: 'new', primary: true },
      ],
    }).then((v) => v === 'new' && newGame({ layout: game.layout }));
  }, 700);
}

// ---------- Screen ----------

let tiles = [];

function build() {
  const { positions } = LAYOUTS[game.layout];
  const board = el('div', { class: 'board', id: 'board' });
  tiles = positions.map((p, i) => {
    const t = el('button', { class: 'tile', dataset: { i }, style: `--x: ${p.x}; --y: ${p.y}; --z: ${p.z}; z-index: ${p.z * 1000 + p.x * 10 + p.y}`, onclick: () => tap(i) });
    t.innerHTML = `<span class="tile-face">${faceSvg(game.faces[i])}</span>`;
    board.append(t);
    return t;
  });
  $('stage').replaceChildren(board);
  fit();
  render();
  clearInterval(clock);
  let last = Date.now();
  clock = setInterval(() => {
    const now = Date.now();
    if (game && !game.done && document.visibilityState === 'visible') game.time += (now - last) / 1000;
    last = now;
  }, 1000);
}

// Tile size to fit the stage: a tile is 2 half-units wide and 2.6 tall.
function fit() {
  const { positions } = LAYOUTS[game.layout];
  const w = Math.max(...positions.map((p) => p.x)) + 2;
  const h = Math.max(...positions.map((p) => p.y)) + 2;
  const zMax = Math.max(...positions.map((p) => p.z));
  const stage = $('stage');
  const cs = getComputedStyle(stage);
  const W = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const H = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const unit = Math.min(W / (w + zMax * 0.25), H / (h * 1.3 + zMax * 0.25), 40);
  const board = $('board');
  board.style.setProperty('--u', `${unit}px`);
  board.style.width = `${(w + zMax * 0.25) * unit}px`;
  board.style.height = `${(h * 1.3 + zMax * 0.25) * unit}px`;
  board.style.setProperty('--zmax', zMax);
}

function vanish(pair) {
  for (const i of pair) tiles[i].classList.add('gone');
  setTimeout(render, 260);
}

function shake(i) {
  const t = tiles[i];
  t.classList.remove('nope');
  void t.offsetWidth;
  t.classList.add('nope');
}

function render() {
  const showFree = settings.get('showFree');
  const hintSet = new Set(hintPair || []);
  tiles.forEach((t, i) => {
    const on = game.present[i];
    t.hidden = !on;
    if (!on) return;
    t.classList.remove('gone');
    if (t.dataset.face !== game.faces[i]) {
      t.dataset.face = game.faces[i];
      t.innerHTML = `<span class="tile-face">${faceSvg(game.faces[i])}</span>`;
    }
    const free = isFree(geo, game.present, i);
    t.classList.toggle('free', showFree && free);
    t.classList.toggle('blocked', showFree && !free);
    t.classList.toggle('sel', i === selected);
    t.classList.toggle('hint', hintSet.has(i));
    t.setAttribute('aria-label', `${faceName(game.faces[i])}${free ? '' : ', blocked'}`);
  });
  const left = game.present.filter(Boolean).length;
  $('left').textContent = left;
  $('pairs').textContent = game.done ? 0 : moves(geo, game.faces, game.present).length;
  $('title').textContent = game.daily ? `Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : 'Mahjong';
  $('subtitle').textContent = `${LAYOUTS[game.layout].name}${game.daily ? streakText() : ''}`;
  $('undo-btn').disabled = !game.removed.length || game.done;
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
  const blurbs = { turtle: '144 tiles, the classic. Best with your phone sideways', pyramid: '82 tiles in a stepped pyramid', quick: '34 tiles, a five-minute game' };
  openDialog({
    title: 'Mahjong',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'menu-list' },
        menuCard('calendar', `Daily #${dailyNumber(key, LAUNCH_DAY)}`, done ? `Cleared in ${formatTime(done.time)}` : 'Pyramid, same deal for everyone', go(() => newGame({ layout: 'pyramid', daily: key }))),
        ...Object.keys(LAYOUTS).map((id) => menuCard('tiles', LAYOUTS[id].name, `${blurbs[id]}${best[id] ? ` · best ${formatTime(best[id])}` : ''}`, go(() => newGame({ layout: id })))),
      ),
      el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'How to play'))),
    ),
  });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {}, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)), toggle('Dim blocked tiles', settings.get('showFree'), (v) => settings.set('showFree', v), 'Free tiles stay bright'), toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v))),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, 'Clear the board by matching tiles in pairs. Tap a tile, then its twin.'),
      el('p', {}, 'Only free tiles can be picked: nothing on top of them, and nothing touching their left or right side (one open side is enough). Blocked tiles are dimmed.'),
      el('p', {}, 'Any flower matches any flower, and any season matches any season. Everything else matches only itself.'),
      el('p', {}, el('b', {}, 'Every deal can be won.'), ' If you get stuck, undo or shuffle: shuffles are always winnable too.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', hint);
$('shuffle-btn').addEventListener('click', () => !game.done && doShuffle());
$('hint-btn').prepend(icon('bulb', { size: 22 }));
$('shuffle-btn').prepend(icon('shuffle', { size: 22 }));
$('menu-btn').prepend(icon('levels', { size: 22 }));
addEventListener('resize', () => game && fit());

document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === 'z' || e.key === 'u') undo();
  else if (e.key === 'h') hint();
  else if (e.key === 's') doShuffle();
  else return;
  e.preventDefault();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

const h = parseHash(location.hash);
const saved = store.get('game');
if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) {
  history.replaceState(null, '', location.pathname + location.search);
  newGame({ layout: LAYOUTS[h.l] ? h.l : 'pyramid', daily: h.d > dateKey() ? dateKey() : h.d });
} else if (saved && LAYOUTS[saved.layout] && !saved.done && Array.isArray(saved.present)) restore(saved);
else newGame({ layout: 'pyramid', daily: dateKey() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

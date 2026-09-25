import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { Particles } from './core/fx.js';
import { randomSeed } from './core/rng.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { newGame, turn, step, DIRS } from './js/snake.js';

const store = makeStore('snake');
const ach = makeAchievements('snake', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, mode: 'classic', speed: 'normal', pad: false, effects: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const MODE_NAMES = { classic: 'Classic', wrap: 'Wrap', zen: 'Zen' };
const SPEEDS = { slow: 170, normal: 120, fast: 80 };

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
settings.onChange((key, value) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(value);
  $('pad').hidden = !settings.get('pad');
});
$('pad').hidden = !settings.get('pad');

const sfx = {
  eat(n) {
    const ac = audio();
    if (!ac) return;
    const f = 523.25 * 2 ** ((n % 12) / 12);
    tone(ac, { freq: f, duration: 0.12, gain: 0.06 });
    tone(ac, { freq: f * 1.5, duration: 0.14, gain: 0.04, when: 0.05 });
  },
  turn() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.015, freq: 3000, q: 2, gain: 0.05 });
  },
  die() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.4, freq: 300, q: 0.5, gain: 0.5 });
    [330, 262, 196].forEach((f, i) => tone(ac, { freq: f, duration: 0.25, gain: 0.06, when: 0.1 + i * 0.12, type: 'triangle' }));
  },
  cut: () => sounds.invalid(),
};

// ---------- Game loop ----------

let state = null;
let prev = null; // body before the last tick, for smooth drawing
let phase = 'ready'; // ready | playing | paused | over
let acc = 0;
let lastTime = 0;
const particles = new Particles();
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let cell = 20;

function reset() {
  state = newGame({ mode: settings.get('mode'), seed: randomSeed() });
  prev = state.body.slice();
  phase = 'ready';
  acc = 0;
  particles.clear();
  hud();
  showOverlay('Swipe or press an arrow key to start');
}

function tickMs() {
  // A little faster as the snake grows (not in Zen).
  const base = SPEEDS[settings.get('speed')];
  return settings.get('mode') === 'zen' ? base : Math.max(base * 0.6, base * 0.985 ** state.score);
}

function steer(dir) {
  if (phase === 'over') return;
  if (phase === 'ready' || phase === 'paused') {
    phase = 'playing';
    hideOverlay();
  }
  const next = turn(state, dir);
  if (next !== state) sfx.turn();
  state = next;
}

function tick() {
  prev = state.body.slice();
  const { state: next, event } = step(state);
  state = next;
  if (event === 'eat') {
    sfx.eat(state.score);
    burst(state.body[0]);
    navigator.vibrate?.(8);
  } else if (event === 'cut') sfx.cut();
  else if (event === 'die') gameOver();
  if (state.food < 0) gameOver(true);
  hud();
}

function burst(i) {
  if (!settings.get('effects') || reduced.matches) return;
  const [x, y] = center(i);
  particles.burst(x, y, css('--food'), 'sparks', { count: 22, speed: 260 });
}

function gameOver(won = false) {
  phase = 'over';
  sfx.die();
  navigator.vibrate?.(60);
  const key = `${settings.get('mode')}-${settings.get('speed')}`;
  const best = store.get('best', {});
  const isBest = state.score > (best[key] || 0);
  if (isBest) store.set('best', { ...best, [key]: state.score });
  const games = store.get('games', 0) + 1;
  store.set('games', games);
  ach.at('score-10', state.score);
  ach.at('score-25', state.score);
  ach.at('score-50', state.score);
  if (settings.get('speed') === 'fast') ach.at('fast-20', state.score);
  if (settings.get('mode') === 'wrap') ach.at('wrap-30', state.score);
  ach.add('games-25');
  if (won) ach.unlock('fill');
  showOverlay(won ? 'You filled the board!' : isBest && state.score > 0 ? `New best: ${state.score}!` : `Score ${state.score}`, 'Tap or press Space to play again');
  hud();
}

function frame(t) {
  const dt = Math.min(0.1, (t - lastTime) / 1000 || 0);
  lastTime = t;
  if (phase === 'playing') {
    acc += dt * 1000;
    const ms = tickMs();
    while (acc >= ms && phase === 'playing') {
      acc -= ms;
      tick();
    }
  }
  particles.step(dt);
  draw(phase === 'playing' ? acc / tickMs() : 1);
  requestAnimationFrame(frame);
}

// ---------- Drawing ----------

const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

function resize() {
  const stage = $('stage');
  const cs = getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const height = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const size = Math.floor(Math.max(120, Math.min(width, height, 640)));
  cell = size / state.w;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const center = (i) => [((i % state.w) + 0.5) * cell, (Math.floor(i / state.w) + 0.5) * cell];

function draw(f) {
  const { w, h } = state;
  const size = w * cell;
  ctx.clearRect(0, 0, size, size);
  // Board: a soft checkerboard.
  ctx.fillStyle = css('--board-a');
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = css('--board-b');
  for (let y = 0; y < h; y++) for (let x = (y % 2); x < w; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
  // Food, gently pulsing.
  if (state.food >= 0) {
    const [fx, fy] = center(state.food);
    const pulse = reduced.matches ? 1 : 1 + Math.sin(performance.now() / 200) * 0.06;
    ctx.fillStyle = css('--food');
    ctx.beginPath();
    ctx.arc(fx, fy + cell * 0.04, cell * 0.36 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css('--leaf');
    ctx.beginPath();
    ctx.ellipse(fx + cell * 0.12, fy - cell * 0.32, cell * 0.14, cell * 0.07, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Snake: each segment slides from its old square to its new one.
  const body = state.body;
  const pts = body.map((b, k) => {
    const a = prev[k] ?? prev[prev.length - 1] ?? b;
    let [ax, ay] = center(a);
    const [bx, by] = center(b);
    // Across a wrap edge, don't slide across the whole board.
    if (Math.abs(bx - ax) > cell * 1.5 || Math.abs(by - ay) > cell * 1.5) [ax, ay] = [bx, by];
    return [ax + (bx - ax) * f, ay + (by - ay) * f];
  });
  const body1 = css('--snake');
  const body2 = css('--snake-2');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = pts.length - 1; k > 0; k--) {
    const [x1, y1] = pts[k];
    const [x2, y2] = pts[k - 1];
    if (Math.hypot(x2 - x1, y2 - y1) > cell * 1.5) continue;
    ctx.strokeStyle = k % 2 ? body1 : body2;
    ctx.lineWidth = cell * (0.62 + 0.18 * (1 - k / pts.length));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Head with eyes looking where it's going.
  const [hx, hy] = pts[0];
  ctx.fillStyle = body1;
  ctx.beginPath();
  ctx.arc(hx, hy, cell * 0.44, 0, Math.PI * 2);
  ctx.fill();
  const [dx, dy] = DIRS[state.queue[0] || state.dir];
  for (const side of [-1, 1]) {
    const ex = hx + dx * cell * 0.14 + -dy * side * cell * 0.18;
    const ey = hy + dy * cell * 0.14 + dx * side * cell * 0.18;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ex + dx * cell * 0.04, ey + dy * cell * 0.04, cell * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!state.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, size, size);
  }
  particles.draw(ctx, { width: size, height: size });
}

// ---------- Screen ----------

function hud() {
  const key = `${settings.get('mode')}-${settings.get('speed')}`;
  $('score').textContent = state.score;
  $('best').textContent = Math.max(state.score, store.get('best', {})[key] || 0);
  $('subtitle').textContent = `${MODE_NAMES[settings.get('mode')]} · ${settings.get('speed')}`;
}

function showOverlay(title, sub = '') {
  $('overlay').hidden = false;
  $('overlay-title').textContent = title;
  $('overlay-sub').textContent = sub;
}
function hideOverlay() {
  $('overlay').hidden = true;
}

function pause() {
  if (phase !== 'playing') return;
  phase = 'paused';
  showOverlay('Paused', 'Swipe or press an arrow key to carry on');
}

// ---------- Input ----------

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (KEYS[e.key]) steer(KEYS[e.key]);
  else if (e.key === ' ' || e.key === 'Enter') {
    if (phase === 'over') reset();
    else if (phase === 'playing') pause();
    else steer(state.dir);
  } else if (e.key === 'p' || e.key === 'Escape') pause();
  else return;
  e.preventDefault();
});

// Swipes anywhere on the play area.
let touch = null;
$('stage').addEventListener('pointerdown', (e) => {
  touch = { x: e.clientX, y: e.clientY, used: false };
});
$('stage').addEventListener('pointermove', (e) => {
  if (!touch || touch.used) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < 18) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  // Allow a second swipe in the same gesture: start measuring again from here.
  touch = { x: e.clientX, y: e.clientY, used: false };
});
$('stage').addEventListener('pointerup', () => {
  if (touch && phase === 'over') reset();
  touch = null;
});
for (const b of document.querySelectorAll('#pad button')) b.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  steer(b.dataset.dir);
});

document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pause());

// ---------- Menus ----------

function openMenu() {
  pause();
  const best = store.get('best', {});
  openDialog({
    title: 'Snake',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Mode'), segmented('mode', [['classic', 'Classic'], ['wrap', 'Wrap'], ['zen', 'Zen']], settings.get('mode'), (v) => settings.set('mode', v))),
      el('p', { class: 'muted small' }, 'Classic: walls are deadly. Wrap: go off one side, come back on the other. Zen: you can’t lose; biting your tail just shortens you.'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Speed'), segmented('speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], settings.get('speed'), (v) => settings.set('speed', v))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Best scores'), el('div', { class: 'stat-grid' }, ...['classic', 'wrap', 'zen'].map((m) => el('div', { class: 'stat' }, el('b', {}, Math.max(...['slow', 'normal', 'fast'].map((s) => best[`${m}-${s}`] || 0))), el('span', {}, MODE_NAMES[m]))))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Arrow buttons', settings.get('pad'), (v) => settings.set('pad', v), 'On-screen buttons as well as swipes'),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
    actions: [{ label: 'New game', value: 'new', primary: true }],
  }).then((v) => {
    if (v === 'new' || phase === 'ready') reset();
    hud();
  });
}

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('menu-btn').prepend(icon('settings', { size: 22 }));

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

reset();
resize();
addEventListener('resize', resize);
requestAnimationFrame(frame);

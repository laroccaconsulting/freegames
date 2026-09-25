import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { Particles } from './core/fx.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { W, H, R, PADDLE_H, TOP_Y, BOTTOM_Y, newMatch, step, aiTarget, aiSpeed } from './js/rally.js';

const store = makeStore('rally');
const ach = makeAchievements('rally', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, effects: true, opponent: 'normal', to: 7 });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
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

const OPPONENTS = [
  ['easy', 'Easy'],
  ['normal', 'Normal'],
  ['hard', 'Hard'],
  ['friend', 'Friend'],
];
const friend = () => settings.get('opponent') === 'friend';

const sfx = {
  paddle(hits) {
    const ac = audio();
    if (ac) tone(ac, { freq: 392 * 2 ** (Math.min(hits, 12) / 24), duration: 0.07, gain: 0.05, type: 'square' });
  },
  wall() {
    const ac = audio();
    if (ac) tone(ac, { freq: 240, duration: 0.04, gain: 0.03, type: 'square' });
  },
  serve() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.04, freq: 1800, gain: 0.12 });
  },
  point(good) {
    const ac = audio();
    if (!ac) return;
    const notes = good ? [523.25, 659.25, 783.99] : [392, 311];
    notes.forEach((f, i) => tone(ac, { freq: f, duration: 0.18, gain: 0.05, when: i * 0.08, type: 'triangle' }));
  },
  win(good) {
    const ac = audio();
    if (!ac) return;
    const notes = good ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [392, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => tone(ac, { freq: f, duration: 0.3, gain: 0.06, when: i * 0.1, type: 'triangle' }));
  },
};

// ---------- Game ----------

let s = null;
let phase = 'ready'; // ready | playing | paused | over
const targets = { top: W / 2, bottom: W / 2 };
const memo = {};
const particles = new Particles();
const trail = [];
let flash = null; // { side, life } after a point
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let scale = 1;

function reset() {
  s = newMatch({ to: settings.get('to'), serveTo: 'bottom' });
  for (const k of Object.keys(memo)) delete memo[k];
  targets.top = targets.bottom = W / 2;
  phase = 'ready';
  particles.clear();
  trail.length = 0;
  overlay(friend() ? 'Tap to start' : 'Drag to move · tap to start', friend() ? 'Each player drags on their own half' : `First to ${s.to} wins`);
  hud();
}

function go() {
  if (phase === 'over') return reset();
  if (phase === 'ready' || phase === 'paused') {
    phase = 'playing';
    hideOverlay();
  }
}

const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const name = (side) => (friend() ? (side === 'top' ? 'Top' : 'Bottom') : side === 'top' ? 'The computer' : 'You');

function handle(events) {
  const effects = settings.get('effects') && !reduced.matches;
  for (const e of events) {
    if (e.type === 'paddle') {
      sfx.paddle(e.hits);
      if (effects) particles.burst(s.ball.x, s.ball.y, css(e.side === 'top' ? '--p2' : '--p1'), 'spark', { count: 8, speed: 120 });
    } else if (e.type === 'wall') sfx.wall();
    else if (e.type === 'serve') sfx.serve();
    else if (e.type === 'point') {
      const good = friend() || e.side === 'bottom';
      sfx.point(good);
      if (!good) navigator.vibrate?.(40);
      flash = { side: e.side, life: 1 };
      trail.length = 0;
      if (e.rally >= 12 && !s.winner) toast(`${e.rally}-hit rally!`, { duration: 1200 });
      if (e.rally >= 20) ach.unlock('rally-20');
    } else if (e.type === 'win') finish(e.side);
  }
  hud();
}

function finish(side) {
  phase = 'over';
  if (!friend() && side === 'bottom') {
    ach.unlock('first-win');
    if (settings.get('opponent') === 'normal') ach.unlock('beat-normal');
    if (settings.get('opponent') === 'hard') ach.unlock('beat-hard');
    ach.add('wins-10');
    ach.add('wins-50');
  }
  if (friend()) ach.unlock('friend');
  if (!friend() && side === 'bottom' && s.score.top === 0) ach.unlock('shutout');
  const score = `${s.score[side]}–${s.score[side === 'top' ? 'bottom' : 'top']}`;
  const good = friend() || side === 'bottom';
  sfx.win(good);
  if (settings.get('effects') && !reduced.matches && good)
    for (let k = 0; k < 3; k++) particles.burst(W * (0.25 + k * 0.25), side === 'top' ? H * 0.25 : H * 0.75, null, 'confetti', { count: 30, speed: 300 });
  if (!friend()) {
    const level = settings.get('opponent');
    const rec = store.get('record', {});
    const r = rec[level] || { won: 0, lost: 0 };
    r[side === 'bottom' ? 'won' : 'lost']++;
    rec[level] = r;
    store.set('record', rec);
  }
  if (friend()) overlay(`${name(side)} wins ${score}!`, 'Tap to play again', side === 'top');
  else overlay(side === 'bottom' ? `You win ${score}!` : `The computer wins ${score}`, 'Tap to play again');
}

let last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (phase === 'playing') {
    const caps = {};
    if (!friend()) {
      targets.top = aiTarget(s, 'top', settings.get('opponent'), memo);
      caps.top = aiSpeed(settings.get('opponent'));
    }
    handle(step(s, dt, targets, caps));
    if (s.wait <= 0) {
      trail.push({ x: s.ball.x, y: s.ball.y });
      if (trail.length > 8) trail.shift();
    }
  }
  particles.step(dt);
  if (flash) {
    flash.life -= dt * 1.5;
    if (flash.life <= 0) flash = null;
  }
  draw();
  requestAnimationFrame(frame);
}

// ---------- Drawing ----------

function resize() {
  const stage = $('stage');
  const cs = getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const height = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  scale = Math.max(0.3, Math.min(width / W, height / H));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function draw() {
  ctx.fillStyle = css('--field');
  ctx.fillRect(0, 0, W, H);
  // Court lines.
  ctx.strokeStyle = css('--line');
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(8, H / 2);
  ctx.lineTo(W - 8, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // A glow on the half that just won a point.
  if (flash) {
    ctx.fillStyle = `rgba(255,255,255,${0.18 * flash.life})`;
    ctx.fillRect(0, flash.side === 'top' ? 0 : H / 2, W, H / 2);
  }
  // Big faint scores in each half; the top one faces the top player.
  ctx.fillStyle = css('--line');
  ctx.globalAlpha = 0.5;
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.score.bottom, W / 2, H * 0.75);
  ctx.save();
  ctx.translate(W / 2, H * 0.25);
  if (friend()) ctx.rotate(Math.PI);
  ctx.fillText(s.score.top, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
  // Paddles.
  const drawPaddle = (p, y, color) => {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    roundRect(p.x - p.w / 2, y, p.w, PADDLE_H, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
  };
  drawPaddle(s.paddles.top, TOP_Y - PADDLE_H, css('--p2'));
  drawPaddle(s.paddles.bottom, BOTTOM_Y, css('--p1'));
  // Ball and its trail.
  const ball = css('--ball');
  if (s.wait <= 0 && settings.get('effects') && !reduced.matches) {
    trail.forEach((p, i) => {
      ctx.globalAlpha = (i + 1) / trail.length / 4;
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * (0.5 + (i / trail.length) * 0.5), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ball;
  ctx.globalAlpha = s.wait > 0 ? 0.35 + 0.35 * Math.abs(Math.sin(s.wait * 8)) : 1;
  ctx.beginPath();
  ctx.arc(s.ball.x, s.ball.y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  particles.draw(ctx, { width: W, height: H });
}

// ---------- Screen ----------

function hud() {
  $('top-score').textContent = s.score.top;
  $('bottom-score').textContent = s.score.bottom;
  $('top-label').textContent = friend() ? 'Top' : 'CPU';
  $('bottom-label').textContent = friend() ? 'Bottom' : 'You';
  const opp = OPPONENTS.find(([id]) => id === settings.get('opponent'))[1];
  $('subtitle').textContent = friend() ? `Two players · to ${s.to}` : `vs ${opp} · to ${s.to}`;
}
function overlay(title, sub = '', flip = false) {
  $('overlay').hidden = false;
  $('overlay').classList.toggle('flip', flip);
  $('overlay-title').textContent = title;
  $('overlay-sub').textContent = sub;
}
function hideOverlay() {
  $('overlay').hidden = true;
}
function pause() {
  if (phase !== 'playing') return;
  phase = 'paused';
  overlay('Paused', 'Tap to carry on');
}

// ---------- Input ----------

// Each finger steers the paddle on its own half (in one-player mode, any
// finger steers yours), so two people can play on one phone.
const toWorld = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
};
const fingers = new Map(); // pointerId -> { side, x, y, t }
const stage = $('stage');
stage.addEventListener('pointerdown', (e) => {
  const p = toWorld(e);
  const side = friend() && p.y < H / 2 ? 'top' : 'bottom';
  fingers.set(e.pointerId, { side, x: e.clientX, y: e.clientY, t: Date.now() });
  if (phase === 'playing') targets[side] = p.x;
});
stage.addEventListener('pointermove', (e) => {
  const f = fingers.get(e.pointerId);
  if (f) targets[f.side] = toWorld(e).x;
  else if (e.pointerType === 'mouse' && !friend() && phase === 'playing') targets.bottom = toWorld(e).x;
});
const lift = (e) => {
  const f = fingers.get(e.pointerId);
  fingers.delete(e.pointerId);
  if (e.type === 'pointerup' && f && phase !== 'playing' && Math.hypot(e.clientX - f.x, e.clientY - f.y) < 12) go();
};
stage.addEventListener('pointerup', lift);
stage.addEventListener('pointercancel', lift);

const keys = new Set();
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === ' ' || e.key === 'Enter') go();
  else if (e.key === 'p' || e.key === 'Escape') pause();
  else if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) keys.add(e.key.toLowerCase());
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
setInterval(() => {
  if (!s) return;
  if (keys.has('arrowleft')) targets.bottom = s.paddles.bottom.x - 40;
  if (keys.has('arrowright')) targets.bottom = s.paddles.bottom.x + 40;
  if (friend()) {
    // A and D move the top paddle, screen-relative.
    if (keys.has('a')) targets.top = s.paddles.top.x - 40;
    if (keys.has('d')) targets.top = s.paddles.top.x + 40;
  }
}, 16);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pause());

function record() {
  const rec = store.get('record', {});
  return el(
    'div',
    { class: 'stat-grid' },
    ...['easy', 'normal', 'hard'].map((level) => {
      const r = rec[level] || { won: 0, lost: 0 };
      return el('div', { class: 'stat' }, el('b', {}, `${r.won}–${r.lost}`), el('span', {}, `vs ${level[0].toUpperCase() + level.slice(1)}`));
    }),
  );
}

function openMenu() {
  pause();
  const before = `${settings.get('opponent')}/${settings.get('to')}`;
  openDialog({
    title: 'Rally',
    body: el(
      'div',
      {},
      el('p', {}, 'Drag to move your paddle; where the ball meets it sets the angle, and every hit is a little faster. With a friend, sit at either end of the phone and each drag on your own half.'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Opponent'), segmented('opponent', OPPONENTS, settings.get('opponent'), (v) => settings.set('opponent', v))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Match'), segmented('to', [[3, 'To 3'], [5, 'To 5'], [7, 'To 7'], [11, 'To 11']], settings.get('to'), (v) => settings.set('to', Number(v)))),
      record(),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Sparks, trail and confetti'),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
    actions: [{ label: 'New match', value: 'new' }, { label: 'Carry on', value: null, primary: true }],
  }).then((v) => {
    if (v === 'new' || `${settings.get('opponent')}/${settings.get('to')}` !== before) reset();
    else hud();
  });
}
$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('menu-btn').prepend(icon('settings', { size: 22 }));
$('new-btn').addEventListener('click', reset);
$('new-btn').prepend(icon('flag', { size: 22 }));

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

reset();
resize();
addEventListener('resize', resize);
requestAnimationFrame(frame);

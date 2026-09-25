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
import { W, H, R, PADDLE_Y, PADDLE_H, newGame, launch, step } from './js/bricks.js';

const store = makeStore('bricks');
const ach = makeAchievements('bricks', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, effects: true });
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

const sfx = {
  paddle() {
    const ac = audio();
    if (ac) tone(ac, { freq: 330, duration: 0.07, gain: 0.05, type: 'square' });
  },
  wall() {
    const ac = audio();
    if (ac) tone(ac, { freq: 220, duration: 0.04, gain: 0.03, type: 'square' });
  },
  brick(combo) {
    const ac = audio();
    if (ac) tone(ac, { freq: 440 * 2 ** (Math.min(combo, 24) / 12), duration: 0.09, gain: 0.05, type: 'square' });
  },
  hit() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.03, freq: 2400, gain: 0.2 });
  },
  power() {
    const ac = audio();
    if (ac) [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.12, gain: 0.05, when: i * 0.05 }));
  },
  lose() {
    const ac = audio();
    if (ac) [392, 311, 233].forEach((f, i) => tone(ac, { freq: f, duration: 0.25, gain: 0.06, when: i * 0.12, type: 'triangle' }));
  },
  clear() {
    const ac = audio();
    if (ac) [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.3, gain: 0.06, when: i * 0.09, type: 'triangle' }));
  },
};

// ---------- Game ----------

let s = null;
let phase = 'ready'; // ready | playing | paused | between | over
let target = W / 2;
let shake = 0;
const particles = new Particles();
const floaters = [];
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let scale = 1;

function reset() {
  s = newGame();
  phase = 'ready';
  particles.clear();
  overlay('Drag to move · tap to launch');
  hud();
}

function nextLevel() {
  s = newGame({ level: s.level + 1, lives: Math.min(5, s.lives + 1), score: s.score });
  phase = 'ready';
  overlay(`Level ${s.level}`, 'Tap to launch');
  hud();
}

function go() {
  if (phase === 'over') return reset();
  if (phase === 'between') return nextLevel();
  if (phase === 'ready' || phase === 'paused') {
    phase = 'playing';
    hideOverlay();
    launch(s);
  } else if (s.balls.some((b) => b.stuck)) launch(s);
}

const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const COLORS = () => [0, 1, 2, 3, 4, 5].map((k) => css(`--b${k}`));

function handle(events) {
  const effects = settings.get('effects') && !reduced.matches;
  for (const e of events) {
    if (e.type === 'paddle') sfx.paddle();
    else if (e.type === 'wall') sfx.wall();
    else if (e.type === 'hit') sfx.hit();
    else if (e.type === 'break') {
      sfx.brick(e.combo);
      if (effects) {
        const k = e.brick;
        particles.burst(k.x + k.w / 2, k.y + k.h / 2, COLORS()[k.color], 'confetti', { count: 14, speed: 180 });
        if (e.combo >= 3) floaters.push({ x: k.x + k.w / 2, y: k.y, text: `×${e.combo}`, life: 1 });
      }
      if (e.combo >= 8) ach.unlock('combo-8');
    } else if (e.type === 'power') {
      sfx.power();
      ach.unlock('power');
      toast({ wide: 'Wide paddle!', multi: 'Multi-ball!', slow: 'Slow motion!' }[e.kind], { duration: 1200 });
    } else if (e.type === 'lose') {
      sfx.lose();
      shake = effects ? 10 : 0;
      navigator.vibrate?.(60);
      if (!s.over) {
        phase = 'ready';
        overlay(`${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`, 'Tap to launch');
      }
    } else if (e.type === 'clear') {
      sfx.clear();
      phase = 'between';
      ach.unlock('level-1');
      ach.at('level-5', s.level);
      ach.at('level-10', s.level);
      if (effects) for (let k = 0; k < 4; k++) particles.burst(W * (0.2 + k * 0.2), H * 0.4, null, 'confetti', { count: 30, speed: 320, palette: COLORS() });
      overlay(`Level ${s.level} cleared!`, 'Tap for the next level');
    }
  }
  if (s.over && phase !== 'over') {
    phase = 'over';
    ach.at('score-5000', s.score);
    const best = store.get('best', 0);
    if (s.score > best) store.set('best', s.score);
    store.set('bestLevel', Math.max(store.get('bestLevel', 1), s.level));
    overlay(s.score > best ? `New best: ${s.score}!` : `Game over · ${s.score}`, 'Tap to play again');
  }
  hud();
}

let last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (phase === 'playing' || phase === 'ready') handle(step(s, phase === 'playing' ? dt : 0.0001, target));
  particles.step(dt);
  for (const f of floaters) {
    f.y -= 30 * dt;
    f.life -= dt;
  }
  while (floaters.length && floaters[0].life <= 0) floaters.shift();
  shake = Math.max(0, shake - dt * 40);
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
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.fillStyle = css('--field');
  ctx.fillRect(-20, -20, W + 40, H + 40);
  const colors = COLORS();
  for (const k of s.bricks) {
    if (k.hp <= 0) continue;
    const g = ctx.createLinearGradient(0, k.y, 0, k.y + k.h);
    g.addColorStop(0, '#ffffff66');
    g.addColorStop(0.35, colors[k.color]);
    g.addColorStop(1, colors[k.color]);
    ctx.fillStyle = g;
    roundRect(k.x, k.y, k.w, k.h, 4);
    ctx.fill();
    if (k.max > 1) {
      ctx.strokeStyle = k.hp === k.max ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.35)';
      ctx.lineWidth = 2;
      roundRect(k.x + 2, k.y + 2, k.w - 4, k.h - 4, 3);
      ctx.stroke();
    }
    if (k.power) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(k.x + k.w / 2, k.y + k.h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Power-ups falling.
  for (const d of s.drops) {
    ctx.fillStyle = { wide: '#2fb36a', multi: '#9a5ad8', slow: '#2f7de0' }[d.kind];
    roundRect(d.x - 14, d.y - 7, 28, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText({ wide: '↔', multi: '●●', slow: '½' }[d.kind], d.x, d.y + 0.5);
  }
  // Paddle.
  const p = s.paddle;
  const pg = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
  pg.addColorStop(0, css('--paddle-hi'));
  pg.addColorStop(1, css('--paddle'));
  ctx.fillStyle = pg;
  roundRect(p.x - p.w / 2, PADDLE_Y, p.w, PADDLE_H, 6);
  ctx.fill();
  // Balls with a short glow.
  for (const b of s.balls) {
    ctx.fillStyle = css('--ball');
    ctx.shadowColor = css('--ball');
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  particles.draw(ctx, { width: W, height: H });
  ctx.fillStyle = css('--text');
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px system-ui, sans-serif';
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- Screen ----------

function hud() {
  $('score').textContent = s.score;
  $('level').textContent = s.level;
  $('lives').textContent = '♥'.repeat(Math.max(0, s.lives));
  $('best').textContent = `Best ${Math.max(store.get('best', 0), s.score)}`;
}
function overlay(title, sub = '') {
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
  overlay('Paused', 'Tap to carry on');
}

// ---------- Input ----------

const toWorld = (clientX) => (clientX - canvas.getBoundingClientRect().left) / scale;
let downAt = null;
$('stage').addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
  target = toWorld(e.clientX);
});
$('stage').addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || downAt) target = toWorld(e.clientX);
});
$('stage').addEventListener('pointerup', (e) => {
  // A tap (not a drag) launches or moves on.
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 12 && Date.now() - downAt.t < 350) go();
  else if (phase === 'ready' || phase === 'between' || phase === 'over') go();
  downAt = null;
});
const keys = new Set();
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === ' ' || e.key === 'Enter') go();
  else if (e.key === 'p' || e.key === 'Escape') pause();
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keys.add(e.key);
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(e.key));
setInterval(() => {
  if (keys.has('ArrowLeft')) target = Math.max(0, s.paddle.x - 30);
  if (keys.has('ArrowRight')) target = Math.min(W, s.paddle.x + 30);
}, 16);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pause());

function openMenu() {
  pause();
  openDialog({
    title: 'Bricks',
    body: el(
      'div',
      {},
      el('p', {}, 'Drag anywhere to move the paddle; tap to launch. Where the ball hits the paddle sets its angle. Break bricks in a row for a combo. Catch falling power-ups: ↔ wide paddle, ●● three balls, ½ slow motion. Clear a level for an extra life.'),
      el('div', { class: 'stat-grid' }, el('div', { class: 'stat' }, el('b', {}, store.get('best', 0)), el('span', {}, 'Best score')), el('div', { class: 'stat' }, el('b', {}, store.get('bestLevel', 1)), el('span', {}, 'Best level'))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Sparks, combo numbers and shake'),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
    actions: [{ label: 'New game', value: 'new' }, { label: 'Carry on', value: null, primary: true }],
  }).then((v) => v === 'new' && reset());
}
$('menu-btn').addEventListener('click', openMenu);
$('menu-btn').prepend(icon('settings', { size: 22 }));

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

reset();
resize();
addEventListener('resize', resize);
requestAnimationFrame(frame);

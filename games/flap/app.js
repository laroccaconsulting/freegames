import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { Particles } from './core/fx.js';
import { randomSeed } from './core/rng.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, shareText } from './core/golf.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { W, H, GROUND, BIRD_X, R, GATE_W, newRun, step, medalFor } from './js/flap.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('flap');
const ach = makeAchievements('flap', ACHIEVEMENTS);
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
  if (key === 'theme' || key === 'themeAt') {
    applyTheme(themeId());
    palette = null;
  }
  if (key === 'sound') setSoundEnabled(value);
});

const sfx = {
  flap() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.06, freq: 900, q: 0.8, gain: 0.12 });
  },
  score(n) {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 880, duration: 0.08, gain: 0.04, type: 'square' });
    if (n % 10 === 0) tone(ac, { freq: 1318.5, duration: 0.16, gain: 0.05, when: 0.08, type: 'square' });
  },
  crash() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.2, freq: 300, gain: 0.3 });
    [330, 247, 196].forEach((f, i) => tone(ac, { freq: f, duration: 0.2, gain: 0.05, when: 0.12 + i * 0.1, type: 'triangle' }));
  },
};

// ---------- Game ----------

// mode: 'daily' | 'endless'
let mode = store.get('mode', 'daily');
let run = null;
let phase = 'ready'; // ready | flying | over
let pending = false; // a tap waiting for the next frame
let shake = 0;
let deadAt = 0;
const particles = new Particles();
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let scale = 1;

const today = () => dateKey();
const seedFor = () => (mode === 'daily' ? dailySeed('flap', today()) : randomSeed());
const bestKey = () => (mode === 'daily' ? `daily:${today()}` : 'endless');

function reset() {
  run = newRun(seedFor());
  phase = 'ready';
  particles.clear();
  overlay(mode === 'daily' ? `Daily #${dailyNumber(today(), LAUNCH_DAY)}` : 'Endless', 'Tap to flap');
  hud();
}

function setMode(m) {
  mode = m;
  store.set('mode', m);
  reset();
}

function tap() {
  if (document.querySelector('dialog[open]')) return;
  if (phase === 'over') {
    // A short pause after crashing, so a frantic tap doesn't restart.
    if (performance.now() - deadAt > 450) reset();
    return;
  }
  if (phase === 'ready') {
    phase = 'flying';
    hideOverlay();
  }
  pending = true;
}

function handle(events) {
  const effects = settings.get('effects') && !reduced.matches;
  for (const e of events) {
    if (e.type === 'flap') {
      sfx.flap();
      if (effects) particles.burst(BIRD_X - 8, run.y + 6, palette.cloud, 'spark', { count: 3, speed: 60 });
    } else if (e.type === 'score') {
      sfx.score(e.score);
      if (effects && e.score % 10 === 0) particles.burst(BIRD_X, run.y, null, 'confetti', { count: 24, speed: 220 });
    } else if (e.type === 'crash') crashed();
  }
  hud();
}

function crashed() {
  phase = 'over';
  deadAt = performance.now();
  sfx.crash();
  navigator.vibrate?.(80);
  if (settings.get('effects') && !reduced.matches) {
    shake = 12;
    particles.burst(BIRD_X, run.y, palette.bird, 'confetti', { count: 20, speed: 200 });
  }
  const score = run.score;
  const bests = store.get('best', {});
  const prev = bests[bestKey()] || 0;
  const newBest = score > prev;
  if (newBest) store.set('best', { ...bests, [bestKey()]: score });
  const overall = Math.max(store.get('allTime', 0), score);
  store.set('allTime', overall);
  if (mode === 'daily') {
    const log = store.get('daily', {});
    const r = log[today()];
    store.set('daily', { ...log, [today()]: { best: Math.max(score, r?.best || 0), tries: (r?.tries || 0) + 1 } });
  }
  for (const id of ['bronze', 'silver', 'gold', 'platinum']) ach.at(id, score);
  ach.add('flights-50');
  if (mode === 'daily') {
    ach.unlock('daily');
    const streak = dailyStreak(store.get('daily', {}), today());
    ach.at('streak-7', streak);
    ach.at('streak-30', streak);
  }
  const m = medalFor(score);
  overlay(newBest && score ? `New best: ${score}!` : `${score} ${score === 1 ? 'gate' : 'gates'}`, m ? `${m.name} medal · tap to fly again` : 'Tap to fly again');
  hud();
}

let last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (phase === 'flying') {
    handle(step(run, dt, pending));
    pending = false;
  } else if (phase === 'ready') step(run, dt, false);
  particles.step(dt);
  shake = Math.max(0, shake - dt * 40);
  draw(t / 1000);
  requestAnimationFrame(frame);
}

// ---------- Drawing ----------

let palette = null;
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const readPalette = () => {
  const names = ['sky-top', 'sky-bottom', 'hill', 'hill-far', 'pillar', 'pillar-edge', 'ground', 'ground-top', 'bird', 'wing', 'cloud'];
  return Object.fromEntries(names.map((n) => [n.replace(/-(\w)/g, (_, c) => c.toUpperCase()), css(`--${n}`)]));
};

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

function hills(offset, base, amp, color, period) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, base - Math.abs(Math.sin((x + offset) / period)) * amp);
  ctx.lineTo(W, GROUND);
  ctx.fill();
}

function draw(time) {
  palette ||= readPalette();
  const p = palette;
  const x0 = run.x;
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  // Clouds and hills scroll slower than the gates, for depth.
  ctx.fillStyle = p.cloud;
  for (let k = 0; k < 4; k++) {
    const cx = ((k * 140 - x0 * 0.2) % (W + 160) + W + 160) % (W + 160) - 80;
    const cy = 70 + ((k * 53) % 90);
    for (const [dx, dy, r] of [[0, 0, 18], [18, -8, 22], [40, 0, 18]]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  hills(x0 * 0.25, GROUND - 40, 70, p.hillFar, 90);
  hills(x0 * 0.5 + 200, GROUND, 50, p.hill, 60);
  // Gates.
  for (const g of run.gates) {
    const gx = g.x - x0;
    if (gx > W + 10 || gx + GATE_W < -10) continue;
    const top = g.gap - g.size / 2;
    const bottom = g.gap + g.size / 2;
    for (const [y, h, capY] of [[-10, top + 10, top - 22], [bottom, GROUND - bottom, bottom]]) {
      const grad = ctx.createLinearGradient(gx, 0, gx + GATE_W, 0);
      grad.addColorStop(0, p.pillarEdge);
      grad.addColorStop(0.35, p.pillar);
      grad.addColorStop(1, p.pillarEdge);
      ctx.fillStyle = grad;
      ctx.fillRect(gx + 4, y, GATE_W - 8, h);
      ctx.fillRect(gx - 2, capY, GATE_W + 4, 22);
      ctx.strokeStyle = p.pillarEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(gx - 2, capY, GATE_W + 4, 22);
    }
  }
  // Ground with moving stripes.
  ctx.fillStyle = p.ground;
  ctx.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
  ctx.fillStyle = p.groundTop;
  ctx.fillRect(-20, GROUND, W + 40, 12);
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  for (let k = -1; k < W / 24 + 1; k++) {
    const sx = k * 24 - (x0 % 24);
    ctx.beginPath();
    ctx.moveTo(sx, GROUND + 12);
    ctx.lineTo(sx + 12, GROUND + 12);
    ctx.lineTo(sx, GROUND + 26);
    ctx.fill();
  }
  drawBird(time);
  particles.draw(ctx, { width: W, height: H });
  // Score.
  if (phase !== 'ready') {
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.strokeText(run.score, W / 2, 80);
    ctx.fillStyle = '#fff';
    ctx.fillText(run.score, W / 2, 80);
  }
  ctx.restore();
}

function drawBird(time) {
  const p = palette;
  const hallows = document.documentElement.dataset.theme === 'hallows';
  const tilt = Math.max(-0.5, Math.min(1.2, run.vy / 600));
  const flapping = phase !== 'over' && (run.vy < 0 || phase === 'ready');
  const wing = Math.sin(time * (flapping ? 22 : 8)) * (flapping ? 1 : 0.4);
  ctx.save();
  ctx.translate(BIRD_X, run.y);
  ctx.rotate(tilt);
  if (hallows) {
    // A little bat.
    ctx.fillStyle = p.wing;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * 14, -12 - wing * 8, side * 26, -4 - wing * 10);
      ctx.quadraticCurveTo(side * 20, 2, side * 22, 6);
      ctx.quadraticCurveTo(side * 12, 4, 0, 4);
      ctx.fill();
    }
    ctx.fillStyle = p.bird;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe29a';
    ctx.fillRect(2, -4, 3, 3);
    ctx.fillRect(7, -4, 3, 3);
  } else {
    ctx.fillStyle = p.bird;
    ctx.beginPath();
    ctx.ellipse(0, 0, R + 2, R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath();
    ctx.ellipse(2, 5, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wing.
    ctx.fillStyle = p.wing;
    ctx.beginPath();
    ctx.ellipse(-4, 1 + wing * 4, 8, 5 - wing * 2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Eye and beak.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -4, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(7.5, -4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f26b3a';
    ctx.beginPath();
    ctx.moveTo(R, -1);
    ctx.lineTo(R + 9, 2);
    ctx.lineTo(R, 5);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Screen ----------

function hud() {
  const bests = store.get('best', {});
  $('best').textContent = bests[bestKey()] || 0;
  $('title').textContent = mode === 'daily' ? `Daily #${dailyNumber(today(), LAUNCH_DAY)}` : 'Endless';
  const s = dailyStreak(store.get('daily', {}), today());
  $('subtitle').textContent = mode === 'daily' ? `Same course for everyone${s > 1 ? ` · ${s}-day streak` : ''}` : `A new course every run · best ever ${store.get('allTime', 0)}`;
  $('daily-btn').classList.toggle('on', mode === 'daily');
  $('endless-btn').classList.toggle('on', mode === 'endless');
}
function overlay(title, sub = '') {
  $('overlay').hidden = false;
  $('overlay-title').textContent = title;
  $('overlay-sub').textContent = sub;
}
function hideOverlay() {
  $('overlay').hidden = true;
}

// ---------- Input ----------

$('stage').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tap();
});
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.repeat) return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'Enter') {
    e.preventDefault();
    tap();
  }
});
document.addEventListener('visibilitychange', () => {
  // Leaving mid-flight ends the run; the course is short enough to retry.
  if (document.visibilityState === 'hidden' && phase === 'flying') reset();
});

function share() {
  const r = store.get('daily', {})[today()];
  if (!r) return;
  const m = medalFor(r.best);
  const text = `Flap · Daily #${dailyNumber(today(), LAUNCH_DAY)} ${m ? { Platinum: '💎', Gold: '🥇', Silver: '🥈', Bronze: '🥉' }[m.name] : '🐤'}\n${r.best} gates in ${r.tries} ${r.tries === 1 ? 'try' : 'tries'}`;
  shareText(text, location.origin + location.pathname).then((how) => how === 'copied' && toast('Result copied — paste it anywhere'));
}

function openMenu() {
  const r = store.get('daily', {})[today()];
  openDialog({
    title: 'Flap',
    body: el(
      'div',
      {},
      el('p', {}, 'Tap anywhere (or press space) to flap. Fly through the gaps between the pillars; each one is a point. The daily course is the same for everyone, so compare scores with friends.'),
      el(
        'div',
        { class: 'stat-grid' },
        el('div', { class: 'stat' }, el('b', {}, r ? r.best : '–'), el('span', {}, 'Today')),
        el('div', { class: 'stat' }, el('b', {}, store.get('best', {}).endless || 0), el('span', {}, 'Endless best')),
        el('div', { class: 'stat' }, el('b', {}, store.get('allTime', 0)), el('span', {}, 'Best ever')),
      ),
      el('p', { class: 'muted' }, 'Medals: bronze at 10, silver at 25, gold at 50, platinum at 100.'),
      r && el('button', { class: 'btn share-btn', onclick: share }, icon('share'), 'Share today’s best'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Feathers, confetti and shake'),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
}

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('menu-btn').prepend(icon('settings', { size: 22 }));
$('daily-btn').addEventListener('click', () => setMode('daily'));
$('daily-btn').prepend(icon('calendar', { size: 22 }));
$('endless-btn').addEventListener('click', () => setMode('endless'));
$('endless-btn').prepend(icon('infinity', { size: 22 }));

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

reset();
resize();
addEventListener('resize', resize);
requestAnimationFrame(frame);

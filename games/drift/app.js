import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon } from './core/icons.js';
import { Particles } from './core/fx.js';
import { randomSeed, mulberry32 } from './core/rng.js';
import { W, H, SHIP_R, newGame, step } from './js/drift.js';

const store = makeStore('drift');
const settings = makeSettings(store, { theme: null, sound: true, effects: true, autofire: true });
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
  fire() {
    const ac = audio();
    if (ac) tone(ac, { freq: 1200, duration: 0.05, gain: 0.02, type: 'square' });
  },
  break(size) {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.08 + size * 0.06, freq: 1400 - size * 350, gain: 0.25 });
  },
  crash() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.5, freq: 250, gain: 0.35 });
  },
  wave() {
    const ac = audio();
    if (ac) [523.25, 659.25, 783.99].forEach((f, i) => tone(ac, { freq: f, duration: 0.18, gain: 0.05, when: i * 0.08, type: 'triangle' }));
  },
  extra() {
    const ac = audio();
    if (ac) [783.99, 1046.5, 1318.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.12, gain: 0.05, when: i * 0.06, type: 'square' }));
  },
};

// ---------- Game ----------

let s = null;
let phase = 'ready'; // ready | playing | paused | over
let shake = 0;
const particles = new Particles();
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let scale = 1;
const stars = (() => {
  const r = mulberry32(7);
  return Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H, z: 0.3 + r() * 0.7 }));
})();

function reset() {
  s = newGame(randomSeed());
  phase = 'ready';
  particles.clear();
  overlay('Hold to fly · it fires by itself', 'Tap to start');
  hud();
}

function go() {
  if (phase === 'over') return reset();
  if (phase === 'ready' || phase === 'paused') {
    phase = 'playing';
    hideOverlay();
  }
}

function handle(events) {
  const effects = settings.get('effects') && !reduced.matches;
  for (const e of events) {
    if (e.type === 'fire') sfx.fire();
    else if (e.type === 'break') {
      sfx.break(e.size);
      if (effects) particles.burst(e.x, e.y, palette.rock, 'spark', { count: 6 + e.size * 4, speed: 90 + e.size * 30 });
      navigator.vibrate?.(e.size === 3 ? 12 : 5);
    } else if (e.type === 'crash') {
      sfx.crash();
      navigator.vibrate?.(120);
      if (effects) {
        shake = 14;
        particles.burst(e.x, e.y, palette.ship, 'confetti', { count: 30, speed: 220 });
      }
    } else if (e.type === 'wave') {
      sfx.wave();
      toast(`Wave ${e.wave}`, { duration: 1200 });
    } else if (e.type === 'extra') {
      sfx.extra();
      toast('Extra ship!', { duration: 1200 });
    } else if (e.type === 'over') {
      phase = 'over';
      const best = store.get('best', 0);
      if (s.score > best) store.set('best', s.score);
      store.set('bestWave', Math.max(store.get('bestWave', 1), s.wave));
      overlay(s.score > best ? `New best: ${s.score}!` : `Game over · ${s.score}`, 'Tap to play again');
    }
  }
  hud();
}

// ---------- Input ----------

// Touch and mouse: hold where you want to go. The ship turns to face your
// finger and thrusts while it's more than a little way off.
let pointer = null; // { x, y } in world units while held
const keys = new Set();
const toWorld = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
};
$('stage').addEventListener('pointerdown', (e) => {
  if (phase !== 'playing') {
    go();
    return;
  }
  $('stage').setPointerCapture?.(e.pointerId);
  pointer = toWorld(e);
});
$('stage').addEventListener('pointermove', (e) => {
  if (pointer) pointer = toWorld(e);
});
const lift = () => (pointer = null);
$('stage').addEventListener('pointerup', lift);
$('stage').addEventListener('pointercancel', lift);
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Enter' || (e.key === ' ' && phase !== 'playing')) go();
  else if (e.key === 'p' || e.key === 'Escape') pause();
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'd', 'w'].includes(e.key)) keys.add(e.key);
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(e.key));
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pause());

function controls() {
  const c = { turn: 0, thrust: false, fire: settings.get('autofire') && s.rocks.length > 0, aim: null };
  if (keys.has('ArrowLeft') || keys.has('a')) c.turn -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) c.turn += 1;
  if (keys.has('ArrowUp') || keys.has('w')) c.thrust = true;
  if (keys.has(' ')) c.fire = true;
  if (pointer && s.ship) {
    const dx = pointer.x - s.ship.x;
    const dy = pointer.y - s.ship.y;
    c.aim = Math.atan2(dy, dx);
    let d = c.aim - s.ship.a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    c.thrust = Math.hypot(dx, dy) > 50 && Math.abs(d) < 0.9;
    if (!settings.get('autofire')) c.fire = true;
  }
  return c;
}

function pause() {
  if (phase !== 'playing') return;
  phase = 'paused';
  pointer = null;
  overlay('Paused', 'Tap to carry on');
}

let last = 0;
let thrusting = false;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (phase === 'playing') {
    const c = controls();
    thrusting = c.thrust && s.ship;
    handle(step(s, dt, c));
    if (thrusting && settings.get('effects') && !reduced.matches && Math.random() < 0.5) {
      const sh = s.ship;
      if (sh) particles.burst(sh.x - Math.cos(sh.a) * SHIP_R, sh.y - Math.sin(sh.a) * SHIP_R, palette.flame, 'spark', { count: 1, speed: 40 });
    }
  }
  particles.step(dt);
  shake = Math.max(0, shake - dt * 40);
  draw(t / 1000);
  requestAnimationFrame(frame);
}

// ---------- Drawing ----------

let palette = null;
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

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

// Draw something at (x, y) and again across any edge it overlaps, so
// things slide smoothly off one side and onto the other.
function wrapped(x, y, r, fn) {
  for (const ox of [0, x < r ? W : x > W - r ? -W : null]) {
    if (ox === null) continue;
    for (const oy of [0, y < r ? H : y > H - r ? -H : null]) {
      if (oy === null) continue;
      fn(x + ox, y + oy);
    }
  }
}

function draw(time) {
  palette ||= Object.fromEntries(['space', 'star', 'rock', 'rock-edge', 'ship', 'flame', 'shot'].map((n) => [n.replace('-e', 'E'), css(`--${n}`)]));
  const p = palette;
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.fillStyle = p.space;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.fillStyle = p.star;
  const sx = s.ship ? s.ship.x : W / 2;
  const sy = s.ship ? s.ship.y : H / 2;
  for (const st of stars) {
    // A little parallax against the ship's position.
    const x = (((st.x - sx * st.z * 0.1) % W) + W) % W;
    const y = (((st.y - sy * st.z * 0.1) % H) + H) % H;
    ctx.globalAlpha = 0.3 + st.z * 0.7 * (0.75 + 0.25 * Math.sin(time * 2 + st.x));
    ctx.fillRect(x, y, st.z * 2, st.z * 2);
  }
  ctx.globalAlpha = 1;
  // Rocks.
  for (const r of s.rocks) {
    wrapped(r.x, r.y, r.r, (x, y) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r.a);
      ctx.beginPath();
      r.shape.forEach((k, i) => {
        const a = (i / r.shape.length) * Math.PI * 2;
        const px = Math.cos(a) * r.r * k;
        const py = Math.sin(a) * r.r * k;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = p.rock;
      ctx.fill();
      ctx.strokeStyle = p.rockEdge;
      ctx.lineWidth = 2;
      ctx.stroke();
      // A crater or two.
      ctx.fillStyle = p.rockEdge;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(r.r * 0.25, -r.r * 0.2, r.r * 0.18, 0, Math.PI * 2);
      ctx.arc(-r.r * 0.3, r.r * 0.25, r.r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    });
  }
  // Shots.
  ctx.fillStyle = p.shot;
  for (const b of s.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ship, blinking while its shield is up.
  const sh = s.ship;
  if (sh && !(sh.shield > 0 && Math.floor(time * 10) % 2)) {
    wrapped(sh.x, sh.y, SHIP_R + 4, (x, y) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sh.a);
      if (thrusting) {
        ctx.fillStyle = p.flame;
        ctx.beginPath();
        ctx.moveTo(-SHIP_R * 0.7, -4);
        ctx.lineTo(-SHIP_R * (1.3 + Math.random() * 0.5), 0);
        ctx.lineTo(-SHIP_R * 0.7, 4);
        ctx.fill();
      }
      ctx.fillStyle = p.ship;
      ctx.shadowColor = p.ship;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(SHIP_R * 1.3, 0);
      ctx.lineTo(-SHIP_R * 0.9, -SHIP_R * 0.8);
      ctx.lineTo(-SHIP_R * 0.5, 0);
      ctx.lineTo(-SHIP_R * 0.9, SHIP_R * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      if (sh.shield > 0) {
        ctx.strokeStyle = p.ship;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, SHIP_R * 1.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });
  }
  // Where the finger is.
  if (pointer && phase === 'playing') {
    ctx.strokeStyle = p.ship;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  particles.draw(ctx, { width: W, height: H });
  ctx.restore();
}

// ---------- Screen ----------

function hud() {
  $('score').textContent = s.score;
  $('wave').textContent = s.wave;
  $('lives').textContent = '▲'.repeat(Math.max(0, Math.min(6, s.lives - (s.ship || s.over ? 1 : 0))));
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

function openMenu() {
  pause();
  openDialog({
    title: 'Drift',
    body: el(
      'div',
      {},
      el('p', {}, 'Hold a finger (or the mouse) where you want to fly: the ship turns to face it and thrusts toward it, and fires by itself. Big rocks break into smaller, faster ones. Clear the field for the next wave; every 10,000 points earns an extra ship.'),
      el('p', { class: 'muted' }, 'Keys: ← → turn, ↑ thrust, space fires, P pauses.'),
      el('div', { class: 'stat-grid' }, el('div', { class: 'stat' }, el('b', {}, store.get('best', 0)), el('span', {}, 'Best score')), el('div', { class: 'stat' }, el('b', {}, store.get('bestWave', 1)), el('span', {}, 'Best wave'))),
      toggle('Fire by itself', settings.get('autofire'), (v) => settings.set('autofire', v), 'Off: fire while your finger is down, or with space'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v), 'Sparks and shake'),
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

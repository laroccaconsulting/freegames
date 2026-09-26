import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, openDialog, toggle, segmented, el, toast } from './core/ui.js';
import { audio, setSoundEnabled, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { Particles } from './core/fx.js';
import { SPELL_LIST, SPELLS_BY_ID, TEMPLATES } from './js/glyphs.js';
import { prepare, recognize, fitTemplate, centroid } from './js/recognizer.js';
import { makeWorld, castSpell, tick, progress, remember, find, TASKS } from './js/scene.js';
import { View, targetAt, centreOf, drawRoom, drawObjects, drawWand, drawTrail, drawSigil, drawGlyph, grip, SIGIL_SECONDS } from './js/render.js';

const $ = (id) => document.getElementById(id);
const store = makeStore('wand');
const settings = makeSettings(store, { sound: true, effects: true, handed: 'right', ghosts: true });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

applyTheme('hallows');
setSoundEnabled(settings.get('sound'));

const view = new View($('canvas'));
const fx = new Particles();
const prepared = prepare(TEMPLATES);
const byId = new Map(TEMPLATES.map((t) => [t.id, t]));
const world = makeWorld();

view.handed = settings.get('handed');
settings.onChange((key, value) => {
  if (key === 'sound') setSoundEnabled(value);
  if (key === 'handed') view.handed = value;
});

// ---------- drawing state ----------

let now = 0; // seconds since the page loaded, the clock everything animates on
let stroke = null; // the points of the stroke in progress
let trail = []; // recent tip positions, for the fading line of light
let sigils = []; // clean glyphs playing their little flourish
let tip = { x: view.w / 2, y: view.h * 0.42 };
let aim = { ...tip };
let idleSince = 0;
let glow = 0;
let ghost = null; // a spell picked from the book, traced faintly on screen
let highlight = null; // the object the current stroke is aimed at
let done = new Set();

const announce = (text) => ($('announce').textContent = text);

// ---------- sound ----------

const sfx = {
  swish() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.09, freq: 3200, q: 0.6, gain: 0.1 });
  },
  cast(color) {
    const ac = audio();
    if (!ac) return;
    // Pitch follows the glyph's colour so each spell sounds a little different.
    const n = parseInt(color.slice(1), 16);
    const base = 380 + ((n >> 8) & 255);
    tone(ac, { freq: base, duration: 0.3, gain: 0.07, type: 'triangle' });
    tone(ac, { freq: base * 1.5, duration: 0.4, gain: 0.05, when: 0.05 });
    noiseBurst(ac, { duration: 0.12, freq: 1800, gain: 0.14 });
  },
  fizzle() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 190, duration: 0.18, gain: 0.06, type: 'sawtooth' });
    noiseBurst(ac, { duration: 0.16, freq: 700, q: 0.5, gain: 0.08 });
  },
  trial() {
    const ac = audio();
    if (!ac) return;
    [659.25, 987.77, 1318.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.45, gain: 0.07, when: i * 0.09, type: 'triangle' }));
  },
};

// ---------- input ----------

const inHud = (e) => !!e.target.closest?.('.hud-top, .drawer, dialog, .toast');

function point(e) {
  const r = $('canvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

addEventListener(
  'pointerdown',
  (e) => {
    if (inHud(e) || e.button > 0) return;
    e.preventDefault();
    const p = point(e);
    aim = p;
    stroke = [{ ...p, t: now }];
    trail = [];
    ghost = null;
    $('hint').classList.add('gone');
    sfx.swish();
  },
  { passive: false },
);

addEventListener('pointermove', (e) => {
  if (inHud(e) && !stroke) return;
  const p = point(e);
  aim = p;
  idleSince = now;
  if (!stroke) return;
  const last = stroke[stroke.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) < 2.5) return;
  stroke.push({ ...p, t: now });
  highlight = targetAt(world, view, stroke)?.id ?? null;
});

const release = () => {
  if (!stroke) return;
  const pts = stroke;
  stroke = null;
  highlight = null;
  cast(pts);
};
addEventListener('pointerup', release);
addEventListener('pointercancel', release);

// ---------- casting ----------

function show(name, message, fizzle = false) {
  const box = $('readout');
  $('spell-name').textContent = name;
  $('spell-msg').textContent = message;
  box.classList.toggle('fizzle', fizzle);
  box.classList.add('show');
  announce(`${name}. ${message}`);
  clearTimeout(show.timer);
  show.timer = setTimeout(() => box.classList.remove('show'), 3200);
}

function cast(pts) {
  const result = recognize(pts, prepared);
  const centre = centroid(pts);

  if (!result.id) {
    if (result.reason === 'short') return; // a tap, not a spell
    const near = result.near && result.score > 0.5 ? SPELLS_BY_ID.get(result.near) : null;
    show('The spell will not take', near ? `The shape was nearly ${near.name}. Try again, a little cleaner.` : 'That shape means nothing.', true);
    sfx.fizzle();
    if (settings.get('effects')) fx.burst(centre.x, centre.y, '#6b5f96', 'sparks', { count: 14, speed: 160 });
    return;
  }

  const s = SPELLS_BY_ID.get(result.id);
  const target = targetAt(world, view, pts);
  const outcome = castSpell(world, s.id, target?.id);
  remember(world);

  // The scrawl is replaced by the clean glyph, which then flies at the target.
  const aimed = outcome.hit && target ? centreOf(view, target) : null;
  sigils.push({ points: fitTemplate(pts, byId.get(s.id)), color: s.color, target: aimed, born: now });
  trail = [];

  sfx.cast(s.color);
  if (settings.get('effects') && !reducedMotion.matches) {
    const at = aimed || { x: centre.x, y: centre.y };
    setTimeout(() => {
      fx.burst(at.x, at.y, s.color, 'stars', { count: outcome.inert ? 10 : 26, speed: outcome.inert ? 130 : 320 });
      fx.ring(at.x, at.y, s.color, 40, 3);
    }, 650);
  }

  lastHit = aimed || centre;
  show(s.name, outcome.message);
  checkTrials();
}

// A trial can finish a moment after the spell lands (the lantern has to fall),
// so this runs every frame, not just on a cast. Once earned a trial stays
// earned, even if you break the urn again afterwards.
let lastHit = null;
let shown = -1;
function checkTrials(at = lastHit) {
  const list = progress(world);
  for (const t of list) {
    if (t.complete && !done.has(t.id)) {
      done.add(t.id);
      sfx.trial();
      toast(`Trial done — ${t.text}`);
      if (at && settings.get('effects') && !reducedMotion.matches) fx.burst(at.x, at.y, '#e8b04a', 'stars', { count: 40, speed: 380 });
    }
  }
  if (done.size === shown) return;
  shown = done.size;
  $('tasks-count').textContent = String(done.size);
  if (done.size > store.get('best', 0)) store.set('best', done.size);
  if (drawerOpen) renderTasks();
}

// ---------- the loop ----------

let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  now += dt;
  view.resize();
  tick(world, dt);
  fx.step(dt);
  checkTrials();

  // The tip chases the finger; with nothing to chase it drifts and breathes.
  if (!stroke && now - idleSince > 1.2) {
    const rest = restPoint();
    aim = { x: rest.x, y: rest.y + Math.sin(now * 0.9) * 8 };
  }
  tip.x += (aim.x - tip.x) * Math.min(1, dt * 20);
  tip.y += (aim.y - tip.y) * Math.min(1, dt * 20);
  glow += ((stroke ? 1 : 0.25) - glow) * Math.min(1, dt * 6);

  // The tip trails light even when the finger is still moving between casts.
  if (stroke) trail.push({ x: tip.x, y: tip.y, t: now });
  trail = trail.filter((p) => now - p.t < 0.9);
  sigils = sigils.filter((s) => now - s.born < SIGIL_SECONDS);

  const ctx = view.ctx;
  drawRoom(ctx, view, world);
  drawObjects(ctx, view, world, now, highlight);

  if (ghost) {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(now * 2) * 0.06;
    drawGlyph(ctx, ghost.stroke, view.cx, view.h * 0.42, Math.min(view.w, view.h) * 0.38, { color: ghost.color, width: 5, progress: Math.min(1, ((now - ghost.born) % 3) / 1.6) });
    ctx.restore();
  }

  drawTrail(ctx, trail, now, stroke ? '#ffe6a8' : 'rgba(255, 230, 168, 0.6)', { width: 8 });
  for (const s of sigils) drawSigil(ctx, s, now - s.born);
  if (settings.get('effects')) fx.draw(ctx, { additive: true, width: view.w, height: view.h });
  drawWand(ctx, view, tip, glow, '#ffd98a', now);

  requestAnimationFrame(frame);
}

function restPoint() {
  const g = grip(view);
  const dx = view.cx - g.x;
  const dy = view.h * 0.4 - g.y;
  const k = 0.82;
  return { x: g.x + dx * k, y: g.y + dy * k };
}

// ---------- the spellbook ----------

function renderBook() {
  const cards = SPELL_LIST.map((s) => {
    const canvas = el('canvas', { width: 148, height: 148, 'aria-hidden': 'true' });
    const card = el(
      'button',
      {
        class: 'spell',
        onclick: () => {
          ghost = settings.get('ghosts') ? { ...s, born: now } : null;
          document.querySelector('dialog')?.closeWith?.(null);
          if (ghost) show(s.name, s.shape);
        },
      },
      canvas,
      el('strong', {}, s.name),
      el('em', {}, s.effect),
    );
    card.glyph = { canvas, spell: s };
    return card;
  });

  // Each glyph draws itself over and over, so the direction to trace is obvious.
  let raf = 0;
  const animate = () => {
    const t = performance.now() / 1000;
    for (const card of cards) {
      const { canvas, spell } = card.glyph;
      const c = canvas.getContext('2d');
      c.setTransform(2, 0, 0, 2, 0, 0);
      c.clearRect(0, 0, 74, 74);
      const p = reducedMotion.matches ? 1 : Math.min(1, ((t + spell.name.length * 0.2) % 3.2) / 2);
      drawGlyph(c, spell.stroke, 37, 37, 52, { color: spell.color, width: 2.6, progress: p });
    }
    raf = requestAnimationFrame(animate);
  };
  animate();

  openDialog({
    title: 'Spellbook',
    className: 'wide',
    body: el(
      'div',
      {},
      el('p', { class: 'muted small', style: 'margin:0 0 12px' }, 'Trace a glyph anywhere on screen, across the thing you mean to hit. The dot is where the stroke starts; the arrow is where it ends. Tap a spell to trace it as a ghost.'),
      el('div', { class: 'book' }, cards),
    ),
  }).then(() => cancelAnimationFrame(raf));
}

// ---------- trials ----------

let drawerOpen = false;
function renderTasks() {
  const list = progress(world).map((t) => ({ ...t, complete: t.complete || done.has(t.id) }));
  const best = store.get('best', 0);
  $('tasks-best').textContent = best ? `Best so far: ${best} of ${TASKS.length}.` : '';
  $('task-list').replaceChildren(
    ...list.map((t) =>
      el(
        'li',
        { class: t.complete ? 'done' : '' },
        el('i', {}, t.complete ? '✓' : '○'),
        el('span', {}, t.text, el('small', {}, t.hint)),
      ),
    ),
  );
}

$('tasks-btn').addEventListener('click', () => {
  drawerOpen = !drawerOpen;
  $('tasks-drawer').hidden = !drawerOpen;
  if (drawerOpen) renderTasks();
});
$('tasks-close').addEventListener('click', () => {
  drawerOpen = false;
  $('tasks-drawer').hidden = true;
});
$('book-btn').addEventListener('click', renderBook);

$('settings-btn').addEventListener('click', () => {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'field' },
        el('span', { class: 'field-label' }, 'Wand hand'),
        segmented('handed', [['right', 'Right'], ['left', 'Left']], settings.get('handed'), (v) => settings.set('handed', v)),
      ),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Effects', settings.get('effects'), (v) => settings.set('effects', v)),
      toggle('Ghost glyphs', settings.get('ghosts'), (v) => settings.set('ghosts', v), 'Tapping a spell in the book traces it faintly on screen.'),
    ),
    actions: [{ label: 'Start over', value: 'reset' }, { label: 'Done', primary: true, value: null }],
  }).then((v) => {
    if (v === 'reset') location.reload();
  });
});

// ---------- go ----------

// The chamber always starts fresh; only the best run so far is remembered.
$('tasks-count').textContent = '0';

addEventListener('resize', () => view.resize());
addHubLink();
requestAnimationFrame((ts) => {
  last = ts;
  frame(ts);
});

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// Reachable from browser tests.
$('canvas').game = { view, world, prepared, cast, find };

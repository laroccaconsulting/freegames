import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, offerHallows, openDialog, toggle, segmented, el, toast } from './core/ui.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { audio, setSoundEnabled, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { Particles } from './core/fx.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { SPELL_LIST, SPELLS_BY_ID, TEMPLATES } from './js/glyphs.js';
import { prepare, recognize, fitTemplate, centroid } from './js/recognizer.js';
import { LEVELS, levelById, isUnlocked, knownSpells } from './js/levels.js';
import { makeWorld, castSpell, wouldAffect, tick, progress, finished, currentStep, find } from './js/scene.js';
import { View, targetAt, rankTargets, centreOf, drawRoom, drawObjects, drawWand, drawTrail, drawSigil, drawGlyph, grip, SIGIL_SECONDS } from './js/render.js';

const $ = (id) => document.getElementById(id);
const store = makeStore('wand');
const settings = makeSettings(store, { sound: true, effects: true, handed: 'right', ghosts: true, theme: null });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ach = makeAchievements('wand', ACHIEVEMENTS);

// Every place is night; the theme decides whether it is lit by candles
// (Hallows) or by cold blue witch-light (Classic). The newer of the player's
// pick here and the look chosen on the games list wins — see core/hallows.js.
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'classic');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};

const view = new View($('canvas'));
const fx = new Particles();
const byId = new Map(TEMPLATES.map((t) => [t.id, t]));

// ---------- where we are ----------

let level = levelById(store.get('level', 'chamber'));
let world = makeWorld(level);
let prepared = prepare(TEMPLATES);
let done = new Set(); // steps finished in this visit to this place
let victory = false;
const beaten = new Set(store.get('finished', []).filter((id) => LEVELS.some((l) => l.id === id)));

// Only the spells you have with you are matched against, so a glyph you have
// not been given here simply will not take.
const kitOf = (lvl) => (lvl.kit === 'all' ? SPELL_LIST : SPELL_LIST.filter((s) => lvl.kit.includes(s.id)));

function enter(id) {
  level = levelById(id);
  world = makeWorld(level);
  prepared = prepare(TEMPLATES.filter((t) => level.kit === 'all' || level.kit.includes(t.id)));
  done = new Set();
  // -1 means "absorb whatever is already true here without celebrating it".
  shown = -1;
  victory = false;
  sigils = [];
  trail = [];
  ghost = null;
  store.set('level', level.id);
  $('readout').classList.remove('show');
  $('place-name').textContent = level.name;
  $('place-name').classList.add('show');
  clearTimeout(enter.nameTimer);
  enter.nameTimer = setTimeout(() => $('place-name').classList.remove('show'), 5000);
  $('places').hidden = true;
  $('victory').hidden = true;
  closeDrawer();
  $('hint').classList.remove('gone');
  $('hint').innerHTML = level.kind === 'practice'
    ? 'Drag anywhere to draw. Draw <b>across the thing you want to hit</b>.'
    : `<b>${level.place}</b> — open <b>Steps</b> if you get stuck.`;
  renderSteps();
  announce(`${level.name}. ${level.blurb}`);
}

function applySettings() {
  const hallows = themeId() === 'hallows';
  applyTheme(hallows ? 'hallows' : 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hallows ? '#120c22' : '#0d1220');
  view.setHallows(hallows);
  view.handed = settings.get('handed');
  setSoundEnabled(settings.get('sound'));
}
applySettings();
settings.onChange(applySettings);
onLookChange(applySettings);
offerHallows(store, themeId(), () => pickTheme('hallows'));

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
const glyphsCast = new Set(); // for the "whole spellbook" achievement
let streak = 0; // casts in a row that did not fizzle
let mended = false; // the urn has been whole at least once this visit

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
  step() {
    const ac = audio();
    if (!ac) return;
    [659.25, 987.77, 1318.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.45, gain: 0.07, when: i * 0.09, type: 'triangle' }));
  },
  win() {
    const ac = audio();
    if (!ac) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.6, gain: 0.08, when: i * 0.13, type: 'triangle' }));
  },
};

// ---------- input ----------

const inHud = (e) => !!e.target.closest?.('.hud-top, .drawer, .panel, dialog, .toast');

function point(e) {
  const r = $('canvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

addEventListener(
  'pointerdown',
  (e) => {
    if (inHud(e) || e.button > 0 || !$('places').hidden) return;
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
  show.timer = setTimeout(() => box.classList.remove('show'), 4000);
}

function cast(pts) {
  const result = recognize(pts, prepared);
  const centre = centroid(pts);

  if (!result.id) {
    if (result.reason === 'short') return; // a tap, not a spell
    const near = result.near && result.score > 0.5 ? SPELLS_BY_ID.get(result.near) : null;
    show('The spell will not take', near ? `The shape was nearly ${near.name}. Try again, a little cleaner.` : 'That shape means nothing here.', true);
    streak = 0;
    sfx.fizzle();
    if (settings.get('effects')) fx.burst(centre.x, centre.y, '#6b5f96', 'sparks', { count: 14, speed: 160 });
    return;
  }

  const s = SPELLS_BY_ID.get(result.id);
  // Of everything the stroke covered, prefer one this spell can actually do
  // something to — so a slash over the hanging lantern cuts its rope.
  const covered = rankTargets(world, view, pts);
  const target = covered.find((o) => wouldAffect(world, s.id, o)) || covered[0] || null;
  const outcome = castSpell(world, s.id, target?.id);

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

  ach.unlock('first-spell');
  ach.add('casts-100');
  glyphsCast.add(s.id);
  ach.at('every-glyph', glyphsCast.size);
  ach.at('streak-10', ++streak);
  if (result.score >= 0.96) ach.unlock('clean-cast');
  const urn = find(world, 'urn');
  if (urn && !urn.broken) mended = true;
  else if (urn && mended) ach.unlock('butterfingers');

  checkSteps();
}

// A step can finish a moment after the spell lands (the lantern has to fall),
// so this runs every frame, not just on a cast.
let lastHit = null;
let shown = -1;
function checkSteps(at = lastHit) {
  const list = progress(world);
  for (const step of list) {
    if (step.complete && !done.has(step.id)) {
      done.add(step.id);
      // The first step of a level completes as you arrive sometimes; only
      // celebrate the ones the player actually did something for.
      if (shown >= 0) {
        sfx.step();
        toast(level.kind === 'practice' ? `Trial done — ${step.text}` : `Done — ${step.text}`);
        if (at && settings.get('effects') && !reducedMotion.matches) fx.burst(at.x, at.y, '#e8b04a', 'stars', { count: 36, speed: 360 });
      }
    }
  }
  if (done.size !== shown) {
    shown = done.size;
    $('steps-count').textContent = String(done.size);
    $('steps-total').textContent = String(level.steps.length);
    if (drawerOpen) renderSteps();
    // Two spells to do what neither could alone: the point of the game.
    if (done.size >= 2 && level.kind === 'journey') ach.unlock('combination');
    if (level.kind === 'practice') {
      if (done.size > store.get('best', 0)) store.set('best', done.size);
      ach.at('all-trials', done.size);
    }
  }
  if (!victory && finished(world)) celebrate();
}

function celebrate() {
  victory = true;
  const first = !beaten.has(level.id);
  beaten.add(level.id);
  store.set('finished', [...beaten]);
  if (level.kind === 'journey') {
    ach.unlock('journey-done');
    ach.at('all-places', LEVELS.filter((l) => l.kind === 'journey' && beaten.has(l.id)).length);
  } else ach.at('all-trials', level.steps.length);
  sfx.win();
  if (settings.get('effects') && !reducedMotion.matches) {
    fx.fountain(view.w, view.h, ['#e8b04a', '#ffd98a', '#fff3cf', '#c3a2ff'], 'stars', 1);
    fx.flash = 0.5;
  }
  const next = nextJourney();
  $('victory-name').textContent = level.name;
  $('victory-line').textContent = level.kind === 'practice' ? 'Every trial in the chamber, done.' : level.done || 'The way is open.';
  $('victory-unlocked').textContent = first && next ? `${next.name} is open to you.` : '';
  $('victory-next').textContent = next ? `Go to ${next.name}` : 'Back to the places';
  $('victory').hidden = false;
  announce(`${level.name} complete.`);
}

const nextJourney = () => {
  const journeys = LEVELS.filter((l) => l.kind === 'journey');
  const i = journeys.findIndex((l) => l.id === level.id);
  return i >= 0 ? journeys[i + 1] : journeys.find((l) => !beaten.has(l.id)) || journeys[0];
};

// ---------- the loop ----------

let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  now += dt;
  view.resize();
  tick(world, dt);
  fx.step(dt);
  checkSteps();

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
  const palette = view.paletteFor(world);
  drawRoom(ctx, view, world);
  drawObjects(ctx, view, world, now, highlight);

  if (ghost) {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(now * 2) * 0.06;
    drawGlyph(ctx, ghost.stroke, view.cx, view.h * 0.42, Math.min(view.w, view.h) * 0.38, { color: ghost.color, width: 5, progress: Math.min(1, ((now - ghost.born) % 3) / 1.6) });
    ctx.restore();
  }

  drawTrail(ctx, trail, now, palette.trail, { width: 8 });
  for (const s of sigils) drawSigil(ctx, s, now - s.born);
  if (settings.get('effects')) fx.draw(ctx, { additive: true, width: view.w, height: view.h });
  drawWand(ctx, view, tip, glow, palette.tip, now);

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
  const kit = kitOf(level);
  const cards = kit.map((s) => {
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

  const known = knownSpells([...beaten]).size;
  openDialog({
    title: level.kit === 'all' ? 'Spellbook' : `What you brought to ${level.name}`,
    className: 'wide',
    body: el(
      'div',
      {},
      el('p', { class: 'muted small', style: 'margin:0 0 12px' }, 'Trace a glyph anywhere on screen, across the thing you mean to hit. The dot is where the stroke starts; the arrow is where it ends. Tap a spell to trace it as a ghost.'),
      el('div', { class: 'book' }, cards),
      level.kit === 'all' ? null : el('p', { class: 'muted small', style: 'margin:12px 0 0' }, `${kit.length} of the ${SPELL_LIST.length} glyphs, chosen for this place. You have met ${known} so far.`),
    ),
  }).then(() => cancelAnimationFrame(raf));
}

// ---------- the steps ----------

let drawerOpen = false;
function renderSteps() {
  const list = progress(world);
  $('steps-title').textContent = level.kind === 'practice' ? 'Trials' : 'Steps';
  $('steps-note').textContent =
    level.kind === 'practice'
      ? 'Any order you like. Most can be solved more than one way.'
      : 'One thing at a time. The next step shows itself once this one is done.';
  const items = [];
  let hiddenCount = 0;
  for (const s of list) {
    if (!s.revealed) {
      hiddenCount++;
      continue;
    }
    items.push(
      el(
        'li',
        { class: s.complete ? 'done' : 'now' },
        el('i', {}, s.complete ? '✓' : '○'),
        el('span', {}, s.text, s.complete ? null : el('small', {}, s.hint)),
      ),
    );
  }
  if (hiddenCount) items.push(el('li', { class: 'later' }, el('i', {}, '·'), el('span', {}, `${hiddenCount} more to come`)));
  $('step-list').replaceChildren(...items);
  $('steps-count').textContent = String(list.filter((s) => s.complete).length);
  $('steps-total').textContent = String(level.steps.length);
}

const closeDrawer = () => {
  drawerOpen = false;
  $('steps-drawer').hidden = true;
};

$('steps-btn').addEventListener('click', () => {
  drawerOpen = !drawerOpen;
  $('steps-drawer').hidden = !drawerOpen;
  if (drawerOpen) renderSteps();
});
$('steps-close').addEventListener('click', closeDrawer);
$('book-btn').addEventListener('click', renderBook);

// ---------- the places ----------

function renderPlaces() {
  const cards = LEVELS.map((l) => {
    const open = isUnlocked(l, [...beaten]);
    const beat = beaten.has(l.id);
    const canvas = el('canvas', { width: 220, height: 132, class: 'place-art', 'aria-hidden': 'true' });
    const card = el(
      'button',
      {
        class: `place${open ? '' : ' locked'}${beat ? ' beaten' : ''}`,
        disabled: open ? null : 'disabled',
        onclick: () => open && enter(l.id),
      },
      canvas,
      el(
        'span',
        { class: 'place-text' },
        el('strong', {}, l.name),
        el('em', {}, open ? l.blurb : 'Finish the place before this one to come here.'),
        el('small', {}, open ? `${l.steps.length} ${l.kind === 'practice' ? 'trials' : 'steps'} · ${l.kit === 'all' ? 'every glyph' : `${l.kit.length} glyphs`}${beat ? ' · done' : ''}` : 'Locked'),
      ),
    );
    card.art = { canvas, level: l, open };
    return card;
  });
  // Each card shows its own room, drawn by the real renderer at thumbnail size.
  for (const card of cards) {
    const { canvas, level: l, open } = card.art;
    const mini = new View(canvas);
    mini.setHallows(themeId() === 'hallows');
    const w = makeWorld(l);
    tick(w, 0.2);
    drawRoom(mini.ctx, mini, w);
    drawObjects(mini.ctx, mini, w, 0.3, null);
    if (!open) {
      mini.ctx.fillStyle = 'rgba(8, 5, 16, 0.72)';
      mini.ctx.fillRect(0, 0, mini.w, mini.h);
    }
  }
  $('place-list').replaceChildren(...cards);
  $('places-known').textContent = `${knownSpells([...beaten]).size} of ${SPELL_LIST.length} glyphs known`;
  $('places').hidden = false;
}

$('places-btn').addEventListener('click', renderPlaces);
$('places-close').addEventListener('click', () => ($('places').hidden = true));
$('victory-next').addEventListener('click', () => {
  const next = nextJourney();
  if (next && isUnlocked(next, [...beaten])) enter(next.id);
  else {
    $('victory').hidden = true;
    renderPlaces();
  }
});
$('victory-stay').addEventListener('click', () => ($('victory').hidden = true));

$('settings-btn').addEventListener('click', () => {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'field' },
        el('span', { class: 'field-label' }, 'Look'),
        segmented('theme', [['hallows', 'Hallows'], ['classic', 'Classic']], themeId(), pickTheme),
      ),
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
    actions: [
      { label: 'Start this place again', value: 'restart' },
      { label: 'Done', primary: true, value: null },
    ],
  }).then((v) => {
    if (v === 'restart') enter(level.id);
  });
});

// ---------- go ----------

enter(level.id);
addEventListener('resize', () => view.resize());
addHubLink();
requestAnimationFrame((ts) => {
  last = ts;
  frame(ts);
});
if (!store.get('visited', false)) {
  store.set('visited', true);
  renderPlaces();
}

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// Reachable from browser tests.
$('canvas').game = {
  view,
  get world() {
    return world;
  },
  get prepared() {
    return prepared;
  },
  cast,
  find,
  enter,
  levels: LEVELS,
  step: () => currentStep(world),
  aimTest: (pts) => targetAt(world, view, pts)?.id ?? null,
};

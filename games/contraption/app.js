import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, hideToast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { DT } from './js/physics.js';
import { toSave, fromSave } from './js/format.js';
import { encodeMachine, decodeMachine, machineFromHash } from './js/share.js';
import { GALLERY, SUBMIT } from './js/gallery.js';
import { CHANGES } from './js/changes.js';
import * as ED from './js/editor.js';
import { DT as _DT, ENGINE } from './js/physics.js';
import { LEVELS, CHAPTERS, levelById, SANDBOX, ALL_PARTS_SANDBOX, BENCH, BIG_BENCH } from './js/levels.js';
import { PARTS, PART_TYPES, PART_INFO, ITEM_INFO, problems, makeRun, key, moverMotion, gearR } from './js/machine.js';
import { View, PALETTES, drawHandle } from './js/render.js';
import { drawScene, drawPart, machineLayout, centre } from './js/draw.js';
import { starsFor, scoreFor, record, isOpen, isSolved, chapterOpen, chapterDone, totalStars, nextLevel, unlockedParts } from './js/progress.js';

const $ = (id) => document.getElementById(id);
const store = makeStore('contraption');
// Paper (light) is the default look: the game is drawn for daylight and
// e-paper screens. Ink is the dark look; Hallows the autumn one.
const settings = makeSettings(store, { theme: null, sound: true, trails: true, ratios: true });
const ach = makeAchievements('contraption', ACHIEVEMENTS);
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'light');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function pal() {
  const t = themeId();
  if (t === 'hallows') return PALETTES.hallows;
  if (t === 'dark' || (t === 'auto' && darkQuery.matches)) return PALETTES.ink;
  return PALETTES.paper;
}

// ---------- state (declared before anything runs) ----------

const view = new View($('board'));
let screen = 'title';
let mode = 'build';
let level = null;
let sandbox = false;
let parts = [];
let selected = null;
let armed = null;
let chainFrom = null;
let chainPlane = 0;
let armedChip = null;
let editing = false; // the level editor is open
let draft = null;
let edTool = 'wall';
let edRect = null;
let edLine = null; // a mover being dragged out
let edUndo = [];
let selecting = null; // the box being dragged by Make a chip
let problemMap = new Map();
let layout = null;
let run = null;
let speed = 1;
let acc = 0;
let lastPaths = null;
let hintParts = [];
let undoStack = [];
let ghost = null;
let drag = null;
let userView = null; // a zoom/pan the player chose, else fit
let dirty = true;
let failTimer = 0;
let lastImpact = 0;
let progress = store.get('progress', {});
let stats = store.get('stats', { runs: 0, fails: 0 });
const pointers = new Map();
let demo = null;


// ---------- theme and settings ----------

function applySettings() {
  applyTheme(themeId());
  setSoundEnabled(settings.get('sound'));
  buildTray();
  dirty = true;
}
applyTheme(themeId());
setSoundEnabled(settings.get('sound'));
watchSystemTheme(() => themeId());
darkQuery.addEventListener?.('change', () => applySettings());
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applySettings());
settings.onChange(() => applySettings());

// ---------- helpers ----------

const save = () => store.set('progress', progress);
const numberOf = (lvl) => {
  if (lvl.id === 'sandbox' || lvl.custom) return '';
  const inCh = LEVELS.filter((l) => l.chapter === lvl.chapter);
  return `${lvl.chapter + 1}-${inCh.indexOf(lvl) + 1}`;
};
const indexOf = (lvl) => LEVELS.indexOf(lvl);
const announce = (t) => ($('announce').textContent = t);
const uid = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const fmt = (s) => `${s.toFixed(1)} s`;
const starText = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(of - n);

function offered(type) {
  if (type === 'chip') return sandbox && chipLibrary().length ? Infinity : 0;
  if (level.id.startsWith('gallery:')) return Infinity;
  if (sandbox) return unlockedParts(progress).has(type) ? Infinity : 0;
  return level.parts?.[type] ?? 0;
}
const usedOf = (type) => parts.filter((p) => p.type === type).length;
const allParts = () => [...(level.fixed || []), ...parts];

function refresh() {
  problemMap = problems(level, parts);
  layout = machineLayout(allParts());
  dirty = true;
  renderInspector();
  updateTray();
  updateHud();
}

function saveMachine() {
  store.set(`machine:${level.id}`, toSave(parts));
}

function pushUndo() {
  undoStack.push(JSON.stringify(parts));
  if (undoStack.length > 60) undoStack.shift();
  $('d-undo').disabled = false;
}

function undo() {
  if (editing) {
    if (edUndo.length) editDraft(edUndo.pop(), false);
    return;
  }
  if (!undoStack.length || mode !== 'build') return;
  parts = JSON.parse(undoStack.pop());
  if (!parts.some((p) => p.id === selected)) selected = null;
  $('d-undo').disabled = !undoStack.length;
  saveMachine();
  refresh();
}

// ---------- screens ----------

function show(name) {
  screen = name;
  $('title').hidden = name !== 'title';
  $('levels').hidden = name !== 'levels';
  $('hud').hidden = name !== 'play';
  $('dock').hidden = name !== 'play' || mode !== 'build';
  $('runbar').hidden = name !== 'play' || mode !== 'run';
  if (name === 'title') startTitle();
  if (name === 'levels') renderLevels();
  layoutView();
  dirty = true;
}

function startTitle() {
  const stars = totalStars(progress);
  $('title-stars').textContent = stars ? `★ ${stars} / ${LEVELS.length * 3}` : '';
  const started = LEVELS.some((l) => isSolved(progress, l.id)) || store.get('last');
  $('t-continue').textContent = started ? 'Continue' : 'Start';
  const sbOpen = chapterDone(progress, 0);
  $('t-sandbox').classList.toggle('locked', !sbOpen);
  $('t-editor').classList.toggle('locked', !sbOpen);
  $('t-sandbox').setAttribute('aria-label', sbOpen ? 'Sandbox' : 'Sandbox, locked');
  demo = null;
  nextDemo();
  const returning = Object.keys(progress).length || stats.runs;
  if (returning && store.get('seenChanges') !== CHANGES[0].id && !machineFromHash(location.hash)) setTimeout(() => screen === 'title' && !document.querySelector('dialog[open]') && whatsNew({ onlyNew: true }), 700);
  else if (!returning) store.set('seenChanges', CHANGES[0].id);
}

const DEMOS = ['grand', 'seesaw', 'gear-up', 'ricochet', 'heavy', 'clockwork'];
function nextDemo() {
  const i = demo ? (DEMOS.indexOf(demo.level.id) + 1) % DEMOS.length : 0;
  const lvl = levelById(DEMOS[i]);
  demo = { level: lvl, run: makeRun(lvl, lvl.solution), wait: 0, layout: machineLayout([...(lvl.fixed || []), ...lvl.solution]) };
}

// ---------- level select ----------

function iconCanvas(type, w = 40, h = 32, palette = pal()) {
  const c = el('canvas', { width: w * 2, height: h * 2 });
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const v = new View(c);
  v.dpr = 2;
  v.w = w;
  v.h = h;
  const sample = {
    ramp: { type: 'ramp', a: [0.4, 2], b: [2.6, 0.6] },
    bouncer: { type: 'bouncer', a: [0.4, 1.7], b: [2.6, 0.9] },
    conveyor: { type: 'conveyor', a: [0.7, 1.2], b: [2.3, 1.2] },
    lever: { type: 'lever', p: [1.5, 1.05], angle: -15, l1: 1.2, l2: 1.2 },
    weight: { type: 'weight', p: [1.5, 1.2] },
    motor: { type: 'motor', p: [1.5, 1.2], dir: 1 },
    gear: { type: 'gear', p: [1.5, 1.2], teeth: 10, plane: 1 },
    chain: null,
    plate: { type: 'plate', p: [1.5, 1.3] },
    beam: { type: 'beam', a: [0.5, 1.2], b: [2.5, 1.2] },
    wire: { type: 'wire', a: [0.5, 1.6], b: [2.5, 0.9] },
    nand: { type: 'nand', p: [1.5, 1.2] },
    delay: { type: 'delay', p: [1.5, 1.0], wait: 1 },
    pixel: { type: 'pixel', p: [1.5, 1.2], mode: 'toggle' },
    trapdoor: { type: 'trapdoor', p: [0.6, 1.3], l: 1.8, angle: 0, side: 1 },
    gate: { type: 'gate', p: [2, 1.1], side: 1 },
    escape: { type: 'escape', p: [1.5, 1.2] },
    pendulum: { type: 'pendulum', p: [1.5, -0.2], l: 3.1 },
    dial: { type: 'dial', p: [1.5, 1.2], r: 1.1 },
    chip: { type: 'chip', p: [0, 0.2], def: { name: '', parts: [], links: [], inputs: ['a'], outputs: ['a'] } },
  }[type];
  v.s = Math.min(w / 3, h / 2.4);
  v.ox = (w - 3 * v.s) / 2;
  v.oy = (h - 2.4 * v.s) / 2;
  const ctx = c.getContext('2d');
  ctx.setTransform(2 * v.s, 0, 0, 2 * v.s, 2 * v.ox, 2 * v.oy);
  if (type === 'chain') {
    const g1 = { type: 'gear', p: [0.8, 1.2], teeth: 6 };
    const g2 = { type: 'gear', p: [2.3, 1.2], teeth: 6 };
    const s0 = v.s;
    v.s = s0;
    ctx.save();
    ctx.translate(0, 0);
    drawPart(v, palette, { type: 'chain', a: g1.p, b: g2.p }, [g1, g2]);
    ctx.restore();
  } else if (type === 'gear' || type === 'escape' || type === 'pendulum') {
    const k = { gear: 0.85, escape: 0.55, pendulum: 0.62 }[type];
    ctx.translate(1.5, 1.2);
    ctx.scale(k, k);
    ctx.translate(-1.5, -1.2);
    drawPart(v, palette, sample);
  } else if (sample) drawPart(v, palette, sample);
  return c;
}

// A small padlock in ink (the emoji one is in colour).
function lockGlyph() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('width', '13');
  s.setAttribute('height', '13');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/>';
  return s;
}

function renderLevels() {
  $('levels-stars').textContent = `★ ${totalStars(progress)} / ${LEVELS.length * 3}`;
  const next = nextLevel(progress);
  const host = $('chapters');
  host.replaceChildren(
    ...CHAPTERS.map((ch, c) => {
      const open = chapterOpen(progress, c);
      const lvls = LEVELS.filter((l) => l.chapter === c);
      const stars = lvls.reduce((n, l) => n + (progress[l.id]?.stars || 0), 0);
      return el(
        'section',
        { class: `chapter ${open ? '' : 'locked'}` },
        el('div', { class: 'chapter-head' }, iconCanvas(ch.part, 56, 56), el('div', {}, el('small', { class: 'kicker' }, `Chapter ${c + 1}`), el('h3', {}, ch.name), el('p', {}, open ? `${ch.blurb} ★ ${stars}/${lvls.length * 3}` : `Locked: finish chapter ${c} to open.`))),
        el(
          'div',
          { class: 'tiles' },
          lvls.map((l) => {
            const i = indexOf(l);
            const rec = progress[l.id];
            const can = isOpen(progress, i);
            return el(
              'button',
              {
                class: `tile ${rec?.solved ? 'solved' : ''} ${l === next && !rec?.solved ? 'next' : ''}`,
                disabled: !can,
                'aria-label': `${numberOf(l)} ${l.name}${rec?.solved ? `, ${rec.stars} stars` : can ? '' : ', locked'}`,
                onclick: () => openLevel(l),
              },
              rec?.flawless ? el('span', { class: 'flag', 'aria-hidden': 'true' }, '⚑') : null,
              el('span', {}, numberOf(l).split('-')[1]),
              rec?.solved ? el('small', {}, starText(rec.stars)) : can ? el('small', {}, 'Play') : lockGlyph(),
            );
          }),
        ),
      );
    }),
  );
}

// ---------- opening a level ----------

function openLevel(lvl, { card = true, preset = null } = {}) {
  sandbox = lvl.id === 'sandbox' || lvl.id.startsWith('gallery:');
  if (lvl.id === 'sandbox') {
    SANDBOX.parts = Object.fromEntries([...unlockedParts(progress)].map((t) => [t, 99]));
  }
  level = lvl.id === 'sandbox' ? SANDBOX : lvl;
  const saved = store.get(`machine:${level.id}`, null);
  parts = saved || !preset ? fromSave(saved).parts : preset.map((p, i) => ({ ...p, id: `g${i}` }));
  selected = null;
  armed = null;
  chainFrom = null;
  hintParts = [];
  undoStack = [];
  lastPaths = null;
  run = null;
  mode = 'build';
  userView = null;
  $('d-undo').disabled = true;
  if (!sandbox) store.set('last', level.id);
  buildTray();
  refresh();
  show('play');
  announce(`${numberOf(level)} ${level.name}. ${level.goalText}`);
  if (card && !sandbox) levelCard();
  else if (sandbox && !store.get('sandboxSeen')) {
    store.set('sandboxSeen', true);
    toast('Every part you have met, as many as you like.', { duration: 3500 });
  }
}

function partsRow(entries) {
  return el(
    'div',
    { class: 'card-parts' },
    entries.map(([type, n]) => el('span', { class: 'card-part' }, iconCanvas(type, 36, 28), `${PART_INFO[type].name}${n === Infinity ? '' : ` × ${n}`}`)),
  );
}

async function levelCard() {
  const ch = CHAPTERS[level.chapter];
  // a part is introduced on the first level that offers it
  const seen = new Set(LEVELS.slice(0, indexOf(level)).flatMap((l) => Object.keys(l.parts || {})));
  const newParts = level.custom ? [] : PART_TYPES.filter((t) => level.parts?.[t] && !seen.has(t));
  void ch;
  const rec = progress[level.id];
  const body = el(
    'div',
    {},
    ...newParts.map((t) => el('div', { class: 'intro' }, iconCanvas(t, 72, 56), el('div', {}, el('p', {}, el('b', {}, `New: ${PART_INFO[t].name}. `), PART_INFO[t].blurb), el('p', {}, PART_INFO[t].physics), el('small', {}, `Tip: ${PART_INFO[t].tip}`)))),
    el('p', { class: 'card-goal' }, level.goalText),
    partsRow(PART_TYPES.filter((t) => level.parts[t]).map((t) => [t, level.parts[t]])),
    el(
      'ul',
      { class: 'card-targets' },
      el('li', {}, `★★ with ${level.stars.parts} part${level.stars.parts === 1 ? '' : 's'} or fewer`),
      el('li', {}, `★★★ and delivered within ${level.stars.time} s`),
      rec?.solved ? el('li', {}, `Best: ${starText(rec.stars)} · ${fmt(rec.time)} · ${rec.parts} parts · ${rec.score} points`) : null,
    ),
  );
  await openDialog({ title: level.custom ? level.name : `${numberOf(level)} · ${level.name}`, body, actions: [{ label: 'Build', value: 'go', primary: true }] });
}

// ---------- tray ----------

function buildTray() {
  const tray = $('tray');
  if (!level) return tray.replaceChildren();
  if (editing) return buildEditTray();
  const types = PART_TYPES.filter((t) => offered(t) > 0);
  tray.replaceChildren(
    ...types.map((t) => {
      const b = el('button', { class: 'part-btn', dataset: { type: t }, 'aria-label': PART_INFO[t].name }, iconCanvas(t), el('span', {}, PART_INFO[t].name), el('span', { class: 'count' }, ''));
      b.addEventListener('pointerdown', (e) => trayDown(e, t, b));
      b.addEventListener('click', (e) => e.preventDefault());
      return b;
    }),
  );
  updateTray();
}

const TOOL_LOOK = { wall: ['▦', 'Wall'], nobuild: ['▧', 'No-build'], danger: ['▲', 'Spikes'], cup: ['⊔', 'Cup'], lamp: ['✺', 'Lamp'], ball: ['●', 'Ball'], crate: ['▣', 'Crate'], steel: ['◉', 'Steel'], egg: ['⬯', 'Egg'], mover: ['⇄', 'Mover'], machine: ['⚙', 'Machine'], erase: ['⌫', 'Erase'] };
const TOOL_TIP = {
  lamp: 'Tap to place the lamp. The goal becomes the lamp: set how in Level settings',
  mover: 'Drag from where it starts to where it goes; tap for a spinning arm. Tap a mover to change it',
  erase: 'Tap something to remove it',
};

function buildEditTray() {
  $('tray').replaceChildren(
    ...ED.TOOLS.map((t) => {
      const b = el('button', { class: `part-btn ${edTool === t ? 'armed' : ''}`, 'aria-label': TOOL_LOOK[t][1] }, el('span', { class: 'tool-glyph', 'aria-hidden': 'true' }, TOOL_LOOK[t][0]), el('span', {}, TOOL_LOOK[t][1]));
      b.addEventListener('click', () => {
        if (t === 'machine') return editFixed();
        edTool = t;
        buildEditTray();
        toast(TOOL_TIP[t] || (ED.RECT_TOOLS.has(t) ? `Drag a box to add ${TOOL_LOOK[t][1].toLowerCase()}` : `Tap to place the ${TOOL_LOOK[t][1].toLowerCase()}`), { position: 'top', duration: t === 'mover' || t === 'lamp' ? 3500 : 1600 });
      });
      return b;
    }),
  );
}

function updateTray() {
  if (editing) return;
  for (const b of $('tray').querySelectorAll('.part-btn')) {
    const t = b.dataset.type;
    const left = offered(t) - usedOf(t);
    b.querySelector('.count').textContent = left === Infinity ? '∞' : left;
    b.classList.toggle('empty', left <= 0);
    b.classList.toggle('armed', armed === t);
  }
}

// 'Ramp' → 'ramp', but 'NAND' stays 'NAND'
const lowerName = (n) => (n === n.toUpperCase() ? n : n.toLowerCase());

function arm(type) {
  if (type === 'chip' && armed !== 'chip') return pickChip();
  armed = armed === type ? null : type;
  chainFrom = null;
  selected = null;
  ghost = null;
  if (armed) {
    if (offered(armed) - usedOf(armed) <= 0) {
      toast(`No ${PART_INFO[armed].name.toLowerCase()}s left. Tap one on the board and delete it to reuse it.`);
      armed = null;
    } else if (armed === 'chain') toast('Tap the first gear, then the second', { position: 'top' });
    else if (armed === 'wire') toast('Tap a plate or beam lamp, then a motor', { position: 'top' });
    else toast(`Tap a peg to place the ${lowerName(PART_INFO[armed].name)}`, { position: 'top', duration: 1800 });
  } else hideToast();
  renderInspector();
  updateTray();
  dirty = true;
}

// A tray button: a tap arms the part; a drag up onto the board places it;
// a drag sideways scrolls the tray (touch scrolls natively: the buttons
// allow pan-x, and the browser cancels the pointer when it takes over).
function trayDown(e, type, btn) {
  if (mode !== 'build') return;
  e.preventDefault();
  const tray = $('tray');
  const start = { x: e.clientX, y: e.clientY, scroll: tray.scrollLeft };
  let how = null; // 'scroll' or 'drag', once the pointer has moved
  btn.setPointerCapture?.(e.pointerId);
  const move = (ev) => {
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    if (!how && Math.hypot(dx, dy) > 8) {
      how = Math.abs(dx) > Math.abs(dy) ? 'scroll' : 'drag';
      if (how === 'drag' && armed !== type) arm(type);
    }
    if (how === 'scroll') tray.scrollLeft = start.scroll - dx;
    else if (how === 'drag' && armed === type && armed !== 'chain' && armed !== 'wire' && Math.hypot(dx, dy) > 12) {
      const r = $('board').getBoundingClientRect();
      ghostAt(ev.clientX - r.left, ev.clientY - r.top, true);
    }
  };
  const up = (ev) => {
    btn.removeEventListener('pointermove', move);
    btn.removeEventListener('pointerup', up);
    btn.removeEventListener('pointercancel', up);
    if (ev.type === 'pointerup' && !how) arm(type);
    else if (how === 'drag' && ev.type === 'pointerup' && ghost && document.elementFromPoint(ev.clientX, ev.clientY) === $('board')) placeGhost();
    else ghost = null;
    dirty = true;
  };
  btn.addEventListener('pointermove', move);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
}

// When the tray holds more than fits, arrows at its ends show there is more
// and scroll it (for a mouse; fingers can swipe). A mouse wheel scrolls it too.
function trayArrows() {
  const tray = $('tray');
  const more = (tray.scrollWidth - tray.clientWidth) > 2;
  $('tray-left').hidden = !more || tray.scrollLeft <= 2;
  $('tray-right').hidden = !more || tray.scrollLeft >= tray.scrollWidth - tray.clientWidth - 2;
}
function setupTrayScroll() {
  const tray = $('tray');
  const page = (dir) => tray.scrollBy({ left: dir * tray.clientWidth * 0.7, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  $('tray-left').addEventListener('click', () => page(-1));
  $('tray-right').addEventListener('click', allPartsSheet);
  tray.addEventListener('scroll', trayArrows, { passive: true });
  tray.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && tray.scrollWidth > tray.clientWidth) {
      e.preventDefault();
      tray.scrollLeft += e.deltaY;
    }
  }, { passive: false });
  addEventListener('resize', trayArrows);
  new MutationObserver(() => requestAnimationFrame(trayArrows)).observe(tray, { childList: true });
}
setupTrayScroll();

// Every button in the tray at once, as a grid: pick one to use it.
async function allPartsSheet() {
  const btns = [...$('tray').children];
  const tiles = btns.map((b, i) => {
    const copy = b.cloneNode(true);
    copy.removeAttribute('id');
    // canvases do not clone their pixels
    const from = b.querySelectorAll('canvas');
    copy.querySelectorAll('canvas').forEach((c, k) => c.getContext('2d').drawImage(from[k], 0, 0));
    copy.addEventListener('click', () => pick(i));
    return copy;
  });
  let pick;
  const chosen = new Promise((res) => (pick = res));
  const dialog = openDialog({ title: editing ? 'Tools' : 'Parts', body: el('div', { class: 'parts-grid' }, tiles), actions: [{ label: 'Close', value: null }] });
  const i = await Promise.race([chosen, dialog]);
  if (i == null) return;
  document.querySelector('dialog[open]')?.closeWith?.(null);
  const b = btns[i];
  if (b.dataset.type) {
    if (armed !== b.dataset.type) arm(b.dataset.type);
  } else b.click();
  b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
  trayArrows();
}

// ---------- making and placing parts ----------

function snap(wx, wy) {
  return [Math.min(level.w - 1, Math.max(1, Math.round(wx))), Math.min(level.h - 1, Math.max(1, Math.round(wy)))];
}

function candidates(type, p) {
  if (type === 'chip') return armedChip ? [{ type: 'chip', p, def: armedChip }] : [];
  return PARTS[type].defaults(p);
}

function bestPart(type, p) {
  const list = candidates(type, p).map((c) => ({ ...c, id: 'ghost' }));
  const others = allParts();
  // a gear that would mesh with a neighbour is the most useful default
  if (type === 'gear') {
    const meshing = list.find((c) => !problemOf(c, others) && others.some((o) => o.type === 'gear' && Math.abs(Math.hypot(o.p[0] - c.p[0], o.p[1] - c.p[1]) - (gearR(o) + gearR(c))) < 1e-6 && (o.plane || 0) === (c.plane || 0)));
    if (meshing) return meshing;
  }
  return list.find((c) => !problemOf(c, others)) || list[0];
}

function problemOf(part, others) {
  const m = problems(level, [...others.filter((o) => !o.fixed), part].filter((o, i, a) => a.indexOf(o) === i));
  return m.get(part.id) || null;
}

function ghostAt(sx, sy, show = true) {
  if (!armed || armed === 'chain' || armed === 'wire') return;
  const [wx, wy] = view.toWorld(sx, sy);
  const p = snap(wx, wy);
  ghost = show ? bestPart(armed, p) : null;
  dirty = true;
}

function placeGhost() {
  if (!ghost) return;
  pushUndo();
  const part = { ...ghost, id: uid() };
  parts.push(part);
  ghost = null;
  armed = null;
  selected = part.id;
  sounds.place();
  saveMachine();
  refresh();
  const why = problemMap.get(part.id);
  if (why) toast(why, { position: 'top' });
  else hideToast();
}

function gearAt(p) {
  return allParts().find((o) => o.type === 'gear' && key(o.p) === key(p));
}

// Parts placed by tapping two others: a chain joins two gears, a wire runs
// from a sensor's pin to a motor.
function linkCandidates(type, stage, wx, wy) {
  const all = allParts();
  if (type === 'chain') return all.filter((o) => o.type === 'gear' && Math.hypot(o.p[0] - wx, o.p[1] - wy) < Math.max(0.8, gearR(o) * 0.7)).map((o) => ({ part: o, at: o.p }));
  const pin = PARTS.wire.link[stage === 0 ? 'first' : 'second'];
  // every pin of every part (chips and toggles have several), nearest first
  return all
    .flatMap((o) => PARTS.wire.pinsOf(o, pin).map((at) => ({ part: o, at })))
    .map((c) => ({ ...c, d: Math.hypot(c.at[0] - wx, c.at[1] - wy) }))
    .filter((c) => c.d < 0.9)
    .sort((a, b) => a.d - b.d);
}

function linkTap(wx, wy) {
  const type = armed;
  const words = type === 'chain' ? ['a gear', 'the second gear'] : PARTS.wire.link.words;
  const hit = linkCandidates(type, chainFrom ? 1 : 0, wx, wy)[0];
  if (!hit) {
    toast(`Tap ${chainFrom ? words[1] : words[0]}`, { position: 'top', duration: 1500 });
    return;
  }
  if (!chainFrom) {
    chainFrom = hit.at;
    chainPlane = hit.part.plane || 0;
    toast(`Now tap ${words[1]}`, { position: 'top' });
    dirty = true;
    return;
  }
  const part = type === 'chain' ? { id: uid(), type, a: chainFrom, b: hit.at, pa: chainPlane, pb: hit.part.plane || 0 } : { id: uid(), type, a: chainFrom, b: hit.at };
  chainFrom = null;
  pushUndo();
  parts.push(part);
  armed = null;
  selected = part.id;
  sounds.place();
  saveMachine();
  refresh();
  const why = problemMap.get(part.id);
  toast(why || (type === 'chain' ? 'Chained' : 'Wired'), { position: 'top', duration: 1500 });
}

function removePart(id) {
  const part = parts.find((p) => p.id === id);
  if (!part) return;
  pushUndo();
  parts = parts.filter((p) => p !== part);
  // a chain loses its gear: take the chain off too
  const pl = part.plane || 0;
  const pins = [PARTS[part.type].output?.(part), PARTS[part.type].input?.(part)].filter(Boolean).map(key);
  if (pins.length) parts = parts.filter((p) => p.type !== 'wire' || !(pins.includes(key(p.a)) || pins.includes(key(p.b))));
  if (part.type === 'gear') parts = parts.filter((p) => p.type !== 'chain' || !((key(p.a) === key(part.p) && (p.pa ?? 0) === pl) || (key(p.b) === key(part.p) && (p.pb ?? 0) === pl)));
  selected = null;
  sounds.flip();
  saveMachine();
  refresh();
}

// ---------- hit testing ----------

function partDistance(part, wx, wy) {
  return PARTS[part.type].distance(part, wx, wy);
}

function hitPart(wx, wy) {
  const tol = Math.max(0.35, 14 / view.s);
  let best = null;
  let bd = tol;
  for (const p of parts) {
    const d = partDistance(p, wx, wy);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function handlesOf(part) {
  return part ? PARTS[part.type].handles(part) : [];
}

function hitHandle(wx, wy) {
  const part = parts.find((p) => p.id === selected);
  const r = Math.max(0.55, 22 / view.s);
  for (const h of handlesOf(part)) if (Math.hypot(wx - h.at[0], wy - h.at[1]) < r) return { part, ...h };
  return null;
}

// ---------- board input ----------

const canvas = $('board');

function localXY(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

let lastTap = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (screen !== 'play') return;
  canvas.setPointerCapture?.(e.pointerId);
  const [sx, sy] = localXY(e);
  pointers.set(e.pointerId, { x: sx, y: sy });
  if (pointers.size === 1 && minimapTap(sx, sy)) {
    pointers.delete(e.pointerId);
    return;
  }
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    drag = { kind: 'pinch', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), s0: view.s, mid: [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2], world: view.toWorld((p1.x + p2.x) / 2, (p1.y + p2.y) / 2) };
    return;
  }
  if (mode !== 'build') {
    drag = { kind: 'pan', sx, sy, ox: view.ox, oy: view.oy, moved: false };
    return;
  }
  const [wx, wy] = view.toWorld(sx, sy);
  if (editing) {
    drag = ED.RECT_TOOLS.has(edTool) ? { kind: 'edrect', from: [wx, wy], to: [wx, wy] } : edTool === 'mover' ? { kind: 'edmover', from: [wx, wy], to: [wx, wy] } : { kind: 'edtap', at: [wx, wy] };
    return;
  }
  if (selecting) {
    drag = { kind: 'select', from: [wx, wy], to: [wx, wy] };
    return;
  }
  if (armed === 'chain' || armed === 'wire') {
    drag = { kind: 'tap', sx, sy };
    return;
  }
  if (armed) {
    ghostAt(sx, sy);
    drag = { kind: 'place', sx, sy };
    return;
  }
  const h = hitHandle(wx, wy);
  if (h) {
    pushUndo();
    drag = { kind: 'handle', ...h, moved: false };
    return;
  }
  const part = hitPart(wx, wy);
  if (part) {
    const wasSelected = selected === part.id;
    selected = part.id;
    pushUndo();
    drag = { kind: 'move', part, start: [wx, wy], orig: JSON.parse(JSON.stringify(part)), moved: false, wasSelected };
    renderInspector();
    dirty = true;
    return;
  }
  // empty board: deselect, pan, double-tap to fit
  const now = performance.now();
  if (now - lastTap < 320) {
    userView = null;
    layoutView();
  }
  lastTap = now;
  if (selected) {
    selected = null;
    renderInspector();
  }
  drag = { kind: 'pan', sx, sy, ox: view.ox, oy: view.oy, moved: false };
  dirty = true;
});

canvas.addEventListener('pointermove', (e) => {
  const [sx, sy] = localXY(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: sx, y: sy });
  if (screen !== 'play') return;
  if (!drag) {
    if (armed && e.pointerType === 'mouse') ghostAt(sx, sy);
    return;
  }
  const [wx, wy] = view.toWorld(sx, sy);
  if (drag.kind === 'pinch' && pointers.size >= 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const mid = [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2];
    view.s = Math.max(6, Math.min(140, (drag.s0 * d) / drag.d0));
    view.ox = mid[0] - drag.world[0] * view.s;
    view.oy = mid[1] - drag.world[1] * view.s;
    userView = { s: view.s, ox: view.ox, oy: view.oy };
    dirty = true;
  } else if (drag.kind === 'edrect') {
    drag.to = [wx, wy];
    edRect = { from: drag.from, to: drag.to };
    dirty = true;
  } else if (drag.kind === 'edmover') {
    drag.to = [wx, wy];
    edLine = { from: drag.from, to: drag.to };
    dirty = true;
  } else if (drag.kind === 'select') {
    drag.to = [wx, wy];
    selecting = { from: drag.from, to: drag.to };
    dirty = true;
  } else if (drag.kind === 'pan') {
    if (Math.hypot(sx - drag.sx, sy - drag.sy) > 6) drag.moved = true;
    if (drag.moved && !fitsWhole()) {
      view.ox = drag.ox + sx - drag.sx;
      view.oy = drag.oy + sy - drag.sy;
      clampView(boardRect());
      userView = { s: view.s, ox: view.ox, oy: view.oy };
      dirty = true;
    }
  } else if (drag.kind === 'place') {
    ghostAt(sx, sy);
  } else if (drag.kind === 'handle') {
    dragHandle(drag, wx, wy);
  } else if (drag.kind === 'move') {
    const dx = Math.round(wx - drag.start[0]);
    const dy = Math.round(wy - drag.start[1]);
    if (dx || dy || drag.moved) {
      drag.moved = true;
      const before = pinPegs(drag.part);
      PARTS[drag.part.type].move(drag.part, drag.orig, dx, dy);
      carryWires(before, pinPegs(drag.part));
      refresh();
    }
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (drag.kind === 'pinch') {
    if (pointers.size === 0) drag = null;
    return;
  }
  const [sx, sy] = localXY(e);
  const d = drag;
  drag = null;
  if (d.kind === 'edrect') {
    edRect = null;
    editDraft(ED.addRect(draft, edTool, d.from, d.to));
  } else if (d.kind === 'edmover') {
    edLine = null;
    const short = Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1]) < 0.75;
    const at = ED.moverAt(draft, d.from);
    if (short && at >= 0) moverSettings(at);
    else if ((draft.movers || []).length >= ED.MAX_MOVERS) toast(`Up to ${ED.MAX_MOVERS} movers. Erase one first.`, { position: 'top' });
    else editDraft(ED.addMover(draft, d.from, d.to));
  } else if (d.kind === 'edtap') {
    editDraft(edTool === 'erase' ? ED.eraseAt(draft, d.at) : ED.placeAt(draft, edTool, d.at));
  } else if (d.kind === 'select') {
    selecting = null;
    makeChip(d.from, d.to);
  } else if (d.kind === 'place') {
    ghostAt(sx, sy);
    placeGhost();
  } else if (d.kind === 'tap') {
    const [wx, wy] = view.toWorld(sx, sy);
    linkTap(wx, wy);
  } else if (d.kind === 'handle' || d.kind === 'move') {
    if (!d.moved) undoStack.pop();
    else sounds.place();
    $('d-undo').disabled = !undoStack.length;
    saveMachine();
    refresh();
  }
  dirty = true;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !drag && ghost) {
    ghost = null;
    dirty = true;
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (screen !== 'play') return;
    e.preventDefault();
    const [sx, sy] = localXY(e);
    const world = view.toWorld(sx, sy);
    view.s = Math.max(6, Math.min(140, view.s * Math.exp(-e.deltaY * 0.0015)));
    view.ox = sx - world[0] * view.s;
    view.oy = sy - world[1] * view.s;
    userView = { s: view.s, ox: view.ox, oy: view.oy };
    dirty = true;
  },
  { passive: false },
);

function dragHandle(d, wx, wy) {
  if (PARTS[d.part.type].drag(d.part, d.which, [wx, wy])) {
    d.moved = true;
    refresh();
  }
}

// ---------- inspector ----------

function group(buttons) {
  return el('div', { class: 'group' }, buttons);
}

function renderInspector() {
  const host = $('inspector');
  const part = parts.find((p) => p.id === selected);
  if (!part || mode !== 'build') {
    host.hidden = true;
    host.replaceChildren();
    layoutView();
    return;
  }
  const info = PART_INFO[part.type];
  const why = problemMap.get(part.id);
  const what = el('div', { class: 'what' }, el('b', {}, info.name), why ? el('small', { class: 'problem' }, `⚠ ${why}`) : el('small', {}, hintFor(part)));
  const controls = (PARTS[part.type].controls?.(part) || []).map((c) => {
    if (c.kind === 'choice') return group(c.options.map(([v, lab, aria]) => el('button', { class: c.value === v ? 'on' : '', 'aria-label': aria, onclick: () => edit(part, { [c.field]: v }) }, lab)));
    if (c.kind === 'stepper') {
      const set = (v) => edit(part, { [c.field]: Math.min(c.max, Math.max(c.min, Math.round(v * 100) / 100)) });
      return group([el('button', { 'aria-label': c.aria[0], onclick: () => set(c.value - c.step) }, '−'), el('span', { class: 'val' }, c.label(c.value)), el('button', { 'aria-label': c.aria[1], onclick: () => set(c.value + c.step) }, '+')]);
    }
    return group([el('button', { 'aria-label': c.aria, onclick: () => edit(part, c.apply) }, c.label)]);
  });
  if (level?.fixedEditor && part.type === 'motor') controls.push(group([[false, 'Runs'], [true, 'Waits']].map(([v, lab]) => el('button', { class: !!part.switched === v ? 'on' : '', 'aria-label': v ? 'Waits for a signal' : 'Runs from the start', onclick: () => edit(part, { switched: v }) }, lab))));
  controls.push(el('button', { class: 'tool', 'aria-label': 'Delete', onclick: () => removePart(part.id) }, 'Delete'));
  host.replaceChildren(what, ...controls);
  host.hidden = false;
  layoutView();
}

function hintFor(part) {
  return PARTS[part.type].hint(part, { layout });
}

function edit(part, changes) {
  pushUndo();
  Object.assign(part, changes);
  sounds.flip();
  saveMachine();
  refresh();
}

// ---------- running ----------

function startRun() {
  if (editing) return tryDraft();
  if (level?.fixedEditor) return doneFixed();
  if (mode === 'run') return stopRun();
  if (problemMap.size) {
    const [id, why] = [...problemMap][0];
    selected = id;
    refresh();
    toast(`Fix the part marked !: ${why}`, { position: 'top' });
    return;
  }
  hideToast();
  armed = null;
  ghost = null;
  selected = null;
  mode = 'run';
  run = makeRun(level, parts, { sandbox });
  acc = 0;
  failTimer = 0;
  stats.runs++;
  store.set('stats', stats);
  ach.unlock('first-run');
  if (layout.trains.some((t) => t.jammed)) ach.unlock('jammed');
  if (level.id === 'sandbox' && parts.length >= 15) ach.unlock('tinkerer');
  sfx.start();
  renderInspector();
  updateTray();
  show('play');
}

function stopRun() {
  if (run) lastPaths = run.paths;
  run = null;
  mode = 'build';
  show('play');
  updateHud();
}

function stepRun(dt) {
  if (!run || run.status !== 'running') return;
  acc += dt * speed;
  let n = 0;
  while (acc >= DT && n < 40) {
    run.tick();
    acc -= DT;
    n++;
    if (run.impacts.length) impactSound(run.impacts);
    if (run.status !== 'running') break;
  }
  $('r-clock').textContent = fmt(run.time);
  if (run.maxThrow > 12) ach.unlock('long-throw');
  if (run.status === 'win') onWin();
  else if (run.status === 'fail') onFail();
}

function onFail() {
  stats.fails++;
  store.set('stats', stats);
  ach.add('persistence');
  const rec = (progress[level.id] ||= {});
  rec.tries = (rec.tries || 0) + 1;
  save();
  sfx.fail();
  toast(`${run.reason}. Try again.`, { position: 'top' });
  announce(run.reason);
  failTimer = 1.4;
  updateHud();
}

function onWin() {
  sfx.win();
  if (level.fromEditor) {
    draft = ED.solvedWith(draft, parts, run.time);
    store.set('draft', draft);
    setTimeout(async () => {
      const v = await openDialog({ title: 'Solved: ready to share', body: el('div', {}, el('p', {}, `Your solution sets the targets: ${draft.stars.parts} part${draft.stars.parts === 1 ? '' : 's'}, ${draft.stars.time} s for three stars.`), el('p', { class: 'muted small' }, 'Anyone you send it to gets the level; your solution stays hidden unless they ask for a hint.')), actions: [{ label: 'Back to editor', value: 'edit' }, { label: 'Share level', value: 'share', primary: true }] });
      stopRun();
      openEditor();
      if (v === 'share') shareLevel();
    }, 650);
    return;
  }
  if (sandbox) {
    toast('Delivered!', { position: 'top' });
    failTimer = 2;
    return;
  }
  const rec = progress[level.id] || {};
  const tries = (rec.tries || 0) + 1;
  const hinted = !!rec.hinted;
  const win = { parts: parts.length, time: run.time, tries, hinted };
  const stars = starsFor(level, win);
  const score = scoreFor(level, win);
  const before = { ...rec };
  progress[level.id] = { ...record(rec, { ...win, stars, score }), hinted };
  save();
  ach.unlock('first-solve');
  if (tries <= 1) ach.unlock('flawless');
  const solved = LEVELS.filter((l) => isSolved(progress, l.id)).length;
  ach.at('all-levels', solved);
  ach.at('stars-90', totalStars(progress));
  const c = level.chapter;
  if (!level.custom && chapterDone(progress, c)) {
    ach.unlock(['slopes-done', 'levers-done', 'belts-done', 'gears-done', 'chains-done', 'timing-done', 'signals-done', 'logic-done', 'memory-done'][c]);
    const lv = LEVELS.filter((l) => l.chapter === c);
    if (lv.every((l) => progress[l.id].stars === 3)) ach.unlock('all-stars');
    if (lv.every((l) => !progress[l.id].hinted)) ach.unlock('no-hints');
  }
  setTimeout(() => results({ stars, score, win, before }), 650);
}

async function results({ stars, score, win, before }) {
  const best = (v, b, lower = true) => (b == null ? '' : lower ? (v < b - 1e-9 ? ' · best!' : '') : v > b ? ' · best!' : '');
  const i = indexOf(level);
  const next = level.custom ? null : LEVELS[i + 1];
  const chapterFinished = !level.custom && chapterDone(progress, level.chapter) && (!before.solved || !LEVELS.filter((l) => l.chapter === level.chapter).every((l) => l === level || before));
  const newCh = next && next.chapter !== level.chapter && !before.solved;
  const body = el(
    'div',
    {},
    el('p', { class: 'result-stars', 'aria-label': `${stars} of 3 stars` }, starText(stars)),
    el(
      'dl',
      { class: 'result-rows' },
      el('dt', {}, 'Machine time'),
      el('dd', {}, fmt(win.time) + best(win.time, before.time)),
      el('dt', {}, 'Parts used'),
      el('dd', {}, `${win.parts}` + best(win.parts, before.parts)),
      el('dt', {}, 'Tries'),
      el('dd', {}, `${win.tries}${win.tries === 1 ? ' · first try!' : ''}`),
      el('dt', {}, 'Score'),
      el('dd', {}, `${score}` + best(score, before.score, false)),
    ),
    stars < 3 ? el('p', { class: 'result-note' }, stars < 2 ? `★★ needs ${level.stars.parts} part${level.stars.parts === 1 ? '' : 's'} or fewer.` : win.hinted ? 'A shown hint part caps this level at ★★.' : `★★★ needs delivery within ${level.stars.time} s.`) : null,
    newCh ? el('div', { class: 'intro' }, iconCanvas(CHAPTERS[next.chapter].part, 72, 56), el('div', {}, el('p', {}, el('b', {}, `Chapter ${next.chapter + 1} open: ${CHAPTERS[next.chapter].name}`)), el('small', {}, CHAPTERS[next.chapter].blurb))) : null,
    !next && chapterFinished ? el('p', { class: 'result-note' }, 'Every level solved. The sandbox is yours.') : null,
  );
  const v = await openDialog({
    title: stars === 3 ? 'Perfect machine' : 'Delivered',
    body,
    actions: [{ label: 'Replay', value: 'replay' }, { label: 'Levels', value: 'levels' }, ...(next ? [{ label: 'Next', value: 'next', primary: true }] : [])],
  });
  if (v === 'next' && next) openLevel(next);
  else if (v === 'levels') {
    stopRun();
    show('levels');
  } else stopRun();
}

// ---------- sound ----------

const sfx = {
  start() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 330, duration: 0.12, gain: 0.06, type: 'square' });
    tone(ac, { freq: 495, duration: 0.14, gain: 0.05, type: 'square', when: 0.07 });
  },
  win() {
    const ac = audio();
    if (!ac) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.5, gain: 0.07, when: i * 0.1, type: 'triangle' }));
  },
  fail() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 150, duration: 0.3, gain: 0.07, type: 'sawtooth' });
    noiseBurst(ac, { duration: 0.2, freq: 500, q: 0.6, gain: 0.12 });
  },
};

function impactSound(list) {
  const now = performance.now();
  if (now - lastImpact < 70) return;
  const hit = list.reduce((a, b) => (b.speed > a.speed ? b : a));
  const ac = audio();
  if (!ac) return;
  lastImpact = now;
  const g = Math.min(0.3, 0.04 + hit.speed * 0.012);
  const metal = hit.a === 'lever' || hit.b === 'lever' || hit.a === 'weight' || hit.b === 'weight';
  noiseBurst(ac, { duration: 0.05, freq: metal ? 2400 : 900, q: metal ? 3 : 0.8, gain: g });
}

// ---------- hints ----------

async function hint() {
  if (sandbox) return toast('No hints in the sandbox: anything goes.');
  const sol = level.solution;
  const shown = hintParts.length;
  const more = shown < sol.length;
  const v = await openDialog({
    title: 'Hint',
    body: el('div', {}, el('p', {}, level.hint), el('p', { class: 'muted small' }, more ? 'Still stuck? Show one part of a working machine as a dashed outline. A shown part caps this level at ★★.' : 'Every part of a working machine is outlined on the board.')),
    actions: more ? [{ label: 'Close', value: null }, { label: shown ? 'Show another part' : 'Show a part', value: 'show', primary: true }] : [{ label: 'Close', value: null, primary: true }],
  });
  if (v === 'show') {
    hintParts = sol.slice(0, shown + 1);
    const rec = (progress[level.id] ||= {});
    rec.hinted = true;
    save();
    const p = hintParts[hintParts.length - 1];
    const extra = p.type === 'motor' ? ` (${p.dir > 0 ? 'clockwise' : 'counter-clockwise'}${p.delay ? `, wait ${p.delay}s` : ''})` : p.type === 'gear' ? ` (${p.teeth} teeth)` : '';
    toast(`${PART_INFO[p.type].name}${extra} goes in the dashed outline`, { position: 'top', duration: 3500 });
    dirty = true;
  }
}

// ---------- menus and settings ----------

function settingsBody() {
  return el(
    'div',
    {},
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Look'), segmented('theme', [['light', 'Paper'], ['dark', 'Ink'], ['auto', 'Auto'], ['hallows', 'Hallows']], themeId(), pickTheme)),
    toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    toggle('Show the last path', settings.get('trails'), (v) => settings.set('trails', v), 'Dots where things went on the last run'),
    toggle('Show gear ratios', settings.get('ratios'), (v) => settings.set('ratios', v), 'Speed of each axle next to the motor'),
    el('div', { class: 'menu-list' }, el('button', { class: 'btn', onclick: () => whatsNew() }, "What's new")),
  );
}

function openSettings() {
  openDialog({ title: 'Settings', body: settingsBody() });
}

async function editorMenu() {
  const v = await openDialog({
    title: 'Level editor',
    body: el('div', {}, el('p', {}, draft.solved ? 'Solved: you can share it.' : 'Try it and solve it once before sharing: your solution sets the star targets.')),
    actions: [{ label: 'Level settings', value: 'settings' }, ...(draft.solved ? [{ label: 'Share level', value: 'share', primary: true }] : []), { label: 'New level', value: 'new' }, { label: 'Title', value: 'title' }],
  });
  if (v === 'settings') levelSettings();
  else if (v === 'share') shareLevel();
  else if (v === 'new') {
    const ok = await openDialog({ title: 'Start a new level?', body: 'The board goes back to the starter. Undo brings this one back.', actions: [{ label: 'Keep', value: null }, { label: 'New', value: 'yes', primary: true }] });
    if (ok === 'yes') editDraft(ED.newDraft());
  } else if (v === 'title') {
    editing = false;
    show('title');
  }
}

async function playMenu() {
  if (editing) return editorMenu();
  const v = await openDialog({
    title: sandbox ? 'Sandbox' : `${numberOf(level)} · ${level.name}`,
    body: el('div', {}, el('p', {}, level.goalText), settingsBody()),
    actions: [
      ...(sandbox ? [] : [{ label: 'Level card', value: 'card' }]),
      ...(sandbox ? [{ label: 'Make a chip', value: 'chip' }] : []),
      { label: 'Share link', value: 'share' },
      { label: 'Save to file', value: 'save' },
      { label: 'Open file', value: 'open' },
      { label: 'Clear machine', value: 'clear' },
      { label: 'Parts guide', value: 'guide' },
      { label: 'Title', value: 'title' },
    ],
  });
  if (v === 'card') levelCard();
  else if (v === 'share') shareMachine();
  else if (v === 'chip') {
    selecting = { from: null, to: null };
    toast('Drag a box around the gates, delays and pixels to wrap', { position: 'top', duration: 0 });
  }
  else if (v === 'save') saveFile();
  else if (v === 'open') openFile();
  else if (v === 'clear') clearMachine();
  else if (v === 'guide') partsGuide();
  else if (v === 'title') {
    stopRun();
    show('title');
  }
}

async function clearMachine() {
  if (!parts.length) return;
  const v = await openDialog({ title: 'Clear the machine?', body: 'Every part you placed goes back in the box. Undo brings them back.', actions: [{ label: 'Keep', value: null }, { label: 'Clear', value: 'yes', primary: true }] });
  if (v !== 'yes') return;
  pushUndo();
  parts = [];
  selected = null;
  saveMachine();
  refresh();
}

function partsGuide() {
  const open = unlockedParts(progress);
  const intro = { ramp: 1, lever: 2, weight: 2, conveyor: 3, motor: 3, gear: 4, chain: 5, bouncer: 6, plate: 7, beam: 7, wire: 7, nand: 8, delay: 8, pixel: 8 };
  openDialog({
    title: 'Parts guide',
    body: el(
      'div',
      { class: 'guide' },
      PART_TYPES.map((t) => {
        const info = PART_INFO[t];
        const has = open.has(t);
        return el('div', { class: `intro ${has ? '' : 'locked'}` }, iconCanvas(t, 72, 56), el('div', {}, el('p', {}, el('b', {}, `${info.name}. `), has ? info.blurb : `Opens in chapter ${intro[t]}.`), has ? el('p', {}, info.physics) : null, has ? el('small', {}, `Tip: ${info.tip}`) : null));
      }),
      el('p', { class: 'muted small' }, 'Things to deliver: ', Object.keys(ITEM_INFO).map((t) => ITEM_INFO[t].name).join(', '), '. Balls roll, crates and cans slide and tip, eggs break if they land hard.'),
    ),
  });
}

// ---------- sharing, files, gallery, what's new ----------

// Shared links name the level; gallery copies and the sandbox share as sandbox.
const shareLevelId = () => (sandbox ? 'sandbox' : level.id);

async function shareMachine() {
  if (!parts.length) return toast('Build something first.');
  const code = await encodeMachine(shareLevelId(), parts);
  const url = `${location.origin}${location.pathname}#m=${code}`;
  const title = sandbox ? `My Contraption: ${level.name}` : `My Contraption for ${numberOf(level)} ${level.name}`;
  try {
    if (navigator.share) await navigator.share({ title, url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Link copied. Anyone who opens it gets your machine.');
    }
  } catch {
    // the share sheet was closed; show the link so it can be copied by hand
    openDialog({ title: 'Share link', body: el('div', {}, el('p', {}, 'Copy this link:'), el('textarea', { readonly: true, rows: 4, style: 'width:100%;font:inherit', onfocus: (e) => e.target.select() }, url)) });
  }
}

function saveFile() {
  const data = { ...toSave(parts), level: shareLevelId(), name: level.name };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `contraption-${shareLevelId()}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function openFile() {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      loadShared({ level: String(data.level || 'sandbox'), engine: data.engine ?? 1, parts: fromSave(data).parts }, 'file');
    } catch {
      toast('That file is not a Contraption machine.');
    }
  });
  input.click();
}

async function loadShared(shared, from = 'link') {
  const lvl = levelById(shared.level);
  if (!lvl || !shared.parts.length) return toast('That machine could not be opened.');
  const v = await openDialog({
    title: from === 'link' ? 'A shared machine' : 'Open machine',
    body: el(
      'div',
      {},
      el('p', {}, `${shared.parts.length} part${shared.parts.length === 1 ? '' : 's'} for ${lvl.id === 'sandbox' ? 'the sandbox' : `${numberOf(lvl)} · ${lvl.name}`}.`),
      el('p', { class: 'muted small' }, lvl.id === 'sandbox' ? 'It replaces your sandbox machine; Undo brings yours back.' : 'It replaces your machine on that level (Undo brings yours back). A solution you did not build counts as a hint: ★★ at most.'),
      shared.engine > ENGINE ? el('p', { class: 'muted small' }, 'It was made with a newer version of the game. If it misbehaves, reload to update.') : null,
    ),
    actions: [{ label: 'Not now', value: null }, { label: 'Open', value: 'open', primary: true }],
  });
  if (v !== 'open') return;
  openLevel(lvl, { card: false });
  pushUndo();
  parts = shared.parts.map((p, i) => ({ ...p, id: uid() + i }));
  if (lvl.id !== 'sandbox') {
    const rec = (progress[lvl.id] ||= {});
    rec.hinted = true;
    save();
  }
  saveMachine();
  buildTray();
  refresh();
  toast('Press Run to watch it.', { position: 'top' });
}

async function openFromHash() {
  const lv = ED.levelFromHash(location.hash);
  if (lv) {
    history.replaceState(null, '', location.pathname + location.search);
    return openSharedLevel(lv);
  }
  const code = machineFromHash(location.hash);
  if (!code) return;
  history.replaceState(null, '', location.pathname + location.search);
  const shared = await decodeMachine(code);
  if (!shared) return toast('That link does not hold a machine.');
  loadShared(shared);
}
addEventListener('hashchange', openFromHash);

async function gallery() {
  const v = await openDialog({
    title: 'Gallery',
    body: el(
      'div',
      { class: 'gallery' },
      GALLERY.map((g) => el('div', { class: 'gallery-item' }, el('h3', {}, g.title), el('small', {}, `by ${g.by} · ${g.parts.length} parts`), el('p', {}, g.note), el('button', { class: 'btn btn-primary', onclick: (e) => e.target.closest('dialog').closeWith(g.id) }, 'Open'))),
      el('p', { class: 'muted small' }, 'Built something worth watching? ', el('a', { href: SUBMIT, target: '_blank', rel: 'noopener' }, 'Send us its link'), ' and it may appear here, with your name.'),
    ),
  });
  const g = GALLERY.find((x) => x.id === v);
  if (!g) return;
  const base = g.level === 'sandbox' ? ALL_PARTS_SANDBOX : g.level === 'bench' ? BENCH : g.level === 'bench-big' ? BIG_BENCH : levelById(g.level);
  openLevel({ ...base, ...(g.board || {}), id: `gallery:${g.id}`, name: g.title, goalText: g.note }, { card: false, preset: g.parts });
  toast('Press Run to watch it. Change anything: your copy is kept.', { position: 'top', duration: 3500 });
}

function whatsNew({ onlyNew = false } = {}) {
  const seen = store.get('seenChanges');
  const list = onlyNew ? CHANGES.slice(0, Math.max(1, CHANGES.findIndex((c) => c.id === seen))) : CHANGES;
  store.set('seenChanges', CHANGES[0].id);
  return openDialog({
    title: "What's new",
    body: el('div', { class: 'changes' }, list.flatMap((c) => [el('h3', {}, `${c.title} · ${c.id}`), el('ul', {}, c.items.map((t) => el('li', {}, t)))])),
    actions: [{ label: 'Play', value: 'ok', primary: true }],
  });
}

// ---------- chips ----------

const LOGIC = new Set(['nand', 'delay', 'pixel']);
const chipLibrary = () => store.get('chips', []);

// Every peg a part has a pin on (signal in or out).
function pinPegs(part) {
  const def = PARTS[part.type];
  return [...(def.outputs?.(part) || (def.output ? [def.output(part)] : [])), ...(def.inputs?.(part) || (def.input ? [def.input(part)] : []))].map((q) => [...q]);
}

// After a part moves, wires that ended on its old pins follow to the new ones.
function carryWires(before, after) {
  before.forEach((old, i) => {
    const now = after[i];
    if (!now || (old[0] === now[0] && old[1] === now[1])) return;
    for (const w of parts) {
      if (w.type !== 'wire') continue;
      for (const end of ['a', 'b']) if (w[end][0] === old[0] && w[end][1] === old[1]) w[end] = [...now];
    }
  });
}

async function makeChip(from, to) {
  hideToast();
  const [x0, x1] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])];
  const [y0, y1] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])];
  const inner = parts.filter((p) => LOGIC.has(p.type) && p.p[0] >= x0 && p.p[0] <= x1 && p.p[1] >= y0 && p.p[1] <= y1);
  if (!inner.length) return toast('No gates, delays or pixels in that box.');
  const all = allParts();
  const ends = parts.filter((p) => p.type === 'wire').map((w) => ({ w, from: PARTS.wire.source(w, all)?.part, to: PARTS.wire.target(w, all)?.part }));
  const isIn = (p) => inner.includes(p);
  const internal = ends.filter((e) => isIn(e.from) && isIn(e.to));
  const incoming = ends.filter((e) => !isIn(e.from) && isIn(e.to));
  const outgoing = ends.filter((e) => isIn(e.from) && !isIn(e.to));
  const order = (a, b) => a.p[1] - b.p[1] || a.p[0] - b.p[0];
  const inputs = [...new Set(incoming.map((e) => e.to))].sort(order);
  const outputs = [...new Set(outgoing.map((e) => e.from))].sort(order);
  if (!inputs.length && !outputs.length) return toast('Nothing is wired in or out of that box, so the chip would have no pins.');
  const field = el('input', { maxlength: 6, value: 'CHIP', 'aria-label': 'Chip name', style: 'font:inherit;font-weight:800;text-transform:uppercase;width:8em' });
  const v = await openDialog({
    title: 'Make a chip',
    body: el('div', {}, el('p', {}, `${inner.length} parts, ${inputs.length} in, ${outputs.length} out. Wires crossing the box become its pins.`), el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Name'), field)),
    actions: [{ label: 'Cancel', value: null }, { label: 'Make it', value: 'ok', primary: true }],
  });
  if (v !== 'ok') return;
  const def = {
    name: (field.value.trim() || 'CHIP').toUpperCase().slice(0, 6),
    parts: inner.map(({ p, ...q }) => ({ ...q })),
    links: internal.map((e) => [e.from.id, e.to.id]),
    inputs: inputs.map((p) => p.id),
    outputs: outputs.map((p) => p.id),
  };
  pushUndo();
  const chip = { id: uid(), type: 'chip', p: [Math.floor(x0), Math.floor(y0)], def };
  const pinIn = PARTS.chip.inputs(chip);
  const pinOut = PARTS.chip.outputs(chip);
  for (const e of incoming) e.w.b = [...pinIn[inputs.indexOf(e.to)]];
  for (const e of outgoing) e.w.a = [...pinOut[outputs.indexOf(e.from)]];
  parts = parts.filter((p) => !isIn(p) && !internal.some((e) => e.w === p));
  parts.push(chip);
  selected = chip.id;
  const lib = chipLibrary().filter((d) => d.name !== def.name);
  store.set('chips', [def, ...lib].slice(0, 30));
  saveMachine();
  buildTray();
  refresh();
  toast(`Chip ${def.name} made. Find it in the tray to place more.`, { position: 'top' });
}

async function pickChip() {
  const lib = chipLibrary();
  if (!lib.length) return toast('Make a chip first: menu, Make a chip.');
  const v = await openDialog({
    title: 'Chips',
    body: el('div', { class: 'gallery' }, lib.map((d, i) => el('div', { class: 'gallery-item' }, el('h3', {}, d.name), el('small', {}, `${d.parts.length} parts · ${d.inputs.length} in, ${d.outputs.length} out`), el('p', {}), el('button', { class: 'btn btn-primary', onclick: (e) => e.target.closest('dialog').closeWith(String(i)) }, 'Place')))),
  });
  if (v == null) return;
  armedChip = lib[Number(v)];
  armed = 'chip';
  toast(`Tap a peg to place ${armedChip.name}`, { position: 'top', duration: 1800 });
  updateTray();
}

// ---------- level editor ----------

function openEditor() {
  draft = store.get('draft', null) || ED.newDraft();
  editing = true;
  sandbox = false;
  level = draft;
  parts = [];
  selected = null;
  armed = null;
  run = null;
  mode = 'build';
  userView = null;
  lastPaths = null;
  hintParts = [];
  buildTray();
  refresh();
  show('play');
  if (!store.get('editorSeen')) {
    store.set('editorSeen', true);
    toast('Draw walls, spikes and no-build zones, place the cup (or a lamp) and items, add movers and fixed parts (Machine), then Try it. Menu for name and parts.', { position: 'top', duration: 6000 });
  }
}

function editDraft(d, undoable = true) {
  if (d === draft) return;
  if (undoable) edUndo = [...edUndo.slice(-40), draft];
  draft = d;
  store.set('draft', draft);
  level = draft;
  refresh();
}

// Machine: build the level's fixed parts with the ordinary tools (every
// part, as many as you like). Done (or Back) makes them fixed.
function editFixed() {
  store.remove('machine:draft-fixed');
  editing = false;
  const all = Object.fromEntries(PART_TYPES.filter((t) => t !== 'chip').map((t) => [t, 99]));
  openLevel({ ...draft, id: 'draft-fixed', name: 'Fixed parts', fixed: (draft.fixed || []).filter((p) => p.id === ED.LAMP), parts: all, fromEditor: true, fixedEditor: true }, { card: false, preset: ED.fixedMachine(draft) });
  if (!store.get('fixedSeen')) {
    store.set('fixedSeen', true);
    toast('Place parts that come with the level. Players cannot move them. Tap a motor to make it wait for a signal. Done when finished.', { position: 'top', duration: 6000 });
  }
}

function doneFixed() {
  const d = ED.setFixed(draft, parts.map((p) => JSON.parse(JSON.stringify(p))));
  store.remove('machine:draft-fixed');
  if (JSON.stringify(d.fixed) !== JSON.stringify(draft.fixed)) {
    edUndo = [...edUndo.slice(-40), draft];
    store.set('draft', d);
  }
  openEditor();
}

async function moverSettings(i) {
  const m = draft.movers[i];
  let shape = ED.moverShapeOf(m);
  const num = (value, min, max, step, aria) => el('input', { type: 'number', value, min, max, step, 'aria-label': aria, style: 'font:inherit;width:4.5em' });
  const period = num(m.path?.period ?? 4, 1, 20, 0.5, 'Seconds there and back');
  const hold = num(Math.round((m.path?.hold ?? 0.15) * 100), 0, 40, 5, 'Wait at each end, percent');
  const phase = num(Math.round((m.path?.phase ?? 0) * 100), 0, 99, 5, 'Start part way, percent');
  const speed = num(m.spin?.speed ?? 1, -4, 4, 0.25, 'Turn speed');
  const length = num(m.length ?? 4, 2, 10, 0.5, 'Arm length');
  const spikes = el('input', { type: 'checkbox', checked: !!m.danger, 'aria-label': 'Spikes' });
  const slider = el('div', {}, el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Seconds there and back'), period), el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Wait at each end (%)'), hold), el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Start part way (%)'), phase));
  const arm = el('div', {}, el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Turn speed (negative turns the other way)'), speed), el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Arm length'), length));
  const shapes = [['platform', 'Platform'], ['gate', 'Gate'], ['block', 'Block'], ['arm', 'Arm']];
  const pick = el('div', { class: 'group', role: 'radiogroup', 'aria-label': 'Shape' });
  const paint = () => {
    pick.replaceChildren(...shapes.map(([v, lab]) => el('button', { class: shape === v ? 'on' : '', role: 'radio', 'aria-checked': String(shape === v), onclick: () => ((shape = v), paint()) }, lab)));
    slider.hidden = shape === 'arm';
    arm.hidden = shape !== 'arm';
  };
  paint();
  const v = await openDialog({
    title: 'Mover',
    body: el('div', { class: 'inspector mover-settings' }, pick, slider, arm, el('label', { class: 'field' }, spikes, ' Spikes: touching it breaks things'), shape !== 'arm' && m.spin ? el('p', { class: 'muted small' }, 'A new slider goes four cells right; erase it and drag one out to choose where.') : null),
    actions: [{ label: 'Delete', value: 'delete' }, { label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
  });
  if (v === 'delete') editDraft(ED.removeMover(draft, i));
  else if (v === 'ok') editDraft(ED.setMover(draft, i, { shape, period: Number(period.value), hold: Number(hold.value) / 100, phase: Number(phase.value) / 100, speed: Number(speed.value), length: Number(length.value), danger: spikes.checked }));
}

function tryDraft() {
  const why = ED.draftProblem(draft);
  if (why) return toast(why, { position: 'top' });
  editing = false;
  openLevel({ ...draft, id: 'draft-try', fromEditor: true }, { card: false });
  toast(draft.solved ? 'Play it again. A new win updates the targets.' : 'Solve it once: your solution sets the targets.', { position: 'top', duration: 3000 });
}

async function levelSettings() {
  const name = el('input', { value: draft.name, maxlength: 40, 'aria-label': 'Level name', style: 'font:inherit;width:100%' });
  const goal = el('input', { value: draft.goalText, maxlength: 140, 'aria-label': 'Goal', style: 'font:inherit;width:100%' });
  const counts = {};
  const rows = PART_TYPES.filter((t) => t !== 'chip').map((t) => {
    const input = el('input', { type: 'number', min: 0, max: 9, value: draft.parts[t] || 0, 'aria-label': `${PART_INFO[t].name}s on offer`, style: 'font:inherit;width:3.5em' });
    counts[t] = input;
    return el('label', { class: 'card-part' }, iconCanvas(t, 36, 28), PART_INFO[t].name, input);
  });
  const num = (value, min, max, step, aria) => el('input', { type: 'number', value, min, max, step, 'aria-label': aria, style: 'font:inherit;width:4.5em' });
  const limit = num(draft.timeLimit ?? 20, 3, 120, 1, 'Time limit in seconds');
  const lg = ED.lampGoalOf(draft.signalGoal);
  let lampBox = null;
  const lampIn = {};
  if (lg) {
    lampIn.kind = el('select', { 'aria-label': 'Lamp goal', style: 'font:inherit' }, [['lit', 'Stay lit'], ['blink', 'Blink'], ['pulse', 'Light, then go dark']].map(([k, lab]) => el('option', { value: k, selected: lg.kind === k }, lab)));
    lampIn.hold = num(lg.hold, 0.1, 30, 0.5, 'Seconds lit');
    lampIn.blinks = num(lg.blinks, 1, 20, 1, 'Blinks');
    lampIn.darkHold = num(lg.darkHold, 0.1, 30, 0.5, 'Seconds dark after');
    lampIn.darkUntil = num(lg.darkUntil, 0, 60, 0.5, 'Must stay dark until');
    const row = (lab, input) => el('label', { class: 'field' }, el('span', { class: 'field-label' }, lab), input);
    const rows2 = { hold: row('Seconds lit', lampIn.hold), blinks: row('Blinks', lampIn.blinks), darkHold: row('Then seconds dark', lampIn.darkHold) };
    const paint = () => {
      const k = lampIn.kind.value;
      rows2.hold.hidden = k === 'blink';
      rows2.blinks.hidden = k !== 'blink';
      rows2.darkHold.hidden = k !== 'pulse';
    };
    lampIn.kind.addEventListener('change', paint);
    lampBox = el('div', {}, el('p', { class: 'field-label' }, 'Lamp goal'), lampIn.kind, rows2.hold, rows2.blinks, rows2.darkHold, row('Lighting before this many seconds fails (0: never)', lampIn.darkUntil));
    paint();
  }
  const v = await openDialog({
    title: 'Level settings',
    body: el('div', {}, el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Name'), name), el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Goal'), goal), lampBox, el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Time limit (seconds)'), limit), el('p', { class: 'field-label' }, 'Parts on offer'), el('div', { class: 'card-parts' }, rows)),
    actions: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
  });
  if (v !== 'ok') return;
  let d = ED.setText(draft, { name: name.value, goalText: goal.value });
  if (Number(limit.value) !== (draft.timeLimit ?? 20)) d = ED.setTimeLimit(d, limit.value);
  if (lg) {
    const next = ED.setLampGoal(d, { kind: lampIn.kind.value, hold: lampIn.hold.value, blinks: lampIn.blinks.value, darkHold: lampIn.darkHold.value, darkUntil: lampIn.darkUntil.value });
    if (JSON.stringify(next.signalGoal) !== JSON.stringify(d.signalGoal)) d = next;
  }
  const offer = Object.fromEntries(Object.entries(counts).map(([t, i]) => [t, Math.max(0, Math.min(9, Math.round(Number(i.value) || 0)))]));
  if (JSON.stringify(Object.entries(offer).filter(([, n]) => n)) !== JSON.stringify(Object.entries(draft.parts).filter(([, n]) => n))) d = ED.setParts(d, offer);
  editDraft(d);
}

async function shareLevel() {
  if (!draft.solved) return toast('Solve it once first: Try it.');
  const code = await ED.encodeLevel(draft);
  const url = `${location.origin}${location.pathname}#lv=${code}`;
  try {
    if (navigator.share) await navigator.share({ title: `A Contraption level: ${draft.name}`, url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Link copied. Anyone who opens it can play your level.');
    }
  } catch {
    openDialog({ title: 'Share level', body: el('div', {}, el('p', {}, 'Copy this link:'), el('textarea', { readonly: true, rows: 4, style: 'width:100%;font:inherit', onfocus: (e) => e.target.select() }, url)) });
  }
}

async function openSharedLevel(code) {
  const lvl = await ED.decodeLevel(code);
  if (!lvl) return toast('That link does not hold a level.');
  const v = await openDialog({
    title: 'A level made by a player',
    body: el('div', {}, el('p', {}, el('b', {}, lvl.name)), el('p', {}, lvl.goalText), lvl.unverified ? el('p', { class: 'muted small' }, 'Its maker\'s solution does not work in this version of the game, so it may not be solvable.') : el('p', { class: 'muted small' }, 'Checked: its maker\'s solution works.')),
    actions: [{ label: 'Not now', value: null }, { label: 'Play', value: 'play', primary: true }],
  });
  if (v === 'play') openLevel(lvl);
}

// ---------- HUD ----------

function updateHud() {
  if (!level) return;
  $('h-name').textContent = editing ? 'Level editor' : sandbox || level.custom ? level.name : `${numberOf(level)} · ${level.name}`;
  const rec = progress[level.id];
  const used = parts.length;
  const bits = [];
  if (!sandbox) {
    bits.push(`${used} part${used === 1 ? '' : 's'}`);
    bits.push(`tries ${rec?.tries || 0}`);
    if (rec?.solved) bits.push(`best ${starText(rec.stars)}`);
  } else bits.push(`${used} parts`);
  $('h-info').textContent = editing ? (draft?.solved ? 'Solved: ready to share' : 'Not solved yet: Try it') : bits.join(' · ');
  $('h-hint').hidden = sandbox || editing || !!level.fromEditor;
  $('d-run').querySelector('span').textContent = editing ? 'Try it' : level.fixedEditor ? 'Done' : 'Run';
}

// ---------- layout and drawing ----------

function boardRect() {
  if (screen === 'title') {
    // the demo machine runs in the space the title card leaves free
    const card = document.querySelector('.title-card').getBoundingClientRect();
    const top = document.querySelector('.title-bar').getBoundingClientRect().bottom;
    if (card.left > view.w * 0.3) return { x: 0, y: 0, w: card.left - 8, h: view.h };
    return { x: 0, y: top, w: view.w, h: Math.max(80, card.top - top - 4) };
  }
  if (screen !== 'play') return { x: 0, y: 0, w: view.w, h: view.h };
  const top = $('hud').getBoundingClientRect().bottom;
  const bottomEl = mode === 'run' ? $('runbar') : $('dock');
  const bottom = bottomEl.hidden ? view.h : bottomEl.getBoundingClientRect().top;
  return { x: 0, y: top, w: view.w, h: Math.max(80, bottom - top) };
}

const MIN_CELL = 14; // px per cell below which pegs get too fiddly to tap (24-wide levels fit a phone)

// Can the whole board be seen at the current zoom?
function fitsWhole() {
  const r = boardRect();
  return level && level.w * view.s <= r.w + 1 && level.h * view.s <= r.h + 1;
}

// Keep at least part of the board on screen.
function clampView(r) {
  const bw = level.w * view.s;
  const bh = level.h * view.s;
  const m = 8;
  // bigger than the screen: no gap past an edge; smaller: keep it on screen
  if (bw > r.w) view.ox = Math.min(r.x + m, Math.max(r.x + r.w - bw - m, view.ox));
  else view.ox = Math.min(r.x + r.w - bw, Math.max(r.x, view.ox));
  if (bh > r.h) view.oy = Math.min(r.y + m, Math.max(r.y + r.h - bh - m, view.oy));
  else view.oy = Math.min(r.y + r.h - bh, Math.max(r.y, view.oy));
}

// The overview in the corner when the board is bigger than the screen.
function minimapRect() {
  const r = boardRect();
  const w = Math.min(150, r.w * 0.3);
  const h = (w * level.h) / level.w;
  return { x: r.x + 8, y: r.y + r.h - h - 8, w, h, k: w / level.w };
}

function drawMinimap() {
  if (fitsWhole()) return;
  const ctx = view.ctx;
  const p = pal();
  const m = minimapRect();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = p.paper;
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.fillStyle = p.ink;
  for (const z of level.walls || []) if (Array.isArray(z)) ctx.fillRect(m.x + z[0] * m.k, m.y + z[1] * m.k, Math.max(1, z[2] * m.k), Math.max(1, z[3] * m.k));
  ctx.fillStyle = p.mid;
  for (const part of allParts()) {
    const c = centre(part);
    ctx.fillRect(m.x + c[0] * m.k - 1.5, m.y + c[1] * m.k - 1.5, 3, 3);
  }
  if (level.goal) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m.x + level.goal.x * m.k, m.y + level.goal.y * m.k, level.goal.w * m.k, level.goal.h * m.k);
  }
  // what is on screen now
  const r = boardRect();
  const [x0, y0] = view.toWorld(r.x, r.y);
  const [x1, y1] = view.toWorld(r.x + r.w, r.y + r.h);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(m.x + Math.max(0, x0) * m.k, m.y + Math.max(0, y0) * m.k, (Math.min(level.w, x1) - Math.max(0, x0)) * m.k, (Math.min(level.h, y1) - Math.max(0, y0)) * m.k);
  ctx.lineWidth = 2;
  ctx.strokeRect(m.x, m.y, m.w, m.h);
}

// Tap the overview to look there.
function minimapTap(sx, sy) {
  if (fitsWhole()) return false;
  const m = minimapRect();
  if (sx < m.x || sy < m.y || sx > m.x + m.w || sy > m.y + m.h) return false;
  const r = boardRect();
  const wx = (sx - m.x) / m.k;
  const wy = (sy - m.y) / m.k;
  view.ox = r.x + r.w / 2 - wx * view.s;
  view.oy = r.y + r.h / 2 - wy * view.s;
  clampView(r);
  userView = { s: view.s, ox: view.ox, oy: view.oy };
  dirty = true;
  return true;
}

function layoutView() {
  view.resize();
  if (screen === 'play' && level) {
    if (userView) Object.assign(view, userView);
    else {
      const rect = boardRect();
      view.fit(level.w, level.h, rect, 6);
      // too small to touch comfortably: start zoomed in on the first item
      // (a gallery machine is for watching: show all of it, however small)
      if (view.s < MIN_CELL && !level.id.startsWith('gallery:')) {
        const it = level.items?.[0] || { x: level.w / 2, y: level.h / 2 };
        view.s = MIN_CELL;
        view.ox = rect.x + rect.w / 2 - it.x * view.s;
        view.oy = rect.y + rect.h / 3 - it.y * view.s;
        clampView(rect);
        userView = { s: view.s, ox: view.ox, oy: view.oy };
      }
    }
  } else if (screen === 'title' && demo) {
    view.fit(demo.level.w, demo.level.h, boardRect(), 10);
  }
  dirty = true;
}
addEventListener('resize', layoutView);
window.visualViewport?.addEventListener('resize', layoutView);

function draw(now) {
  const t = now / 1000;
  if (screen === 'title' && demo) {
    view.fit(demo.level.w, demo.level.h, boardRect(), 10);
    drawScene(view, pal(), demo.level, demo.level.solution, { mode: 'run', run: demo.run, layout: demo.layout, time: t, pegs: false });
    return;
  }
  if (screen === 'levels') {
    view.begin(pal());
    return;
  }
  if (screen !== 'play' || !level) return;
  const moverPose = (i) => moverMotion(level.movers[i])(0);
  drawScene(view, pal(), level, parts, {
    mode,
    run,
    layout,
    time: t,
    selected,
    problems: mode === 'build' ? problemMap : null,
    ghost: mode === 'build' ? ghost : null,
    ghostBad: ghost ? !!problemOf(ghost, allParts()) : false,
    paths: settings.get('trails') && mode === 'build' && lastPaths ? lastPaths : null,
    hintParts: mode === 'build' ? hintParts : null,
    ratios: settings.get('ratios'),
    moverPose,
    goalGlow: run?.inGoal?.some((v) => v > 0) ? 0.6 : 0,
  });
  drawMinimap();
  view.ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
  if (mode === 'build') {
    const part = parts.find((p) => p.id === selected);
    for (const h of handlesOf(part)) drawHandle(view.ctx, view, pal(), h.at[0], h.at[1], drag?.kind === 'handle' && drag.which === h.which);
    if (chainFrom) drawHandle(view.ctx, view, pal(), chainFrom[0], chainFrom[1], true);
    if (editing) drawMoverPaths();
    const box = selecting?.from ? selecting : edRect;
    if (box) {
      const c = view.ctx;
      const [x0, y0] = box.from;
      const [x1, y1] = box.to;
      c.save();
      c.setLineDash([6 / view.s, 4 / view.s]);
      c.strokeStyle = pal().ink;
      c.lineWidth = view.px(2.4);
      c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      c.restore();
    }
  }
}

// In the editor, each slider shows where it goes: a dashed track and an
// outline at the far end. The mover being dragged out shows as an arrow.
function drawMoverPaths() {
  const c = view.ctx;
  const p = pal();
  c.save();
  c.strokeStyle = p.ink;
  c.lineWidth = view.px(1.6);
  c.setLineDash([5 / view.s, 4 / view.s]);
  for (const m of draft.movers || []) {
    if (!m.path) continue;
    const [ax, ay] = m.path.from;
    const [bx, by] = m.path.to;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
    c.strokeRect(bx - (m.w ?? 1) / 2, by - (m.h ?? 1) / 2, m.w ?? 1, m.h ?? 1);
  }
  if (edLine) {
    const [ax, ay] = edLine.from;
    const [bx, by] = edLine.to;
    c.setLineDash([]);
    c.lineWidth = view.px(2.4);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    const a = Math.atan2(by - ay, bx - ax);
    c.moveTo(bx - 0.5 * Math.cos(a - 0.5), by - 0.5 * Math.sin(a - 0.5));
    c.lineTo(bx, by);
    c.lineTo(bx - 0.5 * Math.cos(a + 0.5), by - 0.5 * Math.sin(a + 0.5));
    c.stroke();
  }
  c.restore();
}

let lastTs = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;
  let animate = false;
  if (screen === 'title' && demo) {
    animate = true;
    if (demo.run.status === 'running') {
      demo.acc = (demo.acc || 0) + dt;
      while (demo.acc >= DT && demo.run.status === 'running') {
        demo.run.tick();
        demo.acc -= DT;
      }
    } else if ((demo.wait += dt) > 1.6) nextDemo();
  } else if (screen === 'play' && mode === 'run' && run) {
    animate = true;
    stepRun(dt);
    if (failTimer > 0 && run && run.status !== 'running') {
      failTimer -= dt;
      if (failTimer <= 0) stopRun();
    }
  }
  if (animate || dirty) {
    draw(now);
    dirty = false;
  }
  requestAnimationFrame(frame);
}

// ---------- wiring ----------

$('t-continue').addEventListener('click', () => {
  const last = levelById(store.get('last'));
  const next = nextLevel(progress);
  openLevel(last && !isSolved(progress, last.id) ? last : next);
});
$('t-levels').addEventListener('click', () => show('levels'));
$('t-sandbox').addEventListener('click', () => {
  if (!chapterDone(progress, 0)) return toast('The sandbox opens when you finish chapter 1, Slopes.');
  openLevel(SANDBOX, { card: false });
});
$('t-parts').addEventListener('click', partsGuide);
$('t-gallery').addEventListener('click', gallery);
$('t-editor').addEventListener('click', () => {
  if (!chapterDone(progress, 0)) return toast('The level editor opens when you finish chapter 1, Slopes.');
  openEditor();
});
$('t-settings').addEventListener('click', openSettings);
$('l-back').addEventListener('click', () => show('title'));
$('h-back').addEventListener('click', () => {
  stopRun();
  if (level?.fixedEditor) return doneFixed();
  if (level?.fromEditor) return openEditor();
  if (editing) {
    editing = false;
    return show('title');
  }
  show(sandbox ? 'title' : 'levels');
});
$('h-hint').addEventListener('click', hint);
$('h-menu').addEventListener('click', playMenu);
$('d-run').addEventListener('click', startRun);
$('d-undo').addEventListener('click', undo);
$('r-stop').addEventListener('click', stopRun);
for (const b of document.querySelectorAll('.speed button')) {
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    for (const o of document.querySelectorAll('.speed button')) o.classList.toggle('on', o === b);
  });
}
addEventListener('keydown', (e) => {
  if (screen !== 'play' || document.querySelector('dialog[open]')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (mode === 'run') stopRun();
    else startRun();
  } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey || mode === 'build')) undo();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) removePart(selected);
  else if (e.key === 'Escape') {
    if (selecting) hideToast();
    selecting = null;
    armed = null;
    selected = null;
    ghost = null;
    chainFrom = null;
    renderInspector();
    updateTray();
    dirty = true;
  }
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// For checks in a headless browser: jump straight to a level with ?level=<id>.
const params = new URLSearchParams(location.search);
show('title');
if (params.get('level') && levelById(params.get('level'))) openLevel(levelById(params.get('level')), { card: params.has('card') });
if (params.get('solve') && level) {
  parts = level.solution.map((p) => ({ ...p }));
  refresh();
}
openFromHash();
void reducedMotion;
void _DT;
requestAnimationFrame(frame);

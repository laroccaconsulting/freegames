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
import { LEVELS, CHAPTERS, levelById } from './js/levels.js';
import { PART_TYPES, PART_INFO, ITEM_INFO, problems, makeRun, leverEnds, key, moverMotion, partShape } from './js/machine.js';
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

const SANDBOX = {
  id: 'sandbox',
  chapter: -1,
  name: 'Sandbox',
  goalText: 'Anything goes. Get the ball into the cup however you like.',
  w: 32,
  h: 20,
  items: [{ type: 'ball', x: 3, y: 2 }],
  walls: [[0, 19, 32, 1]],
  goal: { x: 26, y: 16, w: 4, h: 3, cup: true },
  parts: {},
  stars: { parts: 99, time: 99 },
  timeLimit: 60,
  solution: [],
};

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
  if (lvl.id === 'sandbox') return '';
  const inCh = LEVELS.filter((l) => l.chapter === lvl.chapter);
  return `${lvl.chapter + 1}-${inCh.indexOf(lvl) + 1}`;
};
const indexOf = (lvl) => LEVELS.indexOf(lvl);
const announce = (t) => ($('announce').textContent = t);
const uid = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const fmt = (s) => `${s.toFixed(1)} s`;
const starText = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(of - n);

function offered(type) {
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
  store.set(`machine:${level.id}`, parts);
}

function pushUndo() {
  undoStack.push(JSON.stringify(parts));
  if (undoStack.length > 60) undoStack.shift();
  $('d-undo').disabled = false;
}

function undo() {
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
  $('t-sandbox').setAttribute('aria-label', sbOpen ? 'Sandbox' : 'Sandbox, locked');
  demo = null;
  nextDemo();
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
    gear: { type: 'gear', p: [1.5, 1.2], size: 1 },
    chain: null,
  }[type];
  v.s = Math.min(w / 3, h / 2.4);
  v.ox = (w - 3 * v.s) / 2;
  v.oy = (h - 2.4 * v.s) / 2;
  const ctx = c.getContext('2d');
  ctx.setTransform(2 * v.s, 0, 0, 2 * v.s, 2 * v.ox, 2 * v.oy);
  if (type === 'chain') {
    const g1 = { type: 'gear', p: [0.8, 1.2], size: 1 };
    const g2 = { type: 'gear', p: [2.3, 1.2], size: 1 };
    const s0 = v.s;
    v.s = s0;
    ctx.save();
    ctx.translate(0, 0);
    drawPart(v, palette, { type: 'chain', a: g1.p, b: g2.p }, [{ ...g1, size: 0.55 }, { ...g2, size: 0.55 }]);
    ctx.restore();
  } else if (type === 'gear') {
    ctx.translate(1.5, 1.2);
    ctx.scale(0.85, 0.85);
    ctx.translate(-1.5, -1.2);
    drawPart(v, palette, sample);
  } else if (sample) drawPart(v, palette, sample);
  return c;
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
        el('div', { class: 'chapter-head' }, iconCanvas(ch.part, 56, 56), el('div', {}, el('h3', {}, `${c + 1}. ${ch.name}`), el('p', {}, open ? `${ch.blurb} ★ ${stars}/${lvls.length * 3}` : `Locked: finish chapter ${c} to open.`))),
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
              el('small', {}, rec?.solved ? starText(rec.stars) : can ? '' : '🔒'),
            );
          }),
        ),
      );
    }),
  );
}

// ---------- opening a level ----------

function openLevel(lvl, { card = true } = {}) {
  sandbox = lvl.id === 'sandbox';
  if (sandbox) {
    SANDBOX.parts = Object.fromEntries([...unlockedParts(progress)].map((t) => [t, 99]));
  }
  level = sandbox ? SANDBOX : lvl;
  parts = (store.get(`machine:${level.id}`, []) || []).filter((p) => PART_TYPES.includes(p.type));
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
  const newParts = PART_TYPES.filter((t) => level.parts?.[t] && !seen.has(t));
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
  await openDialog({ title: `${numberOf(level)} · ${level.name}`, body, actions: [{ label: 'Build', value: 'go', primary: true }] });
}

// ---------- tray ----------

function buildTray() {
  const tray = $('tray');
  if (!level) return tray.replaceChildren();
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

function updateTray() {
  for (const b of $('tray').querySelectorAll('.part-btn')) {
    const t = b.dataset.type;
    const left = offered(t) - usedOf(t);
    b.querySelector('.count').textContent = left === Infinity ? '∞' : left;
    b.classList.toggle('empty', left <= 0);
    b.classList.toggle('armed', armed === t);
  }
}

function arm(type) {
  armed = armed === type ? null : type;
  chainFrom = null;
  selected = null;
  ghost = null;
  if (armed) {
    if (offered(armed) - usedOf(armed) <= 0) {
      toast(`No ${PART_INFO[armed].name.toLowerCase()}s left. Tap one on the board and delete it to reuse it.`);
      armed = null;
    } else if (armed === 'chain') toast('Tap the first gear, then the second', { position: 'top' });
    else toast(`Tap a peg to place the ${PART_INFO[armed].name.toLowerCase()}`, { position: 'top', duration: 1800 });
  } else hideToast();
  renderInspector();
  updateTray();
  dirty = true;
}

function trayDown(e, type, btn) {
  if (mode !== 'build') return;
  e.preventDefault();
  arm(type);
  if (!armed) return;
  const start = { x: e.clientX, y: e.clientY };
  btn.setPointerCapture?.(e.pointerId);
  const move = (ev) => {
    if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 12 && armed !== 'chain') {
      const r = $('board').getBoundingClientRect();
      ghostAt(ev.clientX - r.left, ev.clientY - r.top, true);
    }
  };
  const up = (ev) => {
    btn.removeEventListener('pointermove', move);
    btn.removeEventListener('pointerup', up);
    btn.removeEventListener('pointercancel', up);
    const over = document.elementFromPoint(ev.clientX, ev.clientY);
    if (ghost && over === $('board')) placeGhost();
    else ghost = null;
    dirty = true;
  };
  btn.addEventListener('pointermove', move);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
}

// ---------- making and placing parts ----------

function snap(wx, wy) {
  return [Math.min(level.w - 1, Math.max(1, Math.round(wx))), Math.min(level.h - 1, Math.max(1, Math.round(wy)))];
}

function candidates(type, p) {
  const [x, y] = p;
  const ab = (offs) => offs.map(([dx, dy]) => ({ type, a: [x, y], b: [x + dx, y + dy] }));
  switch (type) {
    case 'ramp':
      return ab([[3, 1], [-3, 1], [3, 2], [-3, 2], [2, 1], [-2, 1], [3, -1], [-3, -1]]);
    case 'bouncer':
      return ab([[2, 1], [-2, 1], [2, 0], [-2, 0], [1, 1], [-1, 1]]);
    case 'conveyor':
      return ab([[5, 0], [-5, 0], [4, 0], [-4, 0], [3, 0], [-3, 0], [2, 0], [-2, 0]]);
    case 'lever':
      return [[2, 2], [1.5, 1.5], [1, 1], [2, 1], [1, 2], [0.5, 0.5]].map(([l1, l2]) => ({ type, p: [x, y], angle: 0, l1, l2 }));
    case 'weight':
      return [{ type, p: [x, y] }];
    case 'motor':
      return [{ type, p: [x, y], dir: 1, delay: 0 }];
    case 'gear':
      return [1, 2, 3].map((size) => ({ type, p: [x, y], size }));
    default:
      return [];
  }
}

function bestPart(type, p) {
  const list = candidates(type, p).map((c) => ({ ...c, id: 'ghost' }));
  const others = allParts();
  // a gear that would mesh with a neighbour is the most useful default
  if (type === 'gear') {
    const meshing = list.find((c) => !problemOf(c, others) && others.some((o) => o.type === 'gear' && Math.abs(Math.hypot(o.p[0] - c.p[0], o.p[1] - c.p[1]) - (o.size + c.size)) < 1e-6));
    if (meshing) return meshing;
  }
  return list.find((c) => !problemOf(c, others)) || list[0];
}

function problemOf(part, others) {
  const m = problems(level, [...others.filter((o) => !o.fixed), part].filter((o, i, a) => a.indexOf(o) === i));
  return m.get(part.id) || null;
}

function ghostAt(sx, sy, show = true) {
  if (!armed || armed === 'chain') return;
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

function chainTap(wx, wy) {
  const p = snap(wx, wy);
  const g = allParts().find((o) => o.type === 'gear' && Math.hypot(o.p[0] - wx, o.p[1] - wy) < Math.max(0.8, o.size * 0.7));
  if (!g) {
    toast('Tap a gear', { position: 'top', duration: 1500 });
    return;
  }
  if (!chainFrom) {
    chainFrom = g.p;
    toast('Now tap the second gear', { position: 'top' });
    dirty = true;
    return;
  }
  const part = { id: uid(), type: 'chain', a: chainFrom, b: g.p };
  chainFrom = null;
  pushUndo();
  parts.push(part);
  armed = null;
  selected = part.id;
  sounds.place();
  saveMachine();
  refresh();
  const why = problemMap.get(part.id);
  toast(why || 'Chained', { position: 'top', duration: 1500 });
  void p;
}

function removePart(id) {
  const part = parts.find((p) => p.id === id);
  if (!part) return;
  pushUndo();
  parts = parts.filter((p) => p !== part);
  // a chain loses its gear: take the chain off too
  if (part.type === 'gear') parts = parts.filter((p) => p.type !== 'chain' || (key(p.a) !== key(part.p) && key(p.b) !== key(part.p)));
  selected = null;
  sounds.flip();
  saveMachine();
  refresh();
}

// ---------- hit testing ----------

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function partDistance(part, wx, wy) {
  switch (part.type) {
    case 'ramp':
    case 'bouncer':
      return segDist(wx, wy, ...part.a, ...part.b) - 0.2;
    case 'conveyor':
      return segDist(wx, wy, ...part.a, ...part.b) - 0.5;
    case 'lever': {
      const [e1, e2] = leverEnds(part);
      return segDist(wx, wy, ...e1, ...e2) - 0.15;
    }
    case 'weight':
      return Math.max(Math.abs(wx - part.p[0]), Math.abs(wy - part.p[1])) - 0.45;
    case 'motor':
      return Math.hypot(wx - part.p[0], wy - part.p[1]) - 0.45 + 0.1; // just behind front parts
    case 'gear':
      return Math.hypot(wx - part.p[0], wy - part.p[1]) - part.size * 0.75 + 0.3;
    case 'chain':
      return segDist(wx, wy, ...part.a, ...part.b) - 0.15 + 0.3;
    default:
      return Infinity;
  }
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
  if (!part) return [];
  if (part.a && part.type !== 'chain') return [{ which: 'a', at: part.a }, { which: 'b', at: part.b }];
  if (part.type === 'lever') {
    const [e1, e2] = leverEnds(part);
    return [{ which: 'e1', at: e1 }, { which: 'e2', at: e2 }];
  }
  return [];
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
  if (armed === 'chain') {
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
  } else if (drag.kind === 'pan') {
    if (Math.hypot(sx - drag.sx, sy - drag.sy) > 6) drag.moved = true;
    if (drag.moved && userView) {
      view.ox = drag.ox + sx - drag.sx;
      view.oy = drag.oy + sy - drag.sy;
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
      const p = drag.part;
      const o = drag.orig;
      if (o.a) {
        p.a = [o.a[0] + dx, o.a[1] + dy];
        p.b = [o.b[0] + dx, o.b[1] + dy];
      } else p.p = [o.p[0] + dx, o.p[1] + dy];
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
  if (d.kind === 'place') {
    ghostAt(sx, sy);
    placeGhost();
  } else if (d.kind === 'tap') {
    const [wx, wy] = view.toWorld(sx, sy);
    chainTap(wx, wy);
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
  const p = d.part;
  if (d.which === 'a' || d.which === 'b') {
    const q = snap(wx, wy);
    const cur = p[d.which];
    if (q[0] !== cur[0] || q[1] !== cur[1]) {
      p[d.which] = q;
      d.moved = true;
      refresh();
    }
    return;
  }
  // lever end: angle in 15° steps, length in half cells, the other arm stays in line
  let ang = Math.atan2(wy - p.p[1], wx - p.p[0]);
  if (d.which === 'e1') ang += Math.PI;
  let deg = Math.round((ang * 180) / Math.PI / 15) * 15;
  deg = ((deg + 540) % 360) - 180;
  const len = Math.max(0.5, Math.min(6, Math.round(Math.hypot(wx - p.p[0], wy - p.p[1]) * 2) / 2));
  const field = d.which === 'e1' ? 'l1' : 'l2';
  if (deg !== p.angle || len !== p[field]) {
    p.angle = deg;
    p[field] = len;
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
  const controls = [];
  if (part.type === 'gear') {
    controls.push(group([1, 2, 3].map((s) => el('button', { class: part.size === s ? 'on' : '', 'aria-label': `Size ${s}`, onclick: () => edit(part, { size: s }) }, ['S', 'M', 'L'][s - 1]))));
  }
  if (part.type === 'motor') {
    controls.push(group([[1, '↻'], [-1, '↺']].map(([dir, lab]) => el('button', { class: (part.dir || 1) === dir ? 'on' : '', 'aria-label': dir > 0 ? 'Clockwise' : 'Counter-clockwise', onclick: () => edit(part, { dir }) }, lab))));
    controls.push(group([el('button', { 'aria-label': 'Start sooner', onclick: () => edit(part, { delay: Math.max(0, (part.delay || 0) - 0.5) }) }, '−'), el('span', { class: 'val' }, `wait ${part.delay || 0}s`), el('button', { 'aria-label': 'Start later', onclick: () => edit(part, { delay: Math.min(5, (part.delay || 0) + 0.5) }) }, '+')]));
  }
  if (part.type === 'lever') {
    controls.push(group([el('button', { 'aria-label': 'Swap the arms', onclick: () => edit(part, { l1: part.l2, l2: part.l1 }) }, '⇄')]));
  }
  controls.push(el('button', { class: 'tool', 'aria-label': 'Delete', onclick: () => removePart(part.id) }, 'Delete'));
  host.replaceChildren(what, ...controls);
  host.hidden = false;
  layoutView();
}

function hintFor(part) {
  if (part.a && part.type !== 'chain') return 'Drag the round ends to pegs.';
  if (part.type === 'lever') return `Arms ${part.l1} and ${part.l2}. Drag the ends.`;
  if (part.type === 'motor') return (part.dir || 1) > 0 ? 'Turns clockwise.' : 'Turns counter-clockwise.';
  if (part.type === 'weight') return 'Hangs here until you press Run, then falls.';
  if (part.type === 'gear') {
    const A = layout?.axles.get(key(part.p));
    const t = A && layout.trains[A.train];
    if (t?.jammed) return 'Jammed: these gears fight each other.';
    if (t?.motors.length) return `Turns at ${Math.abs(A.k).toFixed(A.k % 1 ? 2 : 0)}× the motor.`;
    return 'Drag to move. Rims that touch mesh.';
  }
  return 'Drag to move it.';
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
  if (sandbox && parts.length >= 15) ach.unlock('tinkerer');
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
  if (chapterDone(progress, c)) {
    ach.unlock(['slopes-done', 'levers-done', 'belts-done', 'gears-done', 'chains-done', 'timing-done'][c]);
    const lv = LEVELS.filter((l) => l.chapter === c);
    if (lv.every((l) => progress[l.id].stars === 3)) ach.unlock('all-stars');
    if (lv.every((l) => !progress[l.id].hinted)) ach.unlock('no-hints');
  }
  setTimeout(() => results({ stars, score, win, before }), 650);
}

async function results({ stars, score, win, before }) {
  const best = (v, b, lower = true) => (b == null ? '' : lower ? (v < b - 1e-9 ? ' · best!' : '') : v > b ? ' · best!' : '');
  const i = indexOf(level);
  const next = LEVELS[i + 1];
  const chapterFinished = chapterDone(progress, level.chapter) && (!before.solved || !LEVELS.filter((l) => l.chapter === level.chapter).every((l) => l === level || before));
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
    const extra = p.type === 'motor' ? ` (${p.dir > 0 ? 'clockwise' : 'counter-clockwise'}${p.delay ? `, wait ${p.delay}s` : ''})` : p.type === 'gear' ? ` (size ${['S', 'M', 'L'][p.size - 1]})` : '';
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
  );
}

function openSettings() {
  openDialog({ title: 'Settings', body: settingsBody() });
}

async function playMenu() {
  const v = await openDialog({
    title: sandbox ? 'Sandbox' : `${numberOf(level)} · ${level.name}`,
    body: el('div', {}, el('p', {}, level.goalText), settingsBody()),
    actions: [
      ...(sandbox ? [] : [{ label: 'Level card', value: 'card' }]),
      { label: 'Clear machine', value: 'clear' },
      { label: 'Parts guide', value: 'guide' },
      { label: 'Title', value: 'title' },
    ],
  });
  if (v === 'card') levelCard();
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
  const intro = { ramp: 1, lever: 2, weight: 2, conveyor: 3, motor: 3, gear: 4, chain: 5, bouncer: 6 };
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

// ---------- HUD ----------

function updateHud() {
  if (!level) return;
  $('h-name').textContent = sandbox ? 'Sandbox' : `${numberOf(level)} · ${level.name}`;
  const rec = progress[level.id];
  const used = parts.length;
  const bits = [];
  if (!sandbox) {
    bits.push(`${used} part${used === 1 ? '' : 's'}`);
    bits.push(`tries ${rec?.tries || 0}`);
    if (rec?.solved) bits.push(`best ${starText(rec.stars)}`);
  } else bits.push(`${used} parts`);
  $('h-info').textContent = bits.join(' · ');
  $('h-hint').hidden = sandbox;
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

function layoutView() {
  view.resize();
  if (screen === 'play' && level) {
    if (userView) Object.assign(view, userView);
    else view.fit(level.w, level.h, boardRect(), 6);
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
  if (mode === 'build') {
    const part = parts.find((p) => p.id === selected);
    for (const h of handlesOf(part)) drawHandle(view.ctx, view, pal(), h.at[0], h.at[1], drag?.kind === 'handle' && drag.which === h.which);
    if (chainFrom) drawHandle(view.ctx, view, pal(), chainFrom[0], chainFrom[1], true);
  }
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
$('t-settings').addEventListener('click', openSettings);
$('l-back').addEventListener('click', () => show('title'));
$('h-back').addEventListener('click', () => {
  stopRun();
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
void reducedMotion;
void partShape;
void centre;
requestAnimationFrame(frame);

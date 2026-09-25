import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon, medal } from './core/icons.js';
import { randomSeed } from './core/rng.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, shareText } from './core/golf.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { injectSprite } from './js/art.js';
import { RANK_LABELS, isRed, cardName } from './js/cards.js';
import * as P from './js/peaks.js';

const LAUNCH_DAY = '2026-09-25';
const NAMES = { tripeaks: 'TriPeaks', pyramid: 'Pyramid', golf: 'Golf' };
const BLURBS = { tripeaks: 'One up or one down, clear three peaks', pyramid: 'Pairs that add to 13', golf: 'Seven columns, as few cards left as you can' };
const store = makeStore('peaks');
const ach = makeAchievements('peaks', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
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
injectSprite();

const sfx = {
  play(streak) {
    const ac = audio();
    if (ac) tone(ac, { freq: 440 * 2 ** (Math.min(streak, 20) / 12), duration: 0.1, gain: 0.05, type: 'triangle' });
  },
  flip() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.05, freq: 3000, q: 1.2, gain: 0.14 });
  },
  nope: () => sounds.invalid(),
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (ac) [392, 311.13, 261.63].forEach((f, i) => tone(ac, { freq: f, duration: 0.22, gain: 0.05, when: i * 0.12, type: 'triangle' }));
  },
};

// ---------- Deals ----------

// game: the pure state from peaks.js plus { daily, par }
let game = null;
let sel = null; // Pyramid: the first card of a pair (layout index or 'w')
const today = () => dateKey();

function newDeal(mode, { daily = null } = {}) {
  const seed = daily ? dailySeed(`peaks-${mode}`, daily) : randomSeed();
  const g = mode === 'golf' ? P.deal(mode, seed) : P.winnableDeal(mode, seed);
  g.daily = daily;
  g.par = mode === 'golf' ? P.golfPar(g) : null;
  g.over = false;
  start(g);
}

function start(g) {
  game = g;
  sel = null;
  store.set('mode', g.mode);
  save();
  build();
  announce(`${titleText()}. ${BLURBS[g.mode]}.`);
}

// The cards and layout come back from the seed, so only the play is saved.
const save = () => store.set('game', { ...game, cards: undefined, layout: undefined });

function load() {
  const saved = store.get('game');
  if (!saved?.mode) return false;
  try {
    const g = P.deal(saved.mode, saved.seed);
    Object.assign(g, saved);
    game = g;
    build();
    return true;
  } catch {
    return false;
  }
}

const titleText = () => (game.daily ? `${NAMES[game.mode]} · Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : NAMES[game.mode]);

// ---------- Moves ----------

function tapLayout(i) {
  if (game.over) return;
  if (game.mode === 'pyramid') return pick(i);
  const res = P.playCard(game, i);
  if (!res) return nope(game.layout[i].card);
  sfx.play(game.streak);
  if (res.points) floater(game.layout[i].card, `+${res.points}`);
  if (res.peak) toast('Peak cleared!', { duration: 1000 });
  after();
}

function pick(src) {
  if (!P.moves(game).length && src !== 'w') return;
  const id = src === 'w' ? P.wasteTop(game) : game.layout[src].card;
  if (id == null) return;
  if (src !== 'w' && !P.isFree(game, src)) return nope(id);
  if (game.cards[id].rank === 13) {
    P.removePair(game, src);
    sel = null;
    sfx.play(game.streak);
    return after();
  }
  if (sel == null || sel === src) {
    sel = sel === src ? null : src;
    sfx.flip();
    return render();
  }
  const res = P.removePair(game, sel, src);
  if (!res) {
    sel = src;
    sfx.nope();
    return render();
  }
  sfx.play(game.streak);
  floater(id, `+${res.points}`);
  sel = null;
  after();
}

function nope(id) {
  sfx.nope();
  const c = cardEls.get(id);
  if (!c || reduced.matches) return;
  c.classList.remove('nope');
  void c.offsetWidth;
  c.classList.add('nope');
}

function drawCard() {
  if (game.over) return;
  const res = P.draw(game);
  if (!res) return sfx.nope();
  sel = null;
  sfx.flip();
  after();
}

function undo() {
  if (!P.undo(game)) return;
  game.over = false;
  sel = null;
  save();
  render();
}

function hint() {
  if (game.over) return;
  const line = game.mode !== 'golf' ? P.solve(game, { limit: 30000 }) : null;
  const all = P.moves(game);
  const m = line?.[0] || all.find((x) => !x.draw) || all[0];
  if (!m) return;
  if (!line && game.mode !== 'golf') toast('This deal may not be winnable from here. Try undoing a few moves.', { duration: 3000 });
  const ids = m.play != null ? [game.layout[m.play].card] : m.king != null ? [srcCard(m.king)] : m.pair ? m.pair.map(srcCard) : [];
  if (m.draw) toast(game.stock.length ? 'Turn over a card from the stock.' : 'Turn the waste back over.', { duration: 1800 });
  for (const id of ids) {
    const c = cardEls.get(id);
    c?.classList.add('hinted');
    setTimeout(() => c?.classList.remove('hinted'), 1600);
  }
}
const srcCard = (s) => (s === 'w' ? P.wasteTop(game) : game.layout[s].card);

function after() {
  save();
  render();
  if (P.cleared(game)) return finish(true);
  if (!P.moves(game).length) finish(false);
}

function finish(won) {
  game.over = true;
  save();
  if (won && game.mode === 'tripeaks') ach.unlock('tripeaks');
  if (won && game.mode === 'pyramid') ach.unlock('pyramid');
  if (won && game.mode === 'golf') ach.unlock('golf-clear');
  if (game.mode === 'golf' && P.left(game) <= game.par) ach.unlock('golf-par');
  if (game.mode === 'tripeaks' && game.best >= 10) ach.unlock('run-10');
  if (won) ach.add('wins-25');
  if (game.daily) ach.unlock('daily');
  const stats = store.get('stats', {});
  const st = (stats[game.mode] ||= { played: 0, won: 0, best: 0 });
  st.played++;
  if (won) st.won++;
  const result = game.mode === 'golf' ? P.left(game) : game.score;
  if (game.mode === 'golf') st.best = st.best ? Math.min(st.best, result) : result;
  else st.best = Math.max(st.best, result);
  if (game.mode === 'golf' && st.best === 0 && !won) st.best = result;
  store.set('stats', stats);
  if (game.daily) {
    const log = store.get(`daily-${game.mode}`, {});
    if (!log[game.daily]) store.set(`daily-${game.mode}`, { ...log, [game.daily]: { won, result } });
  }
  if (won) sfx.win();
  else sfx.lose();
  const golf = game.mode === 'golf';
  const title = won ? 'Cleared!' : golf ? `${P.left(game)} cards left` : 'No moves left';
  const lines = golf ? [`Par ${game.par}`, won ? 'Every card cleared' : P.left(game) <= game.par ? 'At or under par!' : `${P.left(game) - game.par} over par`] : [`Score ${game.score}`, game.mode === 'tripeaks' ? `Longest run ${game.best}` : `${P.left(game)} cards left`];
  const good = won || (golf && P.left(game) <= game.par);
  const text = `Peaks · ${titleText()} ${good ? '💎' : '🃏'}\n${golf ? `${P.left(game)} left (par ${game.par})` : won ? `Cleared · ${game.score} points` : `${P.left(game)} left · ${game.score} points`}`;
  setTimeout(
    () =>
      openDialog({
        title,
        className: 'results',
        body: el(
          'div',
          {},
          el('div', { class: 'stamp show' }, medal(good ? 'diamond' : 'medal')),
          lines.map((l) => el('p', { class: 'result-note' }, l)),
          game.daily && el('p', { class: 'result-note' }, icon('flame', { size: 18 }), `${dailyStreak(store.get(`daily-${game.mode}`, {}), today())}-day streak`),
          el('button', { class: 'btn share-btn', onclick: async () => (await shareText(text, location.origin + location.pathname)) === 'copied' && toast('Result copied — paste it anywhere') }, icon('share'), 'Share result'),
        ),
        actions: [...(won ? [] : [{ label: 'Undo', value: 'undo' }]), { label: 'New deal', value: 'new', primary: true }],
      }).then((v) => {
        if (v === 'new') newDeal(game.mode);
        else if (v === 'undo') undo();
      }),
    reduced.matches ? 150 : 650,
  );
}

// ---------- Table ----------

const table = $('table');
const cardEls = new Map();
let stockSlot = null;
let wasteSlot = null;
const svgUse = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
function face(card) {
  const rank = RANK_LABELS[card.rank];
  const suit = `suit-${card.suit}`;
  return `<div class="idx"><span class="r${rank === '10' ? ' ten' : ''}">${rank}</span>${svgUse(suit, 's')}</div>${svgUse(card.rank > 10 ? `court-${card.rank}` : suit, 'center')}`;
}

function build() {
  table.replaceChildren();
  cardEls.clear();
  stockSlot = el('div', { class: 'slot stock', onclick: drawCard, 'aria-label': 'Stock' }, el('span', { class: 'count' }));
  wasteSlot = el('div', { class: 'slot waste' });
  table.append(stockSlot, wasteSlot);
  for (const card of game.cards) {
    const c = el('div', { class: `card ${isRed(card.suit) ? 'red' : 'black'}${card.rank > 10 ? ' court' : ''}`, dataset: { id: card.id }, role: 'button', 'aria-label': cardName(card) });
    c.innerHTML = `<div class="card-inner"><div class="card-face">${face(card)}</div><div class="card-back"></div></div>`;
    cardEls.set(card.id, c);
    table.append(c);
  }
  table.classList.add('no-anim');
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => table.classList.remove('no-anim')));
}

table.addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (!c) return;
  const id = Number(c.dataset.id);
  const spot = game.layout.findIndex((s, i) => s.card === id && !game.gone[i]);
  if (spot >= 0) return tapLayout(spot);
  if (game.stock.includes(id)) return drawCard();
  if (game.mode === 'pyramid' && P.wasteTop(game) === id) return pick('w');
});

// Card size and positions for the current table size.
function geometry() {
  const W = table.clientWidth;
  const H = table.clientHeight;
  const { cols, rows, step } = { tripeaks: { cols: 10, rows: 4, step: 0.5 }, pyramid: { cols: 7, rows: 7, step: 0.5 }, golf: { cols: 7, rows: 5, step: 0.3 } }[game.mode];
  const pad = 10;
  const unit = 1.07; // card width plus a small gap
  const byW = (W - 2 * pad) / (cols * unit);
  // Layout height + a gap + the stock row (with its count below).
  const byH = (H - 2 * pad - 26) / (1.4 * (1 + (rows - 1) * step) + 0.35 + 1.4);
  const cw = Math.floor(Math.min(byW, byH, 110));
  const ch = Math.round(cw * 1.4);
  const u = cw * unit;
  const layoutH = ch * (1 + (rows - 1) * step);
  const totalH = layoutH + ch * 0.35 + ch + 20;
  const y0 = Math.max(pad, (H - totalH) / 2);
  const x0 = (W - cols * u) / 2 + (u - cw) / 2;
  return { cw, ch, u, x0, y0, step, bottom: y0 + layoutH + ch * 0.35, W };
}

function render() {
  const g = geometry();
  table.style.setProperty('--cw', `${g.cw}px`);
  table.style.setProperty('--ch', `${g.ch}px`);
  const place = (node, x, y, z) => {
    node.style.transform = `translate(${x}px, ${y}px)`;
    node.style.zIndex = z;
  };
  // Stock and waste sit centred under the layout.
  const stockX = g.W / 2 - g.cw * 1.35;
  const wasteX = g.W / 2 + g.cw * 0.1;
  place(stockSlot, stockX, g.bottom, 0);
  place(wasteSlot, wasteX, g.bottom, 0);
  stockSlot.replaceChildren(el('span', {}, game.stock.length ? '' : game.mode === 'pyramid' && game.recycles < P.MAX_RECYCLES && game.waste.length ? '↺' : '✕'), el('span', { class: 'count' }, game.stock.length ? `${game.stock.length} left` : game.mode === 'pyramid' ? `${P.MAX_RECYCLES - game.recycles} redeals` : ''));
  const seen = new Set();
  game.layout.forEach((s, i) => {
    if (game.gone[i]) return;
    const c = cardEls.get(s.card);
    seen.add(s.card);
    place(c, g.x0 + (s.x - 0.5) * g.u, g.y0 + s.row * g.step * g.ch, 10 + s.row * 10 + Math.round(s.x));
    const free = P.isFree(game, i);
    c.className = `card ${c.className.includes('red') ? 'red' : 'black'}${game.cards[s.card].rank > 10 ? ' court' : ''}${P.faceUp(game, i) ? ' up' : ''}${free ? ' free' : ''}${game.mode === 'pyramid' && !free ? ' dim' : ''}${sel === i ? ' sel' : ''}`;
  });
  // The waste fans its top three cards.
  const w = game.waste;
  w.forEach((id, k) => {
    const c = cardEls.get(id);
    seen.add(id);
    const fromTop = w.length - 1 - k;
    const fan = Math.max(0, 2 - fromTop);
    const shown = Math.min(3, w.length);
    place(c, wasteX + (fan - (3 - shown)) * g.cw * 0.28, g.bottom, 200 + k);
    c.className = `card ${c.className.includes('red') ? 'red' : 'black'}${game.cards[id].rank > 10 ? ' court' : ''} up${fromTop === 0 && game.mode === 'pyramid' ? ' free' : ''}${sel === 'w' && fromTop === 0 ? ' sel' : ''}`;
  });
  game.stock.forEach((id, k) => {
    const c = cardEls.get(id);
    seen.add(id);
    place(c, stockX - Math.min(k, 6) * 0.6, g.bottom - Math.min(k, 6) * 0.6, 100 + k);
    c.className = `card ${c.className.includes('red') ? 'red' : 'black'}${game.cards[id].rank > 10 ? ' court' : ''}`;
  });
  // Pyramid pairs leave the table, fading out to the top right.
  for (const [id, c] of cardEls) {
    if (seen.has(id)) continue;
    place(c, g.W - g.cw - 6, -g.ch * 0.4, 300);
    c.className = `card ${c.className.includes('red') ? 'red' : 'black'} up gone`;
  }
  hud();
}

function floater(id, text) {
  if (reduced.matches) return;
  const c = cardEls.get(id);
  const r = c.getBoundingClientRect();
  const t = table.getBoundingClientRect();
  const f = el('div', { class: 'floater', style: `left:${r.left - t.left + r.width / 2}px; top:${r.top - t.top + r.height / 2}px` }, text);
  table.append(f);
  setTimeout(() => f.remove(), 950);
}

function hud() {
  $('title').textContent = NAMES[game.mode];
  $('subtitle').textContent = game.daily ? `Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : BLURBS[game.mode];
  const chip = (label, value, hot = false) => el('div', { class: `chip${hot ? ' hot' : ''}` }, el('small', {}, label), el('b', {}, value));
  const chips =
    game.mode === 'tripeaks'
      ? [chip('Score', game.score), chip('Run', game.streak, game.streak >= 5)]
      : game.mode === 'pyramid'
        ? [chip('Score', game.score), chip('Left', P.left(game))]
        : [chip('Left', P.left(game), game.par != null && P.left(game) <= game.par), chip('Par', game.par ?? '–')];
  $('chips').replaceChildren(...chips);
  $('undo-btn').disabled = !game.history.length;
  $('hint-btn').disabled = game.over;
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = today();
  const stats = store.get('stats', {});
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  const blocks = P.MODES.map((mode) => {
    const r = store.get(`daily-${mode}`, {})[key];
    const st = stats[mode];
    const sub = r ? (mode === 'golf' ? `Today: ${r.result} left` : r.won ? `Today: cleared, ${r.result} points` : `Today: ${r.result} points`) : BLURBS[mode];
    return el(
      'div',
      { class: 'mode-block' },
      menuCard({ tripeaks: 'levels', pyramid: 'blocks', golf: 'flag' }[mode], `${NAMES[mode]} · Daily #${dailyNumber(key, LAUNCH_DAY)}`, sub, go(() => newDeal(mode, { daily: key }))),
      el('button', { class: 'btn', onclick: go(() => newDeal(mode)) }, `New ${NAMES[mode]} deal${st?.played ? ` · won ${st.won} of ${st.played}` : ''}`),
    );
  });
  openDialog({
    title: 'Peaks',
    body: el(
      'div',
      {},
      el('div', { class: 'menu-list' }, blocks),
      el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, 'Settings'), el('button', { class: 'btn', onclick: go(openHelp) }, 'How to play')),
    ),
  });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {}, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)), toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v))),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, el('b', {}, 'TriPeaks. '), 'Tap a face-up card that is one higher or one lower than the card on the waste pile (Kings and Aces wrap round). Runs score more with every card. Stuck? Tap the stock for a new waste card. Clear all three peaks.'),
      el('p', {}, el('b', {}, 'Pyramid. '), 'Tap two uncovered cards that add up to 13 to remove them (Jack 11, Queen 12, and a King is 13 on its own). The waste card counts too. You can turn the waste over twice. Clear the pyramid.'),
      el('p', {}, el('b', {}, 'Golf. '), 'Like TriPeaks on seven columns, but nothing wraps from King to Ace and nothing goes on a King. Leave as few cards as you can; par is the best our solver found.'),
      el('p', { class: 'muted' }, 'Every TriPeaks and Pyramid deal is checked by a solver, so it can be won. Keys: space turns the stock, Z undoes, H hints.'),
    ),
  });
}

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', hint);
$('hint-btn').prepend(icon('bulb', { size: 22 }));
$('new-btn').addEventListener('click', () => newDeal(game.mode));
$('new-btn').prepend(icon('shuffle', { size: 22 }));
document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === ' ') drawCard();
  else if (e.key === 'z') undo();
  else if (e.key === 'h') hint();
  else return;
  e.preventDefault();
});
new ResizeObserver(() => game && render()).observe(table);

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

if (!load()) newDeal(store.get('mode', 'tripeaks'), { daily: today() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

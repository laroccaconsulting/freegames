import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon, medal } from './core/icons.js';
import { randomSeed } from './core/rng.js';
import { injectSprite } from './js/art.js';
import { RANK_LABELS, isRed, cardName } from './js/cards.js';
import * as H from './js/hearts.js';

const NAMES = ['You', 'Wren', 'Otto', 'Iris'];
const store = makeStore('hearts');
const settings = makeSettings(store, { theme: null, sound: true, speed: 'normal' });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const pace = () => ({ fast: 0.45, normal: 1, slow: 1.6 })[settings.get('speed')] * (reduced.matches ? 0.5 : 1);

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
  card() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.04, freq: 2600, q: 1.2, gain: 0.14 });
  },
  take(pts) {
    const ac = audio();
    if (!ac) return;
    if (pts >= 13) [311.13, 261.63, 196].forEach((f, i) => tone(ac, { freq: f, duration: 0.2, gain: 0.05, when: i * 0.1, type: 'triangle' }));
    else if (pts) tone(ac, { freq: 330, duration: 0.12, gain: 0.04, type: 'triangle' });
  },
  nope: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Game ----------

let s = null;
let selected = [];
let showing = null; // a finished trick on display
let timer = null;

function newGame() {
  clearTimeout(timer);
  s = H.newGame(randomSeed());
  selected = [];
  showing = null;
  save();
  render();
  step();
}
const save = () => store.set('game', s);

function step() {
  clearTimeout(timer);
  render();
  if (s.phase === 'play' && s.turn !== 0 && !showing) timer = setTimeout(() => play(H.choosePlay(s)), 520 * pace());
  else if (s.phase === 'done' || s.phase === 'over') timer = setTimeout(roundOver, 500 * pace());
}

function play(card) {
  const res = H.playCard(s, card);
  if (!res) return sfx.nope();
  s = res.state;
  sfx.card();
  save();
  if (res.events.trick) {
    showing = { cards: s.lastTrick, winner: res.events.trick.winner };
    render();
    const { winner, points } = res.events.trick;
    if (points) announce(`${NAMES[winner]} ${winner === 0 ? 'take' : 'takes'} ${points} point${points > 1 ? 's' : ''}.`);
    timer = setTimeout(() => {
      sfx.take(points);
      showing = null;
      step();
    }, 1000 * pace());
    return;
  }
  step();
}

function tapCard(card) {
  if (s.phase === 'pass') {
    if (selected.includes(card)) selected = selected.filter((c) => c !== card);
    else if (selected.length < 3) selected = [...selected, card];
    sfx.card();
    return render();
  }
  if (s.phase !== 'play' || s.turn !== 0 || showing) return;
  if (!H.legal(s).includes(card)) {
    sfx.nope();
    const why = s.tricks === 0 && !s.trick.length ? 'The two of clubs leads the first trick.' : s.trick.length ? 'You must follow suit if you can.' : 'Hearts can’t lead until they’re broken.';
    return toast(why, { duration: 1800 });
  }
  play(card);
}

function doPass() {
  if (selected.length !== 3) return;
  s = H.pass(s, selected);
  selected = [];
  save();
  toast(`You passed 3 ${s.passDir}. New cards are outlined.`, { duration: 2200 });
  step();
}

function roundOver() {
  const over = s.phase === 'over';
  const rows = [0, 1, 2, 3].map((k) => [NAMES[k], s.moon != null ? (k === s.moon ? 0 : 26) : s.taken[k], s.scores[k]]);
  const low = Math.min(...s.scores);
  const table = el('table', { class: 'score-table' }, el('tr', {}, el('th', {}, ''), el('th', {}, 'This hand'), el('th', {}, 'Total')), ...rows.map(([n, h, t]) => el('tr', { class: t === low ? 'lead' : '' }, el('td', {}, n), el('td', {}, `+${h}`), el('td', {}, t))));
  if (over) {
    const w = H.winners(s);
    const won = w.includes(0);
    const stats = store.get('stats', { played: 0, won: 0 });
    stats.played++;
    if (won) stats.won++;
    store.set('stats', stats);
    if (won) sfx.win();
    openDialog({
      title: won ? 'You win!' : `${w.map((k) => NAMES[k]).join(' and ')} ${w.length > 1 ? 'win' : 'wins'}`,
      className: 'results',
      body: el('div', {}, el('div', { class: 'stamp show' }, medal(won ? 'trophy' : 'medal')), table, el('p', { class: 'result-note' }, `Won ${stats.won} of ${stats.played} games`)),
      actions: [{ label: 'New game', value: 'new', primary: true }],
    }).then(() => newGame());
    return;
  }
  const moonNote = s.moon != null ? el('p', { class: 'result-note' }, `${NAMES[s.moon]} shot the moon!`) : null;
  openDialog({
    title: `Hand ${s.round + 1} done`,
    body: el('div', {}, moonNote, table),
    actions: [{ label: 'Next hand', value: 'next', primary: true }],
  }).then(() => {
    s = H.nextRound(s);
    save();
    step();
  });
}

// ---------- Drawing ----------

const table = $('table');
const svgUse = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
function cardEl(id, cls = '') {
  const card = H.CARDS[id];
  const rank = RANK_LABELS[card.rank];
  const suit = `suit-${card.suit}`;
  const c = el('div', { class: `card up ${isRed(card.suit) ? 'red' : 'black'}${card.rank > 10 ? ' court' : ''} ${cls}`, dataset: { id }, role: 'button', 'aria-label': cardName(card) });
  c.innerHTML = `<div class="card-inner"><div class="card-face"><div class="idx"><span class="r${rank === '10' ? ' ten' : ''}">${rank}</span>${svgUse(suit, 's')}</div>${svgUse(card.rank > 10 ? `court-${card.rank}` : suit, 'center')}</div><div class="card-back"></div></div>`;
  return c;
}

function seat(k, side = false) {
  const turn = s.phase === 'play' && s.turn === k && !showing;
  return el(
    'div',
    { class: `seat${side ? ' side' : ''}${turn ? ' turn' : ''}` },
    el('div', { class: 'who' }, NAMES[k], el('small', {}, `${s.scores[k]}${s.taken[k] ? ` (+${s.taken[k]})` : ''}`)),
    el('div', { class: 'backs' }, ...s.hands[k].map(() => el('i'))),
  );
}

let lastPitCount = 0;
function render() {
  // Card size: your 13 cards should fit across the screen.
  const W = table.clientWidth || 360;
  const H2 = table.clientHeight || 600;
  const cw = Math.floor(Math.min(84, W / 5.2, H2 / 6.6));
  const ch = Math.round(cw * 1.4);
  const n = Math.max(1, s.hands[0].length);
  const overlap = Math.min(4, (W - 16 - cw) / Math.max(1, n - 1) - cw);
  table.style.setProperty('--cw', `${cw}px`);
  table.style.setProperty('--ch', `${ch}px`);
  table.style.setProperty('--overlap', `${overlap}px`);

  const pitCards = showing ? showing.cards : s.trick;
  const pit = el('div', { class: 'pit' }, ...pitCards.map((t, i) => cardEl(t.card, `s${t.seat}${showing && t.seat === showing.winner ? ' win' : ''}${!showing && i >= lastPitCount ? ' in' : ''}`)));
  lastPitCount = showing ? 0 : pitCards.length;

  const legal = s.phase === 'play' && s.turn === 0 && !showing ? new Set(H.legal(s)) : null;
  const hand = el(
    'div',
    { class: 'hand' },
    ...s.hands[0].map((id) => {
      const cls = [];
      if (selected.includes(id)) cls.push('up-sel');
      if (s.phase === 'play' && !(legal && legal.has(id))) cls.push('no');
      if (s.received?.includes(id) && s.tricks === 0) cls.push('new');
      const c = cardEl(id, cls.join(' '));
      c.addEventListener('click', () => tapCard(id));
      return c;
    }),
  );
  let status = '';
  if (s.phase === 'pass') status = `Choose 3 cards to pass ${s.passDir} (${selected.length}/3)`;
  else if (showing) status = `${NAMES[showing.winner]} ${showing.winner === 0 ? 'take' : 'takes'} the trick`;
  else if (s.phase === 'play') status = s.turn === 0 ? (s.tricks === 0 && !s.trick.length ? 'You lead with the 2♣' : 'Your turn') : `${NAMES[s.turn]} is thinking…`;
  const passBtn = el('button', { class: 'btn btn-primary', onclick: doPass, disabled: selected.length !== 3 }, `Pass ${s.passDir}`);
  passBtn.hidden = s.phase !== 'pass';
  table.replaceChildren(el('div', { class: 'north' }, seat(2)), el('div', { class: 'middle' }, seat(1, true), pit, seat(3, true)), el('div', { class: 'status-line' }, status), el('div', {}, hand, el('div', { class: 'pass-row' }, passBtn)));
  $('subtitle').textContent = `Hand ${s.round + 1} · first to ${H.GAME_TO} ends it`;
  $('chips').replaceChildren(el('div', { class: 'chip' }, el('small', {}, 'You'), el('b', {}, s.scores[0])), el('div', { class: 'chip' }, el('small', {}, 'Hand'), el('b', {}, `+${s.taken[0]}`)));
  $('last-btn').disabled = !s.lastTrick;
}

// ---------- Menus ----------

function scores() {
  openDialog({
    title: 'Scores',
    body: el('table', { class: 'score-table' }, el('tr', {}, el('th', {}, ''), el('th', {}, 'This hand'), el('th', {}, 'Total')), ...[0, 1, 2, 3].map((k) => el('tr', {}, el('td', {}, NAMES[k]), el('td', {}, `+${s.taken[k]}`), el('td', {}, s.scores[k])))),
  });
}

function lastTrick() {
  if (!s.lastTrick) return;
  const w = H.trickWinner(s.lastTrick);
  toast(`Last trick: ${s.lastTrick.map((t) => `${NAMES[t.seat]} ${RANK_LABELS[H.CARDS[t.card].rank]}${'♠♥♣♦'[H.CARDS[t.card].suit]}`).join(', ')}. ${NAMES[w]} took it.`, { duration: 4000 });
}

function openMenu() {
  const stats = store.get('stats', { played: 0, won: 0 });
  openDialog({
    title: 'Hearts',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, 'Each hand, pass three cards (left, right, across, then keep). The 2♣ leads the first trick; follow suit if you can, otherwise play anything. The highest card of the suit led takes the trick.'),
      el('p', {}, 'Every heart you take is a point and the Q♠ is 13. Lowest score wins when someone reaches 100. Hearts can’t be led until one has been played. Take all 26 points to shoot the moon: everyone else gets 26 instead.'),
      el('div', { class: 'stat-grid' }, el('div', { class: 'stat' }, el('b', {}, stats.played), el('span', {}, 'Games')), el('div', { class: 'stat' }, el('b', {}, stats.won), el('span', {}, 'Won'))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Speed'), segmented('speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], settings.get('speed'), (v) => settings.set('speed', v))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
}

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('scores-btn').addEventListener('click', scores);
$('scores-btn').prepend(icon('chart', { size: 22 }));
$('last-btn').addEventListener('click', lastTrick);
$('last-btn').prepend(icon('tiles', { size: 22 }));
$('new-btn').addEventListener('click', async () => {
  const ok = await openDialog({ title: 'Start a new game?', body: 'This game will be lost.', actions: [{ label: 'Keep playing', value: null }, { label: 'New game', value: 'yes', primary: true }] });
  if (ok === 'yes') newGame();
});
$('new-btn').prepend(icon('shuffle', { size: 22 }));
new ResizeObserver(() => s && render()).observe(table);

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

const saved = store.get('game');
if (saved?.hands) {
  s = saved;
  step();
} else newGame();
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openMenu();
}

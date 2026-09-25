import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { icon, medal } from './core/icons.js';
import { randomSeed } from './core/rng.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import { injectSprite } from './js/art.js';
import { RANK_LABELS, isRed, cardName } from './js/cards.js';
import * as S from './js/spades.js';

const NAMES = ['You', 'Wren', 'Otto', 'Iris'];
const TEAMS = ['You & Otto', 'Wren & Iris'];
const store = makeStore('spades');
const ach = makeAchievements('spades', ACHIEVEMENTS);
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
  take(ours) {
    const ac = audio();
    if (ac) tone(ac, { freq: ours ? 660 : 330, duration: 0.1, gain: 0.035, type: 'triangle' });
  },
  nope: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Game ----------

let s = null;
let showing = null;
let timer = null;

function newGame() {
  clearTimeout(timer);
  s = S.newGame(randomSeed());
  showing = null;
  save();
  step();
}
const save = () => store.set('game', s);

function step() {
  clearTimeout(timer);
  render();
  if (s.phase === 'bid' && s.turn !== 0) timer = setTimeout(() => placeBid(S.chooseBid(s)), 450 * pace());
  else if (s.phase === 'play' && s.turn !== 0 && !showing) timer = setTimeout(() => play(S.choosePlay(s)), 520 * pace());
  else if (s.phase === 'done' || s.phase === 'over') timer = setTimeout(roundOver, 500 * pace());
}

function placeBid(n) {
  const who = s.turn;
  s = S.bid(s, n);
  announce(`${NAMES[who]} ${who === 0 ? 'bid' : 'bids'} ${n === 0 ? 'nil' : n}.`);
  sfx.card();
  save();
  step();
}

function play(card) {
  const res = S.playCard(s, card);
  if (!res) return sfx.nope();
  s = res.state;
  sfx.card();
  save();
  if (res.events.trick) {
    const { winner } = res.events.trick;
    showing = { cards: s.lastTrick, winner };
    render();
    timer = setTimeout(() => {
      sfx.take(S.teamOf(winner) === 0);
      showing = null;
      step();
    }, 950 * pace());
    return;
  }
  step();
}

function tapCard(card) {
  if (s.phase !== 'play' || s.turn !== 0 || showing) return;
  if (!S.legal(s).includes(card)) {
    sfx.nope();
    return toast(s.trick.length ? 'You must follow suit if you can.' : 'Spades can’t lead until they’ve been played.', { duration: 1800 });
  }
  play(card);
}

function roundOver() {
  const r = s.last;
  // Achievements for the hand just played.
  ach.add('hands-100');
  if (r[0].made) ach.unlock('made-bid');
  if (r[1].made === false) ach.unlock('set');
  if (s.bids[0] === 0 && s.taken[0] === 0) ach.unlock('nil');
  if (s.bids[0] >= 6 && r[0].made) ach.unlock('big-bid');
  if (r[0].bagPenalty) store.set('bagged', true);

  const over = s.phase === 'over';
  const line = (team) => {
    const x = r[team];
    const bid = [team, team + 2].map((k) => (s.bids[k] === 0 ? 'nil' : s.bids[k])).join(' + ');
    const took = s.taken[team] + s.taken[team + 2];
    return el('tr', {}, el('td', {}, TEAMS[team]), el('td', {}, bid), el('td', {}, took), el('td', {}, `${x.points > 0 ? '+' : ''}${x.points}${x.bagPenalty ? ' −100' : ''}`), el('td', {}, s.scores[team]));
  };
  const table = el('table', { class: 'score-table' }, el('tr', {}, el('th', {}, ''), el('th', {}, 'Bid'), el('th', {}, 'Took'), el('th', {}, 'Hand'), el('th', {}, 'Total')), line(0), line(1));
  const notes = [...r[0].nils, ...r[1].nils].map((n) => el('p', { class: 'result-note' }, `${NAMES[n.seat]} ${n.ok ? 'made' : 'broke'} nil (${n.ok ? '+' : '−'}100)`));
  if (over) {
    const w = S.winner(s);
    const won = w === 0;
    const stats = store.get('stats', { played: 0, won: 0 });
    stats.played++;
    if (won) {
      stats.won++;
      ach.unlock('first-win');
      ach.add('wins-10');
      if (!store.get('bagged')) ach.unlock('no-bags');
      sfx.win();
    }
    store.remove('bagged');
    store.set('stats', stats);
    openDialog({
      title: won ? 'You and Otto win!' : w === 1 ? 'Wren and Iris win' : 'A tie!',
      className: 'results',
      body: el('div', {}, el('div', { class: 'stamp show' }, medal(won ? 'trophy' : 'medal')), table, notes, el('p', { class: 'result-note' }, `Won ${stats.won} of ${stats.played} games`)),
      actions: [{ label: 'New game', value: 'new', primary: true }],
    }).then(() => newGame());
    return;
  }
  openDialog({
    title: `Hand ${s.round + 1} done`,
    body: el('div', {}, table, notes, el('p', { class: 'result-note' }, `Bags: ${s.bags[0]} (you) · ${s.bags[1]} (them). Ten bags cost 100.`)),
    actions: [{ label: 'Next hand', value: 'next', primary: true }],
  }).then(() => {
    s = S.nextRound(s);
    save();
    step();
  });
}

// ---------- Drawing ----------

const table = $('table');
const svgUse = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
function cardEl(id, cls = '') {
  const card = S.CARDS[id];
  const rank = RANK_LABELS[card.rank];
  const suit = `suit-${card.suit}`;
  const c = el('div', { class: `card up ${isRed(card.suit) ? 'red' : 'black'}${card.rank > 10 ? ' court' : ''} ${cls}`, dataset: { id }, role: 'button', 'aria-label': cardName(card) });
  c.innerHTML = `<div class="card-inner"><div class="card-face"><div class="idx"><span class="r${rank === '10' ? ' ten' : ''}">${rank}</span>${svgUse(suit, 's')}</div>${svgUse(card.rank > 10 ? `court-${card.rank}` : suit, 'center')}</div><div class="card-back"></div></div>`;
  return c;
}

const bidText = (k) => (s.bids[k] == null ? '–' : s.bids[k] === 0 ? 'nil' : s.bids[k]);
function seat(k, side = false) {
  const turn = s.turn === k && !showing && (s.phase === 'bid' || s.phase === 'play');
  return el(
    'div',
    { class: `seat${side ? ' side' : ''}${turn ? ' turn' : ''}${k === 2 ? ' partner' : ''}` },
    el('div', { class: 'who' }, NAMES[k], k === 2 ? el('span', { class: 'team' }, 'partner') : null, el('small', {}, `${s.taken[k]}/${bidText(k)}`)),
    el('div', { class: 'backs' }, ...s.hands[k].map(() => el('i'))),
  );
}

let lastPit = 0;
function render() {
  const W = table.clientWidth || 360;
  const H2 = table.clientHeight || 600;
  const cw = Math.floor(Math.min(84, W / 5.2, H2 / 6.6));
  const n = Math.max(1, s.hands[0].length);
  table.style.setProperty('--cw', `${cw}px`);
  table.style.setProperty('--ch', `${Math.round(cw * 1.4)}px`);
  table.style.setProperty('--overlap', `${Math.min(4, (W - 16 - cw) / Math.max(1, n - 1) - cw)}px`);

  const pitCards = showing ? showing.cards : s.trick;
  const pit = el('div', { class: 'pit' }, ...pitCards.map((t, i) => cardEl(t.card, `s${t.seat}${showing && t.seat === showing.winner ? ' win' : ''}${!showing && i >= lastPit ? ' in' : ''}`)));
  lastPit = showing ? 0 : pitCards.length;

  const legal = s.phase === 'play' && s.turn === 0 && !showing ? new Set(S.legal(s)) : null;
  const hand = el(
    'div',
    { class: 'hand' },
    ...s.hands[0].map((id) => {
      const c = cardEl(id, s.phase === 'play' && !(legal && legal.has(id)) ? 'no' : '');
      c.addEventListener('click', () => tapCard(id));
      return c;
    }),
  );
  let status = '';
  let below = null;
  if (s.phase === 'bid') {
    if (s.turn === 0) {
      status = 'Your bid: how many tricks will you take?';
      const hint = S.chooseBid(s, 0);
      below = el('div', { class: 'bid-pad' }, el('button', { class: `btn nil${hint === 0 ? ' suggest' : ''}`, onclick: () => placeBid(0) }, 'Nil'), ...Array.from({ length: 13 }, (_, k) => el('button', { class: `btn${hint === k + 1 ? ' suggest' : ''}`, onclick: () => placeBid(k + 1) }, k + 1)));
    } else status = `${NAMES[s.turn]} is bidding…`;
  } else if (showing) status = `${NAMES[showing.winner]} ${showing.winner === 0 ? 'take' : 'takes'} the trick`;
  else if (s.phase === 'play') status = s.turn === 0 ? 'Your turn' : `${NAMES[s.turn]} is thinking…`;
  table.replaceChildren(el('div', { class: 'north' }, seat(2)), el('div', { class: 'middle' }, seat(1, true), pit, seat(3, true)), el('div', { class: 'status-line' }, status), el('div', {}, hand, el('div', { class: 'pass-row' }, below)));
  $('subtitle').textContent = `Hand ${s.round + 1} · to ${S.GAME_TO}`;
  const teamBid = (t) => [t, t + 2].reduce((a, k) => a + (s.bids[k] || 0), 0);
  $('chips').replaceChildren(
    el('div', { class: 'chip' }, el('small', {}, 'Us'), el('b', {}, s.scores[0])),
    el('div', { class: 'chip' }, el('small', {}, 'Them'), el('b', {}, s.scores[1])),
  );
  $('chips').title = `Tricks: us ${s.taken[0] + s.taken[2]}/${teamBid(0)}, them ${s.taken[1] + s.taken[3]}/${teamBid(1)}`;
  $('last-btn').disabled = !s.lastTrick;
}

// ---------- Menus ----------

function scores() {
  openDialog({
    title: 'Scores',
    body: el(
      'table',
      { class: 'score-table' },
      el('tr', {}, el('th', {}, ''), el('th', {}, 'Bid'), el('th', {}, 'Took'), el('th', {}, 'Bags'), el('th', {}, 'Total')),
      ...[0, 1].map((t) => el('tr', {}, el('td', {}, TEAMS[t]), el('td', {}, [t, t + 2].map(bidText).join(' + ')), el('td', {}, s.taken[t] + s.taken[t + 2]), el('td', {}, s.bags[t]), el('td', {}, s.scores[t]))),
    ),
  });
}

function lastTrick() {
  if (!s.lastTrick) return;
  const w = S.trickWinner(s.lastTrick);
  toast(`Last trick: ${s.lastTrick.map((t) => `${NAMES[t.seat]} ${RANK_LABELS[S.CARDS[t.card].rank]}${'♠♥♣♦'[S.CARDS[t.card].suit]}`).join(', ')}. ${NAMES[w]} took it.`, { duration: 4000 });
}

function openMenu() {
  const stats = store.get('stats', { played: 0, won: 0 });
  openDialog({
    title: 'Spades',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, 'You and Otto (across from you) play against Wren and Iris. Everyone bids how many tricks they’ll take; your team needs the total of your two bids. Nil means you’ll take none at all (+100 if you manage, −100 if not).'),
      el('p', {}, 'Follow suit if you can. Spades are trumps: the highest spade wins, otherwise the highest card of the suit led. Spades can’t be led until one has been played. Making the bid scores 10 a trick, each extra trick is a bag (1 point), and every 10 bags cost 100. First team to 500 wins.'),
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
if (saved?.hands && saved.bids) {
  s = saved;
  step();
} else newGame();
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openMenu();
}

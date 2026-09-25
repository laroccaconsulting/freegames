import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, shareText, parseHash, buildHash } from './core/golf.js';
import { icon, withIcon, medal } from './core/icons.js';
import { mulberry32, randomSeed } from './core/rng.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';
import * as Y from './js/yacht.js';
import * as T from './js/tenk.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('dice');
const ach = makeAchievements('dice', ACHIEVEMENTS);
const settings = makeSettings(store, { theme: null, sound: true, fast: false });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wait = (ms) => new Promise((r) => setTimeout(r, settings.get('fast') || reduced.matches ? ms / 3 : ms));

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
  roll(n) {
    const ac = audio();
    if (!ac) return;
    for (let i = 0; i < 4 + n; i++) noiseBurst(ac, { duration: 0.03, freq: 1200 + Math.random() * 1600, q: 2, gain: 0.25, when: i * 0.05 + Math.random() * 0.02 });
  },
  hold() {
    const ac = audio();
    if (ac) tone(ac, { freq: 880, duration: 0.06, gain: 0.04 });
  },
  score(points) {
    const ac = audio();
    if (!ac) return;
    const notes = points >= 40 ? [523.25, 659.25, 783.99, 1046.5] : points > 0 ? [659.25, 880] : [220];
    notes.forEach((f, i) => tone(ac, { freq: f, duration: 0.18, gain: 0.05, when: i * 0.07 }));
  },
  bust: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Shared: dice ----------

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function dieEl(value, { held = false, used = false, onclick, rolling = false, label } = {}) {
  const face = el('span', { class: 'face' }, ...Array.from({ length: 9 }, (_, k) => el('i', { class: value && PIPS[value].includes(k) ? 'pip' : '' })));
  return el('button', { class: `die ${held ? 'held' : ''} ${used ? 'used' : ''} ${rolling ? 'rolling' : ''} ${value ? '' : 'blank'}`, onclick, 'aria-label': label || (value ? `Die showing ${value}${held ? ', held' : ''}` : 'Die'), 'aria-pressed': held ? 'true' : 'false', disabled: !onclick }, face);
}

// ---------- Game state ----------

// Yacht:   { mode: 'yacht', seed, daily, players: [{ name, kind, card }], turn, round, dice, held, rolls, over }
// Tenk:    { mode: 'tenk', players: [{ name, kind, score }], turn, dice, picked, aside, turnPoints, phase, over, seed, n }
let game = null;
let busy = false;
let rollingFlag = false;
const save = () => game && store.set('game', game);

function playersFor(setup) {
  if (setup.opponents === 'solo') return [{ name: 'You', kind: 'you' }];
  if (setup.opponents === 'bot') return [{ name: 'You', kind: 'you' }, { name: 'Computer', kind: 'bot' }];
  return Array.from({ length: Number(setup.count) || 2 }, (_, k) => ({ name: `Player ${k + 1}`, kind: 'human' }));
}

function newYacht(setup = {}) {
  const daily = setup.daily || null;
  const seed = daily ? dailySeed('dice-yacht', daily) : randomSeed();
  const players = (daily ? [{ name: 'You', kind: 'you' }] : playersFor(setup)).map((p) => ({ ...p, card: {} }));
  game = { mode: 'yacht', seed, daily, players, turn: 0, round: 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0, over: false };
  if (daily) game.target = Y.total(Y.botGame(seed, mulberry32(seed)));
  save();
  render();
  maybeBot();
}

function newTenk(setup = {}) {
  const players = playersFor(setup.opponents === 'solo' ? { ...setup, opponents: 'bot' } : setup).map((p) => ({ ...p, score: 0 }));
  game = { mode: 'tenk', players, turn: 0, dice: [], picked: [], aside: [], turnPoints: 0, phase: 'start', over: false, seed: randomSeed(), n: 0 };
  save();
  render();
  maybeBot();
}

const current = () => game.players[game.turn];
const isBotTurn = () => !game.over && current().kind === 'bot';
// Each player's Yacht dice come from their own seeded stream.
const yachtSeed = () => (game.daily ? game.seed : game.seed + game.turn * 1009);

// ---------- Yacht moves ----------

async function yachtRoll() {
  if (busy || game.over || game.rolls >= 3 || game.held.every(Boolean)) return;
  busy = true;
  rollingFlag = true;
  sfx.roll(game.held.filter((h) => !h).length);
  render();
  await wait(420);
  game.dice = Y.roll(yachtSeed(), game.round, game.rolls, game.dice, game.held);
  game.rolls++;
  rollingFlag = false;
  busy = false;
  save();
  render();
  announce(`Rolled ${game.dice.join(', ')}. ${3 - game.rolls} roll${3 - game.rolls === 1 ? '' : 's'} left.`);
}

function yachtHold(k) {
  if (busy || game.over || !game.rolls || game.rolls >= 3) return;
  game.held = game.held.map((h, j) => (j === k ? !h : h));
  sfx.hold();
  save();
  render();
}

async function yachtScore(id) {
  if (busy || game.over || !game.rolls) return;
  const p = current();
  if (p.card[id] != null) return;
  const pts = Y.scoreBox(id, game.dice);
  p.card = Y.score(p.card, id, game.dice);
  sfx.score(pts);
  announce(`${p.name} ${p.kind === 'you' ? 'score' : 'scores'} ${pts} in ${Y.BOXES.find((b) => b.id === id).name}.`);
  // Next player; a new round when everyone has gone.
  game.held = [false, false, false, false, false];
  game.dice = [0, 0, 0, 0, 0];
  game.rolls = 0;
  game.turn = (game.turn + 1) % game.players.length;
  if (game.turn === 0) game.round++;
  if (game.players.every((q) => Y.finished(q.card))) game.over = true;
  save();
  render();
  if (game.over) finishYacht();
  else maybeBot();
}

async function yachtBot() {
  const random = mulberry32(game.seed + game.round * 31 + game.turn);
  await wait(500);
  await yachtRoll();
  for (let r = 1; r < 3; r++) {
    await wait(700);
    const held = Y.chooseHold(current().card, game.dice, 3 - r, random);
    if (held.every(Boolean)) break;
    game.held = held;
    render();
    await wait(500);
    await yachtRoll();
  }
  await wait(700);
  await yachtScore(Y.bestBox(current().card, game.dice));
}

function finishYacht() {
  const totals = game.players.map((p) => Y.total(p.card));
  const top = Math.max(...totals);
  const winners = game.players.filter((_, k) => totals[k] === top);
  sfx.win();
  const you = totals[0];
  ach.unlock('yacht-game');
  const mine = game.players[0].card;
  if (mine.yacht === 50) ach.unlock('yacht');
  if (Y.upperTotal(mine) >= Y.UPPER_TARGET) ach.unlock('bonus');
  ach.at('yacht-250', totals[0]);
  if (game.players.length > 1 && totals[0] === top && game.players.some((p) => p.kind === 'bot')) ach.unlock('yacht-beat');
  if (game.daily) ach.unlock('daily');
  if (game.players.length === 1) {
    const best = store.get('best-yacht', 0);
    if (you > best) store.set('best-yacht', you);
    if (game.daily) {
      const log = store.get('daily-yacht', {});
      if (!log[game.daily]) store.set('daily-yacht', { ...log, [game.daily]: { score: you, target: game.target } });
    }
  }
  const title = game.players.length === 1 ? (game.daily ? (you > game.target ? 'You beat the computer!' : you === game.target ? 'Tied with the computer' : 'Game over') : 'Game over') : winners.length > 1 ? 'A tie!' : `${winners[0].name} ${winners[0].kind === 'you' ? 'win' : 'wins'}!`;
  const lines = game.players.map((p, k) => `${p.name}: ${totals[k]}`);
  if (game.daily) lines.push(`Computer on the same dice: ${game.target}`);
  const text = game.daily ? `Dice · Yacht Daily #${dailyNumber(game.daily, LAUNCH_DAY)} ${you > game.target ? '🏆' : '🎲'}\n${you} points · computer ${game.target}` : `Dice · Yacht: ${you} points`;
  setTimeout(() => {
    openDialog({
      title,
      className: 'results',
      body: el(
        'div',
        {},
        el('div', { class: 'stamp show' }, medal(game.daily ? (you > game.target ? 'trophy' : 'check') : 'star')),
        lines.map((l) => el('p', { class: 'result-note' }, l)),
        game.players.length === 1 && el('p', { class: 'result-note' }, `Your best: ${Math.max(you, store.get('best-yacht', 0))}`),
        game.players.length === 1 && el('button', { class: 'btn share-btn', onclick: async () => (await shareText(text, location.origin + location.pathname + (game.daily ? buildHash({ d: game.daily }) : ''))) === 'copied' && toast('Result copied') }, icon('share'), 'Share result'),
      ),
      actions: [
        { label: 'See the card', value: null },
        { label: 'Play again', value: 'again', primary: true },
      ],
    }).then((v) => v === 'again' && newYacht(store.get('setup-yacht', { opponents: 'solo' })));
  }, 800);
}

// ---------- Ten Thousand moves ----------

function tenkRandom() {
  game.n++;
  return mulberry32(game.seed + game.n * 7919);
}

async function tenkRoll() {
  if (busy || game.over) return;
  if (game.phase === 'choose') {
    // Set aside the picked dice first; they must all score.
    const pickedDice = game.picked.map((k) => game.dice[k]);
    const pts = T.scoreSet(pickedDice);
    if (!pts) {
      sfx.bust();
      toast(game.picked.length ? 'Every die you set aside has to score.' : 'Set aside at least one scoring die first.');
      return;
    }
    game.turnPoints += pts;
    game.aside = [...game.aside, ...pickedDice];
  }
  const left = game.phase === 'start' || game.aside.length >= 6 ? 6 : 6 - game.aside.length;
  if (game.aside.length >= 6) game.aside = []; // hot dice: all six again
  busy = true;
  rollingFlag = true;
  game.picked = [];
  sfx.roll(left);
  render();
  await wait(450);
  const random = tenkRandom();
  game.dice = Array.from({ length: left }, () => 1 + Math.floor(random() * 6));
  rollingFlag = false;
  busy = false;
  if (!T.scores(game.dice)) {
    game.phase = 'bust';
    sfx.bust();
    save();
    render();
    announce(`Rolled ${game.dice.join(', ')}. Nothing scores: turn lost.`);
    await wait(1400);
    endTenkTurn(false);
    return;
  }
  game.phase = 'choose';
  save();
  render();
  announce(`Rolled ${game.dice.join(', ')}. Set aside scoring dice.`);
}

function tenkPick(k) {
  if (busy || game.over || game.phase !== 'choose' || isBotTurn()) return;
  game.picked = game.picked.includes(k) ? game.picked.filter((j) => j !== k) : [...game.picked, k];
  sfx.hold();
  save();
  render();
}

function tenkBank() {
  if (busy || game.over || game.phase !== 'choose') return;
  const pts = T.scoreSet(game.picked.map((k) => game.dice[k]));
  if (!pts) {
    sfx.bust();
    toast('Set aside scoring dice to bank them.');
    return;
  }
  game.turnPoints += pts;
  endTenkTurn(true);
}

function endTenkTurn(banked) {
  const p = current();
  if (banked) {
    p.score += game.turnPoints;
    sfx.score(game.turnPoints);
    announce(`${p.name} ${p.kind === 'you' ? 'bank' : 'banks'} ${game.turnPoints}.`);
  }
  if (p.score >= T.TARGET) {
    game.over = true;
    save();
    render();
    finishTenk();
    return;
  }
  game.turn = (game.turn + 1) % game.players.length;
  game.dice = [];
  game.aside = [];
  game.picked = [];
  game.turnPoints = 0;
  game.phase = 'start';
  save();
  render();
  maybeBot();
}

async function tenkBot() {
  const others = Math.max(...game.players.filter((q) => q !== current()).map((q) => q.score));
  await wait(500);
  await tenkRoll();
  for (let guard = 0; guard < 30 && game.phase === 'choose' && isBotTurn(); guard++) {
    await wait(800);
    const b = T.best(game.dice);
    game.picked = b.pick;
    render();
    await wait(600);
    const after = game.turnPoints + b.points;
    const left = game.aside.length + b.pick.length >= 6 ? 6 : 6 - game.aside.length - b.pick.length;
    if (T.shouldBank(after, left, current().score, others)) {
      tenkBank();
      return;
    }
    await tenkRoll();
  }
}

function finishTenk() {
  const w = current();
  sfx.win();
  const stats = store.get('stats-tenk', { played: 0, won: 0 });
  if (game.players.some((p) => p.kind === 'bot')) {
    stats.played++;
    if (w.kind === 'you') stats.won++;
    if (w.kind === 'you') {
      ach.unlock('tenk-win');
      ach.add('tenk-5');
    }
    store.set('stats-tenk', stats);
  }
  setTimeout(() => {
    openDialog({
      title: `${w.name} ${w.kind === 'you' ? 'win' : 'wins'}!`,
      className: 'results',
      body: el('div', {}, el('div', { class: 'stamp show' }, medal(w.kind === 'bot' ? 'check' : 'trophy')), game.players.map((p) => el('p', { class: 'result-note' }, `${p.name}: ${p.score.toLocaleString()}`))),
      actions: [
        { label: 'See the table', value: null },
        { label: 'Play again', value: 'again', primary: true },
      ],
    }).then((v) => v === 'again' && newTenk(store.get('setup-tenk', { opponents: 'bot' })));
  }, 700);
}

// ---------- Computer turns ----------

async function maybeBot() {
  if (!game || !isBotTurn() || busy) return;
  if (game.mode === 'yacht') await yachtBot();
  else await tenkBot();
}

// ---------- Screen ----------

function render() {
  if (!game) return;
  if (game.mode === 'yacht') renderYacht();
  else renderTenk();
}

function renderYacht() {
  const p = current();
  const bot = isBotTurn();
  const canHold = !bot && game.rolls > 0 && game.rolls < 3 && !game.over;
  const dice = el('div', { class: 'dice-row' }, game.dice.map((d, k) => dieEl(d, { held: game.held[k], rolling: rollingFlag && !game.held[k], onclick: canHold ? () => yachtHold(k) : null })));
  const rollBtn = el('button', { class: 'btn btn-primary roll-btn', onclick: yachtRoll, disabled: bot || game.over || game.rolls >= 3 || busy }, game.rolls === 0 ? 'Roll' : game.rolls >= 3 ? 'Choose a box' : `Roll again (${3 - game.rolls} left)`);
  const rows = Y.BOXES.map((b) => {
    const used = p.card[b.id];
    const preview = used == null && game.rolls ? Y.scoreBox(b.id, game.dice) : null;
    return el(
      'button',
      { class: `box ${used != null ? 'used' : ''} ${preview ? 'good' : ''} ${b.upper ? 'upper' : ''}`, onclick: used == null && game.rolls && !bot ? () => yachtScore(b.id) : null, disabled: used != null || !game.rolls || bot },
      el('span', {}, b.name),
      el('b', {}, used != null ? used : preview != null ? preview : ''),
    );
  });
  const upper = Y.upperTotal(p.card);
  const card = el(
    'div',
    { class: 'card' },
    el('div', { class: 'card-col' }, rows.slice(0, 6), el('div', { class: 'bonus' }, el('span', {}, `Bonus (${upper}/${Y.UPPER_TARGET})`), el('b', {}, upper >= Y.UPPER_TARGET ? Y.UPPER_BONUS : '–'))),
    el('div', { class: 'card-col' }, rows.slice(6), p.card.extra ? el('div', { class: 'bonus' }, el('span', {}, 'Extra Yachts'), el('b', {}, p.card.extra)) : null),
  );
  const players = el('div', { class: 'players' }, game.players.map((q, k) => el('div', { class: `player ${k === game.turn && !game.over ? 'turn' : ''}` }, el('b', {}, q.name), el('small', {}, Y.total(q.card)))), game.daily ? el('div', { class: 'player target' }, el('b', {}, 'Target'), el('small', {}, game.target)) : null);
  $('stage').replaceChildren(players, dice, rollBtn, card);
  $('title').textContent = game.daily ? `Yacht · Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : 'Yacht';
  $('subtitle').textContent = game.over ? 'Game over' : `Round ${game.round + 1} of 13 · ${bot ? 'Computer’s turn' : p.kind === 'you' ? 'Your turn' : `${p.name}’s turn`}`;
}

function renderTenk() {
  const p = current();
  const bot = isBotTurn();
  const choosing = game.phase === 'choose';
  const pickedPts = T.scoreSet(game.picked.map((k) => game.dice[k]));
  const dice = el(
    'div',
    { class: 'dice-row six' },
    game.dice.length ? game.dice.map((d, k) => dieEl(d, { held: game.picked.includes(k), rolling: rollingFlag, onclick: choosing && !bot ? () => tenkPick(k) : null })) : Array.from({ length: 6 }, () => dieEl(0, { rolling: rollingFlag })),
  );
  const aside = el('div', { class: 'aside' }, el('small', {}, 'Set aside'), game.aside.map((d) => dieEl(d, { used: true })));
  const left = game.phase === 'start' ? 6 : game.aside.length + game.picked.length >= 6 ? 6 : 6 - game.aside.length - game.picked.length;
  const actions = el(
    'div',
    { class: 'tenk-actions' },
    el('button', { class: 'btn', onclick: tenkBank, disabled: bot || !choosing || !pickedPts }, `Bank ${(game.turnPoints + pickedPts).toLocaleString()}`),
    el('button', { class: 'btn btn-primary', onclick: tenkRoll, disabled: bot || busy || game.over || game.phase === 'bust' || (choosing && !pickedPts) }, game.phase === 'start' ? 'Roll 6 dice' : `Roll ${left} dice`),
  );
  const msg = game.phase === 'bust' ? 'Nothing scores. Turn lost!' : choosing ? (pickedPts ? `This turn: ${game.turnPoints.toLocaleString()} + ${pickedPts.toLocaleString()}` : `This turn: ${game.turnPoints.toLocaleString()}. Tap scoring dice to set them aside.`) : bot ? 'The computer is rolling…' : `${p.kind === 'you' ? 'Your' : `${p.name}’s`} turn. Roll to start.`;
  const players = el('div', { class: 'players' }, game.players.map((q, k) => el('div', { class: `player ${k === game.turn && !game.over ? 'turn' : ''}` }, el('b', {}, q.name), el('small', {}, q.score.toLocaleString()), el('i', { class: 'progress', style: `--p: ${Math.min(1, q.score / T.TARGET)}` }))));
  $('stage').replaceChildren(players, el('p', { class: `tenk-msg ${game.phase === 'bust' ? 'bust' : ''}` }, msg), dice, actions, aside, el('p', { class: 'muted small scoring' }, '1 = 100 · 5 = 50 · three of a kind = 100 × face (1s: 1,000) · each extra doubles · straight or three pairs = 1,500'));
  $('title').textContent = 'Ten Thousand';
  $('subtitle').textContent = game.over ? 'Game over' : `First to ${T.TARGET.toLocaleString()}`;
}

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function setupDialog(mode) {
  const key = `setup-${mode}`;
  const setup = { opponents: mode === 'yacht' ? 'solo' : 'bot', count: '2', ...store.get(key) };
  const opts = mode === 'yacht' ? [['solo', 'Solo'], ['bot', 'Computer'], ['local', 'Pass & play']] : [['bot', 'Computer'], ['local', 'Pass & play']];
  const countRow = el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Players'), segmented('count', [['2', '2'], ['3', '3'], ['4', '4']], setup.count, (v) => (setup.count = v)));
  countRow.hidden = setup.opponents !== 'local';
  openDialog({
    title: mode === 'yacht' ? 'Yacht' : 'Ten Thousand',
    body: el('div', {}, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Play'), segmented('opp', opts, setup.opponents, (v) => ((setup.opponents = v), (countRow.hidden = v !== 'local')))), countRow),
    actions: [{ label: 'Start', value: 'go', primary: true }],
  }).then((v) => {
    if (v !== 'go') return;
    store.set(key, setup);
    if (mode === 'yacht') newYacht(setup);
    else newTenk(setup);
  });
}

function openMenu() {
  const key = dateKey();
  const done = store.get('daily-yacht', {})[key];
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  openDialog({
    title: 'Dice',
    body: el(
      'div',
      {},
      el(
        'div',
        { class: 'menu-list' },
        menuCard('calendar', `Daily Yacht #${dailyNumber(key, LAUNCH_DAY)}`, done ? `You scored ${done.score} · computer ${done.target}` : 'Same dice for everyone. Beat the computer’s score on them', go(() => newYacht({ daily: key }))),
        menuCard('grid', 'Yacht', `Five dice, three rolls, thirteen boxes${store.get('best-yacht') ? ` · best ${store.get('best-yacht')}` : ''}`, go(() => setupDialog('yacht'))),
        menuCard('flame', 'Ten Thousand', 'Push your luck to 10,000', go(() => setupDialog('tenk'))),
      ),
      el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'Rules'))),
    ),
  });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el('div', {}, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)), toggle('Fast computer turns', settings.get('fast'), (v) => settings.set('fast', v)), toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v))),
  });
}

function openHelp() {
  openDialog({
    title: 'Rules',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, el('b', {}, 'Yacht. '), 'Roll five dice up to three times a turn, holding any you like between rolls, then score them in one empty box. Upper boxes count one face. Reach 63 there for a 35 bonus. Three and four of a kind score all five dice; full house 25; small straight (four in a row) 30; large straight 40; Yacht (five of a kind) 50, and each extra Yacht adds 100. Chance is any dice. Thirteen rounds.'),
      el('p', {}, el('b', {}, 'Ten Thousand. '), 'Roll six dice. Set aside at least one scoring die, then roll the rest or bank your turn’s points. Roll nothing that scores and the turn’s points are lost. Score with all six and you may roll all six again. 1 = 100, 5 = 50, three of a kind = 100 × the face (three 1s = 1,000), each extra die of the kind doubles it, and a straight or three pairs is 1,500. First to 10,000 wins.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('menu-btn').prepend(icon('levels', { size: 22 }));
$('rules-btn').addEventListener('click', openHelp);
$('rules-btn').prepend(icon('help', { size: 22 }));

document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = Number(e.key);
  if (e.key === ' ' || e.key === 'r') {
    if (game.mode === 'yacht') yachtRoll();
    else tenkRoll();
  } else if (k >= 1 && k <= 6) {
    if (game.mode === 'yacht' && k <= 5) yachtHold(k - 1);
    else if (game.mode === 'tenk') tenkPick(k - 1);
  } else if (e.key === 'b' && game.mode === 'tenk') tenkBank();
  else return;
  e.preventDefault();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

const h = parseHash(location.hash);
const saved = store.get('game');
if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) {
  history.replaceState(null, '', location.pathname + location.search);
  newYacht({ daily: h.d > dateKey() ? dateKey() : h.d });
} else if (saved && !saved.over && (saved.mode === 'yacht' || saved.mode === 'tenk')) {
  game = saved;
  rollingFlag = false;
  render();
  maybeBot();
} else newYacht({ daily: dateKey() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

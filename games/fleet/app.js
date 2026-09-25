import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, rating, overText, squares, hashSeed } from './core/golf.js';
import { showResults, note } from './core/results.js';
import { icon, withIcon } from './core/icons.js';
import { mulberry32, randomSeed } from './core/rng.js';
import { SIZE, SHIPS, SHIP_NAMES, cellsOf, randomFleet, fire, allSunk, afloat, aim, heat, parFor } from './js/fleet.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('fleet');
const settings = makeSettings(store, { theme: null, sound: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const cellName = (i) => `${'ABCDEFGHIJ'[i % SIZE]}${Math.floor(i / SIZE) + 1}`;

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
  miss() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.25, freq: 600, q: 0.5, gain: 0.25 });
  },
  hit() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.3, freq: 180, q: 0.6, gain: 0.7 });
    tone(ac, { freq: 90, duration: 0.3, gain: 0.12, type: 'triangle' });
  },
  sunk() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.6, freq: 120, q: 0.5, gain: 0.8 });
    [196, 164.8, 130.8].forEach((f, i) => tone(ac, { freq: f, duration: 0.3, gain: 0.06, when: 0.15 + i * 0.12, type: 'triangle' }));
  },
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (ac) [392, 329.6, 261.6].forEach((freq, i) => tone(ac, { freq, duration: 0.35, gain: 0.06, when: i * 0.14, type: 'triangle' }));
  },
};

// ---------- Game ----------

// Battle: { mode: 'battle', level, phase: 'setup' | 'play' | 'over', mine, theirs, myShots (at them), theirShots (at me), turn: 'me' | 'them', seed, hints }
// Solo:   { mode: 'solo', daily | n, theirs, myShots, par, hints, done }
let game = null;
let busy = false;
let hintCell = -1;

const save = () => game && store.set('game', game);

function newBattle(level = store.get('level', 'medium')) {
  const seed = randomSeed();
  const random = mulberry32(seed);
  game = { mode: 'battle', level, phase: 'setup', mine: randomFleet(random), theirs: randomFleet(random), myShots: {}, theirShots: {}, turn: 'me', seed, hints: 0 };
  store.set('level', level);
  hintCell = -1;
  save();
  build();
  announce('Place your fleet: shuffle until you like it, then start.');
}

function newSolo(spec) {
  const seed = spec.daily ? dailySeed('fleet', spec.daily) : hashSeed(`fleet:${spec.n}`);
  const theirs = randomFleet(mulberry32(seed));
  game = { mode: 'solo', ...spec, theirs, myShots: {}, par: parFor(theirs, seed), hints: 0, done: false };
  hintCell = -1;
  save();
  build();
  announce(`${soloTitle()}. Sink every ship. Par ${game.par} shots.`);
}

const soloTitle = () => (game.daily ? `Daily #${dailyNumber(game.daily, LAUNCH_DAY)}` : `Sea #${game.n}`);
const shotsTaken = (shots) => Object.keys(shots).length;

// ---------- Firing ----------

async function shoot(i) {
  if (busy || !game) return;
  if (game.mode === 'battle' && (game.phase !== 'play' || game.turn !== 'me')) return;
  if (game.mode === 'solo' && game.done) return;
  if (game.myShots[i]) {
    toast(`Already fired at ${cellName(i)}`);
    return;
  }
  hintCell = -1;
  const r = fire(game.theirs, game.myShots, i);
  game.myShots = r.shots;
  splash(i, r.result);
  announce(`${cellName(i)}: ${r.result === 'sunk' ? `sunk their ${SHIP_NAMES[r.ship.len]}!` : r.result}.`);
  if (r.result === 'sunk') toast(`You sank their ${SHIP_NAMES[r.ship.len]}!`);
  if (allSunk(game.theirs, game.myShots)) {
    if (game.mode === 'battle') game.phase = 'over';
    else game.done = true;
    save();
    render();
    finish(true);
    return;
  }
  if (game.mode === 'battle') {
    game.turn = 'them';
    save();
    render();
    busy = true;
    await wait(reduced.matches ? 300 : 800);
    busy = false;
    theirTurn();
  } else {
    save();
    render();
  }
}

function theirTurn() {
  if (!game || game.mode !== 'battle' || game.phase !== 'play') return;
  const random = mulberry32(game.seed + shotsTaken(game.theirShots) * 7);
  const i = aim(game.theirShots, afloat(game.mine, game.theirShots), game.level, random);
  const r = fire(game.mine, game.theirShots, i);
  game.theirShots = r.shots;
  splash(i, r.result, true);
  announce(`The computer fires at ${cellName(i)}: ${r.result === 'sunk' ? `your ${SHIP_NAMES[r.ship.len]} is sunk` : r.result}.`);
  if (r.result === 'sunk') toast(`They sank your ${SHIP_NAMES[r.ship.len]}`);
  if (allSunk(game.mine, game.theirShots)) {
    game.phase = 'over';
    save();
    render();
    finish(false);
    return;
  }
  game.turn = 'me';
  save();
  render();
}

function splash(i, result, mine = false) {
  if (result === 'miss') sfx.miss();
  else if (result === 'hit') sfx.hit();
  else sfx.sunk();
  const cell = document.querySelector(`${mine ? '#my-sea' : '#their-sea'} .cell[data-i="${i}"]`);
  if (cell && !reduced.matches) {
    cell.classList.remove('boom', 'plop');
    void cell.offsetWidth;
    cell.classList.add(result === 'miss' ? 'plop' : 'boom');
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function hint() {
  if (!game || (game.mode === 'battle' && (game.phase !== 'play' || game.turn !== 'me')) || (game.mode === 'solo' && game.done)) return;
  const h = heat(game.myShots, afloat(game.theirs, game.myShots));
  let best = -1;
  for (let i = 0; i < h.length; i++) if (!game.myShots[i] && (best < 0 || h[i] > h[best])) best = i;
  hintCell = best;
  game.hints++;
  save();
  render();
  const hunting = !Object.values(game.myShots).includes('hit');
  toast(hunting ? `${cellName(best)}: more of the ships still afloat could be hiding there than anywhere else.` : `${cellName(best)}: in line with your hit, where the rest of the ship most likely lies.`, { duration: 5000 });
}

// ---------- Results ----------

function finish(won) {
  if (game.mode === 'battle') {
    const stats = store.get('stats', {});
    const s = (stats[game.level] ||= { played: 0, won: 0, best: 0 });
    s.played++;
    if (won) {
      s.won++;
      const n = shotsTaken(game.myShots);
      s.best = s.best ? Math.min(s.best, n) : n;
    }
    store.set('stats', stats);
    if (won) setTimeout(sfx.win, 400);
    else setTimeout(sfx.lose, 400);
    setTimeout(() => {
      openDialog({
        title: won ? 'Victory!' : 'Your fleet is sunk',
        body: el('p', {}, won ? `You sank the computer’s fleet in ${shotsTaken(game.myShots)} shots.` : `The computer found all your ships in ${shotsTaken(game.theirShots)} shots. Their remaining ships are shown.`),
        actions: [{ label: 'See the seas', value: null }, { label: 'Play again', value: 'again', primary: true }],
      }).then((v) => v === 'again' && newBattle(game.level));
    }, 900);
    return;
  }
  const n = shotsTaken(game.myShots);
  if (game.daily) {
    const log = store.get('daily', {});
    if (!log[game.daily]) store.set('daily', { ...log, [game.daily]: { n, par: game.par, hints: game.hints } });
  }
  sfx.win();
  const r0 = rating(n, game.par);
  const r = game.hints ? { ...r0, label: 'Sunk with help', emoji: '💡', icon: 'bulb', tier: Math.min(r0.tier, 1) } : r0;
  const notes = [];
  if (game.daily) {
    const s = dailyStreak(store.get('daily', {}), dateKey());
    if (s) notes.push(note(`${s}-day streak`, { icon: 'flame' }));
  }
  if (game.challenge) {
    const diff = Number(game.challenge) - n;
    notes.push(note(diff > 0 ? `You beat your friend by ${diff}!` : diff === 0 ? 'Tied with your friend' : `Your friend did it in ${game.challenge}`, { win: diff > 0, icon: diff > 0 ? 'trophy' : diff === 0 ? 'equal' : 'flag' }));
  }
  const current = game;
  setTimeout(
    () =>
      showResults({
        title: soloTitle(),
        rating: r,
        reels: [{ label: 'Shots', value: n }, { label: 'Par', value: game.par }],
        squares: squares(n, game.par),
        notes,
        share: () => ({
          text: `Fleet · ${soloTitle()} ${r.emoji}\n${n} shots · par ${game.par} (${overText(n - game.par)})${game.hints ? ` · 💡${game.hints}` : ''}\n${squares(n, game.par)}`,
          url: location.origin + location.pathname + buildHash(game.daily ? { d: game.daily, s: n } : { n: game.n, s: n }),
        }),
        actions: [{ label: 'See the sea', value: null }, { label: 'Next sea →', value: 'next', primary: true }],
        reduced: reduced.matches,
      }).then((v) => v === 'next' && current === game && newSolo({ n: nextNumber() })),
    700,
  );
}

function nextNumber() {
  const n = store.get('next', 1);
  store.set('next', n + 1);
  return n;
}

// ---------- Screen ----------

function sea(id, label, onTap) {
  const grid = el('div', { class: 'sea', id, role: 'grid', 'aria-label': label });
  for (let i = 0; i < SIZE * SIZE; i++) grid.append(el('button', { class: 'cell', dataset: { i }, 'aria-label': cellName(i), onclick: onTap ? () => onTap(i) : null, tabindex: onTap ? null : -1 }));
  return el('div', { class: 'sea-wrap' }, el('div', { class: 'cols', 'aria-hidden': 'true' }, ...'ABCDEFGHIJ'.split('').map((c) => el('span', {}, c))), el('div', { class: 'sea-row' }, el('div', { class: 'rows', 'aria-hidden': 'true' }, ...Array.from({ length: SIZE }, (_, k) => el('span', {}, k + 1))), grid));
}

function build() {
  const parts = [];
  if (game.mode === 'battle' && game.phase === 'setup') {
    parts.push(el('p', { class: 'lead' }, 'Your fleet. Shuffle until you like it, then start the battle.'), el('div', { class: 'big' }, sea('my-sea', 'Your fleet')), el('div', { class: 'setup-actions' }, el('button', { class: 'btn', onclick: shuffle }, withIcon('shuffle', 'Shuffle')), el('button', { class: 'btn btn-primary', onclick: startBattle }, 'Start battle')));
  } else {
    parts.push(el('div', { class: 'big' }, sea('their-sea', 'Enemy waters', shoot)), el('div', { class: 'status-row' }, el('div', { class: 'afloat', id: 'afloat' }), game.mode === 'battle' ? el('div', { class: 'small-sea' }, el('small', {}, 'Your fleet'), sea('my-sea', 'Your fleet')) : null));
  }
  $('stage').replaceChildren(...parts);
  render();
}

function shuffle() {
  game.mine = randomFleet(mulberry32(randomSeed()));
  save();
  render();
}

function startBattle() {
  game.phase = 'play';
  game.turn = 'me';
  save();
  build();
  announce('Battle on. Tap enemy waters to fire.');
}

function paint(gridId, ships, shots, { reveal = false } = {}) {
  const grid = $(gridId);
  if (!grid) return;
  const owner = new Map();
  ships.forEach((s, k) => cellsOf(s).forEach((i, j) => owner.set(i, { k, j, s })));
  for (const cell of grid.children) {
    const i = Number(cell.dataset.i);
    const shot = shots[i];
    const o = owner.get(i);
    const showShip = o && (reveal || shot === 'sunk');
    cell.className = `cell ${cell.classList.contains('boom') ? 'boom' : ''} ${cell.classList.contains('plop') ? 'plop' : ''}`;
    if (showShip) {
      cell.classList.add('ship', o.s.across ? 'across' : 'down');
      if (o.j === 0) cell.classList.add('bow');
      if (o.j === o.s.len - 1) cell.classList.add('stern');
    }
    if (shot) cell.classList.add(shot);
    if (gridId === 'their-sea' && i === hintCell) cell.classList.add('hint');
    cell.setAttribute('aria-label', `${cellName(i)}${shot ? `, ${shot}` : showShip ? ', ship' : ''}`);
  }
}

function render() {
  if (!game) return;
  const battle = game.mode === 'battle';
  if (battle) {
    paint('my-sea', game.mine, game.theirShots, { reveal: true });
    paint('their-sea', game.theirs, game.myShots, { reveal: game.phase === 'over' });
  } else paint('their-sea', game.theirs, game.myShots, { reveal: game.done });
  const a = $('afloat');
  if (a) a.replaceChildren(el('small', {}, game.mode === 'battle' ? 'Enemy ships' : 'Still afloat'), ...SHIPS.map((len, k) => el('span', { class: `ship-pip ${k < SHIPS.length && isSunkIndex(k) ? 'gone' : ''}`, style: `--len: ${len}`, title: SHIP_NAMES[len] })));
  $('title').textContent = battle ? 'Fleet' : soloTitle();
  $('subtitle').textContent = battle ? `vs computer · ${LEVEL_NAMES[game.level]}` : `Solo: sink them all${game.daily ? streakText() : ''}`;
  const shots = shotsTaken(game.myShots);
  $('score').replaceChildren(el('div', { class: 'chip' }, el('small', {}, 'Shots'), el('b', {}, shots)), battle ? el('div', { class: 'chip' }, el('small', {}, 'Afloat'), el('b', {}, `${afloat(game.mine, game.theirShots).length}`)) : el('div', { class: 'chip' }, el('small', {}, 'Par'), el('b', {}, game.par)));
  const status = $('status');
  if (battle) status.textContent = game.phase === 'setup' ? '' : game.phase === 'over' ? (allSunk(game.theirs, game.myShots) ? 'Victory!' : 'Defeat.') : game.turn === 'me' ? 'Your shot: tap enemy waters.' : 'The computer is aiming…';
  else status.textContent = game.done ? 'All ships sunk!' : shots ? '' : 'Tap the sea to fire. Ships never touch, not even at the corners.';
  $('hint-btn').disabled = battle ? game.phase !== 'play' || game.turn !== 'me' : game.done;
}

// Which of the SHIPS (by index) the player has sunk.
function isSunkIndex(k) {
  const len = SHIPS[k];
  const sameBefore = SHIPS.slice(0, k).filter((x) => x === len).length;
  const sunkOfLen = game.theirs.filter((s) => s.len === len && cellsOf(s).every((i) => game.myShots[i] === 'sunk')).length;
  return sunkOfLen > sameBefore;
}

const streakText = () => {
  const s = dailyStreak(store.get('daily', {}), dateKey());
  return s ? ` · ${s}-day streak` : '';
};

// ---------- Menus ----------

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = dateKey();
  const done = store.get('daily', {})[key];
  let dialog;
  const go = (fn) => () => {
    dialog?.closeWith?.(null);
    fn();
  };
  const level = store.get('level', 'medium');
  const levelPick = segmented('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], level, (v) => store.set('level', v));
  const body = el(
    'div',
    {},
    el(
      'div',
      { class: 'menu-list' },
      menuCard('flag', 'Battle the computer', 'Take turns firing; sink their fleet first', go(() => newBattle(store.get('level', 'medium')))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Computer'), levelPick),
      menuCard('calendar', `Daily sea #${dailyNumber(key, LAUNCH_DAY)}`, done ? `Sunk in ${done.n} shots (par ${done.par})` : 'Solo: sink them all in fewer shots than par', go(() => newSolo({ daily: key }))),
      menuCard('infinity', 'New sea', 'Solo, endless', go(() => newSolo({ n: nextNumber() }))),
    ),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: go(openStats) }, withIcon('chart', 'Stats')), el('button', { class: 'btn', onclick: go(openSettings) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: go(openHelp) }, withIcon('help', 'Rules'))),
  );
  openDialog({ title: 'Fleet', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openStats() {
  const stats = store.get('stats', {});
  const stat = (v, l) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l));
  const log = store.get('daily', {});
  openDialog({
    title: 'Stats',
    body: el(
      'div',
      {},
      ...['easy', 'medium', 'hard'].map((lv) => {
        const s = stats[lv] || { played: 0, won: 0, best: 0 };
        return el('div', { class: 'field' }, el('span', { class: 'field-label' }, `${LEVEL_NAMES[lv]} computer`), el('div', { class: 'stat-grid' }, stat(s.played, 'Played'), stat(s.played ? `${Math.round((100 * s.won) / s.played)}%` : '–', 'Won'), stat(s.best || '–', 'Fewest shots')));
      }),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Daily sea'), el('div', { class: 'stat-grid' }, stat(Object.keys(log).length, 'Played'), stat(dailyStreak(log, dateKey()), 'Streak'), stat(Object.values(log).filter((r) => r.n <= r.par && !r.hints).length, 'At par'))),
    ),
  });
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
      el('p', {}, 'Each side hides five ships on a 10×10 sea: 5, 4, 3, 3 and 2 squares long, across or down. Ships never touch each other, not even at the corners.'),
      el('p', {}, 'Tap a square to fire. A splash is a miss, a flame is a hit. When every square of a ship is hit, it sinks, and the water round it is marked as clear.'),
      el('p', {}, el('b', {}, 'Battle:'), ' take turns with the computer. Sink its fleet before it sinks yours.'),
      el('p', {}, el('b', {}, 'Solo:'), ' sink a hidden fleet in as few shots as you can. Par is how many shots a sharp computer needed. The daily sea is the same for everyone.'),
      el('p', { class: 'muted' }, 'Tip: until you find a ship, fire on a checkerboard pattern. Every ship covers at least one of those squares.'),
    ),
  });
}

// ---------- Wiring ----------

$('menu-btn').addEventListener('click', openMenu);
$('mode-btn').addEventListener('click', openMenu);
$('hint-btn').addEventListener('click', hint);
$('new-btn').addEventListener('click', () => (game?.mode === 'solo' ? newSolo({ n: nextNumber() }) : newBattle(game?.level)));
$('hint-btn').prepend(icon('bulb', { size: 22 }));
$('new-btn').prepend(icon('infinity', { size: 22 }));
$('menu-btn').prepend(icon('levels', { size: 22 }));

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

function fromLink() {
  const h = parseHash(location.hash);
  if (!h.d && !h.n) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const challenge = /^\d+$/.test(h.s || '') ? Number(h.s) : null;
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { daily: h.d > dateKey() ? dateKey() : h.d, challenge };
  if (Number(h.n) >= 1) return { n: Math.floor(Number(h.n)), challenge };
  return null;
}

const link = fromLink();
const saved = store.get('game');
if (link) {
  newSolo(link.daily ? { daily: link.daily } : { n: link.n });
  game.challenge = link.challenge;
  save();
} else if (saved && (saved.mode === 'battle' || saved.mode === 'solo') && saved.theirs) {
  game = saved;
  build();
  if (game.mode === 'battle' && game.phase === 'play' && game.turn === 'them') setTimeout(theirTurn, 600);
} else newSolo({ daily: dateKey() });
if (!store.get('welcomed')) {
  store.set('welcomed', true);
  openHelp();
}

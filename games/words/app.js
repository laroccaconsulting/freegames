import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast, formatTime } from './core/ui.js';
import { sounds, setSoundEnabled, audio, tone, noiseBurst } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { dateKey, dailyNumber, dailySeed, dailyStreak, parseHash, buildHash, shareText, hashSeed } from './core/golf.js';
import { icon, withIcon, medal } from './core/icons.js';
import { makeDict } from './js/dict.js';
import * as codeword from './js/codeword.js';
import * as wheel from './js/wheel.js';

const LAUNCH_DAY = '2026-09-25';
const store = makeStore('words');
const settings = makeSettings(store, { theme: null, sound: true, autoNext: true });
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};
const $ = (id) => document.getElementById(id);
const announce = (text) => ($('announce').textContent = text);

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
  key() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.025, freq: 3200, q: 1.5, gain: 0.12 });
  },
  good(len = 4) {
    const ac = audio();
    if (!ac) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    for (let i = 0; i < Math.min(notes.length, len - 2); i++) tone(ac, { freq: notes[i], duration: 0.25, gain: 0.05, when: i * 0.06 });
  },
  bad: () => sounds.invalid(),
  win: () => sounds.win(),
};

// ---------- Words ----------

let dict = null;
async function loadDict() {
  const [w, c] = await Promise.all(['data/words.txt', 'data/common.txt'].map((f) => fetch(f).then((r) => r.text())));
  dict = makeDict(w, c);
}

// ---------- Puzzles ----------

// spec: { mode: 'codeword' | 'wheel', daily: 'YYYY-MM-DD' } or { mode, n } (numbered puzzles)
const specId = (s) => `${s.mode}:${s.daily ? `d${s.daily}` : `n${s.n}`}`;
const seedOf = (s) => (s.daily ? dailySeed(`words-${s.mode}`, s.daily) : hashSeed(`words-${s.mode}:${s.n}`));
const titleOf = (s) => `${s.mode === 'codeword' ? 'Codeword' : 'Word Wheel'} ${s.daily ? `· Daily #${dailyNumber(s.daily, LAUNCH_DAY)}` : `#${s.n}`}`;
const today = () => dateKey();

let spec = null;
let puzzle = null;
let play = null; // saved progress for this puzzle

function open(next) {
  spec = next;
  store.set('last', spec);
  const seed = seedOf(spec);
  puzzle = spec.mode === 'codeword' ? codeword.generate(dict, seed) : wheel.generate(dict, seed);
  const saved = store.get(`p:${specId(spec)}`);
  play = spec.mode === 'codeword' ? { guesses: {}, hints: 0, checks: 0, time: 0, done: false, ...saved } : { found: [], revealed: false, done: false, ...saved };
  if (spec.mode === 'codeword') startCodeword();
  else startWheel();
  $('title').textContent = spec.mode === 'codeword' ? 'Codeword' : 'Word Wheel';
  $('subtitle').textContent = spec.daily ? `Daily #${dailyNumber(spec.daily, LAUNCH_DAY)}${streakText()}` : `Puzzle #${spec.n}`;
  announce(titleOf(spec));
}

const save = () => spec && store.set(`p:${specId(spec)}`, play);
const streakText = () => {
  const s = dailyStreak(store.get(`daily-${spec.mode}`, {}), today());
  return s ? ` · ${s}-day streak` : '';
};

function markDaily(result) {
  if (!spec.daily) return;
  const log = store.get(`daily-${spec.mode}`, {});
  if (!log[spec.daily]) store.set(`daily-${spec.mode}`, { ...log, [spec.daily]: result });
}

function tool(id, name, label, onClick) {
  const b = el('button', { class: 'tool', id, onclick: onClick }, icon(name, { size: 22 }), el('span', {}, label));
  return b;
}

// ---------- Codeword ----------

let selected = null; // the number being filled in
let wrong = [];
let clock = null;

function startCodeword() {
  selected = null;
  wrong = [];
  const size = puzzle.size;
  const grid = el('div', { class: 'cw-grid', style: `--n: ${size}`, role: 'grid', 'aria-label': 'Codeword grid' });
  puzzle.cells.forEach((l, i) => {
    if (!l) {
      grid.append(el('div', { class: 'cw-block' }));
      return;
    }
    const n = puzzle.code[l];
    grid.append(el('button', { class: 'cw-cell', dataset: { i, n }, onclick: () => select(n), 'aria-label': `Number ${n}` }, el('small', {}, n), el('b', {})));
  });
  const keyStrip = el('div', { class: 'cw-key', 'aria-label': 'Code key' });
  const nums = Object.values(puzzle.code).sort((a, b) => a - b);
  for (const n of nums) keyStrip.append(el('button', { class: 'cw-keycell', dataset: { n }, onclick: () => select(n) }, el('small', {}, n), el('b', {})));
  const kb = el('div', { class: 'kb' });
  for (const row of ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']) {
    const r = el('div', { class: 'kb-row' });
    for (const ch of row) r.append(el('button', { class: 'kb-key', dataset: { l: ch }, onclick: () => type(ch) }, ch.toUpperCase()));
    kb.append(r);
  }
  kb.lastChild.append(el('button', { class: 'kb-key wide', onclick: () => type(''), 'aria-label': 'Clear' }, '⌫'));
  $('stage').replaceChildren(el('div', { class: 'cw' }, grid, keyStrip, kb));
  $('toolbar').replaceChildren(
    tool('check-btn', 'check', 'Check', check),
    tool('hint-btn', 'bulb', 'Reveal', reveal),
    tool('new-btn', 'infinity', 'New', () => open({ mode: 'codeword', n: nextNumber('codeword') })),
    tool('menu-btn', 'levels', 'Menu', openMenu),
  );
  const first = nums.find((n) => !givenNumber(n) && !play.guesses[n]);
  if (first && !play.done) select(first);
  renderCodeword();
  clearInterval(clock);
  let last = Date.now();
  clock = setInterval(() => {
    const now = Date.now();
    if (spec?.mode === 'codeword' && !play.done && document.visibilityState === 'visible') {
      play.time += (now - last) / 1000;
      if (Math.round(play.time) % 5 === 0) save();
    }
    last = now;
  }, 1000);
}

const givenNumber = (n) => puzzle.given.some((l) => puzzle.code[l] === n);
const letterOf = (n) => Object.keys(puzzle.code).find((l) => puzzle.code[l] === n);

function select(n) {
  if (play.done || givenNumber(n)) {
    if (givenNumber(n)) toast(`${n} is ${letterOf(n).toUpperCase()}: given at the start`);
    return;
  }
  selected = n;
  renderCodeword();
}

function type(letter) {
  if (play.done || selected == null) return;
  const guesses = { ...play.guesses };
  if (letter) {
    if (puzzle.given.includes(letter)) {
      sfx.bad();
      toast(`${letter.toUpperCase()} is already given`);
      return;
    }
    // A letter belongs to one number: move it if it was used elsewhere.
    for (const [n, l] of Object.entries(guesses)) if (l === letter) delete guesses[n];
    guesses[selected] = letter;
  } else delete guesses[selected];
  play.guesses = guesses;
  wrong = wrong.filter((n) => n !== selected);
  sfx.key();
  if (letter && settings.get('autoNext')) {
    const nums = Object.values(puzzle.code).sort((a, b) => a - b);
    const next = nums.find((n) => n > selected && !givenNumber(n) && !guesses[n]) ?? nums.find((n) => !givenNumber(n) && !guesses[n]);
    if (next != null) selected = next;
  }
  save();
  renderCodeword();
  if (codeword.isSolved(puzzle, play.guesses)) finishCodeword();
}

function check() {
  if (play.done) return;
  wrong = codeword.mistakes(puzzle, play.guesses);
  play.checks++;
  save();
  renderCodeword();
  toast(wrong.length ? `${wrong.length} letter${wrong.length > 1 ? 's are' : ' is'} wrong` : 'Everything so far is right');
}

function reveal() {
  if (play.done) return;
  const target = selected != null && play.guesses[selected] !== letterOf(selected) ? selected : Object.values(puzzle.code).find((n) => !givenNumber(n) && play.guesses[n] !== letterOf(n));
  if (target == null) return;
  const l = letterOf(target);
  const guesses = { ...play.guesses };
  for (const [n, g] of Object.entries(guesses)) if (g === l) delete guesses[n];
  guesses[target] = l;
  play.guesses = guesses;
  play.hints++;
  selected = target;
  save();
  renderCodeword();
  announce(`${target} is ${l.toUpperCase()}`);
  if (codeword.isSolved(puzzle, play.guesses)) finishCodeword();
}

function renderCodeword() {
  const used = new Set([...Object.values(play.guesses), ...puzzle.given]);
  for (const cell of document.querySelectorAll('.cw-cell')) {
    const i = Number(cell.dataset.i);
    const n = Number(cell.dataset.n);
    cell.querySelector('b').textContent = codeword.shown(puzzle, play.guesses, i).toUpperCase();
    cell.classList.toggle('sel', n === selected);
    cell.classList.toggle('given', givenNumber(n));
    cell.classList.toggle('wrong', wrong.includes(n));
  }
  for (const k of document.querySelectorAll('.cw-keycell')) {
    const n = Number(k.dataset.n);
    k.querySelector('b').textContent = (givenNumber(n) ? letterOf(n) : play.guesses[n] || '').toUpperCase();
    k.classList.toggle('sel', n === selected);
    k.classList.toggle('given', givenNumber(n));
    k.classList.toggle('wrong', wrong.includes(n));
  }
  for (const k of document.querySelectorAll('.kb-key[data-l]')) k.classList.toggle('used', used.has(k.dataset.l));
  const total = Object.keys(puzzle.code).length;
  const filled = Object.values(puzzle.code).filter((n) => givenNumber(n) || play.guesses[n]).length;
  $('score').replaceChildren(el('div', { class: 'chip' }, el('small', {}, 'Letters'), el('b', {}, `${filled}/${total}`)));
}

function finishCodeword() {
  play.done = true;
  selected = null;
  save();
  renderCodeword();
  markDaily({ time: Math.round(play.time), hints: play.hints });
  sfx.win();
  document.querySelector('.cw-grid')?.classList.add('solved');
  const clean = !play.hints && !play.checks;
  const text = `Words · ${titleOf(spec)} ${clean ? '💎' : '✅'}\nCracked in ${formatTime(play.time)}${play.hints ? ` · 💡${play.hints}` : ''}${play.checks ? ` · ✔︎${play.checks}` : ''}`;
  setTimeout(() => results({ title: 'Code cracked!', medalIcon: clean ? 'diamond' : 'check', lines: [`Time: ${formatTime(play.time)}`, play.hints ? `Letters revealed: ${play.hints}` : 'No letters revealed', play.checks ? `Checks: ${play.checks}` : null], text }), 900);
}

// ---------- Word Wheel ----------

let entry = []; // indexes into the wheel letters (0..7 outer, 8 centre)

function startWheel() {
  entry = [];
  const letters = [...puzzle.letters, puzzle.centre];
  const ring = el('div', { class: 'wheel', role: 'group', 'aria-label': 'Letters' });
  letters.forEach((l, i) => {
    const angle = (i / 8) * 360;
    ring.append(el('button', { class: `wl ${i === 8 ? 'centre' : ''}`, dataset: { i }, style: i < 8 ? `--a: ${angle}deg` : '', onclick: () => addLetter(i) }, l.toUpperCase()));
  });
  $('stage').replaceChildren(
    el(
      'div',
      { class: 'wh' },
      el('div', { class: 'wh-progress' }, el('div', { class: 'bar' }, el('i', {})), el('small', { class: 'bar-label' })),
      el('div', { class: 'wh-entry', id: 'entry', 'aria-live': 'polite' }),
      ring,
      el('div', { class: 'wh-actions' }, el('button', { class: 'btn', onclick: backspace }, 'Delete'), el('button', { class: 'btn', onclick: shuffleWheel }, withIcon('shuffle', 'Shuffle')), el('button', { class: 'btn btn-primary', onclick: submit }, 'Enter')),
      el('div', { class: 'wh-found', id: 'found' }),
    ),
  );
  $('toolbar').replaceChildren(
    tool('reveal-btn', 'flag', 'Answers', revealAnswers),
    tool('new-btn', 'infinity', 'New', () => open({ mode: 'wheel', n: nextNumber('wheel') })),
    tool('help-btn', 'help', 'Rules', openHelp),
    tool('menu-btn', 'levels', 'Menu', openMenu),
  );
  renderWheel();
}

function addLetter(i) {
  if (play.revealed || entry.includes(i)) return;
  entry.push(i);
  sfx.key();
  renderWheel();
}
function backspace() {
  entry.pop();
  renderWheel();
}
function shuffleWheel() {
  const outer = puzzle.letters.split('');
  for (let i = outer.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outer[i], outer[j]] = [outer[j], outer[i]];
  }
  puzzle = { ...puzzle, letters: outer.join('') };
  entry = [];
  startWheel();
}

function submit() {
  if (play.revealed) return;
  const letters = [...puzzle.letters, puzzle.centre];
  const word = entry.map((i) => letters[i]).join('');
  entry = [];
  if (!word) return;
  const why = wheel.check(dict, puzzle, word, play.found);
  if (why) {
    sfx.bad();
    toast(why);
    document.getElementById('entry')?.classList.add('shake');
    setTimeout(() => document.getElementById('entry')?.classList.remove('shake'), 400);
    renderWheel();
    return;
  }
  const before = wheel.level(puzzle, play.found);
  play.found = [...play.found, word];
  const after = wheel.level(puzzle, play.found);
  save();
  sfx.good(word.length);
  const bonus = !puzzle.common.includes(word);
  if (word.length === 9) toast(`${word.toUpperCase()}: the nine-letter word!`);
  else if (after.tier > before.tier) toast(`${after.label}!`);
  else toast(bonus ? `${word}: bonus word` : `${word} +1`, { duration: 1200 });
  renderWheel();
  if (after.tier === 4 && before.tier < 4) finishWheel();
}

function renderWheel() {
  const letters = [...puzzle.letters, puzzle.centre];
  for (const b of document.querySelectorAll('.wl')) b.classList.toggle('used', entry.includes(Number(b.dataset.i)));
  const e = $('entry');
  if (e) e.textContent = entry.map((i) => letters[i]).join('').toUpperCase() || ' ';
  const lv = wheel.level(puzzle, play.found);
  const total = puzzle.common.length;
  const t = wheel.targets(total);
  const bar = document.querySelector('.wh-progress i');
  if (bar) bar.style.width = `${(100 * lv.n) / total}%`;
  const label = document.querySelector('.bar-label');
  if (label) label.textContent = `${lv.label} · ${lv.n} of ${total} words${lv.tier < 4 ? ` · next: ${[t.good, t.great, t.excellent, total][lv.tier]}` : ''}`;
  const found = $('found');
  if (found) {
    const show = play.revealed ? [...new Set([...puzzle.common, ...play.found])].sort() : [...play.found].sort();
    found.replaceChildren(...show.map((w) => el('span', { class: `word ${play.found.includes(w) ? '' : 'missed'} ${w.length === 9 ? 'nine' : ''} ${puzzle.common.includes(w) ? '' : 'bonus'}` }, w)));
  }
  const nine = play.found.some((w) => w.length === 9);
  $('score').replaceChildren(el('div', { class: 'chip' }, el('small', {}, 'Words'), el('b', {}, lv.n)), el('div', { class: `chip ${nine ? 'nine' : ''}` }, el('small', {}, 'Nine'), el('b', {}, nine ? '★' : '–')));
}

async function revealAnswers() {
  if (play.revealed) return;
  const ok = await openDialog({ title: 'Show the answers?', body: 'This ends the puzzle. Words you missed are shown in grey.', actions: [{ label: 'Keep going', value: null }, { label: 'Show answers', value: 'yes', primary: true }] });
  if (ok !== 'yes') return;
  play.revealed = true;
  save();
  renderWheel();
  finishWheel();
}

function finishWheel() {
  play.done = true;
  save();
  const lv = wheel.level(puzzle, play.found);
  const nine = play.found.some((w) => w.length === 9);
  markDaily({ n: lv.n, total: puzzle.common.length, nine });
  if (lv.tier >= 3) sfx.win();
  const text = `Words · ${titleOf(spec)} ${['🌱', '👍', '🌟', '💎', '🧠'][lv.tier]}\n${lv.label}: ${lv.n} of ${puzzle.common.length} words${nine ? ' · found the nine ⭐' : ''}`;
  results({ title: lv.label, medalIcon: ['medal', 'check', 'star', 'diamond', 'trophy'][lv.tier], lines: [`${lv.n} of ${puzzle.common.length} words`, nine ? `Nine-letter word: ${puzzle.nine.toUpperCase()}` : `The nine-letter word was ${puzzle.nine.toUpperCase()}`], text });
}

// ---------- Shared ----------

function results({ title, medalIcon, lines, text }) {
  const url = location.origin + location.pathname + buildHash(spec.daily ? { m: spec.mode, d: spec.daily } : { m: spec.mode, n: spec.n });
  openDialog({
    title,
    className: 'results',
    body: el(
      'div',
      {},
      el('div', { class: 'stamp show' }, medal(medalIcon)),
      lines.filter(Boolean).map((l) => el('p', { class: 'result-note' }, l)),
      spec.daily && el('p', { class: 'result-note' }, icon('flame', { size: 18 }), `${dailyStreak(store.get(`daily-${spec.mode}`, {}), today())}-day streak`),
      el(
        'button',
        {
          class: 'btn share-btn',
          onclick: async () => {
            const how = await shareText(text, url);
            if (how === 'copied') toast('Result copied — paste it anywhere');
          },
        },
        icon('share'),
        'Share result',
      ),
    ),
    actions: [
      { label: 'See the puzzle', value: null },
      { label: 'Next puzzle', value: 'next', primary: true },
    ],
  }).then((v) => v === 'next' && open({ mode: spec.mode, n: nextNumber(spec.mode) }));
}

function nextNumber(mode) {
  const n = store.get(`next-${mode}`, 1);
  store.set(`next-${mode}`, n + 1);
  return n;
}

function menuCard(name, title, sub, onClick) {
  return el('button', { class: 'menu-card', onclick: onClick }, el('span', { class: 'menu-icon' }, icon(name, { size: 24 })), el('span', {}, el('b', {}, title), el('small', {}, sub)));
}

function openMenu() {
  const key = today();
  let dialog;
  const go = (s) => () => {
    dialog?.closeWith?.(null);
    open(s);
  };
  const dailySub = (mode) => {
    const r = store.get(`daily-${mode}`, {})[key];
    const s = dailyStreak(store.get(`daily-${mode}`, {}), key);
    const streak = s ? ` · ${s}-day streak` : '';
    if (!r) return `Same puzzle for everyone today${streak}`;
    return mode === 'codeword' ? `Cracked in ${formatTime(r.time)}${streak}` : `${r.n} of ${r.total} words${streak}`;
  };
  const body = el(
    'div',
    {},
    el(
      'div',
      { class: 'menu-list' },
      menuCard('grid', `Daily Codeword #${dailyNumber(key, LAUNCH_DAY)}`, dailySub('codeword'), go({ mode: 'codeword', daily: key })),
      menuCard('disc', `Daily Word Wheel #${dailyNumber(key, LAUNCH_DAY)}`, dailySub('wheel'), go({ mode: 'wheel', daily: key })),
      menuCard('infinity', 'New Codeword', 'Endless puzzles, each with one solution', go({ mode: 'codeword', n: nextNumber('codeword') })),
      menuCard('infinity', 'New Word Wheel', 'Nine letters, dozens of words', go({ mode: 'wheel', n: nextNumber('wheel') })),
    ),
    el('div', { class: 'menu-row' }, el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openSettings()) }, withIcon('settings', 'Settings')), el('button', { class: 'btn', onclick: () => (dialog?.closeWith?.(null), openHelp()) }, withIcon('help', 'How to play'))),
  );
  openDialog({ title: 'Words', body });
  dialog = document.querySelector('dialog.dialog:last-of-type');
}

function openSettings() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Jump to the next number', settings.get('autoNext'), (v) => settings.set('autoNext', v), 'Codeword: after you type a letter'),
    ),
  });
}

function openHelp() {
  openDialog({
    title: 'How to play',
    body: el(
      'div',
      { class: 'help' },
      el('p', {}, el('b', {}, 'Codeword.'), ' A crossword with no clues: every letter has been swapped for a number, and the same number is always the same letter. A few letters are given. Tap a square, type the letter you think its number stands for, and it fills in everywhere. Every puzzle has exactly one answer.'),
      el('p', {}, el('b', {}, 'Word Wheel.'), ' Make words of four letters or more. Every word must use the middle letter, and each letter only once. One word uses all nine. Rarer words count as bonus words.'),
      el('p', { class: 'muted' }, 'Keyboard: type letters, Backspace deletes, Enter submits. Words come from the public-domain ENABLE list.'),
      el('p', { class: 'muted' }, 'Free forever. No ads, no tracking, works offline.'),
    ),
  });
}

// Physical keyboard.
document.addEventListener('keydown', (e) => {
  if (!spec || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (spec.mode === 'codeword') {
    if (/^[a-z]$/.test(k)) type(k);
    else if (k === 'backspace' || k === 'delete') type('');
    else if (k === 'arrowright' || k === 'arrowleft') {
      const nums = Object.values(puzzle.code).filter((n) => !givenNumber(n)).sort((a, b) => a - b);
      const i = Math.max(0, nums.indexOf(selected));
      select(nums[(i + (k === 'arrowright' ? 1 : -1) + nums.length) % nums.length]);
    } else return;
  } else {
    const letters = [...puzzle.letters, puzzle.centre];
    if (/^[a-z]$/.test(k)) {
      const i = letters.findIndex((l, j) => l === k && !entry.includes(j));
      if (i >= 0) addLetter(i);
      else sfx.bad();
    } else if (k === 'backspace') backspace();
    else if (k === 'enter') submit();
    else if (k === ' ') shuffleWheel();
    else return;
  }
  e.preventDefault();
});

addHubLink();
registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

// ---------- Start ----------

function fromLink() {
  const h = parseHash(location.hash);
  if (h.m !== 'codeword' && h.m !== 'wheel') return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (h.d && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) return { mode: h.m, daily: h.d > today() ? today() : h.d };
  if (Number(h.n) >= 1) return { mode: h.m, n: Math.floor(Number(h.n)) };
  return { mode: h.m, daily: today() };
}

loadDict()
  .then(() => {
    const last = store.get('last');
    open(fromLink() || (last?.n ? last : { mode: last?.mode || 'codeword', daily: today() }));
    if (!store.get('welcomed')) {
      store.set('welcomed', true);
      openHelp();
    }
  })
  .catch(() => ($('loading').textContent = 'Couldn’t load the word list. Check your connection and reload.'));

addEventListener('hashchange', () => {
  const next = fromLink();
  if (next && dict) open(next);
});


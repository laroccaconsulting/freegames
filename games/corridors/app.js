import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, watchSystemTheme, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled, audio, noiseBurst, tone } from './core/sound.js';
import { registerServiceWorker } from './core/pwa.js';
import { parseHash } from './core/golf.js';
import { icon } from './core/icons.js';
import { newGame, applyMove, legalPawnMoves, wallError, moveError, shortestPath, isValidState, hashState } from './js/engine.js';
import { chooseMove, routeChanges } from './js/bot.js';
import { Board, COLORS, COLOR_NAMES } from './js/board.js';
import { ONLINE_SERVER } from './js/config.js';
import { serverBase, createRoom, randomToken, Connection, BUSY } from './js/online.js';

const store = makeStore('corridors');
const settings = makeSettings(store, { theme: 'auto', sound: true, steps: true });
const $ = (id) => document.getElementById(id);

applyTheme(settings.get('theme'));
watchSystemTheme(() => settings.get('theme'));
setSoundEnabled(settings.get('sound'));
settings.onChange((key, value) => {
  if (key === 'theme') applyTheme(value);
  if (key === 'sound') setSoundEnabled(value);
  render();
});

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const BOT_TIME = { easy: 0, medium: 0, hard: 900 };
const REASONS = {
  overlap: 'That wall would overlap or cross another one.',
  'blocks-path': 'Walls can’t cut anyone off from their goal.',
  'no-walls': 'You have no walls left.',
  'out-of-bounds': 'Walls can’t go there.',
  'illegal-pawn': 'Your pawn can’t move there.',
};
const server = () => serverBase(store.get('server') || ONLINE_SERVER);
const announce = (text) => ($('announce').textContent = text);

// ---------- Sounds ----------

const sfx = {
  step: () => sounds.place(),
  wall() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.09, freq: 520, q: 0.7, gain: 0.55 });
    tone(ac, { freq: 110, duration: 0.14, gain: 0.08, type: 'triangle' });
  },
  invalid: () => sounds.invalid(),
  win: () => sounds.win(),
  lose() {
    const ac = audio();
    if (!ac) return;
    [392, 329.6, 261.6].forEach((freq, i) => tone(ac, { freq, duration: 0.35, gain: 0.06, when: i * 0.14, type: 'triangle' }));
  },
};

// ---------- Game ----------

// game.mode: 'bot' | 'local' | 'online'
//   bot/local: { players, level, human, first, state, history, lastMove }
//   online:    { room, state, seats, you, loaded, sending, status, lastMove }
let game = null;
let thinking = false;
let botJob = 0;
let pendingWall = null;
let hint = null;
let conn = null;

const board = new Board($('board'), {
  onCell: (r, c) => tapCell(r, c),
  onWall: (wall, opts) => tapWall(wall, opts),
  onHover: (wall) => hoverWall(wall),
});
$('board').current = () => game; // reachable from browser tests

function playerName(i, { short = false } = {}) {
  if (!game) return COLOR_NAMES[i];
  if (game.mode === 'bot') {
    if (i === game.human) return 'You';
    return game.players === 2 ? 'Computer' : `${COLOR_NAMES[i]} bot`;
  }
  if (game.mode === 'online') {
    if (i === game.you) return 'You';
    const seat = game.seats?.[i];
    return seat ? seat.name : short ? '…' : 'Waiting…';
  }
  return COLOR_NAMES[i];
}

const winsText = (i) => (playerName(i) === 'You' ? 'You win!' : `${playerName(i)} wins!`);

function canAct() {
  if (!game || game.state.winner != null) return false;
  if (game.mode === 'bot') return game.state.turn === game.human && !thinking;
  if (game.mode === 'online') return game.loaded && allSeated() && game.state.turn === game.you && !game.sending;
  return true;
}

const allSeated = () => game.mode !== 'online' || (game.seats.length > 0 && game.seats.every(Boolean));

function startLocal({ mode, players, level = 'medium', first = 'you' }) {
  leaveOnline();
  botJob++;
  thinking = false;
  const human = 0;
  const firstSeat = mode === 'bot' && first === 'computer' ? 1 : 0;
  game = { mode, players, level, human, first, state: newGame(players, { first: firstSeat }), history: [], lastMove: null };
  closeResult();
  board.setRotation(0);
  resetInput();
  save();
  render();
  announce(`New game. ${statusText()}`);
  maybeBot();
}

function save() {
  if (game && game.mode !== 'online') store.set('game', { ...game, history: game.history.slice(-120) });
}

// A result card left open from the last game.
const closeResult = () => document.querySelector('dialog.result-dialog')?.closeWith(null);

function resetInput() {
  pendingWall = null;
  hint = null;
  board.showGhost(null);
}

// A move by the person at this screen.
function humanMove(move) {
  if (!canAct()) return;
  const error = moveError(game.state, move);
  if (error) {
    sfx.invalid();
    toast(REASONS[error] || 'That move isn’t allowed.');
    return;
  }
  if (game.mode === 'online') {
    if (!conn?.send({ type: 'move', move, moveNo: game.state.moveNo })) {
      toast('Not connected. Reconnecting…');
      return;
    }
    game.sending = true;
    resetInput();
    render();
    return;
  }
  commit(move);
}

function commit(move) {
  game.history.push(game.state);
  game.state = applyMove(game.state, move);
  moved(move);
  save();
  maybeBot();
}

// After any move is on the board (local, bot or from the server).
function moved(move) {
  const by = game.state.winner ?? (game.state.turn + game.state.players.length - 1) % game.state.players.length;
  game.lastMove = move;
  resetInput();
  if (move.t === 'wall') sfx.wall();
  else sfx.step();
  render();
  const who = playerName(by);
  const what = move.t === 'wall' ? `placed a wall` : `moved; ${shortestPath(game.state, by)} steps to go`;
  announce(`${who} ${what}. ${statusText()}`);
  if (game.state.winner != null) finished();
}

function finished() {
  const w = game.state.winner;
  const mine = game.mode === 'local' || w === (game.mode === 'bot' ? game.human : game.you);
  if (mine) sfx.win();
  else sfx.lose();
  if (game.mode === 'bot') {
    const stats = store.get('stats', {});
    const s = (stats[game.level] ||= { played: 0, won: 0 });
    s.played++;
    if (w === game.human) s.won++;
    store.set('stats', stats);
  }
  const spectator = game.mode === 'online' && game.you < 0;
  setTimeout(() => {
    if (!game || game.state.winner !== w) return;
    const again = game.mode === 'online' ? (spectator ? null : 'Rematch') : 'Play again';
    openDialog({
      title: winsText(w),
      className: 'result-dialog',
      body: el(
        'div',
        { class: 'result' },
        el('span', { class: 'result-pawn', style: `--pawn: ${COLORS[w]}` }),
        el('p', {}, resultLine(w)),
      ),
      actions: [{ label: 'See the board', value: null }, again && { label: again, value: 'again', primary: true }].filter(Boolean),
    }).then((v) => v === 'again' && playAgain());
  }, 700);
}

function resultLine(w) {
  const moves = Math.ceil(game.state.moveNo / game.state.players.length);
  if (game.mode === 'bot' && w === game.human) {
    const s = store.get('stats', {})[game.level];
    return `You beat the ${LEVEL_NAMES[game.level].toLowerCase()} computer in ${moves} moves.${s ? ` Wins at this level: ${s.won} of ${s.played}.` : ''}`;
  }
  if (game.mode === 'bot') return `The computer got there first. Walls placed early, in front of it, slow it down the most.`;
  return `${playerName(w)} reached the far side in ${moves} moves.`;
}

function playAgain() {
  if (game.mode === 'online') {
    conn?.send({ type: 'rematch' });
    return;
  }
  startLocal(game);
}

// ---------- Computer player ----------

let worker = null;
const jobs = new Map();
let nextId = 1;

function think(state, level, timeMs) {
  return new Promise((resolve) => {
    if (worker === null) {
      try {
        worker = new Worker(new URL('./js/bot-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          jobs.get(data.id)?.resolve(data.move);
          jobs.delete(data.id);
        };
        worker.onerror = () => {
          worker = false;
          for (const job of jobs.values()) job.resolve(chooseMove(job.state, job.level, { timeMs: job.timeMs }));
          jobs.clear();
        };
      } catch {
        worker = false;
      }
    }
    if (!worker) {
      setTimeout(() => resolve(chooseMove(state, level, { timeMs })), 30);
      return;
    }
    const id = nextId++;
    jobs.set(id, { resolve, state, level, timeMs });
    worker.postMessage({ id, state, level, timeMs });
  });
}

function maybeBot() {
  if (!game || game.mode !== 'bot' || game.state.winner != null || game.state.turn === game.human) return;
  const job = ++botJob;
  const before = game.state;
  const started = Date.now();
  thinking = true;
  render();
  think(before, game.level, BOT_TIME[game.level]).then((move) => {
    // A small pause so the computer's moves don't feel instant.
    setTimeout(() => {
      if (job !== botJob || game.state !== before) return;
      thinking = false;
      if (move) commit(move);
      else render();
    }, Math.max(0, 450 - (Date.now() - started)));
  });
}

// ---------- Input ----------

const sameWall = (a, b) => a && b && a.r === b.r && a.c === b.c && a.o === b.o;
let ghostTimer = null;

function tapCell(r, c) {
  if (!canAct()) return;
  if (pendingWall) {
    pendingWall = null;
    board.showGhost(null);
  }
  const target = legalPawnMoves(game.state).some(([tr, tc]) => tr === r && tc === c);
  if (target) humanMove({ t: 'pawn', to: [r, c] });
  else render();
}

function tapWall(wall, { confirm }) {
  if (!canAct()) return;
  clearTimeout(ghostTimer);
  if (confirm || sameWall(pendingWall, wall)) {
    pendingWall = null;
    humanMove({ t: 'wall', ...wall });
    return;
  }
  const error = wallError(game.state, wall);
  if (error) {
    pendingWall = null;
    board.showGhost(wall, { legal: false });
    sfx.invalid();
    toast(REASONS[error]);
    ghostTimer = setTimeout(() => board.showGhost(null), 900);
    return;
  }
  // On touch, the first tap shows the wall and the second places it.
  pendingWall = wall;
  board.showGhost(wall, { pending: true });
  setStatus('Tap the wall again to place it, or tap elsewhere to cancel.');
}

function hoverWall(wall) {
  if (pendingWall) return;
  if (!wall || !canAct()) {
    board.showGhost(hint?.move.t === 'wall' ? hint.move : null, { pending: true });
    return;
  }
  board.showGhost(wall, { legal: !wallError(game.state, wall) });
}

// Arrow keys move your pawn (straight moves and jumps), relative to the screen.
function keyMove(dx, dy) {
  if (!canAct()) return;
  for (let q = 0; q < board.rotation; q++) [dx, dy] = [-dy, dx];
  const [r, c] = game.state.players[game.state.turn].pos;
  const to = legalPawnMoves(game.state).find(([tr, tc]) => (tr - r === dy && tc - c === dx) || (tr - r === 2 * dy && tc - c === 2 * dx));
  if (to) humanMove({ t: 'pawn', to });
  else sfx.invalid();
}

// ---------- Undo and hints ----------

function undo() {
  if (!game || game.mode === 'online' || !game.history.length) return;
  botJob++;
  thinking = false;
  if (game.mode === 'bot') {
    // Back to the last position where it was your turn.
    do game.state = game.history.pop();
    while (game.history.length && game.state.turn !== game.human);
  } else game.state = game.history.pop();
  game.lastMove = null;
  resetInput();
  save();
  render();
  announce(`Move undone. ${statusText()}`);
  maybeBot();
}

async function showHint() {
  if (!canAct() || game.mode === 'online') return;
  const state = game.state;
  $('hint-btn').disabled = true;
  const move = await think(state, 'hard', 500);
  $('hint-btn').disabled = false;
  if (!move || game.state !== state) return;
  const p = state.turn;
  const changes = routeChanges(state, move);
  let text;
  if (move.t === 'pawn') {
    text = `Step here: ${changes[p].after} steps left to your goal.`;
  } else {
    const hurt = changes.filter((ch) => ch.player !== p && ch.after > ch.before).sort((a, b) => b.after - b.before - (a.after - a.before))[0];
    const own = changes[p].after - changes[p].before;
    text = hurt
      ? `A wall here makes ${game.mode === 'bot' && hurt.player !== game.human ? playerName(hurt.player).replace(/^Computer$/, 'the computer') : COLOR_NAMES[hurt.player]}’s route ${hurt.after - hurt.before} step${hurt.after - hurt.before > 1 ? 's' : ''} longer${own > 0 ? ` (yours by ${own})` : ''}.`
      : 'A wall here protects your route.';
    pendingWall = { r: move.r, c: move.c, o: move.o };
  }
  hint = { move, text };
  render();
  toast(text, { duration: 4000 });
  announce(text);
}

// ---------- Online ----------

function myToken() {
  let token = store.get('token');
  if (typeof token !== 'string' || token.length < 16) {
    token = randomToken();
    store.set('token', token);
  }
  return token;
}

async function askName() {
  const input = el('input', { class: 'name-input', maxlength: 20, value: store.get('name', ''), placeholder: 'Your name', autocomplete: 'nickname', 'aria-label': 'Your name' });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.closest('dialog')?.closeWith('ok'));
  const done = openDialog({
    title: 'Your name',
    body: el('div', {}, el('p', { class: 'muted' }, 'Shown to the other players in this game.'), input),
    actions: [{ label: 'Join', value: 'ok', primary: true }],
    dismissible: false,
  });
  setTimeout(() => input.focus(), 50);
  await done;
  const name = input.value.trim().slice(0, 20) || 'Player';
  store.set('name', name);
  return name;
}

async function startOnline(players) {
  const base = server();
  if (!base) return;
  setStatus('Making a room…');
  try {
    const { id } = await createRoom(base, players);
    await joinRoom(id);
    invite(true);
  } catch (e) {
    toast(e.message, { duration: 5000 });
    render();
  }
}

async function joinRoom(id) {
  const base = server();
  if (!base) {
    await openDialog({
      title: 'Online play isn’t set up here',
      body: 'This copy of Corridors has no game server, so it can’t open online game links. You can still play the computer or pass and play.',
      actions: [{ label: 'OK', value: null, primary: true }],
    });
    history.replaceState(null, '', location.pathname + location.search);
    if (!game) startLocal({ mode: 'bot', players: 2 });
    return;
  }
  leaveOnline();
  botJob++;
  thinking = false;
  const name = store.get('name') || (await askName());
  game = { mode: 'online', room: id, state: newGame(2), seats: [], you: -1, loaded: false, sending: false, status: 'connecting', lastMove: null };
  if (parseHash(location.hash).room !== id) history.replaceState(null, '', `#room=${id}`);
  resetInput();
  conn = new Connection({
    base,
    room: id,
    token: myToken(),
    name,
    onMessage: onServerMessage,
    onStatus: (status, { busy } = {}) => {
      if (game?.mode !== 'online') return;
      game.status = busy ? 'busy' : status;
      if (status !== 'online') game.sending = false;
      render();
    },
  });
  conn.connect();
  render();
}

function leaveOnline() {
  conn?.close();
  conn = null;
  if (parseHash(location.hash).room) history.replaceState(null, '', location.pathname + location.search);
}

function onServerMessage(msg) {
  if (game?.mode !== 'online') return;
  if (msg.type === 'snapshot') {
    if (!isValidState(msg.state)) return;
    const first = !game.loaded;
    const wasOver = game.state.winner != null;
    if (msg.state.moveNo < game.state.moveNo || (wasOver && msg.state.winner == null)) closeResult(); // a rematch
    game.state = msg.state;
    game.seats = msg.seats;
    game.you = msg.you;
    game.loaded = true;
    game.sending = false;
    game.lastMove = null;
    const n = msg.state.players.length;
    board.setRotation(msg.you < 0 ? 0 : n === 2 ? msg.you * 2 : msg.you);
    resetInput();
    render();
    if (first && msg.you < 0) toast('This game is full, so you’re watching.');
    announce(statusText());
    // Missed the winning move while reconnecting.
    if (!first && !wasOver && msg.state.winner != null) finished();
  } else if (msg.type === 'moved') {
    if (msg.moveNo <= game.state.moveNo) return; // already have it
    let next = null;
    if (msg.moveNo === game.state.moveNo + 1) {
      try {
        next = applyMove(game.state, msg.move);
      } catch {
        next = null;
      }
    }
    if (!next || hashState(next) !== msg.hash) {
      conn?.send({ type: 'sync' });
      return;
    }
    game.state = next;
    game.sending = false;
    moved(msg.move);
  } else if (msg.type === 'presence') {
    const before = game.seats.filter(Boolean).length;
    game.seats = msg.seats;
    if (game.loaded && msg.seats.filter(Boolean).length > before && allSeated()) {
      toast('Everyone’s here. Game on!');
      sounds.success();
    }
    render();
  } else if (msg.type === 'error') {
    game.sending = false;
    if (msg.code === 'no-room') {
      leaveOnline();
      openDialog({ title: 'Game not found', body: msg.message, actions: [{ label: 'New game', value: 'new', primary: true }] }).then(() => newGameDialog());
      game.status = 'gone';
    } else if (msg.code !== 'stale') toast(REASONS[msg.code] || msg.message);
    render();
  }
}

function invite(created = false) {
  if (game?.mode !== 'online') return;
  const url = `${location.origin}${location.pathname}#room=${game.room}`;
  const field = el('input', { class: 'link-input', readonly: true, value: url, 'aria-label': 'Game link', onfocus: (e) => e.target.select() });
  openDialog({
    title: created ? 'Room ready' : 'Invite',
    body: el(
      'div',
      {},
      el('p', {}, `Send this link to ${game.state.players.length === 2 ? 'a friend' : 'your friends'}. The game starts when every seat is taken.`),
      field,
      el('p', { class: 'muted small' }, 'Anyone else with the link can watch. Games are kept for two weeks, and three days after they end.'),
    ),
    actions: [navigator.share && { label: 'Share', value: 'share' }, { label: 'Copy link', value: 'copy', primary: true }].filter(Boolean),
  }).then(async (v) => {
    if (v === 'share') {
      try {
        await navigator.share({ title: 'Corridors', text: 'Play Corridors with me', url });
      } catch {
        /* cancelled */
      }
    } else if (v === 'copy') {
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      } catch {
        toast('Couldn’t copy. Select the link and copy it.');
      }
    }
  });
}

// ---------- Screen ----------

function statusText() {
  if (!game) return '';
  const s = game.state;
  if (game.mode === 'online') {
    if (game.status === 'gone') return 'This game has ended.';
    if (game.status === 'busy') return BUSY;
    if (game.status !== 'online' || !game.loaded) return game.loaded ? 'Reconnecting…' : 'Connecting…';
    if (!allSeated()) {
      const missing = game.seats.filter((x) => !x).length;
      return `Waiting for ${missing} more player${missing > 1 ? 's' : ''}. Share the link to invite them.`;
    }
  }
  if (s.winner != null) return winsText(s.winner);
  if (game.mode === 'bot' && thinking) return `${playerName(s.turn)} is thinking…`;
  if (game.mode === 'online' && game.sending) return 'Sending…';
  const name = playerName(s.turn);
  if (name === 'You' || game.mode === 'local') {
    const who = name === 'You' ? 'Your' : `${name}’s`;
    return `${who} turn. Move your pawn, or tap a groove to place a wall.`;
  }
  return `${name}’s turn.`;
}

function setStatus(text) {
  $('status').textContent = text;
}

function subtitle() {
  if (!game) return '';
  if (game.mode === 'bot') return `vs computer · ${LEVEL_NAMES[game.level]}`;
  if (game.mode === 'local') return `Pass and play · ${game.players} players`;
  return game.you < 0 && game.loaded ? 'Online · watching' : 'Online';
}

function renderPlayers() {
  const s = game.state;
  const showSteps = settings.get('steps');
  $('players').replaceChildren(
    ...s.players.map((pl, i) => {
      const online = game.mode !== 'online' || !game.seats[i] || game.seats[i].online;
      const turn = s.winner == null ? s.turn === i : s.winner === i;
      return el(
        'div',
        { class: `player ${turn ? 'turn' : ''} ${online ? '' : 'away'}`, style: `--pawn: ${COLORS[i]}` },
        el('span', { class: 'player-dot', 'aria-hidden': 'true' }),
        el(
          'span',
          { class: 'player-text' },
          el('b', {}, playerName(i, { short: true }), !online && el('small', { class: 'away-tag' }, ' away')),
          el(
            'small',
            {},
            el('span', { class: 'walls-left', title: 'Walls left' }, el('i', { class: 'wall-icon', 'aria-hidden': 'true' }), ` ${pl.wallsLeft}`),
            showSteps && el('span', { class: 'steps', title: 'Steps to goal' }, ` · ${shortestPath(s, i)} to go`),
          ),
        ),
      );
    }),
  );
}

function render() {
  if (!game) return;
  const s = game.state;
  const act = canAct();
  const marks = [];
  if (hint?.move.t === 'pawn') marks.push({ r: hint.move.to[0], c: hint.move.to[1], color: COLORS[s.turn], kind: 'hint' });
  board.render({ state: s, targets: act ? legalPawnMoves(s) : [], active: s.winner == null && allSeated() ? s.turn : -1, lastMove: game.lastMove, marks });
  if (pendingWall && act) board.showGhost(pendingWall, { pending: true });
  else if (!pendingWall) board.showGhost(null);
  $('board').classList.toggle('my-turn', act);
  $('subtitle').textContent = subtitle();
  renderPlayers();
  setStatus(statusText());
  const local = game.mode !== 'online';
  $('undo-btn').hidden = !local;
  $('hint-btn').hidden = !local;
  $('invite-btn').hidden = local;
  $('undo-btn').disabled = !game.history?.length;
  $('hint-btn').disabled = !act;
}

// ---------- Dialogs ----------

function newGameDialog() {
  const online = !!server();
  const setup = { opponent: 'bot', players: 2, level: 'medium', first: 'you', ...store.get('setup') };
  if (setup.opponent === 'online' && !online) setup.opponent = 'bot';
  const rows = {};
  const row = (key, label, control) => (rows[key] = el('div', { class: 'field' }, el('span', { class: 'field-label' }, label), control));
  const update = () => {
    rows.level.hidden = setup.opponent !== 'bot';
    rows.first.hidden = setup.opponent !== 'bot';
    rows.online.hidden = setup.opponent !== 'online';
  };
  const set = (key) => (v) => {
    setup[key] = key === 'players' ? Number(v) : v;
    update();
  };
  const body = el(
    'div',
    { class: 'setup' },
    row('opponent', 'Play against', segmented('opponent', [['bot', 'Computer'], ['local', 'Pass & play'], ...(online ? [['online', 'Online']] : [])], setup.opponent, set('opponent'))),
    row('players', 'Players', segmented('players', [['2', 'Two'], ['4', 'Four']], setup.players, set('players'))),
    row('level', 'Computer', segmented('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], setup.level, set('level'))),
    row('first', 'Who goes first', segmented('first', [['you', 'You'], ['computer', 'Computer']], setup.first, set('first'))),
    (rows.online = el('p', { class: 'muted small' }, 'You’ll get a link to send. The game starts when everyone has joined.')),
  );
  update();
  openDialog({ title: 'New game', body, actions: [{ label: 'Start', value: 'start', primary: true }] }).then((v) => {
    if (v !== 'start') return;
    store.set('setup', setup);
    if (setup.opponent === 'online') startOnline(setup.players);
    else startLocal({ mode: setup.opponent, players: setup.players, level: setup.level, first: setup.first });
  });
}

function rulesDialog(first = false) {
  return openDialog({
    title: first ? 'Welcome to Corridors' : 'How to play',
    body: el(
      'div',
      { class: 'rules' },
      el('p', {}, 'Race your pawn to the far side of the board, the one striped in your colour. On your turn, do one thing:'),
      el(
        'ul',
        {},
        el('li', {}, el('b', {}, 'Move'), ' one square: tap a dot.'),
        el('li', {}, el('b', {}, 'Or place a wall'), ' two squares long in a groove to slow someone down. Tap a groove to see the wall, then tap again to place it. With a mouse, just click.'),
      ),
      el('p', {}, 'Walls can’t overlap, cross, or cut anyone off from their goal completely. Each player has 10 walls (5 each with four players).'),
      el('p', {}, 'If a pawn is next to yours, you can jump over it. If a wall or the edge is behind it, step diagonally round it instead.'),
      el('p', { class: 'muted small' }, 'Keyboard: arrow keys move, Z undoes, H gives a hint, N starts a new game.'),
    ),
    actions: [{ label: first ? 'Play' : 'Got it', value: 'ok', primary: true }],
  });
}

function settingsDialog() {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'), segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], settings.get('theme'), (v) => settings.set('theme', v))),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
      toggle('Show steps to go', settings.get('steps'), (v) => settings.set('steps', v), 'Each player’s shortest route to their goal'),
    ),
  });
}

// ---------- Wiring ----------

$('new-btn').addEventListener('click', newGameDialog);
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('invite-btn').addEventListener('click', () => invite());
$('rules-btn').addEventListener('click', () => rulesDialog());
$('settings-btn').addEventListener('click', settingsDialog);
for (const [id, name] of [['hint-btn', 'bulb'], ['invite-btn', 'share'], ['rules-btn', 'help'], ['settings-btn', 'settings']]) {
  $(id).prepend(icon(name, { size: 22 }));
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (keys[e.key]) {
    e.preventDefault();
    keyMove(...keys[e.key]);
  } else if (e.key === 'Escape' && pendingWall) {
    pendingWall = null;
    board.showGhost(null);
    render();
  } else if (e.key === 'z' || e.key === 'u') undo();
  else if (e.key === 'h') showHint();
  else if (e.key === 'n') newGameDialog();
});

addEventListener('hashchange', () => {
  const room = parseHash(location.hash).room;
  if (room && room !== (game?.mode === 'online' && game.room)) joinRoom(room);
});

function resume() {
  const room = parseHash(location.hash).room;
  if (room) return joinRoom(room);
  const saved = store.get('game');
  if (saved && saved.mode !== 'online' && isValidState(saved.state) && Array.isArray(saved.history) && saved.history.every(isValidState)) {
    game = saved;
    render();
    maybeBot();
    return;
  }
  startLocal({ mode: 'bot', players: 2, level: 'medium' });
  if (!store.get('welcomed')) {
    store.set('welcomed', true);
    rulesDialog(true);
  }
}

resume();

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});

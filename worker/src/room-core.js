// The rules of an online room, without any Cloudflare APIs so it can be
// unit-tested. The Durable Object in room.js feeds it messages and carries
// out the effects it returns.
//
// client → server
//   { type: 'join', token, name }
//   { type: 'move', move, moveNo }   moveNo = the state's moveNo the client saw
//   { type: 'rematch' }
//   { type: 'sync' }                 ask for a fresh snapshot
// server → client
//   { type: 'snapshot', state, seats, you, hash }
//   { type: 'moved', move, by, moveNo, hash }
//   { type: 'presence', seats }
//   { type: 'error', code, message }
import { newGame, applyMove, hashState, moveError } from '../../games/corridors/js/engine.js';

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const MESSAGES = {
  'no-room': 'This game link has expired or never existed.',
  'bad-token': 'Could not join: bad player id.',
  'not-seated': 'You are watching this game.',
  'waiting': 'Waiting for everyone to join.',
  'not-your-turn': "It isn't your turn.",
  'stale': 'The board changed; here is the latest.',
  'not-over': 'The game is still going.',
};

export function cleanName(name) {
  const text = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 20);
  return text || 'Player';
}

// seats: [{ token, name } | null] — tokens stay on the server.
export class RoomCore {
  constructor() {
    this.state = null;
    this.seats = [];
  }

  get exists() {
    return this.state != null;
  }

  get full() {
    return this.seats.length > 0 && this.seats.every(Boolean);
  }

  create(players) {
    this.state = newGame(players === 4 ? 4 : 2);
    this.seats = Array(this.state.players.length).fill(null);
  }

  load(state, seats) {
    this.state = state;
    this.seats = seats;
  }

  seatOf(token) {
    return token ? this.seats.findIndex((s) => s?.token === token) : -1;
  }

  // What everyone may see: names and who is connected, never tokens.
  publicSeats(sessions) {
    const online = new Set(sessions.map((s) => s?.token));
    return this.seats.map((s) => s && { name: s.name, online: online.has(s.token) });
  }

  snapshotFor(token, sessions) {
    return { type: 'snapshot', state: this.state, seats: this.publicSeats(sessions), you: this.seatOf(token), hash: hashState(this.state) };
  }

  // Handles one message from a socket.
  //   session   that socket's { token, name } (null before it joins)
  //   others    the sessions of every other open socket
  // Returns effects: { attach, reply: [], broadcast: [], snapshotAll, save, finished }
  handle(session, msg, others) {
    const fx = { reply: [], broadcast: [], snapshotAll: false, save: false, finished: false };
    const error = (code) => {
      fx.reply.push({ type: 'error', code, message: MESSAGES[code] || code });
      return fx;
    };
    if (!msg || typeof msg !== 'object') return fx;
    if (!this.exists) return error('no-room');

    if (msg.type === 'join') {
      if (typeof msg.token !== 'string' || !TOKEN.test(msg.token)) return error('bad-token');
      const name = cleanName(msg.name);
      fx.attach = { token: msg.token, name };
      const all = [...others, fx.attach];
      let seat = this.seatOf(msg.token);
      if (seat >= 0) {
        if (this.seats[seat].name !== name) {
          this.seats[seat] = { token: msg.token, name };
          fx.save = true;
        }
      } else {
        seat = this.seats.indexOf(null);
        if (seat >= 0) {
          this.seats[seat] = { token: msg.token, name };
          fx.save = true;
        }
      }
      fx.reply.push(this.snapshotFor(msg.token, all));
      fx.broadcast.push({ type: 'presence', seats: this.publicSeats(all) });
      return fx;
    }

    const sessions = session ? [...others, session] : others;
    if (msg.type === 'sync') {
      fx.reply.push(this.snapshotFor(session?.token, sessions));
      return fx;
    }

    const seat = this.seatOf(session?.token);
    if (seat < 0) return error('not-seated');

    if (msg.type === 'move') {
      if (!this.full) return error('waiting');
      if (msg.moveNo !== this.state.moveNo) {
        error('stale');
        fx.reply.push(this.snapshotFor(session.token, sessions));
        return fx;
      }
      if (this.state.winner == null && this.state.turn !== seat) return error('not-your-turn');
      const problem = moveError(this.state, msg.move);
      if (problem) return error(problem);
      const move = msg.move.t === 'pawn' ? { t: 'pawn', to: [msg.move.to[0], msg.move.to[1]] } : { t: 'wall', r: msg.move.r, c: msg.move.c, o: msg.move.o };
      this.state = applyMove(this.state, move);
      fx.save = true;
      fx.finished = this.state.winner != null;
      fx.broadcast.push({ type: 'moved', move, by: seat, moveNo: this.state.moveNo, hash: hashState(this.state) });
      return fx;
    }

    if (msg.type === 'rematch') {
      if (this.state.winner == null) return error('not-over');
      // The player after the winner starts the next game.
      this.state = newGame(this.state.players.length, { first: this.state.winner + 1 });
      fx.save = true;
      fx.snapshotAll = true;
      return fx;
    }

    return fx;
  }
}

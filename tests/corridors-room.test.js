import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomCore, cleanName } from '../worker/src/room-core.js';
import { applyMove, hashState } from '../games/corridors/js/engine.js';

const TOKENS = ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc', 'dddddddddddddddd', 'eeeeeeeeeeeeeeee'];

// A room plus fake sockets: each socket is just its session (or null).
function setup(players = 2) {
  const room = new RoomCore();
  room.create(players);
  const sockets = [];
  const send = (i, msg) => {
    const others = sockets.filter((s, j) => j !== i && s).map((s) => s);
    const fx = room.handle(sockets[i] ?? null, msg, others);
    if (fx.attach) sockets[i] = fx.attach;
    return fx;
  };
  const join = (i, name = `P${i}`) => send(i, { type: 'join', token: TOKENS[i], name });
  return { room, sockets, send, join };
}

test('names are cleaned', () => {
  assert.equal(cleanName('  Ann  '), 'Ann');
  assert.equal(cleanName('<b>x</b>'), 'bx/b');
  assert.equal(cleanName(''), 'Player');
  assert.equal(cleanName('x'.repeat(40)).length, 20);
});

test('unknown rooms and bad tokens are refused', () => {
  const room = new RoomCore();
  assert.equal(room.handle(null, { type: 'join', token: TOKENS[0] }, []).reply[0].code, 'no-room');
  const { send } = setup();
  assert.equal(send(0, { type: 'join', token: 'short' }).reply[0].code, 'bad-token');
  assert.deepEqual(send(0, 'nonsense').reply, []);
});

test('players take seats in order; extras watch', () => {
  const { join, room } = setup(2);
  const a = join(0);
  assert.equal(a.reply[0].type, 'snapshot');
  assert.equal(a.reply[0].you, 0);
  assert.ok(a.save);
  assert.equal(join(1).reply[0].you, 1);
  assert.ok(room.full);
  const watcher = join(2);
  assert.equal(watcher.reply[0].you, -1);
  assert.ok(!watcher.save, 'a spectator costs no write');
  // Tokens are never sent to clients.
  assert.ok(!JSON.stringify(watcher.reply).includes(TOKENS[0]));
  assert.deepEqual(watcher.broadcast[0].seats.map((s) => s.online), [true, true]);
});

test('reconnecting with the same token reclaims the seat', () => {
  const { join, sockets, room } = setup(2);
  join(0);
  join(1);
  sockets[0] = null; // player 0's socket closes
  const again = join(0); // same token, new socket
  assert.equal(again.reply[0].you, 0);
  assert.ok(!again.save, 'nothing changed, nothing written');
  assert.equal(room.seats.filter(Boolean).length, 2);
});

test('moves: waiting, turn order, stale and illegal moves are rejected', () => {
  const { join, send, room } = setup(2);
  join(0);
  assert.equal(send(0, { type: 'move', move: { t: 'pawn', to: [7, 4] }, moveNo: 0 }).reply[0].code, 'waiting');
  join(1);
  assert.equal(send(1, { type: 'move', move: { t: 'pawn', to: [1, 4] }, moveNo: 0 }).reply[0].code, 'not-your-turn');
  const stale = send(0, { type: 'move', move: { t: 'pawn', to: [7, 4] }, moveNo: 5 });
  assert.equal(stale.reply[0].code, 'stale');
  assert.equal(stale.reply[1].type, 'snapshot');
  assert.equal(send(0, { type: 'move', move: { t: 'pawn', to: [5, 4] }, moveNo: 0 }).reply[0].code, 'illegal-pawn');
  assert.equal(send(0, { type: 'move', move: { t: 'wall', r: 9, c: 0, o: 'H' }, moveNo: 0 }).reply[0].code, 'out-of-bounds');
  assert.equal(send(2, { type: 'move', move: { t: 'pawn', to: [7, 4] }, moveNo: 0 }).reply[0].code, 'not-seated');
  const ok = send(0, { type: 'move', move: { t: 'pawn', to: [7, 4], extra: 'x'.repeat(10) }, moveNo: 0 });
  assert.deepEqual(ok.reply, []);
  assert.ok(ok.save);
  const moved = ok.broadcast[0];
  assert.deepEqual(moved, { type: 'moved', move: { t: 'pawn', to: [7, 4] }, by: 0, moveNo: 1, hash: hashState(room.state) });
  assert.equal(room.state.turn, 1);
});

test('clients replaying broadcasts stay in sync', () => {
  const { join, send, room } = setup(2);
  join(0);
  join(1);
  let client = room.snapshotFor(TOKENS[0], []).state;
  const moves = [
    [0, { t: 'wall', r: 1, c: 3, o: 'H' }],
    [1, { t: 'pawn', to: [0, 3] }],
    [0, { t: 'pawn', to: [7, 4] }],
  ];
  for (const [who, move] of moves) {
    const fx = send(who, { type: 'move', move, moveNo: room.state.moveNo });
    const m = fx.broadcast[0];
    client = applyMove(client, m.move);
    assert.equal(hashState(client), m.hash);
  }
});

test('a win ends the game and a rematch starts a new one', () => {
  const { join, send, room } = setup(2);
  join(0);
  join(1);
  room.state.players[0].pos = [1, 0];
  const fx = send(0, { type: 'move', move: { t: 'pawn', to: [0, 0] }, moveNo: 0 });
  assert.ok(fx.finished);
  assert.equal(room.state.winner, 0);
  assert.equal(send(1, { type: 'move', move: { t: 'pawn', to: [1, 4] }, moveNo: 1 }).reply[0].code, 'game-over');
  assert.equal(send(2, { type: 'rematch' }).reply[0].code, 'not-seated');
  const re = send(1, { type: 'rematch' });
  assert.ok(re.snapshotAll && re.save);
  assert.equal(room.state.winner, null);
  assert.equal(room.state.moveNo, 0);
  assert.equal(room.state.turn, 1, 'the player after the winner starts');
  assert.equal(send(0, { type: 'rematch' }).reply[0].code, 'not-over');
});

test('four-player rooms need four players', () => {
  const { join, send, room } = setup(4);
  [0, 1, 2].forEach((i) => join(i));
  assert.equal(send(0, { type: 'move', move: { t: 'pawn', to: [7, 4] }, moveNo: 0 }).reply[0].code, 'waiting');
  assert.equal(join(3).reply[0].you, 3);
  assert.equal(join(4).reply[0].you, -1);
  send(0, { type: 'move', move: { t: 'pawn', to: [7, 4] }, moveNo: 0 });
  assert.equal(room.state.turn, 1);
});

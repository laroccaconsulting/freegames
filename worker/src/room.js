// One Durable Object per online game. It is the authority: clients send
// moves, the room checks them with the shared rules engine, saves, and
// tells everyone.
//
// Free-plan care:
// - WebSocket Hibernation API only (ctx.acceptWebSocket), no timers, so an
//   idle room costs nothing while players think.
// - One SQLite row, rewritten once per accepted move (plus a seat change on
//   join). Presence is never written.
// - Alarms delete finished games after 3 days and abandoned ones after 14.
import { DurableObject } from 'cloudflare:workers';
import { RoomCore } from './room-core.js';

const DAY = 24 * 60 * 60 * 1000;
const FINISHED_TTL = 3 * DAY;
const IDLE_TTL = 14 * DAY;
const MAX_MESSAGE = 2048;

export class CorridorsRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new RoomCore();
    this.updated = 0;
    this.alarmAt = null;
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT, seats TEXT, updated INTEGER)');
      const row = sql.exec('SELECT state, seats, updated FROM game WHERE id = 1').toArray()[0];
      if (row) {
        this.core.load(JSON.parse(row.state), JSON.parse(row.seats));
        this.updated = row.updated;
      }
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  // Called by the Worker (RPC) when a room is made. False if the id is taken.
  async create(players) {
    if (this.core.exists) return false;
    this.core.create(players);
    await this.save();
    return true;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return;
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return; // ignore malformed JSON
    }
    const fx = this.core.handle(ws.deserializeAttachment(), msg, this.sessions(ws));
    if (fx.attach) ws.serializeAttachment(fx.attach);
    if (fx.save) await this.save();
    for (const m of fx.reply) send(ws, m);
    for (const m of fx.broadcast) this.broadcast(m);
    if (fx.snapshotAll) {
      for (const other of this.ctx.getWebSockets()) {
        const s = other.deserializeAttachment();
        if (s) send(other, this.core.snapshotFor(s.token, this.sessions(other).concat(s)));
      }
    }
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* already closed */
    }
    if (this.core.exists) this.broadcast({ type: 'presence', seats: this.core.publicSeats(this.sessions(ws)) }, ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }

  async alarm() {
    const age = Date.now() - this.updated;
    const ttl = this.core.state?.winner != null ? FINISHED_TTL : IDLE_TTL;
    if (!this.core.exists || age >= ttl - 60_000) {
      for (const ws of this.ctx.getWebSockets()) {
        send(ws, { type: 'error', code: 'no-room', message: 'This game has expired.' });
        ws.close(1000, 'expired');
      }
      await this.ctx.storage.deleteAll();
      this.core = new RoomCore();
      this.alarmAt = null;
      return;
    }
    this.alarmAt = this.updated + ttl;
    await this.ctx.storage.setAlarm(this.alarmAt);
  }

  // Sessions of every open socket except `skip`.
  sessions(skip) {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== skip)
      .map((ws) => ws.deserializeAttachment())
      .filter(Boolean);
  }

  broadcast(msg, skip) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip) continue;
      try {
        ws.send(text);
      } catch {
        /* closing */
      }
    }
  }

  async save() {
    this.updated = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO game (id, state, seats, updated) VALUES (1, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET state = excluded.state, seats = excluded.seats, updated = excluded.updated',
      JSON.stringify(this.core.state),
      JSON.stringify(this.core.seats),
      this.updated,
    );
    // Keep a cleanup alarm pending without rewriting it on every move:
    // finished games get 3 days; otherwise refresh only when under a week remains.
    const finished = this.core.state.winner != null;
    const due = this.updated + (finished ? FINISHED_TTL : IDLE_TTL);
    if (finished ? this.alarmAt !== due : !this.alarmAt || this.alarmAt < this.updated + IDLE_TTL / 2) {
      this.alarmAt = due;
      await this.ctx.storage.setAlarm(due);
    }
  }
}

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* closing */
  }
}

// Client side of online rooms: make a room, then keep a WebSocket to it
// open, reconnecting with backoff. The server is the authority; this only
// passes messages along.

// Friendly text for when the server can't be reached or is over its daily
// free allowance (it answers with errors until 00:00 UTC).
export const BUSY = 'Online play is resting right now (the free server may have reached its daily limit). Try again later, or play the computer.';

export function serverBase(configured) {
  if (!configured) return null;
  try {
    return new URL(configured, location.href).href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export async function createRoom(base, players) {
  let res;
  try {
    // text/plain keeps this a "simple" request: no CORS preflight to pay for.
    res = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ players }) });
  } catch {
    throw new Error("Can't reach the game server. Are you online?");
  }
  if (!res.ok) throw new Error(BUSY);
  const data = await res.json().catch(() => null);
  if (!data?.id) throw new Error(BUSY);
  return data;
}

export function randomToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
}

// status: 'connecting' | 'online' | 'offline'
export class Connection {
  constructor({ base, room, token, name, onMessage, onStatus }) {
    Object.assign(this, { base, room, token, name, onMessage, onStatus });
    this.ws = null;
    this.tries = 0;
    this.timer = null;
    this.closed = false;
    this.failures = 0;
    this.wake = () => {
      if (document.visibilityState === 'visible' && !this.ws && !this.closed) this.connect();
    };
    document.addEventListener('visibilitychange', this.wake);
    addEventListener('online', this.wake);
  }

  connect() {
    clearTimeout(this.timer);
    if (this.closed) return;
    const url = `${this.base.replace(/^http/, 'ws')}/api/rooms/${encodeURIComponent(this.room)}/ws`;
    this.onStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.failures = 0;
      this.send({ type: 'join', token: this.token, name: this.name });
      this.onStatus('online');
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'error' && msg.code === 'no-room') this.close();
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!ws.opened) this.failures++;
      this.retry();
    };
    ws.addEventListener('open', () => (ws.opened = true));
  }

  retry() {
    if (this.closed) return;
    this.onStatus('offline', { busy: this.failures >= 3 });
    // 1s, 2s, 4s … up to 30s, with jitter; only while the page is visible.
    const delay = Math.min(30000, 1000 * 2 ** this.tries++) * (0.75 + Math.random() / 2);
    this.timer = setTimeout(() => document.visibilityState === 'visible' && this.connect(), delay);
  }

  send(msg) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.wake);
    removeEventListener('online', this.wake);
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000);
    } catch {
      /* already closed */
    }
  }
}

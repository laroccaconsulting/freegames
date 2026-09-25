// Building blocks for levels. A Builder walks left to right placing objects;
// each chunk is a short, fair obstacle that starts and ends with the player
// back on the ground in cube mode (or inside its own corridor for the flying
// modes). Hand-made levels and generated ones are both built from these.

export class Builder {
  constructor({ runway = 14 } = {}) {
    this.x = runway;
    this.objects = [];
    this.colors = [];
  }
  put(t, dx, y, extra = {}) {
    this.objects.push({ t, x: this.x + dx, y, ...extra });
    return this;
  }
  go(n) {
    this.x += n;
    return this;
  }
  // A column (or several) of blocks standing on `y0`.
  wall(dx, h, w = 1, y0 = 0) {
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) this.put('block', dx + c, y0 + r);
    return this;
  }
  // A column of blocks hanging down from `top` (exclusive).
  hang(dx, h, w = 1, top = 10) {
    for (let c = 0; c < w; c++) for (let r = 1; r <= h; r++) this.put('block', dx + c, top - r);
    return this;
  }
  row(dx, y, w, t = 'block', extra = {}) {
    for (let c = 0; c < w; c++) this.put(t, dx + c, y, extra);
    return this;
  }
  spikes(dx, n, y = 0, f = 0, t = 'spike') {
    for (let c = 0; c < n; c++) this.put(t, dx + c, y, f ? { f: 1 } : {});
    return this;
  }
  portal(dx, v, y = 1, extra = {}) {
    return this.put('portal', dx, y, { v, ...extra });
  }
  // Colour change: the background and ground fade to these from here on.
  color(bg, ground, line) {
    this.colors.push({ x: this.x, bg, ground, line });
    return this;
  }
  coin(dx, y) {
    return this.put('coin', dx, y);
  }
  done(extra = {}) {
    return { objects: this.objects, colors: this.colors, length: Math.ceil(this.x + 14), ...extra };
  }
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// ---------- Cube (ground) ----------
// Each takes (builder, random, difficulty 0-3).

export const CUBE = {
  spikes(b, r, d) {
    const n = int(r, 1, d >= 1 ? 3 : 2);
    b.go(4).spikes(0, n).go(n + 3);
  },
  // Hop onto a block, then clear spikes on the way down.
  hop(b, r, d) {
    b.go(4).wall(0, 1, 1).spikes(1, d >= 2 ? 3 : 2).go(7);
  },
  plateau(b, r, d) {
    const w = int(r, 6, 10);
    b.go(4).wall(0, 1, w);
    if (d >= 1) b.spikes(Math.floor(w / 2), 1, 1);
    if (d >= 2) b.spikes(w, 2);
    b.go(w + 4);
  },
  stairs(b, r, d) {
    const steps = d >= 1 ? 3 : 2;
    b.go(4);
    for (let k = 0; k < steps; k++) b.wall(k * 3, k + 1, 3);
    b.spikes(steps * 3, d >= 2 ? 3 : 1);
    b.go(steps * 3 + 6);
  },
  // A yellow pad throws you over a wall too tall to jump.
  padWall(b, r, d) {
    b.go(4).put('pad', 0, 0).wall(3, 3, 2);
    if (d >= 2) b.spikes(5, 2);
    b.go(9);
  },
  // Too long to jump: bounce off the orb in the middle.
  orbPit(b, r, d) {
    const n = d >= 2 ? 7 : 6;
    b.go(4).spikes(0, n).put('orb', 3, 2).go(n + 4);
  },
  minis(b, r, d) {
    b.go(4).spikes(0, int(r, 2, 3), 0, 0, 'mini').go(8);
  },
  // Towers topped with spikes: jump from tower to tower.
  towers(b, r, d) {
    b.go(4).wall(0, 1, 2).spikes(2, 3).wall(5, 2, 2).spikes(7, 2).go(12);
  },
  // Blue portal up onto the underside of a roof, spikes hang from it,
  // then a yellow portal drops you back to the ground.
  roof(b, r, d) {
    const L = d >= 2 ? 20 : 16;
    b.go(3).row(-1, 5, L + 5).portal(1, 'up');
    b.spikes(8, 1, 4, 1);
    if (d >= 1) b.spikes(14, d >= 2 ? 2 : 1, 4, 1);
    b.portal(L, 'down', 3).go(L + 7);
  },
  // Pink pad: a small hop onto a floating row.
  pinkPad(b, r, d) {
    b.go(4).put('ppad', 0, 0).row(3, 1, 5).spikes(3, 5).go(11);
  },
  // Floating slabs over a spike floor.
  slabs(b, r, d) {
    b.go(4).spikes(0, 10);
    b.row(1, 1, 3, 'slab').row(6, 1, 3, 'slab');
    b.go(13);
  },
  // Blue orb: tap it mid-jump to fall up onto a roof; a blue pad under the
  // roof sends you back down.
  blueOrb(b) {
    b.go(4).row(-2, 5, 18).spikes(0, 6).put('borb', 3, 2).spikes(9, 1, 4, 1).put('bpad', 13, 4, { f: 1 }).go(18);
  },
};

// ---------- Ship ----------

export function shipIn(b) {
  b.go(3).portal(0, 'ship').go(6);
}

// Gates: a gap between a pillar from the floor and one from the ceiling,
// drifting up and down. The gap narrows with difficulty.
export function shipGates(b, r, d, n = 4) {
  let lo = 3;
  const gap = [5, 4, 4, 3][d];
  for (let k = 0; k < n; k++) {
    lo = Math.max(1, Math.min(10 - gap - 1, lo + int(r, -3, 3)));
    const w = int(r, 1, 2);
    if (lo > 0) b.wall(0, lo, w);
    b.hang(0, 10 - lo - gap, w);
    if (d >= 2 && lo > 1 && r() < 0.5) b.spikes(0, 1, lo);
    b.go(w + 7 - Math.min(d, 2));
  }
}

// A low tunnel: fly flat between a raised floor and a lowered ceiling.
export function shipTunnel(b, r, d) {
  const lo = int(r, 2, 5);
  const L = int(r, 6, 10);
  b.wall(0, lo, L).hang(0, 10 - lo - 4, L).go(L + 7);
}

export function shipOut(b) {
  b.portal(0, 'cube', 0, { s: 10 }).go(8);
}

// ---------- Ball (flip gravity between floor and a low ceiling) ----------

export const BALL_CEIL = 6;

export function ballIn(b) {
  b.go(3).portal(0, 'ball', 1, { c: BALL_CEIL }).go(6);
}

export function ballRun(b, r, d, n = 5) {
  let side = 0;
  for (let k = 0; k < n; k++) {
    side = r() < 0.7 ? 1 - side : side;
    const w = int(r, 1, d >= 2 ? 4 : 3);
    if (side === 0) b.spikes(0, w, 0);
    else b.spikes(0, w, BALL_CEIL - 1, 1);
    b.go(w + 7 - Math.min(d, 2));
  }
}

export function ballOut(b) {
  b.portal(0, 'cube', 0, { s: BALL_CEIL }).go(8);
}

// ---------- Wave (zig-zag at 45°) ----------

export function waveIn(b) {
  b.go(3).portal(0, 'wave').go(6);
}

export function waveRun(b, r, d, n = 5) {
  let up = r() < 0.5;
  for (let k = 0; k < n; k++) {
    const h = int(r, 4, 5 + Math.min(d, 1));
    const w = int(r, 1, 2);
    if (up) b.wall(0, h, w).spikes(0, w, h);
    else b.hang(0, h, w).spikes(0, w, 9 - h, 1);
    b.spikes(-3, 3, 0);
    b.go(w + 8 - Math.min(d, 2));
    up = !up;
  }
}

export function waveOut(b) {
  b.portal(0, 'cube', 0, { s: 10 }).go(8);
}

export const pickChunk = (r, d) => {
  const names = ['spikes', 'hop', 'plateau', 'stairs', 'padWall', 'orbPit', 'minis', 'towers', 'pinkPad'];
  if (d >= 1) names.push('roof', 'slabs');
  return pick(r, names);
};

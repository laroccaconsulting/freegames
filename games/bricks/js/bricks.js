// Bricks: the physics, in a 360 × 540 world. Pure (no DOM) and
// deterministic, so tests can play it. step() advances by a fixed tick.
//
// state: { w, h, paddle: { x, w }, balls: [{ x, y, vx, vy, stuck }], bricks: [{ x, y, w, h, hp, color, power }],
//          drops: [{ x, y, kind }], lives, score, combo, level, effects: { wide, slow }, over, cleared }

import { mulberry32 } from '../core/rng.js';

export const W = 360;
export const H = 540;
export const R = 6; // ball radius
const PADDLE_Y = H - 36;
const PADDLE_H = 12;
const BASE_SPEED = 300; // px per second
const TICK = 1 / 240;

// Brick layouts from a seed: symmetric patterns, tougher bricks further in.
export function makeLevel(level) {
  const random = mulberry32(level * 7919 + 13);
  const cols = 10;
  const rows = Math.min(10, 5 + Math.floor(level / 2));
  const bw = (W - 20) / cols;
  const bh = 16;
  const bricks = [];
  const pattern = level % 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols / 2; c++) {
      let on = true;
      if (pattern === 1) on = (r + c) % 2 === 0 || r === 0;
      else if (pattern === 2) on = c >= r % 3 || r < 2;
      else if (pattern === 3) on = random() > 0.22;
      if (!on) continue;
      const hp = level > 2 && r < Math.floor(level / 3) + 1 ? 2 : level > 6 && r === 0 ? 3 : 1;
      const power = random() < 0.08 ? ['wide', 'multi', 'slow'][Math.floor(random() * 3)] : null;
      for (const cc of [c, cols - 1 - c]) bricks.push({ x: 10 + cc * bw, y: 60 + r * (bh + 4), w: bw - 4, h: bh, hp, max: hp, color: r % 6, power: cc === c ? power : power && random() < 0.5 ? power : null });
    }
  }
  return bricks;
}

export function newGame({ level = 1, lives = 3, score = 0 } = {}) {
  return {
    w: W,
    h: H,
    paddle: { x: W / 2, w: 72 },
    balls: [{ x: W / 2, y: PADDLE_Y - R - 1, vx: 0, vy: 0, stuck: true }],
    bricks: makeLevel(level),
    drops: [],
    lives,
    score,
    combo: 0,
    level,
    effects: { wide: 0, slow: 0 },
    over: false,
    cleared: false,
    t: 0,
  };
}

export function launch(s) {
  const speed = BASE_SPEED * (1 + Math.min(0.5, (s.level - 1) * 0.04));
  for (const b of s.balls) if (b.stuck) Object.assign(b, { stuck: false, vx: speed * 0.35, vy: -speed * 0.94 });
  return s;
}

const speedOf = (b) => Math.hypot(b.vx, b.vy);

// Advance by dt seconds. `target` is where the player wants the paddle (x).
// Returns a list of events for sound and effects.
export function step(s, dt, target) {
  const events = [];
  let left = Math.min(dt, 0.05);
  while (left > 1e-9) {
    const h = Math.min(TICK, left);
    tick(s, h, target, events);
    left -= h;
    if (s.over || s.cleared) break;
  }
  return events;
}

function tick(s, dt, target, events) {
  s.t += dt;
  const p = s.paddle;
  p.w = s.effects.wide > 0 ? 110 : 72;
  // The paddle follows the finger quickly but not instantly.
  if (target != null) {
    const want = Math.max(p.w / 2, Math.min(W - p.w / 2, target));
    const maxMove = 1400 * dt;
    p.x += Math.max(-maxMove, Math.min(maxMove, want - p.x));
  }
  for (const k of ['wide', 'slow']) s.effects[k] = Math.max(0, s.effects[k] - dt);
  const slow = s.effects.slow > 0 ? 0.7 : 1;

  for (const b of s.balls) {
    if (b.stuck) {
      b.x = p.x;
      b.y = PADDLE_Y - R - 1;
      continue;
    }
    b.x += b.vx * dt * slow;
    b.y += b.vy * dt * slow;
    // Walls.
    if (b.x < R) {
      b.x = R;
      b.vx = Math.abs(b.vx);
      events.push({ type: 'wall' });
    } else if (b.x > W - R) {
      b.x = W - R;
      b.vx = -Math.abs(b.vx);
      events.push({ type: 'wall' });
    }
    if (b.y < R) {
      b.y = R;
      b.vy = Math.abs(b.vy);
      events.push({ type: 'wall' });
    }
    // Paddle: the bounce angle depends on where the ball hits.
    if (b.vy > 0 && b.y + R >= PADDLE_Y && b.y + R <= PADDLE_Y + PADDLE_H + 8 && Math.abs(b.x - p.x) <= p.w / 2 + R) {
      const off = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2)));
      // After a few bounces without breaking anything, lean the angle a
      // little so the ball can't fall into an endless loop.
      s.dry = (s.dry || 0) + 1;
      const lean = s.dry > 4 ? (Math.sin(s.t * 12.9898) > 0 ? 0.18 : -0.18) : 0;
      const angle = Math.max(-1.05, Math.min(1.05, off * 1.05 + lean)); // up to ~60° from vertical
      const speed = Math.min(speedOf(b) * 1.01, BASE_SPEED * 1.9);
      b.vx = Math.sin(angle) * speed;
      b.vy = -Math.cos(angle) * speed;
      b.y = PADDLE_Y - R;
      s.combo = 0;
      events.push({ type: 'paddle' });
    }
    // Bricks: find the first overlapping brick and bounce off its nearest face.
    for (const k of s.bricks) {
      if (k.hp <= 0) continue;
      const nx = Math.max(k.x, Math.min(b.x, k.x + k.w));
      const ny = Math.max(k.y, Math.min(b.y, k.y + k.h));
      const dx = b.x - nx;
      const dy = b.y - ny;
      if (dx * dx + dy * dy > R * R) continue;
      if (Math.abs(dx) > Math.abs(dy)) {
        b.vx = dx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx);
        b.x = nx + (dx > 0 ? R : -R);
      } else {
        b.vy = dy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy);
        b.y = ny + (dy > 0 ? R : -R);
      }
      k.hp--;
      s.dry = 0;
      if (k.hp <= 0) {
        s.combo++;
        s.score += 10 * s.combo;
        events.push({ type: 'break', brick: k, combo: s.combo });
        if (k.power) s.drops.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, kind: k.power });
      } else events.push({ type: 'hit', brick: k });
      break;
    }
  }
  // Lost balls.
  const before = s.balls.length;
  s.balls = s.balls.filter((b) => b.y < H + 20);
  if (before && !s.balls.length) {
    s.lives--;
    s.combo = 0;
    s.drops = [];
    s.effects = { wide: 0, slow: 0 };
    events.push({ type: 'lose' });
    if (s.lives <= 0) s.over = true;
    else s.balls = [{ x: p.x, y: PADDLE_Y - R - 1, vx: 0, vy: 0, stuck: true }];
  }
  // Power-ups fall; catch them with the paddle.
  for (const d of s.drops) {
    d.y += 140 * dt;
    if (d.y >= PADDLE_Y - 6 && d.y <= PADDLE_Y + PADDLE_H && Math.abs(d.x - p.x) <= p.w / 2 + 8) {
      d.caught = true;
      events.push({ type: 'power', kind: d.kind });
      if (d.kind === 'wide') s.effects.wide = 12;
      else if (d.kind === 'slow') s.effects.slow = 10;
      else if (d.kind === 'multi') {
        const src = s.balls.find((b) => !b.stuck) || s.balls[0];
        if (src) for (const a of [-0.5, 0.5]) {
          const sp = speedOf(src) || BASE_SPEED;
          const ang = Math.atan2(src.vx, -src.vy) + a;
          s.balls.push({ x: src.x, y: src.y, vx: Math.sin(ang) * sp, vy: -Math.cos(ang) * sp, stuck: false });
        }
      }
    }
  }
  s.drops = s.drops.filter((d) => !d.caught && d.y < H + 10);
  if (!s.bricks.some((k) => k.hp > 0)) {
    s.cleared = true;
    events.push({ type: 'clear' });
  }
}

export { PADDLE_Y, PADDLE_H };

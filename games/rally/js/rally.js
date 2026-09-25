// Rally: paddle tennis on a 360 × 600 court, bottom player vs top player.
// Pure (no DOM) and deterministic, so tests can play whole matches.
//
// state: { ball: { x, y, vx, vy }, paddles: { top: { x, w }, bottom: { x, w } },
//          score: { top, bottom }, to, serveTo, wait, hits, winner }

export const W = 360;
export const H = 600;
export const R = 7; // ball radius
export const PADDLE_W = 70;
export const PADDLE_H = 12;
export const GAP = 28; // paddle distance from its end of the court
export const TOP_Y = GAP; // top paddle's front face
export const BOTTOM_Y = H - GAP; // bottom paddle's front face
const SERVE_SPEED = 300;
const MAX_SPEED = 720;
const HUMAN_SPEED = 2400; // px per second a finger can drag a paddle
const TICK = 1 / 240;
const SERVE_WAIT = 0.9;

export const LEVELS = {
  easy: { speed: 260, error: 30, think: 0.2, angle: 0.2 },
  normal: { speed: 400, error: 18, think: 0.1, angle: 0.45 },
  hard: { speed: 620, error: 10, think: 0.04, angle: 0.7 },
};

export function newMatch({ to = 7, serveTo = 'bottom' } = {}) {
  const s = {
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    paddles: { top: { x: W / 2, w: PADDLE_W }, bottom: { x: W / 2, w: PADDLE_W } },
    score: { top: 0, bottom: 0 },
    to,
    serveTo,
    wait: SERVE_WAIT,
    hits: 0,
    winner: null,
    t: 0,
  };
  return s;
}

// Serve toward `serveTo` at a gentle angle that alternates side to side.
function serve(s) {
  const dir = s.serveTo === 'bottom' ? 1 : -1;
  const n = s.score.top + s.score.bottom;
  const angle = (n % 2 ? 1 : -1) * (0.25 + ((n * 7) % 5) * 0.04);
  Object.assign(s.ball, { x: W / 2, y: H / 2, vx: Math.sin(angle) * SERVE_SPEED, vy: Math.cos(angle) * SERVE_SPEED * dir });
  s.hits = 0;
}

// Advance by dt seconds. `targets` = { top, bottom }: the x each paddle is
// heading for (null to stay), with optional speed caps in `caps`.
export function step(s, dt, targets = {}, caps = {}) {
  const events = [];
  let left = Math.min(dt, 0.05);
  while (left > 1e-9 && !s.winner) {
    const h = Math.min(TICK, left);
    tick(s, h, targets, caps, events);
    left -= h;
  }
  return events;
}

function movePaddle(p, want, max, dt) {
  if (want == null) return;
  const clamped = Math.max(p.w / 2, Math.min(W - p.w / 2, want));
  const d = clamped - p.x;
  const lim = max * dt;
  p.x += Math.max(-lim, Math.min(lim, d));
}

function tick(s, dt, targets, caps, events) {
  s.t += dt;
  for (const side of ['top', 'bottom']) movePaddle(s.paddles[side], targets[side], caps[side] ?? HUMAN_SPEED, dt);
  if (s.wait > 0) {
    s.wait -= dt;
    if (s.wait <= 0) {
      serve(s);
      events.push({ type: 'serve' });
    }
    return;
  }
  const b = s.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x < R) {
    b.x = R;
    b.vx = Math.abs(b.vx);
    events.push({ type: 'wall' });
  } else if (b.x > W - R) {
    b.x = W - R;
    b.vx = -Math.abs(b.vx);
    events.push({ type: 'wall' });
  }
  // Paddles: the bounce angle depends on where the ball meets the paddle.
  for (const side of ['top', 'bottom']) {
    const p = s.paddles[side];
    const down = side === 'bottom';
    const face = down ? BOTTOM_Y : TOP_Y;
    const moving = down ? b.vy > 0 : b.vy < 0;
    const reach = down ? b.y + R >= face && b.y + R <= face + PADDLE_H + 10 : b.y - R <= face && b.y - R >= face - PADDLE_H - 10;
    if (!moving || !reach || Math.abs(b.x - p.x) > p.w / 2 + R) continue;
    const off = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2)));
    const angle = off * 1.0; // up to ~57° from straight
    s.hits++;
    const speed = Math.min(MAX_SPEED, SERVE_SPEED + s.hits * 22);
    b.vx = Math.sin(angle) * speed;
    b.vy = Math.cos(angle) * speed * (down ? -1 : 1);
    b.y = down ? face - R : face + R;
    events.push({ type: 'paddle', side, hits: s.hits });
  }
  // A point when the ball gets past a paddle.
  if (b.y > H + R || b.y < -R) {
    const winner = b.y > H ? 'top' : 'bottom';
    s.score[winner]++;
    s.serveTo = winner === 'top' ? 'bottom' : 'top'; // serve to whoever lost the point
    Object.assign(b, { x: W / 2, y: H / 2, vx: 0, vy: 0 });
    s.wait = SERVE_WAIT;
    events.push({ type: 'point', side: winner, rally: s.hits });
    if (s.score[winner] >= s.to) {
      s.winner = winner;
      events.push({ type: 'win', side: winner });
    }
  }
}

// Where the ball will cross height y, following wall bounces; null if it's
// moving away.
export function predictX(ball, y) {
  if (!ball.vy || (y - ball.y) / ball.vy < 0) return null;
  const t = (y - ball.y) / ball.vy;
  const span = W - 2 * R;
  let x = ball.x - R + ball.vx * t;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  if (x > span) x = 2 * span - x;
  return x + R;
}

// The computer's target for the `side` paddle. It re-thinks every `think`
// seconds and misjudges by more as the ball speeds up, so long rallies end.
// Harder levels also angle their returns.
export function aiTarget(s, side, level, memo) {
  const L = LEVELS[level] || LEVELS.normal;
  memo.next = memo.next ?? 0;
  if (s.t < memo.next && memo.x != null) return memo.x;
  memo.next = s.t + L.think;
  const face = side === 'top' ? TOP_Y + R : BOTTOM_Y - R;
  const coming = side === 'top' ? s.ball.vy < 0 : s.ball.vy > 0;
  if (s.wait > 0 || !coming) {
    memo.x = W / 2;
    memo.aim = null;
    return memo.x;
  }
  const x = predictX(s.ball, face);
  // A fresh aim error per shot, from a cheap deterministic hash.
  if (memo.aim == null || memo.shot !== s.hits) {
    const rand = (k) => {
      const h = Math.sin((s.hits + 1) * 12.9898 + (s.score.top * 3 + s.score.bottom) * 78.233 + k * 39.425) * 43758.5453;
      return (h - Math.floor(h) - 0.5) * 2;
    };
    const fast = Math.hypot(s.ball.vx, s.ball.vy) / SERVE_SPEED;
    memo.aim = rand(1) * L.error * fast * fast - rand(2) * L.angle * (PADDLE_W / 2);
    memo.shot = s.hits;
  }
  memo.x = x + memo.aim;
  return memo.x;
}

export const aiSpeed = (level) => (LEVELS[level] || LEVELS.normal).speed;

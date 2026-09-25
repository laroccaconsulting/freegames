// Flap: tap to flap up, gravity pulls you down, fly through the gaps.
// Pure (no DOM) and deterministic per seed, so a daily course is the same
// for everyone and tests can fly it.
//
// state: { x (distance flown), y, vy, gates: [{ x, gap, size, passed }], score, over, t }

import { mulberry32 } from '../core/rng.js';

export const W = 360;
export const H = 600;
export const GROUND = H - 70; // top of the ground
export const BIRD_X = 110; // the bird stays here on screen; the world scrolls
export const R = 13; // drawn radius
const HIT_R = 10; // a little forgiving
export const GATE_W = 64;
const SPACING = 215;
const SPEED = 150;
const GRAVITY = 1500;
const FLAP = -440;
const TICK = 1 / 240;

// The gates of a course: gap centres wander but never jump too far, and gaps
// narrow a little as you go.
export function gateAt(seed, k) {
  const size = Math.max(132, 172 - k * 1.2);
  // A deterministic wander: each gap sits near the previous one.
  let y = H * 0.42;
  const r = mulberry32(seed);
  for (let i = 0; i <= k; i++) y = Math.max(90 + size / 2, Math.min(GROUND - 60 - size / 2, y + (r() - 0.5) * 2 * Math.min(170, 90 + i * 4)));
  return { x: 420 + k * SPACING, gap: y, size };
}

export function newRun(seed) {
  return { seed, x: 0, y: H * 0.42, vy: 0, gates: [0, 1, 2, 3].map((k) => ({ ...gateAt(seed, k), k, passed: false })), score: 0, over: false, t: 0, started: false };
}

// Advance by dt seconds; `flap` is true if the player tapped this frame.
export function step(s, dt, flap = false) {
  const events = [];
  if (s.over) return events;
  if (flap) {
    s.started = true;
    s.vy = FLAP;
    events.push({ type: 'flap' });
  }
  if (!s.started) {
    // Hover gently until the first tap.
    s.t += dt;
    s.y = H * 0.42 + Math.sin(s.t * 4) * 6;
    return events;
  }
  let left = Math.min(dt, 0.05);
  while (left > 1e-9 && !s.over) {
    const h = Math.min(TICK, left);
    tick(s, h, events);
    left -= h;
  }
  return events;
}

function tick(s, dt, events) {
  s.t += dt;
  s.x += SPEED * dt;
  s.vy = Math.min(s.vy + GRAVITY * dt, 700);
  s.y += s.vy * dt;
  if (s.y < R) {
    s.y = R;
    s.vy = 0;
  }
  const bx = s.x + BIRD_X;
  for (const g of s.gates) {
    // Passing a gate scores.
    if (!g.passed && bx > g.x + GATE_W) {
      g.passed = true;
      s.score++;
      events.push({ type: 'score', score: s.score });
    }
    // Circle against the two pillars.
    if (bx + HIT_R < g.x || bx - HIT_R > g.x + GATE_W) continue;
    const top = g.gap - g.size / 2;
    const bottom = g.gap + g.size / 2;
    const nx = Math.max(g.x, Math.min(bx, g.x + GATE_W));
    const hitTop = Math.hypot(bx - nx, s.y - Math.min(s.y, top)) < HIT_R && s.y - HIT_R < top;
    const hitBottom = Math.hypot(bx - nx, s.y - Math.max(s.y, bottom)) < HIT_R && s.y + HIT_R > bottom;
    if (hitTop || hitBottom) return crash(s, events);
  }
  if (s.y + R >= GROUND) {
    s.y = GROUND - R;
    return crash(s, events);
  }
  // Keep four gates ahead.
  if (s.gates[0].x + GATE_W < s.x - 20) {
    s.gates.shift();
    const k = s.gates[s.gates.length - 1].k + 1;
    s.gates.push({ ...gateAt(s.seed, k), k, passed: false });
  }
}

function crash(s, events) {
  s.over = true;
  events.push({ type: 'crash', score: s.score });
}

export function medalFor(score) {
  if (score >= 100) return { name: 'Platinum', icon: 'diamond' };
  if (score >= 50) return { name: 'Gold', icon: 'trophy' };
  if (score >= 25) return { name: 'Silver', icon: 'star' };
  if (score >= 10) return { name: 'Bronze', icon: 'medal' };
  return null;
}

export const PHYSICS = { SPEED, GRAVITY, FLAP, SPACING };

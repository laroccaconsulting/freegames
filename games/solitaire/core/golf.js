// "Puzzle golf": shared pieces for games where a solver sets par.
// Daily puzzles, links that carry a puzzle, par ratings and share text.
// Pure functions except where noted, so they can be unit-tested.

// Stable 32-bit hash of a string (FNV-1a with a final avalanche).
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

// Today's date in the player's own time zone, as YYYY-MM-DD.
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const dayIndex = (key) => Math.round(Date.UTC(...key.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) / 86400000);

// Daily puzzle number, counted from the game's launch day (#1).
export function dailyNumber(key, launchKey) {
  return dayIndex(key) - dayIndex(launchKey) + 1;
}

export function addDays(key, days) {
  const d = new Date((dayIndex(key) + days) * 86400000);
  return d.toISOString().slice(0, 10);
}

// Every player gets the same daily puzzle: the seed depends only on the game and date.
export function dailySeed(game, key) {
  return hashSeed(`${game}:daily:${key}`);
}

// Links carry the puzzle in the hash (#d=2026-09-24 or #l=12), never on a server.
export function parseHash(hash) {
  const out = {};
  for (const part of String(hash).replace(/^#/, '').split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

export function buildHash(params) {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

// Par is the fewest moves possible, so the best result is "Perfect".
export function rating(moves, par) {
  const over = moves - par;
  if (over <= 0) return { over: 0, label: 'Perfect', emoji: '💎', tier: 3 };
  if (over <= Math.max(1, Math.round(par * 0.1))) return { over, label: 'Great', emoji: '🌟', tier: 2 };
  if (over <= Math.max(3, Math.round(par * 0.3))) return { over, label: 'Solved', emoji: '✅', tier: 1 };
  return { over, label: 'Finished', emoji: '👍', tier: 0 };
}

export const overText = (over) => (over > 0 ? `+${over}` : 'par');

// A spoiler-free row of squares: green up to par, yellow for each move over.
export function squares(moves, par, max = 10) {
  const over = Math.max(0, moves - par);
  const greens = Math.max(1, Math.round((max * par) / Math.max(moves, par)));
  const yellows = Math.min(max - greens, over ? Math.max(1, Math.round((max * over) / moves)) : 0);
  return '🟩'.repeat(greens) + '🟨'.repeat(yellows);
}

// Streaks for daily puzzles. `log` maps date keys to results.
export function dailyStreak(log, today) {
  let streak = 0;
  let key = log[today] ? today : addDays(today, -1);
  while (log[key]) {
    streak++;
    key = addDays(key, -1);
  }
  return streak;
}

// Shares text with the system share sheet, or copies it. Uses the DOM.
export async function shareText(text, url) {
  const full = url ? `${text}\n${url}` : text;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text: full });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(full);
    return 'copied';
  } catch {
    return 'failed';
  }
}

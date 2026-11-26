// Progress, stars and scores. Pure, so tests can check the rules.
import { LEVELS, CHAPTERS } from './levels.js';

/** Stars for a win: 1 solved, 2 within the parts target, 3 also within the time. A shown hint part caps it at 2. */
export function starsFor(level, { parts, time, hinted = false }) {
  let s = 1;
  if (parts <= level.stars.parts) {
    s = 2;
    if (time <= level.stars.time + 1e-9 && !hinted) s = 3;
  }
  return s;
}

/** Score: 1000 + 150 per part left in the box + 40 per second under the limit − 50 per earlier try (at least 100). */
export function scoreFor(level, { parts, time, tries }) {
  const offered = Object.values(level.parts || {}).reduce((a, b) => a + b, 0);
  const limit = level.timeLimit ?? 20;
  const left = Math.max(0, offered - parts);
  const under = Math.max(0, Math.round((limit - time) * 10) / 10);
  return Math.max(100, Math.round(1000 + 150 * left + 40 * under - 50 * Math.max(0, tries - 1)));
}

/** Merge a win into a level's record, keeping the best of each. */
export function record(prev = {}, win) {
  const r = { ...prev };
  r.solved = true;
  r.stars = Math.max(prev.stars || 0, win.stars);
  r.score = Math.max(prev.score || 0, win.score);
  r.time = prev.time != null ? Math.min(prev.time, win.time) : win.time;
  r.parts = prev.parts != null ? Math.min(prev.parts, win.parts) : win.parts;
  r.flawless = !!(prev.flawless || win.tries <= 1);
  r.tries = 0;
  return r;
}

export const isSolved = (progress, id) => !!progress[id]?.solved;

/** Levels open in order: the first, and any whose previous level is solved. */
export function isOpen(progress, index) {
  return index === 0 || isSolved(progress, LEVELS[index - 1].id) || isSolved(progress, LEVELS[index].id);
}

export function chapterOpen(progress, c) {
  const first = LEVELS.findIndex((l) => l.chapter === c);
  return first >= 0 && isOpen(progress, first);
}

export function chapterDone(progress, c) {
  return LEVELS.filter((l) => l.chapter === c).every((l) => isSolved(progress, l.id));
}

export const totalStars = (progress) => LEVELS.reduce((n, l) => n + (progress[l.id]?.stars || 0), 0);

/** The level to play next: the first unsolved open one, else the last. */
export function nextLevel(progress) {
  const i = LEVELS.findIndex((l, k) => isOpen(progress, k) && !isSolved(progress, l.id));
  return LEVELS[i >= 0 ? i : LEVELS.length - 1];
}

/** Part types you have met: those of every open chapter. */
export function unlockedParts(progress) {
  const types = new Set();
  const intro = { 0: ['ramp'], 1: ['lever', 'weight'], 2: ['conveyor', 'motor'], 3: ['gear'], 4: ['chain'], 5: ['bouncer'] };
  CHAPTERS.forEach((_, c) => {
    if (chapterOpen(progress, c)) for (const t of intro[c]) types.add(t);
  });
  return types;
}

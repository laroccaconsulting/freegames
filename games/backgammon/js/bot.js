// The computer player. Every level looks at every distinct way to play the
// dice and scores the position each one leaves:
//   easy   – a rough score with a lot of noise, so it makes real mistakes
//   medium – the best play by the position score
//   hard   – the best few plays are checked against all 21 rolls the
//            opponent could throw next, and their best reply to each
// Scores are in pips (one pip = one point of travel), so they read naturally.
import { allPlays, applyStep, count, pointOf, indexOf, pipCount, CHECKERS } from './engine.js';

export const LEVELS = ['easy', 'medium', 'hard'];

// The 21 different rolls and how many of the 36 ways to throw two dice give each.
export const ROLLS = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push({ a, b, weight: a === b ? 1 : 2 });

// Value of holding a point (two or more checkers), by the owner's point number.
const POINT_VALUE = [0, 1, 2, 3, 5, 6, 5, 5, 3, 1.5, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 2.5, 4, 4, 2.5, 2, 1.5];
const PRIME = [0, 0, 1, 3, 7, 12, 20];

// Are the two sides still able to hit each other?
export function inContact(s) {
  // Player 0's rearmost checker and player 1's, both as player 0's point numbers.
  let back0 = s.bar[0] ? 25 : 0;
  let back1 = s.bar[1] ? 0 : 25;
  for (let i = 0; i < 24; i++) {
    if (s.board[i] > 0) back0 = Math.max(back0, i + 1);
    if (s.board[i] < 0) back1 = Math.min(back1, i + 1);
  }
  return back0 > back1;
}

// How many of the 36 rolls let `attacker` hit a lone checker at index `target`.
export function shots(s, attacker, target) {
  const tp = pointOf(attacker, target);
  const blocked = (pt) => pt >= 1 && count(s, 1 - attacker, indexOf(attacker, pt)) >= 2;
  const sources = [];
  if (s.bar[attacker]) sources.push(25);
  else for (let i = 0; i < 24; i++) if (count(s, attacker, i) && pointOf(attacker, i) > tp) sources.push(pointOf(attacker, i));
  if (!sources.length) return 0;
  let n = 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      const hit = sources.some((sp) => {
        const d = sp - tp;
        if (d === a || d === b) return true;
        if (a === b) {
          for (let k = 2; k <= 4; k++) {
            if (blocked(sp - a * (k - 1))) return false;
            if (d === a * k) return true;
          }
          return false;
        }
        return d === a + b && (!blocked(sp - a) || !blocked(sp - b));
      });
      if (hit) n++;
    }
  }
  return n;
}

function homePoints(s, p) {
  let n = 0;
  for (let pt = 1; pt <= 6; pt++) if (count(s, p, indexOf(p, pt)) >= 2) n++;
  return n;
}

// The position after p has moved, with the opponent to roll, scored for p.
export function evaluate(s, p) {
  const o = 1 - p;
  if (s.winner === p) return 10000 + 1000 * s.result;
  if (s.winner === o) return -10000 - 1000 * s.result;
  const race = pipCount(s, o) - pipCount(s, p);
  if (!inContact(s)) {
    // A race: pips, plus a little for checkers already off and a smooth home board.
    let waste = 0;
    for (let i = 0; i < 24; i++) waste += Math.max(0, count(s, p, i) - 3) * 0.4;
    return race + (s.off[p] - s.off[o]) * 1.5 - waste;
  }
  let score = race;
  const oppHome = homePoints(s, o);
  const myHome = homePoints(s, p);
  // Lone checkers the opponent can hit next roll; being hit costs the
  // distance the checker had come, plus more if their board is strong.
  for (let i = 0; i < 24; i++) {
    if (count(s, p, i) !== 1) continue;
    const n = shots(s, o, i);
    if (!n) continue;
    const lost = 25 - pointOf(p, i);
    score -= (n / 36) * (lost + 4) * (1 + oppHome / 4);
  }
  // Points held, primes, and crowded stacks.
  let run = 0;
  let best = 0;
  // The opponent's rearmost checker, as p's point number: a prime only
  // matters if they still have to get past it.
  let oppBack = 0;
  for (let i = 0; i < 24; i++) if (count(s, o, i)) oppBack = Math.max(oppBack, 25 - pointOf(o, i));
  if (s.bar[o]) oppBack = 25;
  for (let pt = 1; pt <= 24; pt++) {
    const n = count(s, p, indexOf(p, pt));
    if (n >= 2) {
      score += POINT_VALUE[pt];
      if (pt < oppBack) run++;
      else run = 0;
      best = Math.max(best, run);
    } else run = 0;
    if (n > 3) score -= (n - 3) * 0.8;
  }
  score += PRIME[Math.min(6, best)];
  // Checkers on the bar against a closed-up home board.
  score += s.bar[o] * (1 + myHome * myHome * 0.6);
  score -= s.bar[p] * (1 + oppHome * oppHome * 0.6);
  // Back checkers trapped deep while the opponent builds.
  for (const pt of [24, 23]) score -= count(s, p, indexOf(p, pt)) * oppHome * 0.5;
  return score;
}

function best(plays, score) {
  let top = null;
  let topScore = -Infinity;
  for (const pl of plays) {
    const v = score(pl);
    if (v > topScore) {
      top = pl;
      topScore = v;
    }
  }
  return top;
}

// The opponent's best reply by the position score, for each of their rolls.
function replyValue(state, p) {
  const o = 1 - p;
  if (state.winner != null) return evaluate(state, p);
  let total = 0;
  for (const { a, b, weight } of ROLLS) {
    const rolled = { ...state, turn: o, dice: a === b ? [a, a, a, a] : [a, b] };
    const plays = allPlays(rolled);
    let worst;
    if (!plays.length) worst = evaluate(state, p);
    else {
      let top = -Infinity;
      for (const pl of plays) top = Math.max(top, evaluate(pl.state, o));
      worst = -top;
    }
    total += worst * weight;
  }
  return total / 36;
}

// Returns the steps to play for the mover of `s` (dice already rolled), or [] to pass.
export function choosePlay(s, level = 'medium', { random = Math.random, width = 6 } = {}) {
  const p = s.turn;
  const plays = allPlays(s);
  if (!plays.length) return [];
  if (plays.length === 1) return plays[0].steps;
  if (level === 'easy') {
    // Noise the size of a couple of dice: it keeps obvious hits and safe
    // points, but often misses the better play.
    return best(plays, (pl) => evaluate(pl.state, p) + (random() - 0.5) * 20).steps;
  }
  const scored = plays.map((pl) => ({ pl, v: evaluate(pl.state, p) + random() * 0.01 })).sort((x, y) => y.v - x.v);
  if (level === 'medium' || !inContact(s)) return scored[0].pl.steps;
  // Hard: look one roll ahead for the most promising plays.
  const shortlist = scored.slice(0, width).filter((x, i) => i === 0 || x.v > scored[0].v - 25);
  return best(shortlist, (x) => replyValue(x.pl.state, p)).pl.steps;
}

// A plain-language reason for a play, for hints.
export function describePlay(s, steps) {
  const p = s.turn;
  const o = 1 - p;
  let st = s;
  let hits = 0;
  for (const step of steps) {
    if (step.to !== 'off' && count(st, o, step.to) === 1) hits++;
    st = applyStep(st, step);
  }
  const reasons = [];
  if (st.winner === p) return 'This wins the game.';
  if (hits) reasons.push(hits > 1 ? `hits ${hits} checkers` : 'hits a checker');
  const made = [];
  for (let i = 0; i < 24; i++) if (count(st, p, i) >= 2 && count(s, p, i) < 2) made.push(pointOf(p, i));
  if (made.length) reasons.push(`makes your ${made.join(' and ')} point${made.length > 1 ? 's' : ''}`);
  if (st.off[p] > s.off[p]) reasons.push(`bears off ${st.off[p] - s.off[p]}`);
  let blotsBefore = 0;
  let blotsAfter = 0;
  for (let i = 0; i < 24; i++) {
    if (count(s, p, i) === 1 && shots(s, o, i)) blotsBefore++;
    if (count(st, p, i) === 1 && shots(st, o, i)) blotsAfter++;
  }
  if (!blotsAfter && inContact(st)) reasons.push('leaves no shots');
  else if (blotsAfter < blotsBefore) reasons.push('leaves fewer shots');
  if (!inContact(st) && inContact(s)) reasons.push('breaks contact for a race');
  if (!reasons.length) reasons.push(pipCount(st, p) < pipCount(st, o) ? 'keeps your lead in the race' : 'keeps your position flexible');
  const text = reasons.join(', ');
  return text[0].toUpperCase() + text.slice(1) + '.';
}

export { CHECKERS };

// Ten Thousand: roll six dice, set aside scoring dice, then roll the rest
// or bank your points. Roll nothing that scores and you lose the turn's
// points. First to 10,000 wins. Pure (no DOM).
//
// Scoring: a 1 is 100, a 5 is 50. Three of a kind is 100 × the face (three
// 1s are 1,000); each extra die of the kind doubles it. A straight (1–6)
// or three pairs is 1,500.

export const TARGET = 10000;

const counts = (dice) => {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
};

// Points for a set of dice where every die must score; 0 if any doesn't.
export function scoreSet(dice) {
  if (!dice.length) return 0;
  const c = counts(dice);
  if (dice.length === 6 && c.slice(1).every((n) => n === 1)) return 1500;
  if (dice.length === 6 && c.filter((n) => n === 2).length === 3) return 1500;
  let pts = 0;
  for (let f = 1; f <= 6; f++) {
    let n = c[f];
    if (n >= 3) {
      const base = f === 1 ? 1000 : f * 100;
      pts += base * 2 ** (n - 3);
      n = 0;
    }
    if (f === 1) pts += n * 100;
    else if (f === 5) pts += n * 50;
    else if (n) return 0;
  }
  return pts;
}

// The best-scoring choice of dice from a roll: { pick: [indexes], points }.
export function best(dice) {
  let top = { pick: [], points: 0 };
  for (let m = 1; m < 1 << dice.length; m++) {
    const pick = dice.map((_, k) => k).filter((k) => m & (1 << k));
    const pts = scoreSet(pick.map((k) => dice[k]));
    if (pts > top.points || (pts === top.points && pts && pick.length > top.pick.length)) top = { pick, points: pts };
  }
  return top;
}

export const scores = (dice) => best(dice).points > 0;

// Should the computer bank? More dice left means rolling again is safer.
export function shouldBank(turnPoints, diceLeft, myScore, theirBest, level = 'medium') {
  if (myScore + turnPoints >= TARGET) return true;
  const behind = theirBest - myScore > 2500;
  const need = { 6: Infinity, 5: 2000, 4: 1000, 3: 400, 2: 300, 1: 250 }[diceLeft] ?? 300;
  const factor = level === 'bold' || behind ? 1.6 : level === 'careful' ? 0.7 : 1;
  return turnPoints >= need * factor;
}

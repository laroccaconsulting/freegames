// Hearts achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-win', title: 'First win', desc: 'Win a game of Hearts.' },
  { id: 'clean-hand', title: 'Clean hands', desc: 'Finish a hand without taking a point.' },
  { id: 'moon', title: 'Shoot the moon', desc: 'Take every heart and the queen in one hand.' },
  { id: 'under-30', title: 'Barely touched', desc: 'Win a game with 30 points or fewer.' },
  { id: 'wins-10', title: 'Card sharp', desc: 'Win 10 games.', goal: 10 },
  { id: 'hands-100', title: 'Long evenings', desc: 'Play 100 hands.', goal: 100 },
];

// Spades achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-win', title: 'First win', desc: 'Win a game of Spades with your partner.' },
  { id: 'made-bid', title: 'Contract kept', desc: 'Make your team’s bid in a hand.' },
  { id: 'nil', title: 'Nil and void', desc: 'Bid nil and take no tricks.' },
  { id: 'big-bid', title: 'Bold bid', desc: 'Bid 6 or more yourself and make it.' },
  { id: 'set', title: 'Set them', desc: 'Stop the other team making their bid.' },
  { id: 'no-bags', title: 'Tidy', desc: 'Win a game without a bag penalty.' },
  { id: 'wins-10', title: 'Partners in crime', desc: 'Win 10 games.', goal: 10 },
  { id: 'hands-100', title: 'Card table regular', desc: 'Play 100 hands.', goal: 100 },
];

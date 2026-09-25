// Dice achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'yacht-game', title: 'Full card', desc: 'Finish a game of Yacht.' },
  { id: 'yacht', title: 'Yacht!', desc: 'Score a Yacht: five of a kind.' },
  { id: 'bonus', title: 'Top half', desc: 'Earn the upper-section bonus in Yacht.' },
  { id: 'yacht-250', title: 'Big score', desc: 'Score 250 or more in Yacht.', goal: 250 },
  { id: 'yacht-beat', title: 'Dice duel', desc: 'Beat a computer player at Yacht.' },
  { id: 'tenk-win', title: 'Ten thousand', desc: 'Win a game of Ten Thousand against the computer.' },
  { id: 'tenk-5', title: 'High roller', desc: 'Win 5 games of Ten Thousand against the computer.', goal: 5 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily Yacht.' },
];

// Dots and Boxes achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-win', title: 'First win', desc: 'Beat the computer.' },
  { id: 'beat-normal', title: 'Getting serious', desc: 'Beat the computer on Normal.' },
  { id: 'beat-hard', title: 'Top of the class', desc: 'Beat the computer on Hard.' },
  { id: 'wins-10', title: 'Regular', desc: 'Beat the computer 10 times.', goal: 10 },
  { id: 'wins-50', title: 'Veteran', desc: 'Beat the computer 50 times.', goal: 50 },
  { id: 'friend', title: 'Pass it on', desc: 'Finish a game against a friend on one device.' },
  { id: 'big-board', title: 'Big board', desc: 'Beat the computer on the 6×6 board.' },
  { id: 'shutout', title: 'Shutout', desc: 'Beat the computer without letting it close a single box.', secret: true },
];

// Backgammon achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-win', title: 'First win', desc: 'Beat the computer.' },
  { id: 'beat-medium', title: 'Getting serious', desc: 'Beat the computer on Medium.' },
  { id: 'beat-hard', title: 'Top of the class', desc: 'Beat the computer on Hard.' },
  { id: 'wins-10', title: 'Regular', desc: 'Beat the computer 10 times.', goal: 10 },
  { id: 'wins-50', title: 'Veteran', desc: 'Beat the computer 50 times.', goal: 50 },
  { id: 'friend', title: 'Pass it on', desc: 'Finish a game against a friend on one device.' },
  { id: 'gammon', title: 'Gammon', desc: 'Win a gammon: bear off before your opponent bears off any.' },
  { id: 'backgammon', title: 'Backgammon!', desc: 'Win a backgammon, the biggest win there is.', secret: true },
];

// Clusters achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'Pop!', desc: 'Finish a board.' },
  { id: 'clear', title: 'Clean sweep', desc: 'Clear every tile off a board.' },
  { id: 'big-group', title: 'Big pop', desc: 'Pop a group of 15 or more tiles at once.' },
  { id: 'target', title: 'On target', desc: 'Beat the target score.' },
  { id: 'tricky', title: 'Tricky', desc: 'Clear a Tricky board completely.' },
  { id: 'boards-25', title: 'Collector', desc: 'Finish 25 boards.', goal: 25 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

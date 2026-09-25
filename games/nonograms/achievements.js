// Nonograms achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'First picture', desc: 'Solve a nonogram.' },
  { id: 'large', title: 'Big picture', desc: 'Solve a 15×15 puzzle.' },
  { id: 'clean', title: 'Pure logic', desc: 'Solve a 10×10 or bigger without hints.' },
  { id: 'fast', title: 'Quick sketch', desc: 'Solve a 10×10 in under 5 minutes.' },
  { id: 'solved-50', title: 'Gallery', desc: 'Solve 50 puzzles.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

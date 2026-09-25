// Pipes achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'Plumbed in', desc: 'Connect a whole network.' },
  { id: 'par', title: 'Perfect plumbing', desc: 'Solve a board in par without hints.' },
  { id: 'large', title: 'Big network', desc: 'Solve a 9×11 board.' },
  { id: 'huge', title: 'Waterworks', desc: 'Solve an 11×15 board.' },
  { id: 'solved-50', title: 'Master plumber', desc: 'Solve 50 boards.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

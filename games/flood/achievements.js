// Flood achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'First flood', desc: 'Fill a board with one colour.' },
  { id: 'par', title: 'On par', desc: 'Finish a board in par or better without hints.' },
  { id: 'birdie', title: 'Birdie', desc: 'Beat par.' },
  { id: 'level-10', title: 'Rising tide', desc: 'Reach level 10.' },
  { id: 'level-30', title: 'High water', desc: 'Reach level 30.' },
  { id: 'solved-50', title: 'Flood plain', desc: 'Finish 50 boards.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

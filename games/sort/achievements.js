// Sort achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'First sort', desc: 'Solve your first puzzle.' },
  { id: 'perfect', title: 'Perfect', desc: 'Match par without hints.' },
  { id: 'birdie', title: 'Birdie', desc: 'Beat par.' },
  { id: 'level-10', title: 'Ten down', desc: 'Clear level 10.', goal: 10 },
  { id: 'level-25', title: 'Twenty-five', desc: 'Clear level 25.', goal: 25 },
  { id: 'solved-50', title: 'Fifty', desc: 'Solve 50 puzzles.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
  { id: 'no-extra', title: 'Tidy', desc: 'Solve a level 20 or later without the extra tube.' },
];

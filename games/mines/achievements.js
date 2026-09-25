// Minesweeper achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'Cleared', desc: 'Clear a board.' },
  { id: 'intermediate', title: 'Intermediate', desc: 'Clear an Intermediate board.' },
  { id: 'expert', title: 'Expert sweeper', desc: 'Clear an Expert board.' },
  { id: 'clean', title: 'Steady hands', desc: 'Clear a board without hints or undos.' },
  { id: 'beginner-60', title: 'Quick sweep', desc: 'Clear a Beginner board in under a minute.' },
  { id: 'cleared-25', title: 'Minefield veteran', desc: 'Clear 25 boards.', goal: 25 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

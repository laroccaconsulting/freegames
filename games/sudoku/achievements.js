// Sudoku achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'First grid', desc: 'Solve a sudoku.' },
  { id: 'hard', title: 'Hard nut', desc: 'Solve a Hard sudoku.' },
  { id: 'expert', title: 'Expert', desc: 'Solve an Expert sudoku.' },
  { id: 'clean', title: 'No help needed', desc: 'Solve a sudoku without hints.' },
  { id: 'fast', title: 'Speed solver', desc: 'Solve a Medium or harder sudoku in under 10 minutes without hints.' },
  { id: 'solved-50', title: 'Fifty grids', desc: 'Solve 50 sudokus.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

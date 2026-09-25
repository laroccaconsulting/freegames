// Logic achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'mode-stars', title: 'Star gazer', desc: 'Solve a Star Battle.' },
  { id: 'mode-calc', title: 'Number cruncher', desc: 'Solve a Calcudoku.' },
  { id: 'mode-bridges', title: 'Bridge builder', desc: 'Solve a Bridges puzzle.' },
  { id: 'mode-futoshiki', title: 'Greater than', desc: 'Solve a Futoshiki.' },
  { id: 'mode-skyscrapers', title: 'Skyline', desc: 'Solve a Skyscrapers puzzle.' },
  { id: 'mode-lightup', title: 'Lights on', desc: 'Solve a Light Up.' },
  { id: 'mode-tents', title: 'Happy camper', desc: 'Solve a Tents puzzle.' },
  { id: 'all-modes', title: 'Polymath', desc: 'Solve one of every kind of puzzle.' },
  { id: 'large', title: 'Big thinker', desc: 'Solve a puzzle at the largest size without hints.' },
  { id: 'solved-100', title: 'Logician', desc: 'Solve 100 puzzles.', goal: 100 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the same daily puzzle 7 days in a row.', goal: 7 },
];

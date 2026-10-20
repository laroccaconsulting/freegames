// Nonograms achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'First solve', desc: 'Solve a nonogram.' },
  { id: 'large', title: 'Big picture', desc: 'Solve a 15×15 puzzle.' },
  { id: 'clean', title: 'Pure logic', desc: 'Solve a 10×10 or bigger without hints.' },
  { id: 'fast', title: 'Quick sketch', desc: 'Solve a 10×10 in under 5 minutes.' },
  { id: 'solved-50', title: 'Fifty grids', desc: 'Solve 50 puzzles.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
  { id: 'picture-1', title: 'First drawing', desc: 'Reveal your first picture in the Pictures series.' },
  { id: 'pictures-10', title: 'Sketchbook', desc: 'Reveal 10 pictures.', goal: 10 },
  { id: 'pictures-25', title: 'Art class', desc: 'Reveal 25 pictures.', goal: 25 },
  { id: 'pictures-50', title: 'Gallery opening', desc: 'Reveal 50 pictures.', goal: 50 },
  { id: 'pictures-100', title: 'Masterpiece collection', desc: 'Reveal all 100 pictures.', goal: 100 },
  { id: 'pictures-big', title: 'Big canvas', desc: 'Reveal every 15×15 picture.' },
];

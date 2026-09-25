// Code Breaker achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'Code cracked', desc: 'Crack a code.' },
  { id: 'par', title: 'Sharp mind', desc: 'Crack a code in par or better without hints.' },
  { id: 'hard', title: 'Safecracker', desc: 'Crack a Hard code.' },
  { id: 'three', title: 'Mind reader', desc: 'Crack a code in three guesses or fewer.' },
  { id: 'cracked-50', title: 'Codebook', desc: 'Crack 50 codes.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily code.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish a daily code 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish a daily code 30 days in a row.', goal: 30 },
];

// Fleet achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-win', title: 'Admiral', desc: 'Sink the computer’s fleet.' },
  { id: 'beat-hard', title: 'Fleet admiral', desc: 'Sink the Hard computer’s fleet.' },
  { id: 'wins-10', title: 'Seasoned', desc: 'Win 10 battles.', goal: 10 },
  { id: 'solo', title: 'Sharpshooter', desc: 'Sink every ship in a solo sea.' },
  { id: 'par', title: 'Eagle eye', desc: 'Sink a solo sea in par or better without hints.' },
  { id: 'seas-25', title: 'Old salt', desc: 'Clear 25 solo seas.', goal: 25 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

// Mahjong achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'Cleared', desc: 'Clear a layout.' },
  { id: 'turtle', title: 'Turtle power', desc: 'Clear the full Turtle layout.' },
  { id: 'pyramid', title: 'Pyramid builder', desc: 'Clear the Pyramid layout.' },
  { id: 'clean', title: 'No help needed', desc: 'Clear the Turtle without hints or shuffles.' },
  { id: 'fast', title: 'Quick hands', desc: 'Clear the Turtle in under 8 minutes.' },
  { id: 'cleared-25', title: 'Tile master', desc: 'Clear 25 layouts.', goal: 25 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
];

// Sort achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first', title: 'First sort', desc: 'Solve your first puzzle.' },
  { id: 'perfect', title: 'Perfect', desc: 'Match par without hints.' },
  { id: 'birdie', title: 'Ten perfect', desc: 'Match par on 10 puzzles without help.', goal: 10 },
  { id: 'level-10', title: 'Ten down', desc: 'Clear level 10.', goal: 10 },
  { id: 'level-25', title: 'Twenty-five', desc: 'Clear level 25.', goal: 25 },
  { id: 'solved-50', title: 'Fifty', desc: 'Solve 50 puzzles.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Finish a daily puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Finish the daily 30 days in a row.', goal: 30 },
  { id: 'no-extra', title: 'Tidy', desc: 'Solve a level 20 or later without the extra tube.' },
  { id: 'advanced', title: 'Advanced', desc: 'Solve an Advanced level.' },
  { id: 'advanced-10', title: 'Tight squeeze', desc: 'Clear Advanced level 10.', goal: 10 },
  { id: 'advanced-25', title: 'Deep end', desc: 'Clear Advanced level 25.', goal: 25 },
  { id: 'advanced-50', title: 'Master mixer', desc: 'Clear Advanced level 50.', goal: 50 },
  { id: 'hidden', title: 'In the dark', desc: 'Solve a puzzle with hidden layers.' },
  { id: 'locked', title: 'Key holder', desc: 'Solve a puzzle with a locked tube.' },
  { id: 'frozen', title: 'Thaw', desc: 'Solve a puzzle with a frozen tube.' },
  { id: 'hardcore', title: 'Hardcore', desc: 'Clear an Advanced level in hardcore.' },
  { id: 'flawless', title: 'Flawless', desc: 'Clear a hardcore level on your first life.' },
  { id: 'flawless-10', title: 'Untouchable', desc: 'Clear 10 hardcore levels on the first life.', goal: 10 },
];

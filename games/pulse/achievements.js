// Pulse achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-level', title: 'On the beat', desc: 'Complete a level.' },
  { id: 'all-levels', title: 'Full album', desc: 'Complete every hand-made level.' },
  { id: 'first-try', title: 'Sight-reader', desc: 'Complete a level on your first attempt.' },
  { id: 'all-coins', title: 'Collector', desc: 'Find every coin in a level.' },
  { id: 'practice', title: 'Rehearsal', desc: 'Finish a level in practice mode.' },
  { id: 'endless-10', title: 'Encore', desc: 'Complete 10 generated levels.', goal: 10 },
  { id: 'daily', title: 'Daily habit', desc: 'Complete a daily level.' },
  { id: 'jumps-1000', title: 'Bouncy', desc: 'Jump 1,000 times.', goal: 1000 },
];

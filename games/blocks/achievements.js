// Blocks achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-line', title: 'Clean line', desc: 'Clear a line.' },
  { id: 'double', title: 'Double', desc: 'Clear two lines with one piece.' },
  { id: 'quad', title: 'Quad!', desc: 'Clear four lines with one piece.', secret: true },
  { id: 'streak-5', title: 'In the zone', desc: 'Clear lines five pieces in a row.' },
  { id: 'score-1000', title: 'Thousand', desc: 'Score 1,000 in a classic game.', goal: 1000 },
  { id: 'score-5000', title: 'Block master', desc: 'Score 5,000 in a classic game.', goal: 5000 },
  { id: 'beat-target', title: 'On target', desc: 'Beat the daily target.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the daily 7 days in a row.', goal: 7 },
];

// Words achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'codeword', title: 'Codebreaker', desc: 'Crack a Codeword.' },
  { id: 'codeword-clean', title: 'Unaided', desc: 'Crack a Codeword without reveals or checks.' },
  { id: 'nine', title: 'The nine', desc: 'Find the nine-letter word in a Word Wheel.' },
  { id: 'wheel-genius', title: 'Wheel genius', desc: 'Reach the top rank in a Word Wheel.' },
  { id: 'ladder-par', title: 'Shortest ladder', desc: 'Finish a Word Ladder in par without hints.' },
  { id: 'grid-long', title: 'Long word', desc: 'Find a word of 7 letters or more in a Word Grid.' },
  { id: 'search', title: 'Sharp eyes', desc: 'Find every word in a Word Search.' },
  { id: 'all-five', title: 'Word nerd', desc: 'Finish one of each: Codeword, Wheel, Ladder, Grid and Search.' },
  { id: 'daily', title: 'Daily habit', desc: 'Finish any daily word puzzle.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Finish the same daily puzzle 7 days in a row.', goal: 7 },
];

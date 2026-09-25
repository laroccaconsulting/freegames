// Solitaire achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'klondike', title: 'Klondike', desc: 'Win a game of Klondike.' },
  { id: 'draw-3', title: 'Draw three', desc: 'Win Klondike with draw 3.' },
  { id: 'spider', title: 'Spider', desc: 'Win a game of Spider.' },
  { id: 'spider-4', title: 'Four-suit Spider', desc: 'Win Spider with all four suits.' },
  { id: 'freecell', title: 'FreeCell', desc: 'Win a game of FreeCell.' },
  { id: 'fast', title: 'Quick deal', desc: 'Win any game in under 3 minutes.' },
  { id: 'streak-5', title: 'On a roll', desc: 'Win 5 games in a row of one kind.' },
  { id: 'wins-100', title: 'Card shark', desc: 'Win 100 games.', goal: 100 },
];

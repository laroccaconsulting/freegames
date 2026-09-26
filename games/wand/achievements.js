// Wand achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'first-spell', title: 'It works', desc: 'Cast your first spell.' },
  { id: 'every-glyph', title: 'Whole spellbook', desc: 'Cast all eighteen spells at least once.', goal: 18 },
  { id: 'all-trials', title: 'Chamber cleared', desc: 'Finish every trial.', goal: 10 },
  { id: 'clean-cast', title: 'Steady hand', desc: 'Draw a glyph almost perfectly.' },
  { id: 'streak-10', title: 'No fumbles', desc: 'Cast ten spells in a row without one fizzling.', goal: 10 },
  { id: 'casts-100', title: 'Practised', desc: 'Cast a hundred spells.', goal: 100 },
  { id: 'combination', title: 'Two spells, one problem', desc: 'Solve something no single spell can do.' },
  { id: 'journey-done', title: 'Somewhere else', desc: 'Finish a place beyond the practice chamber.' },
  { id: 'all-places', title: 'Everywhere', desc: 'Finish all four journeys.', goal: 4 },
  { id: 'butterfingers', title: 'Butterfingers', desc: 'Mend the urn, then break it again.', secret: true },
];

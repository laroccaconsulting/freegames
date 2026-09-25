// Flap achievements: plain data, also shown on the games list.
// id is the save key, so never change one. goal: a count to reach.
export default [
  { id: 'bronze', title: 'Bronze', desc: 'Fly through 10 gates in one run.', goal: 10 },
  { id: 'silver', title: 'Silver', desc: 'Fly through 25 gates in one run.', goal: 25 },
  { id: 'gold', title: 'Gold', desc: 'Fly through 50 gates in one run.', goal: 50 },
  { id: 'platinum', title: 'Platinum', desc: 'Fly through 100 gates in one run.', goal: 100 },
  { id: 'flights-50', title: 'Frequent flyer', desc: 'Take 50 flights.', goal: 50 },
  { id: 'daily', title: 'Daily habit', desc: 'Fly the daily course.' },
  { id: 'streak-7', title: 'Week streak', desc: 'Fly the daily course 7 days in a row.', goal: 7 },
  { id: 'streak-30', title: 'Month streak', desc: 'Fly the daily course 30 days in a row.', goal: 30 },
];

// This game's achievements: plain data, also shown on the games list
// (scripts/build-sw.mjs copies every game's list into site/achievements.js).
// id: stable forever (it's the save key). goal: a count to reach, for
// achievements that fill up. secret: hidden until unlocked.
export default [
  { id: 'first-tap', title: 'Hello', desc: 'Tap the button once.' },
  { id: 'taps-10', title: 'Getting the hang of it', desc: 'Tap 10 times.', goal: 10 },
];

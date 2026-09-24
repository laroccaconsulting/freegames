// Synthesized sounds for Blocks. Chimes use the current theme's scale.
import { audio, tone, noiseBurst } from '../core/sound.js';

let theme = null;
export const setSoundTheme = (t) => (theme = t);

const note = (step) => {
  const { root, scale } = theme.sound;
  const octave = Math.floor(step / scale.length);
  return root * 2 ** ((scale[step % scale.length] + 12 * octave) / 12);
};

export const sfx = {
  pickUp() {
    const ac = audio();
    if (ac) tone(ac, { freq: 880, duration: 0.05, gain: 0.03 });
  },
  // A solid thunk; bigger pieces sound heavier.
  place(cells) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.05, freq: 900 - cells * 60, q: 1.2, gain: 0.35 });
    tone(ac, { freq: 140 - cells * 6, duration: 0.09, gain: 0.08, type: 'sine' });
  },
  invalid() {
    const ac = audio();
    if (ac) tone(ac, { freq: 170, duration: 0.1, gain: 0.06, type: 'triangle' });
  },
  // Lines clearing: a run of notes that rises with lines and streak.
  clear(lines, streak) {
    const ac = audio();
    if (!ac) return;
    const base = Math.min(streak, 5);
    for (let k = 0; k < 2 + lines; k++) tone(ac, { freq: note(base + k), duration: 0.35, gain: 0.05, when: k * 0.05, type: theme.sound.wave });
    noiseBurst(ac, { duration: 0.18, freq: 5000, q: 0.7, gain: 0.06 });
    if (lines >= 3) [0, 4, 7].forEach((s) => tone(ac, { freq: note(base + s + 7), duration: 0.9, gain: 0.035, when: 0.15 }));
  },
  deal() {
    const ac = audio();
    if (!ac) return;
    for (let k = 0; k < 3; k++) noiseBurst(ac, { duration: 0.025, freq: 2600, gain: 0.12, when: k * 0.07 });
  },
  sweep() {
    const ac = audio();
    if (!ac) return;
    for (let k = 0; k < 6; k++) tone(ac, { freq: note(8 - k), duration: 0.2, gain: 0.03, when: k * 0.05 });
  },
  over() {
    const ac = audio();
    if (!ac) return;
    [7, 4, 2, 0].forEach((s, i) => tone(ac, { freq: note(s) / 2, duration: 0.35, gain: 0.06, when: i * 0.12, type: theme.sound.wave }));
  },
  jackpot() {
    const ac = audio();
    if (!ac) return;
    [0, 2, 4, 5, 7, 9].forEach((s, i) => tone(ac, { freq: note(s), duration: 0.6, gain: 0.06, when: i * 0.08, type: theme.sound.wave }));
    [0, 4, 7].forEach((s) => tone(ac, { freq: note(s + 9), duration: 1.4, gain: 0.04, when: 0.5 }));
    for (let i = 0; i < 14; i++) tone(ac, { freq: 2400 + Math.random() * 2400, duration: 0.08, gain: 0.015, when: 0.5 + i * 0.06 });
  },
  tick() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.012, freq: 4200, q: 3, gain: 0.08 });
  },
  stamp(tier) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.08, freq: 300, q: 0.7, gain: 0.35 });
    if (tier >= 2) [0, 4, 7, 12].forEach((s, i) => tone(ac, { freq: note(s + 2), duration: 0.7, gain: 0.05, when: 0.04 * i, type: theme.sound.wave }));
    else tone(ac, { freq: note(2), duration: 0.4, gain: 0.05, type: theme.sound.wave });
  },
};

// Synthesized sounds for Trio. Chimes use the current theme's scale.
import { audio, tone, noiseBurst } from '../core/sound.js';

let theme = null;
export const setSoundTheme = (t) => (theme = t);

const note = (step) => {
  const { root, scale } = theme.sound;
  const octave = Math.floor(step / scale.length);
  return root * 2 ** ((scale[step % scale.length] + 12 * octave) / 12);
};

export const sfx = {
  // A light clack as a tile lifts off the board.
  tap() {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.03, freq: 3200, q: 2.5, gain: 0.22 });
    tone(ac, { freq: 1400, duration: 0.05, gain: 0.03 });
  },
  land(slot) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.035, freq: 1500 + slot * 120, q: 1.8, gain: 0.25 });
  },
  blocked() {
    const ac = audio();
    if (ac) tone(ac, { freq: 180, duration: 0.1, gain: 0.06, type: 'triangle' });
  },
  // Three of a kind: a chord that climbs with each match in a row.
  match(combo = 0) {
    const ac = audio();
    if (!ac) return;
    const base = Math.min(combo, 6);
    [0, 2, 4].forEach((s, i) => tone(ac, { freq: note(base + s), duration: 0.45, gain: 0.055, when: i * 0.045, type: theme.sound.wave }));
    noiseBurst(ac, { duration: 0.12, freq: 6000, q: 0.8, gain: 0.05, when: 0.02 });
  },
  full() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 220, duration: 0.25, gain: 0.08, type: 'sawtooth' });
    tone(ac, { freq: 165, duration: 0.35, gain: 0.07, type: 'sawtooth', when: 0.12 });
  },
  marquee(i) {
    const ac = audio();
    if (ac) tone(ac, { freq: note(i % 9), duration: 0.2, gain: 0.05, type: theme.sound.wave });
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
  hint() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: note(4), duration: 0.25, gain: 0.04 });
    tone(ac, { freq: note(6), duration: 0.35, gain: 0.04, when: 0.1 });
  },
};

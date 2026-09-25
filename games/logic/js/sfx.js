// Small synthesized sounds shared by the Logic modes.
import { sounds, audio, tone, noiseBurst } from '../core/sound.js';

export const sfx = {
  tap() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.025, freq: 2600, q: 1.5, gain: 0.15 });
  },
  place() {
    const ac = audio();
    if (ac) tone(ac, { freq: 880, duration: 0.12, gain: 0.05 });
  },
  bad: () => sounds.invalid(),
  win: () => sounds.win(),
};

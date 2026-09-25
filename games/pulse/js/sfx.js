// Sound effects for Pulse, synthesized. They are few on purpose: the music
// is the soundtrack, and jumps are silent.
import { audio, tone, noiseBurst } from '../core/sound.js';

let on = true;
export const setSfxEnabled = (v) => (on = v);
const ctx = () => (on ? audio() : null);

export const sfx = {
  die() {
    const ac = ctx();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.35, freq: 700, q: 0.6, gain: 0.5 });
    noiseBurst(ac, { duration: 0.12, freq: 2600, q: 0.8, gain: 0.25 });
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(260, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.3);
    g.gain.setValueAtTime(0.25, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.4);
  },
  coin() {
    const ac = ctx();
    if (!ac) return;
    tone(ac, { freq: 1318.5, duration: 0.12, gain: 0.08, type: 'square' });
    tone(ac, { freq: 1975.5, duration: 0.3, gain: 0.07, when: 0.07, type: 'square' });
  },
  portal() {
    const ac = ctx();
    if (ac) noiseBurst(ac, { duration: 0.25, freq: 3200, q: 0.5, gain: 0.05 });
  },
  checkpoint() {
    const ac = ctx();
    if (ac) tone(ac, { freq: 1046.5, duration: 0.12, gain: 0.05, type: 'triangle' });
  },
  complete() {
    const ac = ctx();
    if (!ac) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, { freq: f, duration: 0.5, gain: 0.08, when: i * 0.09, type: 'square' }));
    [1046.5, 1318.5, 1568].forEach((f) => tone(ac, { freq: f, duration: 1.6, gain: 0.05, when: 0.42, type: 'triangle' }));
    for (let i = 0; i < 10; i++) noiseBurst(ac, { duration: 0.2, freq: 1500 + Math.random() * 3000, gain: 0.08, when: 0.5 + i * 0.13 + Math.random() * 0.05 });
  },
  tick() {
    const ac = ctx();
    if (ac) noiseBurst(ac, { duration: 0.02, freq: 4200, q: 1.2, gain: 0.08 });
  },
  stamp(tier = 0) {
    const ac = ctx();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.08, freq: 900, q: 0.8, gain: 0.4 });
    if (tier >= 2) [0, 4, 7].forEach((s, i) => tone(ac, { freq: 659.25 * 2 ** (s / 12), duration: 0.5, gain: 0.05, when: 0.05 + i * 0.05 }));
  },
};

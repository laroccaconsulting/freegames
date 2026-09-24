// Synthesized sounds for Pour. Chimes use the current theme's scale, so
// every theme sounds a little different. No audio files.
import { audio, tone, noiseBurst } from '../core/sound.js';

let theme = null;
export const setSoundTheme = (t) => (theme = t);

const note = (step) => {
  const { root, scale } = theme.sound;
  const octave = Math.floor(step / scale.length);
  return root * 2 ** ((scale[step % scale.length] + 12 * octave) / 12);
};

// A bubble "bloop": a sine whose pitch jumps up quickly.
function bloop(ac, { freq, when = 0, gain = 0.05, duration = 0.07 }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + when;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 2.2, t + duration);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sfx = {
  select() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 1760, duration: 0.06, gain: 0.03 });
    noiseBurst(ac, { duration: 0.02, freq: 6000, q: 2, gain: 0.05 });
  },
  deselect() {
    const ac = audio();
    if (ac) tone(ac, { freq: 1320, duration: 0.05, gain: 0.025 });
  },
  // Gurgling pour. Pitch rises as the receiving tube fills, like a real bottle.
  pour(duration, fromLevel, toLevel) {
    const ac = audio();
    if (!ac) return;
    const steps = Math.max(3, Math.round(duration / 0.055));
    for (let i = 0; i < steps; i++) {
      const fill = fromLevel + ((toLevel - fromLevel) * i) / steps;
      const freq = 240 + fill * 110 + Math.random() * 60;
      bloop(ac, { freq, when: 0.05 + i * (duration / steps), gain: 0.035 + Math.random() * 0.02 });
    }
    noiseBurst(ac, { duration: duration * 0.9, freq: 900, q: 0.6, gain: 0.03, when: 0.04 });
  },
  invalid() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 140, duration: 0.14, gain: 0.08, type: 'triangle' });
    tone(ac, { freq: 110, duration: 0.14, gain: 0.06, type: 'triangle', when: 0.06 });
  },
  // Cork pop plus a chord that climbs with each tube finished in a row.
  complete(combo = 0) {
    const ac = audio();
    if (!ac) return;
    noiseBurst(ac, { duration: 0.05, freq: 700, q: 1.5, gain: 0.3 });
    bloop(ac, { freq: 420, gain: 0.08, duration: 0.09 });
    const base = Math.min(combo, 5);
    [0, 2, 4].forEach((s, i) => tone(ac, { freq: note(base + s), duration: 0.5, gain: 0.05, when: 0.05 + i * 0.05, type: theme.sound.wave }));
  },
  // One rising note per tube as the win marquee lights up.
  marquee(i) {
    const ac = audio();
    if (ac) tone(ac, { freq: note(i % 9), duration: 0.22, gain: 0.05, type: theme.sound.wave });
  },
  jackpot() {
    const ac = audio();
    if (!ac) return;
    const seq = [0, 2, 4, 5, 7, 9];
    seq.forEach((s, i) => tone(ac, { freq: note(s), duration: 0.6, gain: 0.06, when: i * 0.08, type: theme.sound.wave }));
    [0, 4, 7].forEach((s) => tone(ac, { freq: note(s + 9), duration: 1.4, gain: 0.04, when: 0.5, type: 'sine' }));
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

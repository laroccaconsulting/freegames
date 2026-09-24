// Small synthesized sound effects. No audio files, nothing to license.
// The AudioContext is created lazily on the first user gesture.

let ctx = null;
let enabled = true;

export function audio() {
  if (!enabled) return null;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setSoundEnabled(on) {
  enabled = on;
}

export function noiseBurst(ac, { duration = 0.05, freq = 2500, q = 1, gain = 0.25, when = 0 }) {
  const len = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(ac.currentTime + when);
}

export function tone(ac, { freq, duration = 0.2, gain = 0.12, when = 0, type = 'sine' }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime + when;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export const sounds = {
  place() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.045, freq: 1800, q: 0.8, gain: 0.35 });
  },
  flip() {
    const ac = audio();
    if (ac) noiseBurst(ac, { duration: 0.03, freq: 3800, q: 1.2, gain: 0.2 });
  },
  deal() {
    const ac = audio();
    if (!ac) return;
    for (let i = 0; i < 4; i++) noiseBurst(ac, { duration: 0.03, freq: 2600, gain: 0.18, when: i * 0.05 });
  },
  invalid() {
    const ac = audio();
    if (ac) tone(ac, { freq: 150, duration: 0.12, gain: 0.08, type: 'triangle' });
  },
  success() {
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 880, duration: 0.18, gain: 0.07 });
    tone(ac, { freq: 1318.5, duration: 0.25, gain: 0.06, when: 0.07 });
  },
  win() {
    const ac = audio();
    if (!ac) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone(ac, { freq: f, duration: 0.5, gain: 0.08, when: i * 0.11, type: 'triangle' }),
    );
  },
};

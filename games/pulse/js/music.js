// Music made on the spot with Web Audio: every level has its own tempo, key,
// chords and patterns (from a seed), so there is nothing to license and
// nothing to download. A lookahead scheduler keeps it tight.
import { audio } from '../core/sound.js';
import { mulberry32 } from '../core/rng.js';

// Chord roots in semitones above the key's root (natural minor).
const PROGS = [
  [0, 8, 3, 10],
  [0, 5, 8, 7],
  [0, 10, 8, 7],
  [8, 10, 0, 0],
];
const MINOR_DEGREES = new Set([0, 5, 7]);
const chord = (root) => [0, MINOR_DEGREES.has(root) ? 3 : 4, 7].map((i) => root + i);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

let noise = null;
function noiseBuffer(ac) {
  if (noise?.sampleRate === ac.sampleRate) return noise;
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

export class Music {
  constructor() {
    this.timer = null;
    this.volume = 0.5;
  }

  // Starts `song` from the top. practice: a calm loop for practice mode.
  play(song, { practice = false } = {}) {
    this.stop(0);
    const ac = audio();
    if (!ac || !song) return;
    this.ac = ac;
    this.song = song;
    this.practice = practice;
    const r = mulberry32(song.seed);
    this.prog = PROGS[song.prog % PROGS.length];
    this.stepDur = 60 / (practice ? song.bpm * 0.75 : song.bpm) / 4;
    // Two lead patterns: chord-tone index per sixteenth, or -1 for a rest.
    const pattern = (density) => Array.from({ length: 16 }, (_, i) => (r() < (i % 4 === 0 ? 0.9 : density) ? Math.floor(r() * 4) : -1));
    this.leadA = pattern(0.55);
    this.leadB = pattern(0.7);
    this.rolling = r() < 0.5; // rolling sixteenth bass vs off-beat eighths
    this.master = ac.createGain();
    this.master.gain.value = this.volume;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ac.destination);
    this.delay = ac.createDelay(1);
    this.delay.delayTime.value = this.stepDur * 3;
    const fb = ac.createGain();
    fb.gain.value = 0.32;
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.master);
    this.step = 0;
    this.start = ac.currentTime + 0.05;
    this.next = this.start;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(fade = 0.15) {
    clearInterval(this.timer);
    this.timer = null;
    const m = this.master;
    if (!m) return;
    this.master = null;
    const t = this.ac.currentTime;
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(m.gain.value, t);
    m.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
    setTimeout(() => m.disconnect(), (fade + 0.2) * 1000);
  }

  get playing() {
    return !!this.timer;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  schedule() {
    const ac = this.ac;
    if (!this.master) return;
    while (this.next < ac.currentTime + 0.12) {
      if (this.practice) this.practiceStep(this.step, this.next);
      else this.levelStep(this.step, this.next);
      this.step++;
      this.next += this.stepDur;
    }
  }

  levelStep(n, t) {
    const i = n % 16;
    const bar = Math.floor(n / 16);
    const sec = bar < 2 ? 0 : 1 + (Math.floor((bar - 2) / 8) % 2); // intro, A, B
    const root = this.song.root + this.prog[bar % 4];
    const tones = chord(root);
    if (i % 4 === 0) this.kick(t);
    if (sec > 0 && (i === 4 || i === 12)) this.clap(t);
    if (sec > 0 && i % 2 === 0) this.hat(t, i % 4 === 2);
    if (sec === 2 && i % 2 === 1) this.hat(t, false, 0.5);
    if (this.rolling ? i % 4 !== 0 : i % 4 === 2) this.bass(t, hz(root - 12), this.stepDur * (this.rolling ? 0.9 : 1.8));
    if (sec > 0) {
      const pat = sec === 1 ? this.leadA : this.leadB;
      const k = pat[i];
      if (k >= 0) {
        const note = k === 3 ? tones[0] + 12 : tones[k];
        this.lead(t, hz(note + 12), this.stepDur * 0.9);
      }
    }
    if (i === 0) this.pad(t, tones.map((m) => hz(m)), this.stepDur * 16, sec === 0 ? 0.03 : 0.02);
    if (sec === 2 && bar % 8 === 7 && i >= 8) this.clap(t, 0.12 + (i - 8) * 0.02); // fill
  }

  practiceStep(n, t) {
    const i = n % 16;
    const bar = Math.floor(n / 16);
    const tones = chord(this.song.root + this.prog[bar % 4]);
    if (i === 0) this.pad(t, tones.map((m) => hz(m)), this.stepDur * 16, 0.05);
    if (i % 2 === 0 && this.leadA[i] >= 0) this.lead(t, hz(tones[this.leadA[i] % 3] + 12), this.stepDur * 1.6, 0.035);
    if (i === 0 || i === 10) this.bass(t, hz(tones[0] - 12), this.stepDur * 4, 0.12);
  }

  // ---------- Instruments ----------

  env(t, peak, decay, attack = 0.004) {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  kick(t) {
    const ac = this.ac;
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 0.9, 0.32)).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }

  noise(t, { type, freq, q = 0.8, gain, decay }) {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this.env(t, gain, decay, 0.002)).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  clap(t, gain = 0.32) {
    this.noise(t, { type: 'bandpass', freq: 1600, q: 0.9, gain, decay: 0.13 });
    this.noise(t + 0.012, { type: 'bandpass', freq: 1300, q: 0.9, gain: gain * 0.6, decay: 0.1 });
  }

  hat(t, open, scale = 1) {
    this.noise(t, { type: 'highpass', freq: 7500, q: 0.6, gain: (open ? 0.12 : 0.06) * scale, decay: open ? 0.11 : 0.03 });
  }

  bass(t, freq, dur, gain = 0.2) {
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(260, t + dur);
    o.connect(f).connect(this.env(t, gain, dur)).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  lead(t, freq, dur, gain = 0.06) {
    const ac = this.ac;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    const g = this.env(t, gain, dur);
    f.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    for (const [type, detune] of [['square', -6], ['sawtooth', 7]]) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  pad(t, freqs, dur, gain) {
    const ac = this.ac;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.master);
    for (const freq of freqs) {
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

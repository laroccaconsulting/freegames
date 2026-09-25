// The levels. Hand-made ones are fixed sequences of chunks with their own
// colours, music and three coins each; generated ones (daily and random)
// come from a seed. Every level is checked by the bot (tests/pulse.test.js)
// so we can promise it can be beaten.
import { mulberry32 } from '../core/rng.js';
import { hashSeed } from '../core/golf.js';
import { compile } from './engine.js';
import {
  Builder, CUBE, pickChunk,
  shipIn, shipGates, shipTunnel, shipOut,
  ballIn, ballRun, ballOut,
  waveIn, waveRun, waveOut,
} from './chunks.js';

// Background, ground and line colours.
export const PALETTES = {
  blue: ['#1f47d6', '#1233a8', '#dfe8ff'],
  magenta: ['#b0179c', '#7a0f78', '#ffe0fb'],
  green: ['#12944a', '#0a6a3a', '#e3ffe9'],
  orange: ['#d9560e', '#9e3508', '#fff0e0'],
  purple: ['#5a22c4', '#3a1592', '#ece3ff'],
  teal: ['#0b8f9a', '#066571', '#dcfbff'],
  red: ['#c4132f', '#8a0b22', '#ffe1e5'],
  night: ['#1a1d4a', '#0e1033', '#dfe3ff'],
  gold: ['#b98a0b', '#7d5a04', '#fff6d8'],
};

const color = (b, name) => b.color(...PALETTES[name]);
const cubes = (b, r, d, names) => names.forEach((n) => CUBE[n](b, r, d));

function ship(b, r, d, gates = 4, tunnel = false) {
  shipIn(b);
  shipGates(b, r, d, gates);
  if (tunnel) shipTunnel(b, r, d);
  shipOut(b);
}
function ball(b, r, d, n = 5) {
  ballIn(b);
  ballRun(b, r, d, n);
  ballOut(b);
}
function wave(b, r, d, n = 5) {
  waveIn(b);
  waveRun(b, r, d, n);
  waveOut(b);
}

// ---------- Hand-made levels ----------

export const LEVELS = [
  {
    id: 'first-steps',
    name: 'First Steps',
    stars: 1,
    label: 'Easy',
    song: { bpm: 128, root: 57, prog: 0, seed: 11 },
    build(b, r) {
      color(b, 'blue');
      cubes(b, r, 0, ['spikes', 'spikes', 'hop', 'plateau', 'spikes']);
      b.coin(5, 5);
      cubes(b, r, 0, ['padWall', 'stairs', 'orbPit', 'minis', 'towers']);
      color(b, 'magenta');
      shipIn(b);
      shipGates(b, r, 0, 3);
      b.coin(2, 8);
      shipGates(b, r, 0, 2);
      shipOut(b);
      color(b, 'purple');
      cubes(b, r, 0, ['spikes', 'plateau', 'pinkPad', 'hop']);
      b.coin(8, 4);
      cubes(b, r, 0, ['orbPit', 'stairs', 'spikes', 'spikes']);
    },
  },
  {
    id: 'neon-drift',
    name: 'Neon Drift',
    stars: 2,
    label: 'Normal',
    song: { bpm: 136, root: 55, prog: 1, seed: 23 },
    build(b, r) {
      color(b, 'purple');
      cubes(b, r, 1, ['spikes', 'hop', 'stairs', 'orbPit', 'plateau']);
      color(b, 'teal');
      cubes(b, r, 1, ['roof', 'spikes', 'padWall']);
      b.coin(6, 4);
      cubes(b, r, 1, ['towers', 'minis']);
      color(b, 'magenta');
      ship(b, r, 1, 5, true);
      color(b, 'blue');
      cubes(b, r, 1, ['spikes', 'pinkPad', 'slabs', 'hop']);
      color(b, 'green');
      ballIn(b);
      ballRun(b, r, 1, 3);
      b.coin(3, 5);
      ballRun(b, r, 1, 3);
      ballOut(b);
      color(b, 'purple');
      cubes(b, r, 1, ['plateau', 'orbPit', 'roof']);
      b.coin(6, 4);
      cubes(b, r, 1, ['stairs', 'spikes']);
    },
  },
  {
    id: 'skyline',
    name: 'Skyline',
    stars: 3,
    label: 'Hard',
    speed: 2,
    song: { bpm: 144, root: 58, prog: 2, seed: 37 },
    build(b, r) {
      color(b, 'orange');
      cubes(b, r, 1, ['spikes', 'towers', 'plateau', 'orbPit']);
      b.coin(6, 5);
      cubes(b, r, 1, ['padWall', 'hop']);
      color(b, 'red');
      wave(b, r, 1, 6);
      color(b, 'gold');
      cubes(b, r, 2, ['stairs', 'spikes', 'roof', 'slabs']);
      color(b, 'night');
      shipIn(b);
      shipGates(b, r, 1, 3);
      b.coin(3, 6);
      shipGates(b, r, 1, 3);
      shipTunnel(b, r, 1);
      shipOut(b);
      color(b, 'orange');
      cubes(b, r, 2, ['hop', 'blueOrb', 'plateau']);
      b.coin(4, 3);
      cubes(b, r, 2, ['orbPit', 'spikes']);
    },
  },
  {
    id: 'gravity-well',
    name: 'Gravity Well',
    stars: 4,
    label: 'Harder',
    song: { bpm: 150, root: 53, prog: 3, seed: 41 },
    build(b, r) {
      color(b, 'teal');
      cubes(b, r, 2, ['spikes', 'roof', 'blueOrb', 'hop']);
      b.coin(5, 5);
      color(b, 'green');
      ball(b, r, 2, 7);
      color(b, 'night');
      cubes(b, r, 2, ['roof', 'towers', 'orbPit']);
      color(b, 'purple');
      ship(b, r, 2, 6, true);
      b.coin(2, 3);
      color(b, 'teal');
      cubes(b, r, 2, ['blueOrb', 'plateau', 'stairs']);
      color(b, 'red');
      waveIn(b);
      waveRun(b, r, 2, 4);
      b.coin(4, 6);
      waveRun(b, r, 2, 3);
      waveOut(b);
      color(b, 'teal');
      cubes(b, r, 2, ['roof', 'spikes', 'padWall']);
    },
  },
  {
    id: 'overdrive',
    name: 'Overdrive',
    stars: 5,
    label: 'Insane',
    speed: 2,
    song: { bpm: 160, root: 52, prog: 0, seed: 59 },
    build(b, r) {
      color(b, 'red');
      cubes(b, r, 3, ['spikes', 'hop', 'plateau', 'towers', 'orbPit']);
      b.coin(5, 4);
      color(b, 'night');
      ship(b, r, 3, 6, true);
      color(b, 'magenta');
      cubes(b, r, 3, ['roof', 'blueOrb', 'stairs']);
      b.portal(2, 's3', 0, { s: 12 }).go(4);
      color(b, 'orange');
      wave(b, r, 3, 6);
      b.coin(4, 3);
      cubes(b, r, 3, ['spikes', 'slabs']);
      b.portal(2, 's2', 0, { s: 12 }).go(4);
      color(b, 'green');
      ball(b, r, 3, 7);
      color(b, 'red');
      cubes(b, r, 3, ['padWall', 'roof', 'hop']);
      b.coin(6, 4);
      cubes(b, r, 3, ['orbPit', 'plateau', 'spikes']);
    },
  },
];

export function buildLevel(def) {
  const b = new Builder();
  def.build(b, mulberry32(hashSeed(`pulse:${def.id}`)));
  return compile({ ...b.done(), id: def.id, name: def.name, speed: def.speed ?? 1, song: def.song, stars: def.stars, label: def.label });
}

// ---------- Generated levels ----------

export const DIFFICULTIES = [
  { name: 'Easy', stars: 1 },
  { name: 'Normal', stars: 2 },
  { name: 'Hard', stars: 3 },
  { name: 'Insane', stars: 5 },
];

const WORDS = ['Neon', 'Echo', 'Prism', 'Volt', 'Laser', 'Orbit', 'Static', 'Pixel', 'Nova', 'Flux', 'Pulse', 'Chrome', 'Drift', 'Spark', 'Circuit', 'Glow'];
const WORDS2 = ['Rush', 'Run', 'Storm', 'Dream', 'Rider', 'Heart', 'Wave', 'Jump', 'Zone', 'Beat', 'Road', 'Line', 'Sky', 'Fall', 'City', 'Rain'];

// A level from a seed: cube stretches with flying sections between them.
// `k` re-rolls the same seed when the bot finds a level unfair.
export function generate(seed, d, k = 0) {
  const r = mulberry32(hashSeed(`pulse:gen:${seed}:${d}:${k}`));
  const palettes = Object.keys(PALETTES);
  const pal = () => palettes[Math.floor(r() * palettes.length)];
  const b = new Builder();
  const cube = (n) => {
    color(b, pal());
    for (let i = 0; i < n; i++) CUBE[pickChunk(r, d)](b, r, d);
  };
  const fliers = [
    () => ship(b, r, d, 4 + d, r() < 0.5),
    () => ball(b, r, d, 5 + d),
    () => wave(b, r, d, 4 + d),
  ];
  const order = [0, 1, 2].sort(() => r() - 0.5);
  cube(6);
  color(b, pal());
  fliers[order[0]]();
  if (d >= 2) b.portal(2, 's2', 0, { s: 12 }).go(4);
  cube(5);
  color(b, pal());
  fliers[order[1]]();
  cube(5);
  if (d >= 1) {
    color(b, pal());
    fliers[order[2]]();
    cube(4);
  }
  const name = `${WORDS[Math.floor(r() * WORDS.length)]} ${WORDS2[Math.floor(r() * WORDS2.length)]}`;
  const song = { bpm: 124 + Math.floor(r() * 10) * 4, root: 50 + Math.floor(r() * 10), prog: Math.floor(r() * 4), seed: Math.floor(r() * 1e6) };
  return compile({ ...b.done(), id: `gen:${seed}:${d}`, name, speed: 1, song, stars: DIFFICULTIES[d].stars, label: DIFFICULTIES[d].name });
}

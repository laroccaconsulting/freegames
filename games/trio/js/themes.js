import { drawJewel } from '../core/jewels.js';

// Themes are plug-ins: one object each. To add one, append it to THEMES and
// add a `body[data-skin='<id>']` block in app.css for the background.
//
//   id, name, dark   identifier, display name, dark background?
//   icons            { kind: 'shapes', shapes: [...] } drawn in code, or
//                    { kind: 'emoji', set: [...] } using the system emoji font
//   tile             { face, face2, edge, side, radius } tile colours
//   additive         particles glow ('lighter' blending)
//   particles        'sparks' | 'stars' | 'confetti' | 'petals' | 'leaves'
//   sound            { wave, root, scale } chime notes (semitones above root)
//   preview          CSS background for the theme picker card

// Shapes drawn in code: [shape, colour]. Distinct in shape *and* colour.
const JEWELS = [
  ['heart', '#ff3b6b'],
  ['diamond', '#29c9ff'],
  ['star', '#ffc629'],
  ['circle', '#3ee07a'],
  ['drop', '#4f7bff'],
  ['moon', '#b45cff'],
  ['clover', '#19c2a0'],
  ['bolt', '#ff8a1f'],
  ['crown', '#ffd84a'],
  ['hex', '#ff5fd2'],
  ['triangle', '#ff4d3d'],
  ['flower', '#ff9ad0'],
];

export const THEMES = [
  {
    id: 'jewels',
    name: 'Jewels',
    dark: true,
    icons: { kind: 'shapes', shapes: JEWELS },
    tile: { face: '#fbf7ff', face2: '#e4dcf5', edge: 'rgba(255,255,255,0.9)', side: '#8e7fb8', radius: 0.2 },
    additive: true,
    particles: 'sparks',
    sound: { wave: 'triangle', root: 523.25, scale: [0, 4, 7, 11, 12, 16, 19, 23, 24] },
    preview: 'radial-gradient(circle at 30% 20%, #ff2fb0aa, transparent 55%), radial-gradient(circle at 80% 70%, #20e3ffaa, transparent 55%), #0d0724',
  },
  {
    id: 'orchard',
    name: 'Orchard',
    dark: false,
    icons: {
      kind: 'emoji',
      set: ['🍎', '🍋', '🍇', '🍓', '🍊', '🍉', '🍌', '🍒', '🥝', '🍑', '🍍', '🥥'],
      colors: ['#e3342f', '#ffd23f', '#8e44ad', '#ff3d5a', '#ff9a1f', '#2ecc71', '#ffe14d', '#c0392b', '#8bd34a', '#ffb07a', '#f4c430', '#8d6e63'],
    },
    tile: { face: '#fffdf6', face2: '#f3e7cf', edge: 'rgba(255,255,255,1)', side: '#c9a36b', radius: 0.22 },
    additive: false,
    particles: 'confetti',
    sound: { wave: 'sine', root: 587.33, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'radial-gradient(circle at 75% 20%, #ffd76a, transparent 45%), linear-gradient(#e9f7d8, #cdebb0)',
  },
  {
    id: 'garden',
    name: 'Garden',
    dark: true,
    icons: {
      kind: 'emoji',
      set: ['🌸', '🌻', '🍀', '🍄', '🦋', '🐝', '🐞', '🌵', '🌷', '🐌', '🌈', '🌙'],
      colors: ['#ff9ad0', '#ffc629', '#3ee07a', '#ff4d3d', '#4fb3ff', '#ffd23f', '#e3342f', '#2ecc71', '#ff5fa2', '#c9a36b', '#b45cff', '#ffe675'],
    },
    tile: { face: '#fbfff8', face2: '#dff0d8', edge: 'rgba(255,255,255,0.95)', side: '#5d8a63', radius: 0.24 },
    additive: true,
    particles: 'petals',
    sound: { wave: 'sine', root: 440, scale: [0, 2, 5, 7, 9, 12, 14, 17, 19] },
    preview: 'radial-gradient(circle at 70% 30%, #7ce0a466, transparent 55%), linear-gradient(#0b2a24, #123d2f)',
  },
  {
    id: 'hallows',
    name: 'Hallows',
    dark: true,
    icons: {
      kind: 'shapes',
      shapes: [
        ['hat', '#7b4dff'], ['pumpkin', '#ff7a1a'], ['bat', '#3a3150'], ['potion', '#2fc46b'],
        ['moon', '#c7d2ff'], ['star', '#ffd84a'], ['orb', '#29c9ff'], ['leaf', '#c0392b'],
        ['owl', '#8b5a2b'], ['cauldron', '#1c5d99'], ['candle', '#f4efe0'], ['key', '#e0457b'],
      ],
    },
    tile: { face: '#f8efd9', face2: '#e8d4ab', edge: 'rgba(255,248,230,0.95)', side: '#6b4a2b', radius: 0.18 },
    additive: true,
    particles: 'leaves',
    sound: { wave: 'triangle', root: 440, scale: [0, 3, 7, 10, 12, 15, 19, 22, 24] },
    preview: 'radial-gradient(circle at 78% 22%, #fff3c4 0 7%, #ffd98a55 9%, transparent 26%), radial-gradient(ellipse at 50% 120%, #ff8a1f66, transparent 55%), linear-gradient(#0b0718, #23133b)',
  },
  {
    id: 'calm',
    name: 'Calm',
    dark: false,
    // Okabe–Ito colours; every picture is also a different shape.
    icons: {
      kind: 'shapes',
      flat: true,
      shapes: [
        ['circle', '#d55e00'], ['square', '#0072b2'], ['triangle', '#009e73'], ['diamond', '#cc79a7'],
        ['star', '#e69f00'], ['heart', '#c0392b'], ['hex', '#56b4e9'], ['moon', '#6a3d9a'],
        ['drop', '#1b1b1b'], ['clover', '#4d7c0f'], ['bolt', '#b8860b'], ['crown', '#7a6a58'],
      ],
    },
    tile: { face: '#ffffff', face2: '#f1eee6', edge: 'rgba(255,255,255,1)', side: '#b6ad9c', radius: 0.16 },
    additive: false,
    particles: 'petals',
    sound: { wave: 'sine', root: 392, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'linear-gradient(#eeeae0, #e3ded2)',
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// ---------- Drawing tile pictures ----------

// Draws picture `type` centred at (0, 0) with radius r.
export function drawIcon(ctx, theme, type, r) {
  const icons = theme.icons;
  if (icons.kind === 'emoji') {
    ctx.font = `${Math.round(r * 1.7)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons.set[type % icons.set.length], 0, r * 0.1);
    return;
  }
  const [shape, color] = icons.shapes[type % icons.shapes.length];
  drawJewel(ctx, shape, color, r, icons.flat);
}

// The colour a picture "is", for particles.
export function iconColor(theme, type) {
  const icons = theme.icons;
  if (icons.kind === 'shapes') return icons.shapes[type % icons.shapes.length][1];
  return icons.colors[type % icons.colors.length];
}

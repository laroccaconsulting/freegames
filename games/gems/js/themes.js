// Themes are plug-ins: one object each. To add one, append it to THEMES and
// add a `body[data-skin='<id>']` block in app.css for the background.
//
//   id, name, dark   identifier, display name, dark background?
//   gems             { kind: 'shapes', shapes: [[shape, colour]…], flat? } drawn
//                    in code, or { kind: 'emoji', set: [...], colors: [...] }
//   board            { bg, cell, line } board colours
//   additive         particles glow ('lighter' blending)
//   particles        'sparks' | 'stars' | 'confetti' | 'petals' | 'leaves'
//   sound            { wave, root, scale } chime notes (semitones above root)
//   preview          CSS background for the theme picker card
import { drawJewel } from '../core/jewels.js';

export const THEMES = [
  {
    id: 'jewels',
    name: 'Jewels',
    dark: true,
    gems: { kind: 'shapes', shapes: [['heart', '#ff3b6b'], ['diamond', '#29c9ff'], ['star', '#ffc629'], ['circle', '#3ee07a'], ['moon', '#b45cff'], ['hex', '#ff8a1f']] },
    board: { bg: 'rgba(20,8,48,0.7)', cell: 'rgba(255,255,255,0.05)', line: 'rgba(190,160,255,0.35)' },
    additive: true,
    particles: 'sparks',
    sound: { wave: 'triangle', root: 523.25, scale: [0, 4, 7, 11, 12, 16, 19, 23, 24] },
    preview: 'radial-gradient(circle at 30% 20%, #ff2fb0aa, transparent 55%), radial-gradient(circle at 80% 70%, #20e3ffaa, transparent 55%), #0d0724',
  },
  {
    id: 'sweets',
    name: 'Sweets',
    dark: false,
    gems: { kind: 'emoji', set: ['🍩', '🍪', '🧁', '🍭', '🍫', '🍓'], colors: ['#ff8fb1', '#d9a066', '#ff9ad0', '#b45cff', '#8b5a2b', '#ff3d5a'] },
    board: { bg: 'rgba(255,255,255,0.6)', cell: 'rgba(255,140,180,0.12)', line: 'rgba(220,120,160,0.4)' },
    additive: false,
    particles: 'confetti',
    sound: { wave: 'sine', root: 587.33, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'radial-gradient(circle at 75% 20%, #ffd1e3, transparent 50%), linear-gradient(#fff0f6, #ffd6e7)',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    dark: true,
    gems: { kind: 'emoji', set: ['🐠', '🐙', '🦀', '🐚', '🐳', '🐢'], colors: ['#ffb020', '#ff5fa2', '#ff4d3d', '#ffd1b3', '#4fb3ff', '#3ee07a'] },
    board: { bg: 'rgba(4,30,60,0.6)', cell: 'rgba(120,220,255,0.07)', line: 'rgba(120,220,255,0.3)' },
    additive: true,
    particles: 'stars',
    sound: { wave: 'sine', root: 440, scale: [0, 2, 5, 7, 9, 12, 14, 17, 19] },
    preview: 'radial-gradient(circle at 70% 20%, #3fd5e066, transparent 55%), linear-gradient(#03243f, #0a4a6e)',
  },
  {
    id: 'hallows',
    name: 'Hallows',
    dark: true,
    gems: { kind: 'shapes', shapes: [['hat', '#8b5cff'], ['pumpkin', '#ff7a1a'], ['potion', '#35d072'], ['orb', '#29c9ff'], ['star', '#ffd84a'], ['leaf', '#e0452b']] },
    board: { bg: 'rgba(18,10,36,0.88)', cell: 'rgba(255,220,160,0.05)', line: 'rgba(232,176,74,0.35)' },
    additive: true,
    particles: 'leaves',
    sound: { wave: 'triangle', root: 440, scale: [0, 3, 7, 10, 12, 15, 19, 22, 24] },
    preview: 'radial-gradient(circle at 78% 22%, #fff3c4 0 7%, #ffd98a55 9%, transparent 26%), radial-gradient(ellipse at 50% 120%, #ff8a1f66, transparent 55%), linear-gradient(#0b0718, #23133b)',
  },
  {
    id: 'calm',
    name: 'Calm',
    dark: false,
    gems: { kind: 'shapes', flat: true, shapes: [['circle', '#d55e00'], ['square', '#0072b2'], ['triangle', '#009e73'], ['diamond', '#cc79a7'], ['star', '#e69f00'], ['hex', '#1b1b1b']] },
    board: { bg: 'rgba(255,255,255,0.75)', cell: 'rgba(0,0,0,0.05)', line: 'rgba(0,0,0,0.12)' },
    additive: false,
    particles: 'petals',
    sound: { wave: 'sine', root: 392, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'linear-gradient(#eeeae0, #e3ded2)',
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// Draws gem `type` centred at (0, 0) with radius r.
export function drawGem(ctx, theme, type, r) {
  const gems = theme.gems;
  if (gems.kind === 'emoji') {
    ctx.font = `${Math.round(r * 1.75)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gems.set[type % gems.set.length], 0, r * 0.1);
    return;
  }
  const [shape, color] = gems.shapes[type % gems.shapes.length];
  drawJewel(ctx, shape, color, r, gems.flat);
}

export function gemColor(theme, type) {
  const gems = theme.gems;
  return gems.kind === 'shapes' ? gems.shapes[type % gems.shapes.length][1] : gems.colors[type % gems.colors.length];
}

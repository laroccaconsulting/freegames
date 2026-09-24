// Themes are plug-ins: one object each. To add one, append it to THEMES and
// add a `body[data-skin='<id>']` block in app.css for the background.
//
//   id, name, dark   identifier, display name, dark background?
//   icons            { kind: 'shapes', shapes: [...] } drawn in code, or
//                    { kind: 'emoji', set: [...] } using the system emoji font
//   tile             { face, face2, edge, side, radius } tile colours
//   additive         particles glow ('lighter' blending)
//   particles        'sparks' | 'stars' | 'confetti' | 'petals'
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

const TAU = Math.PI * 2;

function shapePath(ctx, shape, r) {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      break;
    case 'square':
      ctx.roundRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56, r * 0.2);
      break;
    case 'triangle':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.98, r * 0.78);
      ctx.lineTo(-r * 0.98, r * 0.78);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.85, -r * 0.2);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.85, -r * 0.2);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(0, r * 0.9);
      ctx.bezierCurveTo(-r * 1.3, 0, -r * 0.8, -r * 1.05, 0, -r * 0.45);
      ctx.bezierCurveTo(r * 0.8, -r * 1.05, r * 1.3, 0, 0, r * 0.9);
      break;
    case 'drop':
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.3, -r * 0.4, r * 0.85, 0, r * 0.75, r * 0.35);
      ctx.arc(0, r * 0.3, r * 0.75, 0.07, Math.PI - 0.07);
      ctx.bezierCurveTo(-r * 0.85, 0, -r * 0.3, -r * 0.4, 0, -r);
      break;
    case 'moon':
      ctx.arc(0, 0, r * 0.9, Math.PI * 0.25, Math.PI * 1.75);
      ctx.arc(r * 0.45, 0, r * 0.68, Math.PI * 1.62, Math.PI * 0.38, true);
      ctx.closePath();
      break;
    case 'clover':
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4 - Math.PI / 4;
        ctx.moveTo(Math.cos(a) * r * 0.45 + r * 0.42, Math.sin(a) * r * 0.45);
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.42, 0, TAU);
      }
      break;
    case 'bolt':
      ctx.moveTo(r * 0.2, -r);
      ctx.lineTo(-r * 0.6, r * 0.15);
      ctx.lineTo(-r * 0.05, r * 0.15);
      ctx.lineTo(-r * 0.25, r);
      ctx.lineTo(r * 0.6, -r * 0.2);
      ctx.lineTo(r * 0.05, -r * 0.2);
      ctx.closePath();
      break;
    case 'crown':
      ctx.moveTo(-r * 0.9, r * 0.6);
      ctx.lineTo(-r * 0.95, -r * 0.55);
      ctx.lineTo(-r * 0.45, -r * 0.05);
      ctx.lineTo(0, -r * 0.8);
      ctx.lineTo(r * 0.45, -r * 0.05);
      ctx.lineTo(r * 0.95, -r * 0.55);
      ctx.lineTo(r * 0.9, r * 0.6);
      ctx.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((i * TAU) / 6) * r * 0.9, Math.sin((i * TAU) / 6) * r * 0.9);
      ctx.closePath();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5 - Math.PI / 2;
        ctx.moveTo(Math.cos(a) * r * 0.5 + r * 0.42, Math.sin(a) * r * 0.5);
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.42, 0, TAU);
      }
      break;
  }
}

const shade = (hex, t) => {
  const v = parseInt(hex.slice(1), 16);
  const c = (s) => {
    const x = (v >> s) & 255;
    return Math.round(t < 0 ? x * (1 + t) : x + (255 - x) * t);
  };
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

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
  shapePath(ctx, shape, r);
  if (icons.flat) {
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }
  // A glossy gem: light top-left, deep edge, a white glint.
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = shade(color, -0.5);
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.5, r * 0.42, r * 0.2, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// The colour a picture "is", for particles.
export function iconColor(theme, type) {
  const icons = theme.icons;
  if (icons.kind === 'shapes') return icons.shapes[type % icons.shapes.length][1];
  return icons.colors[type % icons.colors.length];
}

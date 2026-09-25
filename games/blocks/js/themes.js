// Themes are plug-ins: one object each. To add one, append it to THEMES and
// add a `body[data-skin='<id>']` block in app.css for the background.
//
//   id, name, dark   identifier, display name, dark background?
//   colors           8 block colours (one per piece family)
//   block            'gem' (glossy bevel) | 'wood' (grain) | 'glass' | 'flat'
//   board            { bg, cell, line } board and empty-cell colours
//   glow             0–1 neon glow around blocks and clears
//   additive         particles blend with 'lighter'
//   particles        'sparks' | 'stars' | 'confetti' | 'petals' | 'leaves'
//   sound            { wave, root, scale } chime notes (semitones above root)
//   preview          CSS background for the theme picker card

export const THEMES = [
  {
    id: 'neon',
    name: 'Neon',
    dark: true,
    colors: ['#ff3d7f', '#ffb020', '#ffe14d', '#3dff8f', '#29e6ff', '#3a6bff', '#a45bff', '#ff5fd2'],
    block: 'gem',
    board: { bg: 'rgba(20,8,48,0.72)', cell: 'rgba(255,255,255,0.05)', line: 'rgba(190,160,255,0.35)' },
    glow: 1,
    additive: true,
    particles: 'sparks',
    sound: { wave: 'triangle', root: 523.25, scale: [0, 4, 7, 11, 12, 16, 19, 23, 24] },
    preview: 'radial-gradient(circle at 30% 20%, #ff2fb0aa, transparent 55%), radial-gradient(circle at 80% 70%, #20e3ffaa, transparent 55%), #0d0724',
  },
  {
    id: 'wood',
    name: 'Wood',
    dark: false,
    colors: ['#c98a4b', '#d9a066', '#b87333', '#e0b27a', '#a86a3a', '#cf955a', '#9c5e2e', '#dcae6e'],
    block: 'wood',
    board: { bg: 'rgba(92,56,28,0.9)', cell: 'rgba(0,0,0,0.18)', line: 'rgba(255,220,170,0.25)' },
    glow: 0,
    additive: false,
    particles: 'confetti',
    sound: { wave: 'sine', root: 392, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'linear-gradient(135deg, #f6e3c3, #e2bf8d)',
  },
  {
    id: 'glass',
    name: 'Glass',
    dark: true,
    colors: ['#ff6b8b', '#ffb86b', '#ffe78a', '#7dffb0', '#6be4ff', '#7a9cff', '#c08bff', '#ff8be0'],
    block: 'glass',
    board: { bg: 'rgba(8,22,44,0.55)', cell: 'rgba(160,220,255,0.06)', line: 'rgba(160,220,255,0.3)' },
    glow: 0.7,
    additive: true,
    particles: 'stars',
    sound: { wave: 'sine', root: 440, scale: [0, 2, 5, 7, 9, 12, 14, 17, 19] },
    preview: 'linear-gradient(160deg, transparent 30%, #2de2a655 45%, #7a4dff55 60%, transparent 75%), #061427',
  },
  {
    id: 'hallows',
    name: 'Hallows',
    dark: true,
    colors: ['#ff7a1a', '#ffd24a', '#d7263d', '#7dde3c', '#29c9ff', '#8b5cff', '#ff6fb5', '#c08a4a'],
    block: 'gem',
    board: { bg: 'rgba(18,10,36,0.88)', cell: 'rgba(255,220,160,0.05)', line: 'rgba(232,176,74,0.35)' },
    glow: 0.6,
    additive: true,
    particles: 'leaves',
    sound: { wave: 'triangle', root: 440, scale: [0, 3, 7, 10, 12, 15, 19, 22, 24] },
    preview: 'radial-gradient(circle at 78% 22%, #fff3c4 0 7%, #ffd98a55 9%, transparent 26%), radial-gradient(ellipse at 50% 120%, #ff8a1f66, transparent 55%), linear-gradient(#0b0718, #23133b)',
  },
  {
    id: 'calm',
    name: 'Calm',
    dark: false,
    colors: ['#d55e00', '#e69f00', '#f0e442', '#009e73', '#56b4e9', '#0072b2', '#cc79a7', '#6a3d9a'],
    block: 'flat',
    board: { bg: 'rgba(255,255,255,0.75)', cell: 'rgba(0,0,0,0.05)', line: 'rgba(0,0,0,0.12)' },
    glow: 0,
    additive: false,
    particles: 'petals',
    sound: { wave: 'sine', root: 392, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'linear-gradient(#eeeae0, #e3ded2)',
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

const shade = (hex, t) => {
  const v = parseInt(hex.slice(1), 16);
  const c = (s) => {
    const x = (v >> s) & 255;
    return Math.round(t < 0 ? x * (1 + t) : x + (255 - x) * t);
  };
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

// Draws one block filling (0, 0)–(s, s) in the theme's style.
export function drawBlock(ctx, theme, color, s, seed = 0) {
  const r = s * 0.16;
  const inset = s * 0.04;
  const x = inset;
  const y = inset;
  const w = s - inset * 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, w, r);
  switch (theme.block) {
    case 'gem': {
      const g = ctx.createLinearGradient(0, y, 0, y + w);
      g.addColorStop(0, shade(color, 0.35));
      g.addColorStop(0.5, color);
      g.addColorStop(1, shade(color, -0.35));
      ctx.fillStyle = g;
      ctx.fill();
      // Bevel: bright top-left edge, dark bottom-right.
      ctx.lineWidth = s * 0.07;
      ctx.strokeStyle = shade(color, -0.45);
      ctx.stroke();
      ctx.fillStyle = shade(color, 0.6);
      ctx.beginPath();
      ctx.roundRect(x + w * 0.14, y + w * 0.1, w * 0.72, w * 0.22, w * 0.11);
      ctx.globalAlpha *= 0.75;
      ctx.fill();
      ctx.globalAlpha /= 0.75;
      break;
    }
    case 'wood': {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Grain: a few wavy darker lines, varied per block.
      ctx.strokeStyle = shade(color, -0.22);
      ctx.lineWidth = Math.max(1, s * 0.035);
      for (let k = 0; k < 4; k++) {
        const yy = y + w * (0.18 + k * 0.22) + ((seed * 7 + k * 3) % 5) * 0.6;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.bezierCurveTo(x + w * 0.3, yy - w * 0.06, x + w * 0.6, yy + w * 0.07, x + w, yy - w * 0.02);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(x, y, w, w, r);
      ctx.lineWidth = s * 0.05;
      ctx.strokeStyle = shade(color, -0.4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + w * 0.1, y + w * 0.06, w * 0.8, w * 0.07);
      break;
    }
    case 'glass': {
      const g = ctx.createLinearGradient(x, y, x + w, y + w);
      g.addColorStop(0, shade(color, 0.3) + '');
      g.addColorStop(1, shade(color, -0.25));
      ctx.globalAlpha *= 0.82;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalAlpha /= 0.82;
      ctx.lineWidth = s * 0.05;
      ctx.strokeStyle = shade(color, 0.65);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.12, y + w * 0.12);
      ctx.lineTo(x + w * 0.62, y + w * 0.12);
      ctx.lineTo(x + w * 0.12, y + w * 0.62);
      ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = s * 0.04;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.stroke();
    }
  }
}

// Themes are plug-ins: one object each, no code changes elsewhere.
//
// To add a theme, append an object to THEMES and add a matching
// `body[data-skin='<id>']` block in app.css for the background and chrome.
//
//   id, name      identifier and display name
//   dark          true for dark backgrounds (dialogs follow it)
//   colors        12 liquid colours, most distinct first (small levels use the first few)
//   glass         { fill, edge, rim, shine, shade, glow } tube look; glow 0–1
//   bubbles       idle bubbles rising in the liquid
//   additive      particles blend with 'lighter' (glows on dark themes)
//   particles     burst style: 'sparks' | 'stars' | 'confetti' | 'petals'
//   cap           colour of the stopper that seals a finished tube (null = liquid colour)
//   sound         { wave, root, scale } notes for chimes (semitones above root)
//   preview       CSS background used for the theme's card in the picker

export const THEMES = [
  {
    id: 'neon',
    name: 'Neon',
    dark: true,
    colors: ['#ff3860', '#ffe14d', '#29e6ff', '#b6ff3b', '#9b5cff', '#ff8c1a', '#ff5fd2', '#3a6bff', '#22d67a', '#f2f4ff', '#a86b3c', '#7d879c'],
    glass: { fill: 'rgba(160,140,255,0.07)', edge: 'rgba(214,200,255,0.55)', rim: 'rgba(255,255,255,0.8)', shine: 0.32, shade: 0.35, glow: 1 },
    bubbles: true,
    additive: true,
    particles: 'sparks',
    cap: '#ff5fd2',
    sound: { wave: 'triangle', root: 523.25, scale: [0, 4, 7, 11, 12, 16, 19, 23, 24] },
    preview: 'radial-gradient(circle at 30% 20%, #ff2fb0aa, transparent 55%), radial-gradient(circle at 80% 70%, #20e3ffaa, transparent 55%), #0d0724',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    dark: true,
    colors: ['#e0245e', '#f8d24a', '#3fd5e0', '#9ad94a', '#8e4dff', '#f5862a', '#ff7ab8', '#2e5bff', '#1fae6b', '#eef0ff', '#b07a45', '#6f7d95'],
    glass: { fill: 'rgba(170,230,255,0.07)', edge: 'rgba(190,240,255,0.5)', rim: 'rgba(230,255,255,0.85)', shine: 0.38, shade: 0.4, glow: 0.7 },
    bubbles: true,
    additive: true,
    particles: 'stars',
    cap: '#d8f6ff',
    sound: { wave: 'sine', root: 440, scale: [0, 2, 5, 7, 9, 12, 14, 17, 19] },
    preview: 'linear-gradient(160deg, transparent 30%, #2de2a655 45%, #7a4dff55 60%, transparent 75%), #061427',
  },
  {
    id: 'sunny',
    name: 'Sunny',
    dark: false,
    colors: ['#ef4444', '#facc15', '#0ea5e9', '#84cc16', '#7c3aed', '#f97316', '#ec4899', '#2563eb', '#16a34a', '#1e293b', '#92400e', '#64748b'],
    glass: { fill: 'rgba(255,255,255,0.55)', edge: 'rgba(120,80,40,0.35)', rim: 'rgba(255,255,255,1)', shine: 0.55, shade: 0.18, glow: 0 },
    bubbles: true,
    additive: false,
    particles: 'confetti',
    cap: '#c77a2e',
    sound: { wave: 'sine', root: 587.33, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'radial-gradient(circle at 75% 20%, #ffd76a, transparent 45%), linear-gradient(#fff4e0, #ffd9c2)',
  },
  {
    id: 'calm',
    name: 'Calm',
    dark: false,
    // Okabe–Ito based: readable with common colour blindness. Symbols on by default.
    colors: ['#d55e00', '#f0e442', '#56b4e9', '#009e73', '#cc79a7', '#e69f00', '#0072b2', '#1b1b1b', '#999999', '#b2df8a', '#8c510a', '#fbfbf5'],
    glass: { fill: 'rgba(255,255,255,0.5)', edge: 'rgba(40,40,40,0.35)', rim: 'rgba(255,255,255,0.9)', shine: 0.3, shade: 0.12, glow: 0 },
    bubbles: false,
    additive: false,
    particles: 'petals',
    cap: '#7a6a58',
    symbols: true,
    sound: { wave: 'sine', root: 392, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
    preview: 'linear-gradient(#eeeae0, #e3ded2)',
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

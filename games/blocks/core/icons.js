// A small set of line icons for the interface (24 × 24, drawn with the
// current text colour), plus filled medals for results. Used instead of
// emoji so the chrome looks the same, and refined, on every device.

const SVG = 'http://www.w3.org/2000/svg';

// Each icon is a list of SVG elements: [tag, attributes].
const ICONS = {
  calendar: [['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 3 }], ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }], ['circle', { cx: 12, cy: 15, r: 1.4, fill: 'currentColor', stroke: 'none' }]],
  levels: [['rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.8 }], ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 1.8 }], ['rect', { x: 8.5, y: 4, width: 7, height: 7, rx: 1.8 }]],
  infinity: [['path', { d: 'M12 12c-2-2.7-3.7-4-5.5-4a4 4 0 0 0 0 8c1.8 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.7 4 5.5 4a4 4 0 0 0 0-8c-1.8 0-3.5 1.3-5.5 4z' }]],
  leaf: [['path', { d: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14z' }], ['path', { d: 'M5 19c3-4 6-7 10-9' }]],
  palette: [['path', { d: 'M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.8 2-1.8 0-1.4-1.3-1.7-1.3-3 0-1 .8-1.7 1.8-1.7h2.2a3.8 3.8 0 0 0 3.8-3.8C20.5 6.6 16.7 3.5 12 3.5z' }], ['circle', { cx: 7.8, cy: 11, r: 1.2, fill: 'currentColor', stroke: 'none' }], ['circle', { cx: 10.5, cy: 7.3, r: 1.2, fill: 'currentColor', stroke: 'none' }], ['circle', { cx: 15, cy: 7.5, r: 1.2, fill: 'currentColor', stroke: 'none' }]],
  settings: [['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }], ['circle', { cx: 15, cy: 7, r: 2.2 }], ['circle', { cx: 9, cy: 17, r: 2.2 }]],
  chart: [['path', { d: 'M4 20h16' }], ['rect', { x: 5.5, y: 12, width: 3, height: 5.5, rx: 1 }], ['rect', { x: 10.5, y: 7, width: 3, height: 10.5, rx: 1 }], ['rect', { x: 15.5, y: 10, width: 3, height: 7.5, rx: 1 }]],
  help: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.5' }], ['circle', { cx: 12, cy: 16.8, r: 1, fill: 'currentColor', stroke: 'none' }]],
  share: [['path', { d: 'M12 15V4M8 7.5L12 3.5l4 4' }], ['path', { d: 'M7 11H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1' }]],
  flame: [['path', { d: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-7.8.5 1.6 1.4 2.6 2.4 3.2C11.7 7 13 4.8 15 3c.3 3 3.5 5.6 3.5 10.8 0 4.2-2.8 7.2-6.5 7.2z' }]],
  trophy: [['path', { d: 'M7.5 4h9v5a4.5 4.5 0 0 1-9 0z' }], ['path', { d: 'M7.5 6H4.5a3 3 0 0 0 3.2 3.8M16.5 6h3a3 3 0 0 1-3.2 3.8M12 13.5V17M8.5 20h7M9.5 17h5' }]],
  flag: [['path', { d: 'M5.5 21V4' }], ['path', { d: 'M5.5 4.5h12l-2.5 4 2.5 4h-12' }]],
  equal: [['path', { d: 'M6 9.5h12M6 14.5h12' }]],
  star: [['path', { d: 'M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  diamond: [['path', { d: 'M6.5 4h11l3.5 5-9 11L3 9z' }], ['path', { d: 'M3 9h18M9.5 4L8 9l4 11 4-11-1.5-5' }]],
  bird: [['path', { d: 'M4 15c3 0 4.5-1 6-3 1.7-2.4 3-4.5 6-4.5a3 3 0 0 1 3 2.5l2 .5-2 1.2c-.5 4-3.7 6.8-8 6.8-3 0-5.5-1.3-7-3.5z' }], ['circle', { cx: 16.3, cy: 9.6, r: 0.9, fill: 'currentColor', stroke: 'none' }]],
  bulb: [['path', { d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z' }]],
  flask: [['path', { d: 'M9.5 3.5h5M10.5 3.5v5.2L5.2 18a1.8 1.8 0 0 0 1.6 2.7h10.4a1.8 1.8 0 0 0 1.6-2.7l-5.3-9.3V3.5' }], ['path', { d: 'M7.5 14h9' }]],
  medal: [['circle', { cx: 12, cy: 14.5, r: 5.5 }], ['path', { d: 'M8.5 10L6 3.5h4l2 4.5 2-4.5h4L15.5 10' }]],
  blocks: [['rect', { x: 4, y: 4, width: 7, height: 7, rx: 1.5 }], ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 1.5 }], ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.5 }]],
  grid: [['rect', { x: 3.5, y: 3.5, width: 17, height: 17, rx: 2.5 }], ['path', { d: 'M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17' }]],
  tiles: [['rect', { x: 3.5, y: 7, width: 9, height: 12, rx: 2 }], ['rect', { x: 11.5, y: 5, width: 9, height: 12, rx: 2 }]],
  mine: [['circle', { cx: 12, cy: 13, r: 6 }], ['path', { d: 'M12 3.5v3M12 19.5v1M3.5 13h2M18.5 13h2M6 7l1.5 1.5M16.5 17.5L18 19M18 7l-1.5 1.5M6 19l1.5-1.5' }]],
  tube: [['path', { d: 'M9 3h6M10 3v14a2 2 0 0 0 4 0V3' }], ['path', { d: 'M10 11h4' }]],
  close: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }]],
  key: [['circle', { cx: 8, cy: 12, r: 4 }], ['path', { d: 'M12 12h8.5M17.5 12v3.5M20.5 12v2.5' }]],
  disc: [['circle', { cx: 12, cy: 12, r: 8 }], ['circle', { cx: 12, cy: 12, r: 4.5 }]],
  gem: [['path', { d: 'M12 20.5c-6-3.6-9-7.2-9-10.4C3 7.3 5.1 5 7.8 5c1.8 0 3.2 1 4.2 2.4C13 6 14.4 5 16.2 5 18.9 5 21 7.3 21 10.1c0 3.2-3 6.8-9 10.4z' }]],
};

export function icon(name, { size = 20, className = 'icon' } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const [tag, attrs] of ICONS[name] || ICONS.help) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

// Medal colours by result: [light, deep].
const MEDALS = {
  bird: ['#7ef7ff', '#1d8fe0'],
  diamond: ['#c6f4ff', '#3a7bff'],
  trophy: ['#ffe58a', '#e39a00'],
  star: ['#ffe58a', '#f08a00'],
  check: ['#b8f5c8', '#1f9d57'],
  medal: ['#e7e3f7', '#8a7fb0'],
  bulb: ['#fff3b0', '#d19a00'],
  flask: ['#e3d0ff', '#7b4fd6'],
};

// A round, glossy medal with a white icon, for the results card.
export function medal(name, { size = 76 } = {}) {
  const [light, deep] = MEDALS[name] || MEDALS.medal;
  const wrap = document.createElement('span');
  wrap.className = 'medal';
  wrap.style.setProperty('--medal-light', light);
  wrap.style.setProperty('--medal-deep', deep);
  wrap.style.width = wrap.style.height = `${size}px`;
  wrap.append(icon(name, { size: Math.round(size * 0.5), className: 'medal-icon' }));
  return wrap;
}

// Label with an icon in front, for buttons and notes.
export function withIcon(name, text, size = 18) {
  const frag = document.createDocumentFragment();
  frag.append(icon(name, { size }), document.createTextNode(text));
  return frag;
}

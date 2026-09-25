// Suit and court artwork as SVG path data. Used for the inline sprite the
// cards reference and for drawing cards on canvas in the win celebration.

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

// viewBox 0 0 100 100, indexed by suit: spades, hearts, clubs, diamonds
export const SUIT_PATHS = [
  'M50 4C38 22 8 38 8 60c0 14 11 23 23 23 8 0 14-4 17-9-1 9-5 16-12 22h28c-7-6-11-13-12-22 3 5 9 9 17 9 12 0 23-9 23-23C92 38 62 22 50 4Z',
  'M50 92C22 70 5 53 5 32 5 17 16 7 29 7c9 0 17 5 21 13 4-8 12-13 21-13 13 0 24 10 24 25 0 21-17 38-45 60Z',
  circle(50, 28, 20) + circle(26, 58, 20) + circle(74, 58, 20) + circle(50, 52, 12) + 'M45 60c0 16-5 26-12 34h34c-7-8-12-18-12-34Z',
  'M50 3C60 20 74 36 90 50 74 64 60 80 50 97 40 80 26 64 10 50 26 36 40 20 50 3Z',
];

// Court emblems (viewBox 0 0 100 100): jack's cap, queen's tiara, king's crown.
export const COURT_PATHS = {
  11:
    'M18 74c0-24 14-38 34-38 12 0 22 5 28 14l-8 4c3 6 5 13 5 20Z' +
    'M58 38c8-16 22-26 36-28-6 10-16 22-28 32Z' +
    'M14 78h68v10H14Z' +
    circle(30, 58, 4),
  12:
    'M14 76 20 40l15 20 15-30 15 30 15-20 6 36Z' +
    circle(20, 36, 6) + circle(50, 25, 7) + circle(80, 36, 6) +
    'M14 80h72v10H14Z',
  13:
    'M10 72 6 30l22 20 22-32 22 32 22-20-4 42Z' +
    'M47 4h6v8h7v6h-7v8h-6v-8h-7v-6h7Z' +
    circle(6, 28, 5) + circle(94, 28, 5) +
    'M10 76h80v12H10Z',
};

export function injectSprite() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  const add = (id, d) => {
    const symbol = document.createElementNS(ns, 'symbol');
    symbol.id = id;
    symbol.setAttribute('viewBox', '0 0 100 100');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    symbol.append(path);
    svg.append(symbol);
  };
  SUIT_PATHS.forEach((d, i) => add(`suit-${i}`, d));
  Object.entries(COURT_PATHS).forEach(([rank, d]) => add(`court-${rank}`, d));
  document.body.prepend(svg);
}

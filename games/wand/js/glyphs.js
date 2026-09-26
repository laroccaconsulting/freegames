// The spellbook: one single-stroke glyph per spell, built from maths so there
// are no image files and the shapes can be unit-tested.
//
// Every glyph lives in a nominal square from -1 to 1 with y pointing DOWN, the
// same way the screen does, so "flick up" really is a negative-y stroke. The
// recognizer (js/recognizer.js) normalizes both the template and the player's
// stroke before comparing, so only the *shape* and the *direction it is drawn*
// matter — not where on screen it was drawn, or how big.
//
// Names are our own dog-Latin. Nothing here is taken from any book or film:
// the shapes follow the meaning (draw inwards to pull, outwards to push, a
// circle for light, the same circle backwards to put it out) so they are
// guessable rather than memorized.

const TAU = Math.PI * 2;

// ---------- small stroke builders ----------

// A straight run of points from a to b (b included).
function line(x1, y1, x2, y2, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push({ x: x1 + ((x2 - x1) * i) / n, y: y1 + ((y2 - y1) * i) / n });
  return out;
}

// Corner-to-corner polyline through a list of [x, y] points.
function poly(points, per = 10) {
  let out = [];
  for (let i = 1; i < points.length; i++) {
    const seg = line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], per);
    out = out.concat(i === 1 ? seg : seg.slice(1));
  }
  return out;
}

// Angles are in radians and grow clockwise on screen (because y points down).
function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

// A spiral from radius r0 to r1 over `turns`, starting at angle a0.
function spiral(cx, cy, r0, r1, a0, turns, n = 64) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + TAU * turns * t;
    const r = r0 + (r1 - r0) * t;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

// A sine wave running left to right.
function wave(x0, x1, y, amp, cycles, n = 48) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: x0 + (x1 - x0) * t, y: y + Math.sin(t * TAU * cycles) * amp });
  }
  return out;
}

// Join strokes end to end, dropping the duplicated joint.
function chain(...parts) {
  return parts.reduce((a, b) => a.concat(a.length ? b.slice(1) : b), []);
}

const close = (pts) => pts.concat([{ ...pts[0] }]);

// ---------- the glyphs ----------

// `closed` marks a loop whose start point is arbitrary: the recognizer is
// allowed to slide the player's starting point around the shape before
// comparing, so a circle drawn from the left still reads as a circle.

const SPELLS = [
  {
    id: 'levo',
    name: 'Levo',
    gloss: 'rise',
    effect: 'Lifts the thing you draw over and holds it in the air.',
    element: 'force',
    color: '#9fd4ff',
    tier: 1,
    shape: 'A long sweep to the right, then flick up.',
    stroke: poly([[-0.95, 0.4], [0.1, 0.4], [0.85, -0.85]]),
  },
  {
    id: 'demitto',
    name: 'Demitto',
    gloss: 'settle',
    effect: 'Lets a floating thing down gently. Closes what Levo opened.',
    element: 'force',
    color: '#8fb6d8',
    tier: 1,
    shape: 'A long sweep to the right, then flick down.',
    stroke: poly([[-0.95, -0.4], [0.1, -0.4], [0.85, 0.85]]),
  },
  {
    id: 'attraho',
    name: 'Attraho',
    gloss: 'come to me',
    effect: 'Pulls the target towards you.',
    element: 'force',
    color: '#c3a2ff',
    tier: 1,
    shape: 'A spiral wound inwards, ending in the middle.',
    stroke: spiral(0, 0, 1, 0.04, -Math.PI / 2, 1.75),
  },
  {
    id: 'repello',
    name: 'Repello',
    gloss: 'away',
    effect: 'Shoves the target back, hard.',
    element: 'force',
    color: '#ff9ec4',
    tier: 1,
    shape: 'A spiral wound outwards, starting in the middle.',
    stroke: spiral(0, 0, 0.04, 1, -Math.PI / 2, 1.75),
  },
  {
    id: 'clario',
    name: 'Clario',
    gloss: 'light',
    effect: 'Kindles a light. Wakes anything sleeping in the dark.',
    element: 'light',
    color: '#ffd98a',
    tier: 1,
    closed: true,
    shape: 'A full circle, drawn clockwise.',
    stroke: close(arc(0, 0, 0.95, 0.95, -Math.PI / 2, -Math.PI / 2 + TAU, 40)),
  },
  {
    id: 'tenebro',
    name: 'Tenebro',
    gloss: 'dark',
    effect: 'Snuffs a light out. The same circle, unwound.',
    element: 'light',
    color: '#7c74c8',
    tier: 1,
    closed: true,
    shape: 'A full circle, drawn anticlockwise.',
    stroke: close(arc(0, 0, 0.95, 0.95, -Math.PI / 2, -Math.PI / 2 - TAU, 40)),
  },
  {
    id: 'ignito',
    name: 'Ignito',
    gloss: 'burn',
    effect: 'A gout of flame. Lights candles, burns rope, dries what is wet.',
    element: 'fire',
    color: '#ff8a3d',
    tier: 1,
    shape: 'A lightning zigzag, top to bottom.',
    stroke: poly([[-0.9, -0.85], [0.5, -0.3], [-0.5, 0.3], [0.9, 0.85]]),
  },
  {
    id: 'unda',
    name: 'Unda',
    gloss: 'water',
    effect: 'A jet of water. Douses fire, fills basins, wets soil.',
    element: 'water',
    color: '#5cc8ff',
    tier: 1,
    shape: 'Two waves, left to right.',
    stroke: wave(-0.95, 0.95, 0, 0.55, 2),
  },
  {
    id: 'gelo',
    name: 'Gelo',
    gloss: 'freeze',
    effect: 'Ices the target in place for a few seconds.',
    element: 'ice',
    color: '#a7ecff',
    tier: 2,
    closed: true,
    shape: 'A five-pointed star in one stroke, starting at the top.',
    // A pentagram: an ice crystal, and the one glyph nothing else looks like.
    stroke: (() => {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + i * ((4 * Math.PI) / 5);
        pts.push([Math.cos(a) * 0.95, Math.sin(a) * 0.95]);
      }
      return close(poly(pts, 12));
    })(),
  },
  {
    id: 'reserato',
    name: 'Reserato',
    gloss: 'unlock',
    effect: 'Turns any lock. It does not open the thing — that is your job.',
    element: 'craft',
    color: '#e8c06a',
    tier: 2,
    shape: 'Straight down, then curl right and up: a key turning.',
    stroke: chain(line(-0.25, -0.95, -0.25, 0.3, 14), arc(0.3, 0.3, 0.55, 0.55, Math.PI, Math.PI * 1.7, 18)),
  },
  {
    id: 'sarcito',
    name: 'Sarcito',
    gloss: 'mend',
    effect: 'Puts a broken thing back together.',
    element: 'craft',
    color: '#9de8b5',
    tier: 2,
    closed: true,
    // A lemniscate: the classic "make it whole again" figure eight.
    shape: 'A figure eight.',
    stroke: (() => {
      const out = [];
      for (let i = 0; i <= 56; i++) {
        const t = (i / 56) * TAU - Math.PI / 2;
        out.push({ x: Math.sin(t) * 0.95, y: Math.sin(t) * Math.cos(t) * 1.3 });
      }
      return out;
    })(),
  },
  {
    id: 'aperio',
    name: 'Aperio',
    gloss: 'reveal',
    effect: 'Shows what is hidden: invisible things, secret writing, trapdoors.',
    element: 'mind',
    color: '#d7b6ff',
    tier: 2,
    closed: true,
    shape: 'An eye: an arc over, then an arc back underneath.',
    stroke: close(chain(arc(0, 0.55, 1.05, 1.1, -Math.PI * 0.82, -Math.PI * 0.18, 20), arc(0, -0.55, 1.05, 1.1, Math.PI * 0.18, Math.PI * 0.82, 20))),
  },
  {
    id: 'tempesto',
    name: 'Tempesto',
    gloss: 'gust',
    effect: 'A rush of wind: scatters light things, spins anything on a pivot.',
    element: 'air',
    color: '#bfe6dd',
    tier: 2,
    shape: 'A straight run with a loop tied in the middle.',
    stroke: chain(line(-1, 0.35, -0.2, 0.2, 8), arc(-0.05, -0.15, 0.42, 0.42, Math.PI * 0.75, Math.PI * 0.75 + TAU, 28), line(0.25, 0.1, 1, -0.3, 8)),
  },
  {
    id: 'crescito',
    name: 'Crescito',
    gloss: 'grow',
    effect: 'Makes something bigger, taller or longer. Plants love it.',
    element: 'life',
    color: '#7fd36a',
    tier: 2,
    shape: 'A peak: up to a point, then back down.',
    stroke: poly([[-0.9, 0.8], [0, -0.9], [0.9, 0.8]], 14),
  },
  {
    id: 'minuito',
    name: 'Minuito',
    gloss: 'shrink',
    effect: 'Makes something smaller. The peak, upside down.',
    element: 'life',
    color: '#c8b36a',
    tier: 2,
    shape: 'A valley: down to a point, then back up.',
    stroke: poly([[-0.9, -0.8], [0, 0.9], [0.9, -0.8]], 14),
  },
  {
    id: 'secato',
    name: 'Secato',
    gloss: 'sever',
    effect: 'Cuts rope, cord, vine or thread in one clean stroke.',
    element: 'craft',
    color: '#ff7f7f',
    tier: 3,
    shape: 'One straight slash, from top right to bottom left.',
    stroke: line(0.9, -0.9, -0.9, 0.9, 16),
  },
  {
    id: 'vincito',
    name: 'Vincito',
    gloss: 'bind',
    effect: 'Cages the target where it stands until you let it go.',
    element: 'force',
    color: '#ffb0e0',
    tier: 3,
    shape: 'Three coils wound downwards, like rope round a post.',
    stroke: (() => {
      const out = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        out.push({ x: Math.sin(t * TAU * 3) * 0.85, y: -0.95 + 1.9 * t });
      }
      return out;
    })(),
  },
  {
    id: 'tardito',
    name: 'Tardito',
    gloss: 'slow',
    effect: 'Drags time to a crawl around the target.',
    element: 'mind',
    color: '#8fe3d8',
    tier: 3,
    shape: 'A long S, drawn from the top down.',
    stroke: chain(arc(0, -0.45, 0.62, 0.62, -Math.PI * 0.1, -Math.PI * 1.35, 22), arc(0, 0.45, 0.62, 0.62, Math.PI * 0.65, -Math.PI * 0.1, 22)),
  },
];

export const SPELL_LIST = SPELLS;
export const SPELLS_BY_ID = new Map(SPELLS.map((s) => [s.id, s]));
export const spell = (id) => SPELLS_BY_ID.get(id);

// The shape data the recognizer wants: id plus raw points.
export const TEMPLATES = SPELLS.map(({ id, stroke, closed }) => ({ id, points: stroke, closed: !!closed }));

// Single-stroke shape matching, in the spirit of the $1 recognizer but tuned
// for spells rather than handwriting:
//
//  * Direction matters. Wound inwards is not the same spell as wound outwards,
//    and a flick up is not a flick down, so we do NOT rotate a stroke onto its
//    "indicative angle". Instead we allow a small tilt either way, because
//    people draw at an angle when they hold a phone.
//  * Scaling is uniform. The $1 recognizer squashes every stroke into a square,
//    which turns a straight slash into noise; we divide by the longer side so
//    lines stay lines.
//  * Loops have no start. Templates marked `closed` let the player begin the
//    circle anywhere: we slide their starting point around the shape and keep
//    the best fit.
//
// Everything here is pure maths on {x, y} points — no DOM — so it can be
// unit-tested in tests/wand.test.js.

export const SAMPLES = 48;

// How far the average point may sit from the template before the score hits 0.
// Normalized strokes fit in a box one unit across, so ~0.55 is "unrecognizable".
const SCORE_REF = 0.55;

const TILT = (18 * Math.PI) / 180; // how far off-axis a stroke may be drawn
const TILT_STEPS = 6; // rotations tried across ±TILT
const SHIFT_STEPS = 24; // start points tried around a closed loop

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

// Drop points that land on top of each other, which happens when a finger rests.
export function dedupe(points, epsilon = 0.0001) {
  const out = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1], p) > epsilon) out.push({ x: p.x, y: p.y });
  return out;
}

// Re-space the stroke into exactly n points at equal distance along the path,
// so drawing slowly in one place does not weight that part of the shape.
export function resample(points, n = SAMPLES) {
  const src = dedupe(points);
  if (src.length < 2) return new Array(n).fill(0).map(() => ({ ...(src[0] || { x: 0, y: 0 }) }));
  const step = pathLength(src) / (n - 1);
  if (step === 0) return new Array(n).fill(0).map(() => ({ ...src[0] }));
  const out = [{ ...src[0] }];
  let prev = src[0];
  let i = 1;
  let carried = 0;
  while (i < src.length && out.length < n) {
    const d = dist(prev, src[i]);
    if (carried + d >= step) {
      const t = (step - carried) / d;
      const next = { x: prev.x + (src[i].x - prev.x) * t, y: prev.y + (src[i].y - prev.y) * t };
      out.push(next);
      prev = next;
      carried = 0;
    } else {
      carried += d;
      prev = src[i];
      i++;
    }
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out;
}

export function centroid(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function bounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function rotate(points, angle, about = { x: 0, y: 0 }) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map((p) => {
    const dx = p.x - about.x;
    const dy = p.y - about.y;
    return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
  });
}

// Resample, centre on the centroid and scale uniformly to one unit across.
export function normalize(points, n = SAMPLES) {
  const pts = resample(points, n);
  const b = bounds(pts);
  const size = Math.max(b.width, b.height) || 1;
  const c = centroid(pts);
  return pts.map((p) => ({ x: (p.x - c.x) / size, y: (p.y - c.y) / size }));
}

// Mean distance between matching points of two normalized strokes.
export function meanDistance(a, b, shift = 0) {
  const n = a.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += dist(a[(i + shift) % n], b[i]);
  return total / n;
}

// A closed loop's points repeat, so the last sample is the first again; slide
// the start point around the loop and keep the closest alignment.
function bestDistance(candidate, template) {
  if (!template.closed) return meanDistance(candidate, template.points);
  let best = Infinity;
  const stride = Math.max(1, Math.round(candidate.length / SHIFT_STEPS));
  for (let s = 0; s < candidate.length; s += stride) {
    const d = meanDistance(candidate, template.points, s);
    if (d < best) best = d;
  }
  return best;
}

// Prepare templates once: `{ id, points, closed }` with raw points in.
export function prepare(templates, n = SAMPLES) {
  return templates.map((t) => ({ ...t, points: normalize(t.points, n) }));
}

const score = (d) => Math.max(0, 1 - d / SCORE_REF);

/**
 * Match one stroke against prepared templates.
 * Returns every template scored from 0 (nothing like it) to 1 (identical),
 * best first, plus `confidence`: how far clear the winner is of the runner-up.
 */
export function rank(points, prepared, n = SAMPLES) {
  const base = normalize(points, n);
  // Try the stroke as drawn and tilted a little either way; people rarely draw
  // square to the screen, especially one-handed.
  const angles = [0];
  for (let i = 1; i <= TILT_STEPS; i++) {
    angles.push((TILT * i) / TILT_STEPS, (-TILT * i) / TILT_STEPS);
  }
  const best = new Map(prepared.map((t) => [t.id, Infinity]));
  for (const angle of angles) {
    const turned = angle === 0 ? base : rotate(base, angle);
    for (const t of prepared) {
      const d = bestDistance(turned, t);
      if (d < best.get(t.id)) best.set(t.id, d);
    }
  }
  const results = prepared
    .map((t) => ({ id: t.id, distance: best.get(t.id), score: score(best.get(t.id)) }))
    .sort((a, b) => a.distance - b.distance);
  const gap = results.length > 1 ? results[0].score - results[1].score : results[0].score;
  return { results, best: results[0], confidence: gap };
}

/**
 * The call the game makes. `points` are raw screen positions.
 * Returns `{ id, score, confidence, results }`, or `{ id: null, reason }` when
 * the stroke was too small, too scribbled, or nothing like any glyph.
 */
export function recognize(points, prepared, { minScore = 0.66, minGap = 0.02, minLength = 40, minPoints = 6 } = {}) {
  const clean = dedupe(points);
  if (clean.length < minPoints) return { id: null, reason: 'short', results: [] };
  if (pathLength(clean) < minLength) return { id: null, reason: 'short', results: [] };
  const { results, best, confidence } = rank(clean, prepared);
  if (best.score < minScore) return { id: null, reason: 'unknown', score: best.score, near: best.id, results };
  if (confidence < minGap) return { id: null, reason: 'ambiguous', score: best.score, near: best.id, results };
  return { id: best.id, score: best.score, confidence, results };
}

/**
 * Place a template glyph back over the stroke the player drew: same centre,
 * same size, same tilt. This is what lets a shaky scrawl snap into a clean
 * sigil when the spell lands.
 */
export function fitTemplate(points, template, n = SAMPLES) {
  const drawn = resample(points, n);
  const b = bounds(drawn);
  const size = Math.max(b.width, b.height) || 1;
  const c = centroid(drawn);
  const base = normalize(template.points, n);
  // Pick the tilt that lines up best, so the clean glyph does not snap upright
  // under a stroke the player drew on a slant.
  const drawnNorm = normalize(points, n);
  let bestAngle = 0;
  let bestD = Infinity;
  for (let i = -TILT_STEPS; i <= TILT_STEPS; i++) {
    const angle = (TILT * i) / TILT_STEPS;
    const d = template.closed ? bestDistance(rotate(drawnNorm, angle), { ...template, points: base }) : meanDistance(rotate(drawnNorm, angle), base);
    if (d < bestD) {
      bestD = d;
      bestAngle = angle;
    }
  }
  return rotate(base, -bestAngle).map((p) => ({ x: c.x + p.x * size, y: c.y + p.y * size }));
}

// An anchor escapement: the shapes of the escape wheel's teeth and the
// pendulum's pallets. Pure geometry, shared by the escape wheel and the
// pendulum parts. The pendulum's peg is DROP cells straight above the
// wheel's; its pallets sit at 45° either side of the wheel's top, so the
// tangents there meet at the pendulum's peg and each pallet moves straight
// in and out of the teeth as it swings. Found by a search over the shapes
// (tooth depth, pallet depth, lift and width) for a steady swing and one
// tooth per swing, then checked for slack around it.
import { makeShape, placeShape, overlap } from './physics.js';

export const DROP = 3; // pegs from the pendulum down to the wheel
export const SPAN = Math.PI / 4; // pallets either side of the top
export const TEETH = 30;
export const R = DROP * Math.cos(SPAN); // tooth tips (2.12)
export const ROOT = 1.485; // tooth roots
export const PALLET_IN = 2.07; // how deep a pallet's locking corner reaches
export const LIFT = 0.37; // the slope across a pallet's face: the push each tooth gives
export const PALLET_W = 0.13;
export const PALLET_OUT = R + 0.75;
export const PITCH = (2 * Math.PI) / TEETH;
export const SPRING = { stall: 1.5, speed: 4 }; // the wheel's drive: gentle, nearly constant
export const PUSH = 0.8; // the pendulum's starting swing, rad/s

const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

/** Tooth i in the wheel's own frame: a radial leading face, a sloped back. */
export function toothShape(i) {
  const a = i * PITCH;
  return makeShape([pol(ROOT, a), pol(R, a - 0.06 * PITCH), pol(ROOT, a - 0.62 * PITCH)], 0.02);
}

/**
 * The two pallets in the pendulum's frame (its peg at the origin, hanging
 * straight down). Each is a narrow block reaching down into the teeth,
 * its inner face sloped so a tooth sliding across it pushes it out.
 */
export function palletShapes() {
  const top = -Math.PI / 2;
  return [top - SPAN, top + SPAN].map((phi) => {
    // (t, n) in the wheel's frame at angle phi; the wheel's centre is DROP below the peg
    const at = (t, n) => [n * Math.cos(phi) - t * Math.sin(phi), n * Math.sin(phi) + t * Math.cos(phi) + DROP];
    return makeShape([at(-PALLET_W / 2, PALLET_IN), at(PALLET_W / 2, PALLET_IN + LIFT), at(PALLET_W / 2, PALLET_OUT), at(-PALLET_W / 2, PALLET_OUT)], 0.03);
  });
}

/** The wheel's starting angle: the one (of 40 in a pitch) that leaves the teeth clearest of the pallets. */
export const PHASE = (() => {
  const pallets = palletShapes().map((s) => placeShape(s, 0, -DROP));
  let best = 0;
  let bestGap = -Infinity;
  for (let k = 0; k < 40; k++) {
    const base = (k / 40) * PITCH;
    let gap = Infinity;
    for (let i = 0; i < TEETH; i++) {
      const t = placeShape(toothShape(i), 0, 0, base);
      for (const p of pallets) gap = Math.min(gap, overlap(p, t));
    }
    if (gap > bestGap) [bestGap, best] = [gap, base];
  }
  return best;
})();

/** The wheel's outline in its own frame, for drawing: root, tip, root… */
export function wheelOutline() {
  const pts = [];
  for (let i = 0; i < TEETH; i++) {
    const a = i * PITCH;
    pts.push(pol(ROOT, a - 0.62 * PITCH), pol(R, a - 0.06 * PITCH), pol(ROOT, a));
  }
  return pts;
}

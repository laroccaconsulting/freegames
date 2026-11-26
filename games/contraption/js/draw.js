// Draws a whole board: the level, the machine (in build mode from part data,
// in run mode from the live physics), the last run's path and the overlays.

import { analyse, key, GEAR_TEETH, DRUM_R, partShape } from './machine.js';
import { drawPegs, drawBorder, drawZones, drawWalls, drawDanger, drawGoal, drawGear, drawMotor, drawConveyor, drawRamp, drawBouncer, drawLever, drawWeight, drawChain, drawItem, drawMover, drawPath, drawAxle, outline, label } from './render.js';

const TAU = Math.PI * 2;

/**
 * Each gear's resting angle so that meshing teeth interleave, and each
 * axle's speed ratio. Recomputed when the machine changes.
 */
export function machineLayout(parts) {
  const { axles, trains } = analyse(parts);
  const phase = new Map();
  for (const t of trains) {
    for (const A of t.axles) {
      if (!A.gear || phase.has(key(A.p))) continue;
      phase.set(key(A.p), 0);
      const queue = [A];
      while (queue.length) {
        const P = queue.shift();
        for (const { to: Q, via } of P.links) {
          if (via !== 'mesh' || phase.has(key(Q.p))) continue;
          const nA = GEAR_TEETH[P.gear.size];
          const nB = GEAR_TEETH[Q.gear.size];
          const pitchA = TAU / nA;
          const pitchB = TAU / nB;
          const c = 0.375;
          const alpha = Math.atan2(Q.p[1] - P.p[1], Q.p[0] - P.p[0]);
          const dA = ((((alpha - phase.get(key(P.p)) - c * pitchA) % pitchA) + pitchA) % pitchA);
          phase.set(key(Q.p), alpha + Math.PI + pitchB / 2 - c * pitchB + dA * (nA / nB));
          queue.push(Q);
        }
      }
    }
  }
  return { axles, trains, phase };
}

/**
 * opts: { mode: 'build' | 'run', run, layout, selected, problems (Map),
 * ghost (part), ghostBad, path (array of paths), time, pegs, hintPart }
 */
export function drawScene(view, pal, level, parts, opts = {}) {
  const ctx = view.ctx;
  const { mode = 'build', run = null, layout = machineLayout([...(level.fixed || []), ...parts]), time = 0 } = opts;
  const all = [...(level.fixed || []), ...parts];
  view.begin(pal);
  drawBorder(ctx, view, level, pal);
  drawZones(ctx, view, level, pal);
  if (opts.pegs !== false && mode === 'build') drawPegs(ctx, view, level, pal);
  drawWalls(ctx, view, level, pal);
  drawDanger(ctx, view, level, pal);

  // how far each axle has turned
  const turn = (p) => {
    if (!run) return 0;
    const A = layout.axles.get(key(p));
    if (!A || A.train < 0) return 0;
    const t = run.trains[A.train];
    return t ? A.k * t.theta : 0;
  };

  // back layer: gears, chains
  for (const part of all) {
    if (part.type !== 'gear') continue;
    const a = (layout.phase.get(key(part.p)) || 0) + turn(part.p);
    drawGear(ctx, view, pal, part.p[0], part.p[1], part.size, a);
  }
  for (const part of all) {
    if (part.type !== 'chain') continue;
    const ga = all.find((o) => o.type === 'gear' && key(o.p) === key(part.a));
    const gb = all.find((o) => o.type === 'gear' && key(o.p) === key(part.b));
    if (!ga || !gb) continue;
    drawChain(ctx, view, pal, part.a, ga.size + 0.05, part.b, gb.size + 0.05, turn(part.a) * ga.size);
  }
  for (const part of all) if (part.type === 'gear') drawAxle(ctx, view, pal, part.p[0], part.p[1]);

  if (opts.paths) for (const p of opts.paths) drawPath(ctx, view, pal, p);

  // front layer: the parts things touch
  for (const part of all) {
    if (part.type === 'ramp') drawRamp(ctx, view, pal, part.a, part.b);
    else if (part.type === 'bouncer') drawBouncer(ctx, view, pal, part.a, part.b);
    else if (part.type === 'conveyor') {
      const t = turn(part.a);
      drawConveyor(ctx, view, pal, part.a, part.b, t * DRUM_R, t);
    }
  }
  drawGoal(ctx, view, level, pal, time, opts.goalGlow || 0);
  for (const part of all) {
    if (part.type === 'lever') {
      const b = run?.partBodies.get(part.id);
      drawLever(ctx, view, pal, part, b ? b.angle : undefined);
    } else if (part.type === 'weight') {
      const b = run?.partBodies.get(part.id);
      drawWeight(ctx, view, pal, b ? b.x : part.p[0], b ? b.y : part.p[1], b ? b.angle : 0);
    }
  }
  for (const part of all) {
    if (part.type === 'motor') drawMotor(ctx, view, pal, part.p[0], part.p[1], part.dir || 1, turn(part.p), part.delay, mode === 'run');
  }

  // movers and items
  (level.movers || []).forEach((m, i) => {
    const b = run?.movers[i];
    if (b) drawMover(ctx, view, pal, m, b.x, b.y, b.angle);
    else {
      const p = opts.moverPose ? opts.moverPose(i) : null;
      if (p) drawMover(ctx, view, pal, m, p.x, p.y, p.angle || 0);
    }
  });
  (level.items || []).forEach((it, i) => {
    const b = run?.items[i];
    if (b && b.gone) return;
    drawItem(ctx, view, pal, it, b ? b.x : it.x, b ? b.y : it.y, b ? b.angle : it.angle || 0, { lost: run && run.lost === b && run.status === 'fail' });
  });

  // overlays
  if (opts.hintParts) for (const hp of opts.hintParts) outline(ctx, view, pal, partShape(hp) || chainShape(hp), { width: 2.4, color: pal.mid });
  if (opts.problems) {
    for (const part of parts) {
      if (!opts.problems.has(part.id)) continue;
      outline(ctx, view, pal, partShape(part) || chainShape(part), { width: 2.4 });
      const c = centre(part);
      label(ctx, view, pal, '!', c[0], c[1] - 0.9, { size: 14 });
    }
  }
  if (opts.selected) {
    const s = all.find((p) => p.id === opts.selected);
    if (s) outline(ctx, view, pal, partShape(s) || chainShape(s), { dash: false, width: 2.6 });
  }
  if (opts.ghost) {
    ctx.globalAlpha = 0.55;
    drawPart(view, pal, opts.ghost, all);
    ctx.globalAlpha = 1;
    outline(ctx, view, pal, partShape(opts.ghost) || chainShape(opts.ghost), { width: opts.ghostBad ? 2.6 : 1.6 });
  }
  if (opts.ratios && mode === 'build') drawRatios(view, pal, layout, all);
}

function chainShape(part) {
  if (part.type !== 'chain') return null;
  return { verts: [part.a, part.b], radius: 0.3 };
}

export function centre(part) {
  if (part.a) return [(part.a[0] + part.b[0]) / 2, (part.a[1] + part.b[1]) / 2];
  return part.p;
}

/** Draw a single part from its data (ghosts, tray icons). */
export function drawPart(view, pal, part, all = []) {
  const ctx = view.ctx;
  switch (part.type) {
    case 'ramp':
      return drawRamp(ctx, view, pal, part.a, part.b);
    case 'bouncer':
      return drawBouncer(ctx, view, pal, part.a, part.b);
    case 'conveyor':
      return drawConveyor(ctx, view, pal, part.a, part.b);
    case 'lever':
      return drawLever(ctx, view, pal, part);
    case 'weight':
      return drawWeight(ctx, view, pal, part.p[0], part.p[1]);
    case 'gear':
      return drawGear(ctx, view, pal, part.p[0], part.p[1], part.size, 0);
    case 'motor':
      return drawMotor(ctx, view, pal, part.p[0], part.p[1], part.dir || 1, 0, 0, false);
    case 'chain': {
      const ga = all.find((o) => o.type === 'gear' && key(o.p) === key(part.a));
      const gb = all.find((o) => o.type === 'gear' && key(o.p) === key(part.b));
      if (ga && gb) drawChain(ctx, view, pal, part.a, ga.size, part.b, gb.size);
      return;
    }
  }
}

function fmtRatio(k) {
  const a = Math.abs(k);
  const frac = { 0.5: '½', 0.25: '¼', 0.75: '¾' };
  const near = (x, y) => Math.abs(x - y) < 1e-3;
  for (const [v, s] of Object.entries(frac)) if (near(a, +v)) return `${s}×`;
  if (near(a, 1 / 3)) return '⅓×';
  if (near(a, 2 / 3)) return '⅔×';
  if (near(a, Math.round(a))) return `${Math.round(a)}×`;
  return `${a.toFixed(2)}×`;
}

function drawRatios(view, pal, layout, all) {
  const ctx = view.ctx;
  for (const t of layout.trains) {
    if (t.jammed) {
      const A = t.axles[0];
      label(ctx, view, pal, 'Jammed', A.p[0], A.p[1] - 1.1, { size: 12 });
      continue;
    }
    if (!t.motors.length || t.axles.length < 2) continue;
    const dir = t.motors[0].motor.dir || 1;
    for (const A of t.axles) {
      if (A.motor) continue;
      if (!A.gear && !A.drums.length && !A.levers.length) continue;
      const turnArrow = A.k * dir > 0 ? '↻' : '↺';
      label(ctx, view, pal, `${turnArrow} ${fmtRatio(A.k)}`, A.p[0], A.p[1] + 0.02, { size: 11 });
    }
  }
}

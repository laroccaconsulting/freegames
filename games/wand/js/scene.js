// The test chamber: a small first-person alcove and the rules for what each
// spell does to what. Pure state and pure functions — no DOM, no canvas — so
// the whole spell system can be unit-tested in tests/wand.test.js.
//
// The world is in metres. The camera stands at the origin at eye height
// looking along +z, so x is left/right, y is up from the floor, and z is how
// far away a thing is. Spells that push and pull move z; spells that lift move y.

export const EYE = 1.55; // camera height, metres
export const FLOOR = 0;
export const NEAR = 1.2; // nothing may come closer than this
export const FAR = 5.5;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// `mass` decides what force spells can do:
//   light  — a gust alone will move it
//   normal — Levo lifts it, Attraho and Repello slide it
//   heavy  — too heavy to lift or shove until something makes it smaller
//   fixed  — bolted down; force spells do nothing
const OBJECTS = [
  { id: 'candle', kind: 'candle', label: 'a candle', x: -1.45, z: 2.7, baseY: 1.05, size: 0.36, mass: 'fixed', plinth: true, lightable: true },
  { id: 'urn', kind: 'urn', label: 'a cracked urn', x: -1.25, z: 1.95, baseY: 0.8, size: 0.42, mass: 'normal', plinth: true, broken: true, fragile: true },
  { id: 'vane', kind: 'vane', label: 'a little weather vane', x: -1.95, z: 4.2, baseY: 1.85, size: 0.44, mass: 'fixed', spinnable: true },
  { id: 'brazier', kind: 'brazier', label: 'the brazier', x: -1.7, z: 4.8, baseY: 0, size: 0.7, mass: 'fixed', lightable: true },
  { id: 'crate', kind: 'crate', label: 'a crate', x: -0.8, z: 3.5, baseY: 0, size: 0.85, mass: 'heavy' },
  { id: 'basin', kind: 'basin', label: 'a stone basin', x: -0.05, z: 1.7, baseY: 0.6, size: 0.5, mass: 'fixed', plinth: true, fillable: true },
  { id: 'rune', kind: 'rune', label: 'a mark on the wall', x: -1.0, z: FAR - 0.05, baseY: 2.15, size: 0.6, mass: 'fixed', hidden: true },
  { id: 'vine', kind: 'vine', label: 'a potted vine', x: 0.85, z: 3.0, baseY: 0, size: 0.62, mass: 'fixed', growable: true, grown: 0 },
  { id: 'pixie', kind: 'pixie', label: 'a pixie', x: 1.15, z: 2.7, baseY: 1.62, size: 0.24, mass: 'light', alive: true },
  { id: 'chest', kind: 'chest', label: 'an iron chest', x: 1.85, z: 4.0, baseY: 0, size: 0.78, mass: 'fixed', locked: true, openable: true },
  { id: 'lantern', kind: 'lantern', label: 'a hanging lantern', x: 1.15, z: 2.15, baseY: 1.9, size: 0.38, mass: 'normal', lightable: true, hangsFrom: 'rope' },
  { id: 'rope', kind: 'rope', label: 'the lantern rope', x: 1.15, z: 2.15, baseY: 2.25, size: 0.24, mass: 'fixed', cuttable: true },
];

export function makeWorld() {
  return {
    time: 0,
    objects: OBJECTS.map((o) => ({
      ...o,
      y: o.baseY,
      vy: 0,
      x0: o.x,
      z0: o.z,
      targetZ: o.z,
      scale: 1,
      held: false,
      lit: false,
      wet: 0,
      frozen: 0,
      slowed: 0,
      caged: false,
      cut: false,
      fallen: false,
      open: false,
      spun: 0,
      seen: !o.hidden,
      phase: o.id.length * 1.7,
    })),
    cast: [], // every spell id cast so far, for the journal
  };
}

export const find = (world, id) => world.objects.find((o) => o.id === id);

// ---------- what each spell does ----------

// Returned from a reaction: a line of text means something happened.
// `null` means the spell washed over it with no effect.
const REACTIONS = {
  ignito(o) {
    if (o.frozen > 0) {
      o.frozen = 0;
      o.wet = Math.min(1, o.wet + 0.6);
      return `The ice round ${o.label} melts.`;
    }
    if (o.wet > 0.05) {
      o.wet = 0;
      return `Steam comes off ${o.label}. It is dry again.`;
    }
    if (o.lightable) {
      if (o.lit) return null;
      o.lit = true;
      return `${cap(o.label)} catches and burns.`;
    }
    if (o.cuttable) {
      o.cut = true;
      return `The flame burns through ${o.label}.`;
    }
    return null;
  },
  unda(o) {
    if (o.lit) {
      o.lit = false;
      o.wet = 1;
      return `Water puts ${o.label} out.`;
    }
    if (o.fillable) {
      o.wet = 1;
      return `${cap(o.label)} fills to the brim.`;
    }
    o.wet = Math.min(1, o.wet + 1);
    if (o.growable) return `The soil round ${o.label} drinks it up.`;
    return `${cap(o.label)} is soaked.`;
  },
  clario(o) {
    if (o.hidden && !o.seen) return null; // light alone will not show a hidden thing
    if (o.lightable && !o.lit) {
      o.lit = true;
      return `A small light kindles on ${o.label}.`;
    }
    if (o.alive && o.slowed > 0) {
      o.slowed = 0;
      return `${cap(o.label)} shakes itself awake.`;
    }
    return null;
  },
  tenebro(o) {
    if (o.lit) {
      o.lit = false;
      return `${cap(o.label)} goes dark.`;
    }
    return null;
  },
  levo(o) {
    if (o.openable) {
      if (o.locked) return `The lid of ${o.label} will not shift: it is locked.`;
      if (o.open) return null;
      o.open = true;
      return `The heavy lid of ${o.label} swings up.`;
    }
    if (o.mass === 'fixed') return null;
    if (o.caged) return `${cap(o.label)} strains against the cage.`;
    if (effectiveMass(o) === 'heavy') return `${cap(o.label)} is far too heavy to lift.`;
    if (o.held) return null;
    o.held = true;
    o.vy = 0;
    return `${cap(o.label)} floats up.`;
  },
  demitto(o) {
    if (o.openable && o.open) {
      o.open = false;
      return `The lid of ${o.label} closes.`;
    }
    if (!o.held) return null;
    o.held = false;
    return `${cap(o.label)} settles back down.`;
  },
  attraho(o) {
    if (o.mass === 'fixed' || o.caged) return null;
    if (effectiveMass(o) === 'heavy') return `${cap(o.label)} will not budge.`;
    o.targetZ = clamp(o.targetZ - 0.9, NEAR, FAR);
    return `${cap(o.label)} slides towards you.`;
  },
  repello(o) {
    if (o.mass === 'fixed' || o.caged) return null;
    if (effectiveMass(o) === 'heavy') return `${cap(o.label)} rocks, but stays put.`;
    o.targetZ = clamp(o.targetZ + 1.1, NEAR, FAR);
    if (o.fragile && o.targetZ >= FAR - 0.01) o.broken = true;
    return `${cap(o.label)} is flung back.`;
  },
  tempesto(o) {
    if (o.spinnable) {
      o.spun += 1;
      return `${cap(o.label)} whirls round.`;
    }
    if (o.lit) {
      o.lit = false;
      return `The gust blows ${o.label} out.`;
    }
    if (o.mass === 'light' && !o.caged && !o.frozen) {
      o.targetZ = clamp(o.targetZ + 0.7, NEAR, FAR);
      return `${cap(o.label)} is tumbled by the wind.`;
    }
    return null;
  },
  gelo(o) {
    if (o.lit) {
      o.lit = false;
      o.frozen = 6;
      return `${cap(o.label)} freezes and the flame dies.`;
    }
    o.frozen = 6;
    if (o.alive) return `${cap(o.label)} is frozen mid-air.`;
    return `Frost creeps over ${o.label}.`;
  },
  tardito(o) {
    o.slowed = 10;
    return `Time thickens round ${o.label}.`;
  },
  vincito(o) {
    if (o.mass === 'fixed') return null;
    o.caged = !o.caged;
    o.held = false;
    return o.caged ? `A cage of light closes round ${o.label}.` : `The cage round ${o.label} fades.`;
  },
  reserato(o) {
    if (!o.locked) return o.openable ? `${cap(o.label)} is already unlocked.` : null;
    o.locked = false;
    return `The lock on ${o.label} turns and springs open.`;
  },
  sarcito(o) {
    if (o.cut) {
      o.cut = false;
      return `${cap(o.label)} knits itself back together.`;
    }
    if (!o.broken) return null;
    o.broken = false;
    return `The cracks in ${o.label} close up.`;
  },
  secato(o) {
    if (!o.cuttable) return null;
    if (o.cut) return null;
    o.cut = true;
    return `${cap(o.label)} parts in two.`;
  },
  aperio(o) {
    if (o.seen) return null;
    o.seen = true;
    return `${cap(o.label)} swims into view.`;
  },
  crescito(o) {
    if (o.growable) {
      if (o.wet <= 0.05) return `Nothing happens: ${o.label} is bone dry.`;
      o.grown = clamp(o.grown + 1, 0, 3);
      o.wet = Math.max(0, o.wet - 0.5);
      return o.grown >= 3 ? `${cap(o.label)} reaches the ledge.` : `${cap(o.label)} puts out another length.`;
    }
    if (o.scale >= 2) return null;
    o.scale = clamp(o.scale * 1.5, 0.4, 2);
    return `${cap(o.label)} swells.`;
  },
  minuito(o) {
    if (o.growable && o.grown > 0) {
      o.grown = clamp(o.grown - 1, 0, 3);
      return `${cap(o.label)} shrinks back.`;
    }
    if (o.scale <= 0.4) return null;
    o.scale = clamp(o.scale / 1.5, 0.4, 2);
    return `${cap(o.label)} shrinks.`;
  },
};

// A crate is heavy until it has been shrunk; that is the point of Minuito.
function effectiveMass(o) {
  if (o.mass !== 'heavy') return o.mass;
  return o.scale <= 0.7 ? 'normal' : 'heavy';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Cast `spellId` at `targetId` (or at nothing).
 * Mutates the world and returns what to say and what to draw.
 */
const FORCE = new Set(['levo', 'demitto', 'attraho', 'repello', 'tempesto']);

export function castSpell(world, spellId, targetId) {
  world.cast.push(spellId);
  const reaction = REACTIONS[spellId];
  if (!targetId) return { hit: false, message: 'The spell flies off into the dark.', targetId: null };
  const o = find(world, targetId);
  if (!o) return { hit: false, message: 'The spell flies off into the dark.', targetId: null };
  // Only Aperio can act on something that has not been revealed yet.
  if (!o.seen && spellId !== 'aperio') return { hit: false, message: 'The spell passes through empty air.', targetId: null };
  if (o.alive && !o.caged && o.frozen <= 0 && FORCE.has(spellId)) {
    return { hit: true, targetId, message: `${cap(o.label)} darts out of the way. Stop it moving first.`, inert: true };
  }
  if (o.frozen > 0 && spellId !== 'ignito' && spellId !== 'clario') {
    return { hit: true, targetId, message: `${cap(o.label)} is frozen solid; the spell glances off.` };
  }
  const message = reaction ? reaction(o) : null;
  if (!message) return { hit: true, targetId, message: `${cap(o.label)} pays the spell no mind.`, inert: true };
  return { hit: true, targetId, message };
}

// ---------- the world moving on its own ----------

const HOLD_HEIGHT = 1.35; // how high above its resting place a held thing rides

export function tick(world, dt) {
  world.time += dt;
  for (const o of world.objects) {
    const slow = o.slowed > 0 ? 0.25 : 1;
    if (o.frozen > 0) o.frozen = Math.max(0, o.frozen - dt);
    if (o.slowed > 0) o.slowed = Math.max(0, o.slowed - dt);
    if (o.wet > 0 && !o.fillable) o.wet = Math.max(0, o.wet - dt * 0.05);
    if (o.lit && o.wet > 0.4) o.lit = false;

    // Depth eases towards wherever a push or pull sent it.
    o.z += (o.targetZ - o.z) * Math.min(1, dt * 4 * slow);

    // A cut rope drops whatever hung from it.
    if (o.hangsFrom && !o.fallen && find(world, o.hangsFrom)?.cut) {
      o.fallen = true;
      o.baseY = FLOOR + o.size / 2;
      o.held = false;
    }

    const rest = o.frozen > 0 ? o.y : o.baseY;
    if (o.caged || o.frozen > 0) {
      o.vy = 0;
    } else if (o.held) {
      const target = o.baseY + HOLD_HEIGHT;
      o.y += (target - o.y) * Math.min(1, dt * 3 * slow);
      o.vy = 0;
    } else if (o.y > rest + 0.001 || o.vy !== 0) {
      o.vy -= 9.8 * dt * slow * slow;
      o.y += o.vy * dt * slow;
      if (o.y <= rest) {
        const impact = -o.vy;
        o.y = rest;
        o.vy = 0;
        // Drop a fragile thing from any height and it is broken again.
        if (o.fragile && impact > 4) o.broken = true;
      }
    } else {
      o.y = rest;
    }

    // The pixie will not sit still unless it is stopped.
    if (o.alive && !o.caged && o.frozen <= 0 && !o.held) {
      o.phase += dt * 1.6 * slow;
      o.x = o.x0 + Math.sin(o.phase) * 0.55;
      o.y = o.baseY + Math.sin(o.phase * 2.3) * 0.28;
      o.z = o.z0 + Math.cos(o.phase * 0.7) * 0.5;
      o.targetZ = o.z;
    }

    // A watered vine climbs; drawn height comes from `grown`.
    if (o.growable) o.height = (o.height ?? 0) + ((o.grown * 0.62) - (o.height ?? 0)) * Math.min(1, dt * 2);
  }
}

// ---------- the trials: proof that spells combine into puzzles ----------

export const TASKS = [
  { id: 'light', text: 'Light the candle', hint: 'Fire, or just a light.', done: (w) => find(w, 'candle').lit },
  { id: 'douse', text: 'Put the brazier out once it is burning', hint: 'Water, wind, frost or plain darkness.', done: (w) => !!w.brazierLit && !find(w, 'brazier').lit },
  { id: 'pull', text: 'Bring the crate to the front of the room', hint: 'It is too heavy as it is. Make it smaller first.', done: (w) => find(w, 'crate').z < 2.0 },
  { id: 'float', text: 'Float the crate off the floor', hint: 'Same problem: shrink it, then lift it.', done: (w) => find(w, 'crate').y > 0.6 },
  { id: 'chest', text: 'Get the iron chest open', hint: 'Turn the lock, then lift the lid.', done: (w) => find(w, 'chest').open },
  { id: 'urn', text: 'Mend the cracked urn', hint: 'One spell puts broken things back together.', done: (w) => !find(w, 'urn').broken },
  { id: 'vine', text: 'Grow the vine up to the ledge', hint: 'Water the soil, then grow it. Three times over.', done: (w) => find(w, 'vine').grown >= 3 },
  { id: 'pixie', text: 'Stop the pixie', hint: 'Freeze it, cage it, or slow time round it.', done: (w) => find(w, 'pixie').caged || find(w, 'pixie').frozen > 0 },
  { id: 'rune', text: 'Find what is hidden on the back wall', hint: 'Something has to reveal it.', done: (w) => find(w, 'rune').seen },
  { id: 'lantern', text: 'Bring the hanging lantern down', hint: 'Cut the rope. Or burn it.', done: (w) => find(w, 'lantern').fallen },
];

// Some goals need a state the world only passes through, so remember it.
export function remember(world) {
  if (find(world, 'brazier').lit) world.brazierLit = true;
}

export function progress(world) {
  return TASKS.map((t) => ({ ...t, complete: !!t.done(world) }));
}

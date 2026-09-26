// The rules: what each spell does to what, and how a room settles afterwards.
// Pure state and pure functions — no DOM, no canvas — so the whole spell
// system can be unit-tested in tests/wand.test.js.
//
// The world is in metres. The camera stands at the origin at eye height
// looking along +z, so x is left/right, y is up from the floor, and z is how
// far away a thing is. Spells that push and pull move z; spells that lift move y.
//
// Nothing in here knows about any particular place. The places, and the
// puzzles in them, live in js/levels.js and reach the rules through two
// hooks: `block` (a reason a spell cannot work here) and `onCast` (an
// authored outcome that replaces the generic one).

import { levelById } from './levels.js';

export const EYE = 1.55; // camera height, metres
export const FLOOR = 0;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// `mass` decides what force spells can do:
//   light  — a gust alone will move it
//   normal — Levo lifts it, Attraho and Repello slide it
//   heavy  — too heavy to lift or shove until something makes it smaller
//   fixed  — bolted down; force spells do nothing
export function makeWorld(level = 'chamber') {
  const def = typeof level === 'string' ? levelById(level) : level;
  return {
    level: def,
    room: { ...def.room },
    time: 0,
    // States the world only passes through: steps that have ever been
    // finished, and anything level.watch wants to remember.
    latch: { steps: new Set() },
    objects: def.props.map((o) => ({
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
      if (o.locked) return `${cap(o.label)} will not shift: it is locked.`;
      if (o.open) return null;
      o.open = true;
      return `${cap(o.label)} swings open.`;
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
      return `${cap(o.label)} closes again.`;
    }
    if (!o.held) return null;
    o.held = false;
    return `${cap(o.label)} settles back down.`;
  },
  attraho(o, world) {
    if (o.mass === 'fixed' || o.caged) return null;
    if (effectiveMass(o) === 'heavy') return `${cap(o.label)} will not budge.`;
    o.targetZ = clamp(o.targetZ - 0.9, nearLimit(world), farLimit(world));
    return `${cap(o.label)} slides towards you.`;
  },
  repello(o, world) {
    if (o.mass === 'fixed' || o.caged) return null;
    if (effectiveMass(o) === 'heavy') return `${cap(o.label)} rocks, but stays put.`;
    o.targetZ = clamp(o.targetZ + 1.1, nearLimit(world), farLimit(world));
    if (o.fragile && o.targetZ >= farLimit(world) - 0.01) o.broken = true;
    return `${cap(o.label)} is flung back.`;
  },
  tempesto(o, world) {
    if (o.spinnable) {
      o.spun += 1;
      return `${cap(o.label)} whirls round.`;
    }
    if (o.lit) {
      o.lit = false;
      return `The gust blows ${o.label} out.`;
    }
    if (o.mass === 'light' && !o.caged && !o.frozen) {
      o.targetZ = clamp(o.targetZ + 0.7, nearLimit(world), farLimit(world));
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
    if (o.alive) return `${cap(o.label)} is frozen where it stands.`;
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
      return o.grown >= 3 ? `${cap(o.label)} reaches the top.` : `${cap(o.label)} puts out another length.`;
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

export const SPELL_IDS = Object.keys(REACTIONS);

// A crate is heavy until it has been shrunk; that is the point of Minuito.
function effectiveMass(o) {
  if (o.mass !== 'heavy') return o.mass;
  return o.scale <= 0.7 ? 'normal' : 'heavy';
}

const nearLimit = (world) => (world?.room?.near ?? 0.6) + 0.6;
const farLimit = (world) => (world?.room?.far ?? 5.5) - 0.2;

const FORCE = new Set(['levo', 'demitto', 'attraho', 'repello', 'tempesto']);

// A reason this spell cannot work on this thing here, or null. Levels use it
// to teach: "the bricks are a wall of shadow", "not with that bell going".
export function blocked(world, spellId, o) {
  if (!o) return 'The spell flies off into the dark.';
  if (!o.seen && spellId !== 'aperio') return 'The spell passes through empty air.';
  if (o.alive && !o.caged && o.frozen <= 0 && FORCE.has(spellId)) return `${cap(o.label)} darts out of the way. Stop it moving first.`;
  if (o.frozen > 0 && spellId !== 'ignito' && spellId !== 'clario') return `${cap(o.label)} is frozen solid; the spell glances off.`;
  return world.level?.block?.(world, spellId, o) || null;
}

// Would this spell do anything to this thing? Answered on a copy, so asking
// changes nothing. Used to break a tie between two things the stroke covered:
// aim at the lantern and its rope together and the cutting spell takes the
// rope, while the lighting spell takes the lantern.
export function wouldAffect(world, spellId, o) {
  const reaction = REACTIONS[spellId];
  if (!reaction || !o) return false;
  if (blocked(world, spellId, o)) return false;
  if (reaction({ ...o }, world)) return true;
  // The level may have authored an outcome the generic rules know nothing of.
  return (world.level?.authored?.[o.id] || []).includes(spellId);
}

/**
 * Cast `spellId` at `targetId` (or at nothing).
 * Mutates the world and returns what to say and what to draw.
 */
export function castSpell(world, spellId, targetId) {
  world.cast.push(spellId);
  const reaction = REACTIONS[spellId];
  const o = targetId ? find(world, targetId) : null;
  if (!o) return { hit: false, message: 'The spell flies off into the dark.', targetId: null };

  const refusal = blocked(world, spellId, o);
  // A spell aimed at something not yet revealed must not give away where it
  // is, so it reports as a miss rather than a bounce.
  if (refusal && !o.seen) return { hit: false, targetId: null, message: refusal };
  if (refusal) return { hit: true, targetId, message: refusal, inert: true };

  const generic = reaction ? reaction(o, world) : null;
  // The level gets the last word: it can replace the line, or supply one
  // where the generic rules had nothing to say.
  const authored = world.level?.onCast?.(world, spellId, o) || null;
  const message = authored || generic;
  if (!message) return { hit: true, targetId, message: `${cap(o.label)} pays the spell no mind.`, inert: true };
  return { hit: true, targetId, message };
}

// ---------- the world moving on its own ----------

const HOLD_HEIGHT = 1.35; // how high above its resting place a held thing rides

export function tick(world, dt) {
  world.time += dt;
  for (const o of world.objects) {
    if (o.gone) {
      o.seen = false;
      continue;
    }
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

    // Flitting things will not sit still unless they are stopped.
    if (o.wander && !o.caged && o.frozen <= 0 && !o.held) {
      o.phase += dt * 1.6 * slow;
      o.x = o.x0 + Math.sin(o.phase) * 0.55;
      o.y = o.baseY + Math.sin(o.phase * 2.3) * 0.28;
      o.z = o.z0 + Math.cos(o.phase * 0.7) * 0.5;
      o.targetZ = o.z;
    }

    // A watered plant climbs; drawn height comes from `grown`.
    if (o.growable) o.height = (o.height ?? 0) + (o.grown * 0.62 - (o.height ?? 0)) * Math.min(1, dt * 2);
  }
  world.level?.watch?.(world);
  // A step that has ever been finished stays finished, so undoing something
  // later — dropping the mended urn, letting the snapper go — can never lock
  // a player out of a puzzle they have already solved.
  for (const s of world.level.steps) if (s.done(world)) world.latch.steps.add(s.id);
}

// ---------- the puzzle ----------

/**
 * Where the player is up to.
 * A journey is strictly sequential: the step after the current one is not
 * shown at all, so the room unfolds instead of listing itself. The practice
 * chamber sets `ordered: false` and shows every trial at once.
 */
export function progress(world) {
  const level = world.level;
  const steps = level.steps.map((s) => ({ ...s, complete: world.latch.steps.has(s.id) || !!s.done(world) }));
  if (level.ordered === false) return steps.map((s) => ({ ...s, revealed: true }));
  let reached = true;
  return steps.map((s) => {
    const revealed = reached;
    if (revealed && !s.complete) reached = false;
    return { ...s, revealed };
  });
}

export const finished = (world) => progress(world).every((s) => s.complete);

// The step the player is on, or null when the level is done.
export const currentStep = (world) => progress(world).find((s) => s.revealed && !s.complete) || null;

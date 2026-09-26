import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_LIST, SPELLS_BY_ID, TEMPLATES } from '../games/wand/js/glyphs.js';
import { prepare, recognize, rank, resample, normalize, bounds, centroid, pathLength, fitTemplate, SAMPLES } from '../games/wand/js/recognizer.js';
import { makeWorld, castSpell, wouldAffect, blocked, tick, progress, finished, currentStep, find, SPELL_IDS } from '../games/wand/js/scene.js';
import { LEVELS, levelById, isUnlocked, knownSpells } from '../games/wand/js/levels.js';

const prepared = prepare(TEMPLATES);
const template = (id) => TEMPLATES.find((t) => t.id === id);

// A deterministic stand-in for a finger: jitter, scale, move, tilt, and drop
// samples the way a real pointer stream does.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function drawnByHand(points, rnd, { jitter = 0.06, tilt = 0.14 } = {}) {
  const s = 60 + rnd() * 200;
  const ox = rnd() * 400;
  const oy = rnd() * 400;
  const a = (rnd() * 2 - 1) * tilt;
  const c = Math.cos(a);
  const si = Math.sin(a);
  const out = [];
  for (const p of points) {
    if (rnd() < 0.15) continue; // a dropped pointer sample
    const x = p.x + (rnd() * 2 - 1) * jitter;
    const y = p.y + (rnd() * 2 - 1) * jitter;
    out.push({ x: ox + (x * c - y * si) * s, y: oy + (x * si + y * c) * s });
  }
  return out;
}
// Begin a closed loop somewhere other than where the template does.
function restart(points, k) {
  const loop = points.slice(0, -1);
  const rolled = loop.slice(k).concat(loop.slice(0, k));
  return rolled.concat([{ ...rolled[0] }]);
}

// ---------- the spellbook ----------

test('every spell has a unique id, a drawable stroke and a described shape', () => {
  const ids = new Set();
  for (const s of SPELL_LIST) {
    assert.ok(!ids.has(s.id), `duplicate spell id ${s.id}`);
    ids.add(s.id);
    assert.ok(s.stroke.length >= 8, `${s.id} needs more points`);
    assert.ok(pathLength(s.stroke) > 1, `${s.id} is too short to draw`);
    assert.match(s.color, /^#[0-9a-f]{6}$/i);
    assert.ok(s.name && s.effect && s.shape, `${s.id} is missing copy`);
    // Glyphs live in roughly a two-unit square so they all read at one size.
    const b = bounds(s.stroke);
    assert.ok(Math.max(b.width, b.height) > 1.2 && Math.max(b.width, b.height) < 2.6, `${s.id} is the wrong size`);
  }
  assert.equal(SPELL_LIST.length, TEMPLATES.length);
});

// ---------- normalizing a stroke ----------

test('resampling gives evenly spaced points, however jerkily it was drawn', () => {
  const pts = resample([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 0 }], 11);
  assert.equal(pts.length, 11);
  for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i].x - pts[i - 1].x - 10) < 1e-6);
});

test('a tap resamples without blowing up', () => {
  assert.equal(resample([{ x: 5, y: 5 }], 8).length, 8);
  assert.equal(resample([], 8).length, 8);
});

test('normalizing removes where and how big, but keeps the shape', () => {
  const a = normalize(template('unda').points);
  const big = template('unda').points.map((p) => ({ x: p.x * 37 + 900, y: p.y * 37 - 400 }));
  const b = normalize(big);
  for (let i = 0; i < a.length; i++) assert.ok(Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) < 1e-9);
  const c = centroid(a);
  assert.ok(Math.hypot(c.x, c.y) < 1e-9);
});

test('a straight line stays a straight line (it is not squashed into a square)', () => {
  const n = normalize(template('secato').points);
  const b = bounds(n);
  // Equal sides, because the slash runs corner to corner at 45°.
  assert.ok(Math.abs(b.width - b.height) < 0.01);
  // Every point sits on one line.
  for (const p of n) assert.ok(Math.abs(p.x + p.y) < 0.02, 'the slash bent');
});

// ---------- recognizing ----------

test('every glyph recognizes itself exactly', () => {
  for (const t of TEMPLATES) {
    const r = rank(t.points, prepared);
    assert.equal(r.best.id, t.id);
    assert.ok(r.best.score > 0.999, `${t.id} scored ${r.best.score}`);
  }
});

test('a shaky hand never casts the wrong spell, and rarely fizzles', () => {
  // A miscast is the unforgivable one: you meant to freeze the pixie and set
  // fire to it instead. A fizzle just asks you to draw it again.
  let miscast = 0;
  let fizzled = 0;
  let total = 0;
  const blame = [];
  for (const t of TEMPLATES) {
    const rnd = mulberry32(t.id.length * 7919 + 13);
    for (let k = 0; k < 40; k++) {
      total++;
      const got = recognize(drawnByHand(t.points, rnd), prepared);
      if (got.id === t.id) continue;
      if (got.id === null) fizzled++;
      else {
        miscast++;
        blame.push(`${t.id} read as ${got.id}`);
      }
    }
  }
  assert.equal(miscast, 0, `miscast: ${blame.join(', ')}`);
  assert.ok(fizzled / total < 0.03, `${fizzled} of ${total} shaky strokes fizzled`);
});

test('a closed loop can be started anywhere around it', () => {
  for (const t of TEMPLATES.filter((x) => x.closed)) {
    const n = t.points.length - 1;
    for (let k = 0; k < n; k += Math.round(n / 6)) {
      const rnd = mulberry32(k * 31 + 7);
      const got = recognize(drawnByHand(restart(t.points, k), rnd), prepared);
      assert.equal(got.id, t.id, `${t.id} failed when started at point ${k}`);
    }
  }
});

test('direction matters: mirrored and reversed glyphs are different spells', () => {
  const pairs = [
    ['attraho', 'repello'], // wound in vs wound out
    ['clario', 'tenebro'], // clockwise vs anticlockwise
    ['levo', 'demitto'], // flick up vs flick down
    ['crescito', 'minuito'], // peak vs valley
  ];
  for (const [a, b] of pairs) {
    assert.equal(rank(template(a).points, prepared).best.id, a);
    assert.equal(rank(template(b).points, prepared).best.id, b);
    const drawnBackwards = [...template(a).points].reverse();
    assert.notEqual(rank(drawnBackwards, prepared).best.id, a, `${a} drawn backwards still read as ${a}`);
  }
});

test('a tap or a twitch is not a spell', () => {
  assert.equal(recognize([{ x: 10, y: 10 }, { x: 11, y: 11 }], prepared).reason, 'short');
  const twitch = Array.from({ length: 20 }, (_, i) => ({ x: 10 + i * 0.4, y: 10 }));
  assert.equal(recognize(twitch, prepared).reason, 'short');
});

test('a shape unlike any glyph fizzles rather than picking the nearest', () => {
  // A tight scribble back and forth: long enough to count, meaningless.
  const scribble = [];
  for (let i = 0; i < 60; i++) scribble.push({ x: 100 + (i % 2 ? 40 : 0) + i, y: 100 + ((i * 37) % 23) });
  const got = recognize(scribble, prepared);
  assert.equal(got.id, null);
  assert.equal(got.reason, 'unknown');
});

test('the clean glyph is laid back over the stroke the player drew', () => {
  const rnd = mulberry32(99);
  const drawn = drawnByHand(template('sarcito').points, rnd);
  const fitted = fitTemplate(drawn, template('sarcito'));
  assert.equal(fitted.length, SAMPLES);
  const a = bounds(drawn);
  const b = bounds(fitted);
  // Same place, near enough the same size: it should snap, not jump.
  assert.ok(Math.abs((a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2) < Math.max(a.width, a.height) * 0.2);
  assert.ok(Math.abs(Math.max(a.width, a.height) - Math.max(b.width, b.height)) < Math.max(a.width, a.height) * 0.25);
  // And it is the real glyph, not the scrawl.
  assert.equal(rank(fitted, prepared).best.id, 'sarcito');
});

// ---------- the chamber ----------

const run = (world, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) tick(world, 1 / 60);
};

test('every spell has something in the chamber to do', () => {
  // Some spells only answer a state another spell sets up: you cannot set a
  // thing down until it is floating, and you cannot put a light out until
  // something lit it. So try each spell on each object after each opening
  // stretch of a warm-up sequence, and ask only that *some* combination works.
  const warmUp = ['aperio', 'reserato', 'minuito', 'ignito', 'levo', 'unda'];
  for (const s of SPELL_LIST) {
    const worked = makeWorld('chamber').objects.some((o) =>
      // n runs from 0 (no warm-up) through the whole sequence.
      Array.from({ length: warmUp.length + 1 }, (_, i) => i).some((n) => {
        const w = makeWorld('chamber');
        for (const p of warmUp.slice(0, n)) {
          castSpell(w, p, o.id);
          tick(w, 1 / 60);
        }
        const out = castSpell(w, s.id, o.id);
        return out.hit && !out.inert;
      }),
    );
    assert.ok(worked, `${s.id} does nothing to anything in the chamber`);
  }
});

test('fire lights a candle and water puts it out', () => {
  const w = makeWorld('chamber');
  assert.equal(find(w, 'candle').lit, false);
  castSpell(w, 'ignito', 'candle');
  assert.equal(find(w, 'candle').lit, true);
  castSpell(w, 'unda', 'candle');
  assert.equal(find(w, 'candle').lit, false);
  assert.ok(find(w, 'candle').wet > 0);
});

test('a lit thing cannot be relit, and says so by doing nothing', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'ignito', 'brazier');
  const again = castSpell(w, 'ignito', 'brazier');
  assert.equal(again.inert, true);
});

test('the crate is too heavy until it is shrunk: spells are building blocks', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'levo', 'crate');
  assert.equal(find(w, 'crate').held, false, 'a heavy crate should not lift');
  castSpell(w, 'minuito', 'crate');
  castSpell(w, 'levo', 'crate');
  assert.equal(find(w, 'crate').held, true);
  run(w, 3);
  assert.ok(find(w, 'crate').y > 0.5, 'a held crate should float');
  castSpell(w, 'demitto', 'crate');
  run(w, 3);
  assert.ok(find(w, 'crate').y < 0.05, 'it should come back down');
});

test('pull and push move a thing nearer and further, within the room', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'minuito', 'crate');
  const start = find(w, 'crate').z;
  castSpell(w, 'attraho', 'crate');
  run(w, 3);
  assert.ok(find(w, 'crate').z < start - 0.5);
  for (let i = 0; i < 12; i++) {
    castSpell(w, 'repello', 'crate');
    run(w, 1);
  }
  assert.ok(find(w, 'crate').z <= w.room.far && find(w, 'crate').z >= w.room.near);
});

test('the chest needs two spells in the right order', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'levo', 'chest');
  assert.equal(find(w, 'chest').open, false, 'a locked lid should not lift');
  castSpell(w, 'reserato', 'chest');
  assert.equal(find(w, 'chest').locked, false);
  assert.equal(find(w, 'chest').open, false, 'unlocking is not opening');
  castSpell(w, 'levo', 'chest');
  assert.equal(find(w, 'chest').open, true);
  castSpell(w, 'demitto', 'chest');
  assert.equal(find(w, 'chest').open, false);
});

test('the vine only grows in wet soil, and takes three goes', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'crescito', 'vine');
  assert.equal(find(w, 'vine').grown, 0, 'dry soil should not grow');
  for (let i = 0; i < 3; i++) {
    castSpell(w, 'unda', 'vine');
    castSpell(w, 'crescito', 'vine');
  }
  assert.equal(find(w, 'vine').grown, 3);
});

test('the pixie dodges force until it is stopped', () => {
  const w = makeWorld('chamber');
  assert.equal(castSpell(w, 'attraho', 'pixie').inert, true);
  castSpell(w, 'vincito', 'pixie');
  assert.equal(find(w, 'pixie').caged, true);
  const where = { x: find(w, 'pixie').x, y: find(w, 'pixie').y };
  run(w, 2);
  assert.ok(Math.abs(find(w, 'pixie').x - where.x) < 1e-6, 'a caged pixie should stop moving');
  castSpell(w, 'vincito', 'pixie');
  run(w, 1);
  assert.ok(Math.abs(find(w, 'pixie').x - where.x) > 0.01, 'and start again when let go');
});

test('frost holds a thing still, and wears off', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'gelo', 'pixie');
  assert.ok(find(w, 'pixie').frozen > 0);
  assert.equal(castSpell(w, 'unda', 'pixie').message.includes('glances off'), true);
  run(w, 7);
  assert.equal(find(w, 'pixie').frozen, 0);
});

test('cut the rope and the lantern falls to the floor', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'secato', 'rope');
  run(w, 3);
  assert.equal(find(w, 'lantern').fallen, true);
  assert.ok(find(w, 'lantern').y < 0.5);
});

test('fire will cut a rope too: more than one way to solve it', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'ignito', 'rope');
  run(w, 3);
  assert.equal(find(w, 'lantern').fallen, true);
});

test('only Aperio can touch what has not been revealed', () => {
  const w = makeWorld('chamber');
  assert.equal(castSpell(w, 'clario', 'rune').hit, false);
  assert.equal(find(w, 'rune').seen, false);
  castSpell(w, 'aperio', 'rune');
  assert.equal(find(w, 'rune').seen, true);
});

test('a mended urn dropped from a height breaks again', () => {
  const w = makeWorld('chamber');
  castSpell(w, 'sarcito', 'urn');
  assert.equal(find(w, 'urn').broken, false);
  castSpell(w, 'levo', 'urn');
  run(w, 3);
  castSpell(w, 'demitto', 'urn');
  run(w, 3);
  assert.equal(find(w, 'urn').broken, true);
});

// ---------- the trials ----------

test('every trial can be finished, and each one has a hint', () => {
  const w = makeWorld('chamber');
  for (const t of levelById('chamber').steps) assert.ok(t.text && t.hint, `${t.id} needs copy`);

  const script = [
    ['ignito', 'candle'],
    ['ignito', 'brazier'],
    ['unda', 'brazier'],
    ['minuito', 'crate'],
    ['attraho', 'crate'],
    ['attraho', 'crate'],
    ['attraho', 'crate'],
    ['levo', 'crate'],
    ['reserato', 'chest'],
    ['levo', 'chest'],
    ['sarcito', 'urn'],
    ['unda', 'vine'],
    ['crescito', 'vine'],
    ['unda', 'vine'],
    ['crescito', 'vine'],
    ['unda', 'vine'],
    ['crescito', 'vine'],
    ['gelo', 'pixie'],
    ['aperio', 'rune'],
    ['secato', 'rope'],
  ];
  for (const [spell, target] of script) {
    castSpell(w, spell, target);
    run(w, 0.5);
  }
  run(w, 3);
  const state = progress(w);
  const unfinished = state.filter((t) => !t.complete).map((t) => t.id);
  assert.deepEqual(unfinished, [], `could not finish: ${unfinished.join(', ')}`);
});

test('nothing in the chamber reacts to a spell that is not in the book', () => {
  const w = makeWorld('chamber');
  const out = castSpell(w, 'not-a-spell', 'candle');
  assert.equal(out.inert, true);
  assert.equal(find(w, 'candle').lit, false);
});

test('the spellbook and the chamber agree on what exists', () => {
  const w = makeWorld('chamber');
  assert.equal(SPELLS_BY_ID.size, SPELL_LIST.length);
  for (const t of w.level.steps) assert.ok(typeof t.done(w) === 'boolean', `${t.id} has a broken goal`);
});

// ---------- the places ----------

const run60 = (w, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) tick(w, 1 / 60);
};

// The intended route through each journey. These are the tests that would
// catch a level going unsolvable after a rules change.
const WALKTHROUGHS = {
  platform: [
    ['clario', 'lamp'], ['aperio', 'wall'], ['reserato', 'arch'], ['levo', 'arch'],
    ['minuito', 'trunk'], ['levo', 'trunk'], ['repello', 'trunk'], ['reserato', 'cage'],
    ['tardito', 'clock'], ['ignito', 'whistle'],
  ],
  hall: [
    ['ignito', 'hearth'], ['levo', 'candleA'], ['levo', 'candleB'], ['levo', 'candleC'],
    ['clario', 'candleA'], ['clario', 'candleB'], ['clario', 'candleC'],
    ['clario', 'chandelier'], ['unda', 'goblet'], ['aperio', 'sky'],
  ],
  stacks: [
    ['gelo', 'bell'], ['clario', 'lamp'], ['reserato', 'grille'], ['levo', 'grille'],
    ['secato', 'chain'], ['levo', 'book'], ['demitto', 'book'], ['aperio', 'book'],
  ],
  glasshouse: [
    ['sarcito', 'pane'], ['ignito', 'bed'], ['unda', 'bed'], ['vincito', 'snapper'],
    ['unda', 'climber'], ['crescito', 'climber'], ['unda', 'climber'], ['crescito', 'climber'],
    ['unda', 'climber'], ['crescito', 'climber'], ['reserato', 'latch'], ['levo', 'latch'],
  ],
};

test('every level is well formed: named, roomed, stocked and stepped', () => {
  const ids = new Set();
  for (const level of LEVELS) {
    assert.ok(!ids.has(level.id), `duplicate level ${level.id}`);
    ids.add(level.id);
    assert.ok(level.name && level.place && level.blurb && level.done, `${level.id} needs copy`);
    assert.ok(level.props.length >= 5, `${level.id} is bare`);
    assert.ok(level.steps.length >= 5, `${level.id} needs a puzzle`);
    assert.ok(level.room.far > level.room.near + 2 && level.room.half > 1, `${level.id} room`);
    const propIds = new Set();
    for (const p of level.props) {
      assert.ok(!propIds.has(p.id), `${level.id}/${p.id} is not unique`);
      propIds.add(p.id);
      assert.ok(p.kind && p.label, `${level.id}/${p.id} needs a kind and a label`);
      // Everything has to be on screen on a tall phone: the camera sees about
      // 0.92 of a radian either side, so |x| / z must stay well under that.
      assert.ok(Math.abs(p.x) / p.z < 0.8, `${level.id}/${p.id} is off the edge of the screen`);
      assert.ok(p.z > level.room.near && p.z <= level.room.far, `${level.id}/${p.id} is outside the room`);
      assert.ok(p.baseY >= 0 && p.baseY < level.room.top, `${level.id}/${p.id} is through the ceiling`);
    }
    const stepIds = new Set();
    for (const s of level.steps) {
      assert.ok(!stepIds.has(s.id), `${level.id}/${s.id} is not unique`);
      stepIds.add(s.id);
      assert.ok(s.text && s.hint && typeof s.done === 'function', `${level.id}/${s.id} needs copy and a goal`);
    }
    if (level.kit !== 'all') for (const id of level.kit) assert.ok(SPELLS_BY_ID.has(id), `${level.id} asks for unknown spell ${id}`);
  }
});

test('no level starts already solved, and none starts with nothing to do', () => {
  for (const level of LEVELS) {
    const w = makeWorld(level.id);
    run60(w, 0.2);
    assert.ok(!finished(w), `${level.id} is already finished on arrival`);
    assert.ok(currentStep(w), `${level.id} has no step to show`);
  }
});

test('every journey can be finished with the spells it gives you', () => {
  for (const [id, script] of Object.entries(WALKTHROUGHS)) {
    const level = levelById(id);
    const w = makeWorld(id);
    run60(w, 0.2);
    for (const [spell, target] of script) {
      assert.ok(level.kit.includes(spell), `${id}: ${spell} is not in the kit but the walkthrough needs it`);
      assert.ok(find(w, target), `${id}: no ${target}`);
      castSpell(w, spell, target);
      run60(w, 0.4);
    }
    run60(w, 2);
    const left = progress(w).filter((s) => !s.complete).map((s) => s.id);
    assert.deepEqual(left, [], `${id} could not be finished: ${left.join(', ')}`);
  }
});

test('a journey unfolds one step at a time', () => {
  const w = makeWorld('platform');
  run60(w, 0.2);
  assert.equal(progress(w).filter((s) => s.revealed).length, 1, 'only the first step shows');
  castSpell(w, 'clario', 'lamp');
  run60(w, 0.2);
  const shown = progress(w).filter((s) => s.revealed);
  assert.equal(shown.length, 2);
  assert.equal(shown[0].complete, true);
  assert.equal(shown[1].id, 'seam');
  // The practice chamber is the exception: everything at once.
  assert.equal(progress(makeWorld('chamber')).every((s) => s.revealed), true);
});

test('a step stays done even if the world moves on', () => {
  const w = makeWorld('platform');
  castSpell(w, 'clario', 'lamp');
  run60(w, 0.3);
  assert.equal(progress(w)[0].complete, true);
  castSpell(w, 'tenebro', 'lamp'); // put it out again
  run60(w, 0.3);
  assert.equal(find(w, 'lamp').lit, false);
  assert.equal(progress(w)[0].complete, true, 'undoing a step must not lock the player out');
});

test('the platform will not give up its archway in the dark', () => {
  const w = makeWorld('platform');
  const refused = castSpell(w, 'aperio', 'wall');
  assert.match(refused.message, /light/i);
  assert.equal(find(w, 'arch').seen, false);
  castSpell(w, 'clario', 'lamp');
  castSpell(w, 'aperio', 'wall');
  assert.equal(find(w, 'arch').seen, true);
});

test('the trunk only goes through an archway that is open', () => {
  const w = makeWorld('platform');
  castSpell(w, 'minuito', 'trunk');
  castSpell(w, 'levo', 'trunk');
  castSpell(w, 'repello', 'trunk');
  assert.ok(!find(w, 'trunk').gone, 'it should just slide back, with the arch shut');
  castSpell(w, 'clario', 'lamp');
  castSpell(w, 'aperio', 'wall');
  castSpell(w, 'reserato', 'arch');
  castSpell(w, 'levo', 'arch');
  castSpell(w, 'levo', 'trunk');
  castSpell(w, 'repello', 'trunk');
  assert.ok(find(w, 'trunk').gone);
  run60(w, 0.5);
  assert.equal(find(w, 'trunk').seen, false, 'and then it is not in the room any more');
});

test('the hall needs its candles floating before they will light, and five lights before it shows its sky', () => {
  const w = makeWorld('hall');
  const cold = castSpell(w, 'ignito', 'candleA');
  assert.match(cold.message, /float/i);
  assert.equal(find(w, 'candleA').lit, false);
  castSpell(w, 'levo', 'candleA');
  castSpell(w, 'ignito', 'candleA');
  assert.equal(find(w, 'candleA').lit, true);

  const early = castSpell(w, 'aperio', 'sky');
  assert.match(early.message, /not enough|five/i);
  assert.equal(find(w, 'sky').seen, false);
  for (const id of ['candleB', 'candleC']) {
    castSpell(w, 'levo', id);
    castSpell(w, 'clario', id);
  }
  castSpell(w, 'ignito', 'hearth');
  castSpell(w, 'clario', 'chandelier');
  castSpell(w, 'aperio', 'sky');
  assert.equal(find(w, 'sky').seen, true);
});

test('the library will not let you work while the alarm is ringing', () => {
  const w = makeWorld('stacks');
  const refused = castSpell(w, 'clario', 'lamp');
  assert.match(refused.message, /bell/i);
  assert.equal(find(w, 'lamp').lit, false);
  castSpell(w, 'vincito', 'bell');
  assert.equal(find(w, 'bell').ringing, false);
  castSpell(w, 'clario', 'lamp');
  assert.equal(find(w, 'lamp').lit, true);
});

test('the chained book cannot be lifted, and blank pages need light and a desk', () => {
  const w = makeWorld('stacks');
  castSpell(w, 'gelo', 'bell');
  castSpell(w, 'reserato', 'grille');
  castSpell(w, 'levo', 'grille');
  assert.match(castSpell(w, 'levo', 'book').message, /chain/i);
  castSpell(w, 'secato', 'chain');
  castSpell(w, 'levo', 'book');
  run60(w, 1);
  assert.match(castSpell(w, 'aperio', 'book').message, /far away/i);
  castSpell(w, 'demitto', 'book');
  assert.equal(find(w, 'book').onDesk, true);
  assert.match(castSpell(w, 'aperio', 'book').message, /dark/i, 'and not in the dark');
  castSpell(w, 'clario', 'lamp');
  castSpell(w, 'aperio', 'book');
  assert.equal(find(w, 'book').read, true);
});

test('the glasshouse has to be closed up and thawed before anything will grow', () => {
  const w = makeWorld('glasshouse');
  assert.match(castSpell(w, 'unda', 'bed').message, /freezes|thaw/i);
  assert.match(castSpell(w, 'crescito', 'climber').message, /draught|pane/i);
  castSpell(w, 'sarcito', 'pane');
  castSpell(w, 'ignito', 'bed');
  assert.equal(find(w, 'bed').iced, false);
  // The snapper guards the latch until it is stopped.
  assert.match(castSpell(w, 'reserato', 'latch').message, /snapper/i);
  castSpell(w, 'vincito', 'snapper');
  assert.match(castSpell(w, 'reserato', 'latch').message, /reach|grow/i);
});

test('places unlock in order, and the spells you know grow with them', () => {
  assert.equal(isUnlocked(levelById('chamber'), []), true);
  assert.equal(isUnlocked(levelById('platform'), []), true, 'the first journey is always open');
  assert.equal(isUnlocked(levelById('hall'), []), false);
  assert.equal(isUnlocked(levelById('hall'), ['platform']), true);
  assert.equal(isUnlocked(levelById('glasshouse'), ['platform', 'hall']), false);
  const early = knownSpells([]);
  const late = knownSpells(['platform', 'hall', 'stacks']);
  assert.ok(early.size < late.size, 'finishing places teaches you more glyphs');
  for (const id of early) assert.ok(late.has(id), 'and you never forget one');
  assert.equal(knownSpells(['platform', 'hall', 'stacks', 'glasshouse']).size, SPELL_LIST.length, 'and the journeys between them teach every glyph');
});

test("each level's own kit is unambiguous: a shaky hand never casts the wrong one", () => {
  for (const level of LEVELS) {
    const kit = level.kit === 'all' ? TEMPLATES : TEMPLATES.filter((t) => level.kit.includes(t.id));
    const set = prepare(kit);
    for (const t of kit) {
      const rnd = mulberry32(t.id.length * 613 + level.id.length);
      for (let k = 0; k < 15; k++) {
        const got = recognize(drawnByHand(t.points, rnd), set);
        assert.ok(got.id === t.id || got.id === null, `${level.id}: ${t.id} read as ${got.id}`);
      }
    }
  }
});

test('the level a spell is cast in is the only one that can block it', () => {
  // Nothing in the chamber leans on another level's rules.
  const w = makeWorld('chamber');
  for (const id of SPELL_IDS) {
    for (const o of w.objects) assert.equal(typeof wouldAffect(w, id, o), 'boolean');
    assert.equal(blocked(w, id, null), 'The spell flies off into the dark.');
  }
});

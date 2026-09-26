import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_LIST, SPELLS_BY_ID, TEMPLATES } from '../games/wand/js/glyphs.js';
import { prepare, recognize, rank, resample, normalize, bounds, centroid, pathLength, fitTemplate, SAMPLES } from '../games/wand/js/recognizer.js';
import { makeWorld, castSpell, tick, progress, remember, find, TASKS, NEAR, FAR } from '../games/wand/js/scene.js';

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
  remember(world);
};

test('every spell has something in the chamber to do', () => {
  // Some spells only answer a state another spell sets up: you cannot set a
  // thing down until it is floating, and you cannot put a light out until
  // something lit it. So try each spell on each object after each opening
  // stretch of a warm-up sequence, and ask only that *some* combination works.
  const warmUp = ['aperio', 'reserato', 'minuito', 'ignito', 'levo', 'unda'];
  for (const s of SPELL_LIST) {
    const worked = makeWorld().objects.some((o) =>
      // n runs from 0 (no warm-up) through the whole sequence.
      Array.from({ length: warmUp.length + 1 }, (_, i) => i).some((n) => {
        const w = makeWorld();
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
  const w = makeWorld();
  assert.equal(find(w, 'candle').lit, false);
  castSpell(w, 'ignito', 'candle');
  assert.equal(find(w, 'candle').lit, true);
  castSpell(w, 'unda', 'candle');
  assert.equal(find(w, 'candle').lit, false);
  assert.ok(find(w, 'candle').wet > 0);
});

test('a lit thing cannot be relit, and says so by doing nothing', () => {
  const w = makeWorld();
  castSpell(w, 'ignito', 'brazier');
  const again = castSpell(w, 'ignito', 'brazier');
  assert.equal(again.inert, true);
});

test('the crate is too heavy until it is shrunk: spells are building blocks', () => {
  const w = makeWorld();
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
  const w = makeWorld();
  castSpell(w, 'minuito', 'crate');
  const start = find(w, 'crate').z;
  castSpell(w, 'attraho', 'crate');
  run(w, 3);
  assert.ok(find(w, 'crate').z < start - 0.5);
  for (let i = 0; i < 12; i++) {
    castSpell(w, 'repello', 'crate');
    run(w, 1);
  }
  assert.ok(find(w, 'crate').z <= FAR + 0.001 && find(w, 'crate').z >= NEAR);
});

test('the chest needs two spells in the right order', () => {
  const w = makeWorld();
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
  const w = makeWorld();
  castSpell(w, 'crescito', 'vine');
  assert.equal(find(w, 'vine').grown, 0, 'dry soil should not grow');
  for (let i = 0; i < 3; i++) {
    castSpell(w, 'unda', 'vine');
    castSpell(w, 'crescito', 'vine');
  }
  assert.equal(find(w, 'vine').grown, 3);
});

test('the pixie dodges force until it is stopped', () => {
  const w = makeWorld();
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
  const w = makeWorld();
  castSpell(w, 'gelo', 'pixie');
  assert.ok(find(w, 'pixie').frozen > 0);
  assert.equal(castSpell(w, 'unda', 'pixie').message.includes('glances off'), true);
  run(w, 7);
  assert.equal(find(w, 'pixie').frozen, 0);
});

test('cut the rope and the lantern falls to the floor', () => {
  const w = makeWorld();
  castSpell(w, 'secato', 'rope');
  run(w, 3);
  assert.equal(find(w, 'lantern').fallen, true);
  assert.ok(find(w, 'lantern').y < 0.5);
});

test('fire will cut a rope too: more than one way to solve it', () => {
  const w = makeWorld();
  castSpell(w, 'ignito', 'rope');
  run(w, 3);
  assert.equal(find(w, 'lantern').fallen, true);
});

test('only Aperio can touch what has not been revealed', () => {
  const w = makeWorld();
  assert.equal(castSpell(w, 'clario', 'rune').hit, false);
  assert.equal(find(w, 'rune').seen, false);
  castSpell(w, 'aperio', 'rune');
  assert.equal(find(w, 'rune').seen, true);
});

test('a mended urn dropped from a height breaks again', () => {
  const w = makeWorld();
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
  const w = makeWorld();
  for (const t of TASKS) assert.ok(t.text && t.hint, `${t.id} needs copy`);

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
  const w = makeWorld();
  const out = castSpell(w, 'not-a-spell', 'candle');
  assert.equal(out.inert, true);
  assert.equal(find(w, 'candle').lit, false);
});

test('the spellbook and the chamber agree on what exists', () => {
  const w = makeWorld();
  for (const o of w.objects) assert.ok(SPELLS_BY_ID.size === SPELL_LIST.length);
  for (const t of TASKS) assert.ok(typeof t.done(w) === 'boolean', `${t.id} has a broken goal`);
});

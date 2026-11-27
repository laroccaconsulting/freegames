// The digital clock, built from nothing but NANDs, a delay and pixels,
// wrapped into chips. Used by the Gallery and checked by the tests (it has
// to read the right time). Every chip here is ordinary chip data: a player
// could build the same thing by hand.

// ---------- chips ----------

/**
 * A counter that wraps at `mod` (10 or 6). Toggles flip on their input's
 * rising edge, so each bit is fed through a NOT of the bit before (a ripple
 * counter). When the count reaches `mod`, a NAND spots it and clears every
 * bit. Outputs: the bits, low first, then a carry that rises as it wraps.
 */
export function counterChip(mod) {
  const bits = mod > 8 ? 4 : 3;
  const parts = [];
  const links = [];
  for (let i = 0; i < bits; i++) parts.push({ id: `b${i}`, type: 'pixel', mode: 'toggle' });
  for (let i = 0; i < bits - 1; i++) {
    parts.push({ id: `n${i}`, type: 'nand' });
    links.push([`b${i}`, `n${i}`], [`n${i}`, `b${i + 1}`]);
  }
  // spot the wrap value: the bits that are 1 in it, all on
  parts.push({ id: 'r', type: 'nand' }, { id: 'rr', type: 'nand' });
  for (let i = 0; i < bits; i++) if (mod & (1 << i)) links.push([`b${i}`, 'r']);
  links.push(['r', 'rr']);
  for (let i = 0; i < bits; i++) links.push(['rr', `b${i}`, 1]); // into each clear pin
  // carry: the top bit falls as the count wraps, so NOT(top) rises
  parts.push({ id: 'c', type: 'nand' });
  links.push([`b${bits - 1}`, 'c']);
  return { name: mod === 10 ? 'COUNT10' : 'COUNT6', parts, links, inputs: ['b0'], outputs: [...Array.from({ length: bits }, (_, i) => `b${i}`), 'c'] };
}

// segments a–g: which digits light each one
export const SEGMENTS = {
  a: [0, 2, 3, 5, 6, 7, 8, 9],
  b: [0, 1, 2, 3, 4, 7, 8, 9],
  c: [0, 1, 3, 4, 5, 6, 7, 8, 9],
  d: [0, 2, 3, 5, 6, 8, 9],
  e: [0, 2, 6, 8],
  f: [0, 4, 5, 6, 8, 9],
  g: [2, 3, 4, 5, 6, 8, 9],
};

/**
 * A 7-segment decoder: four bits in, seven segments out. Each digit's
 * pattern is spotted by a NAND (low when it matches); each segment is a
 * NAND of the patterns that light it, which is OR.
 */
export function decoderChip() {
  const parts = [];
  const links = [];
  for (let i = 0; i < 4; i++) {
    parts.push({ id: `i${i}`, type: 'nand' }, { id: `t${i}`, type: 'nand' }); // NOT bit, and bit again
    links.push([`i${i}`, `t${i}`]);
  }
  for (let n = 0; n < 10; n++) {
    parts.push({ id: `m${n}`, type: 'nand' });
    for (let i = 0; i < 4; i++) links.push([n & (1 << i) ? `t${i}` : `i${i}`, `m${n}`]);
  }
  for (const [s, on] of Object.entries(SEGMENTS)) {
    parts.push({ id: `s${s}`, type: 'nand' });
    for (const n of on) links.push([`m${n}`, `s${s}`]);
  }
  return { name: '7SEG', parts, links, inputs: ['i0', 'i1', 'i2', 'i3'], outputs: Object.keys(SEGMENTS).map((s) => `s${s}`) };
}

// ---------- the display ----------

// pixels of each segment on a 3×5 grid
export const SEGMENT_PIXELS = {
  a: [[0, 0], [1, 0], [2, 0]],
  b: [[2, 1]],
  c: [[2, 3]],
  d: [[0, 4], [1, 4], [2, 4]],
  e: [[0, 3]],
  f: [[0, 1]],
  g: [[0, 2], [1, 2], [2, 2]],
};

/** Read a digit back from a display: the number whose segments match, or null. */
export function readDigit(lit) {
  for (let n = 0; n < 10; n++) if (Object.entries(SEGMENTS).every(([s, on]) => on.includes(n) === !!lit[s])) return n;
  return null;
}

// ---------- the whole clock ----------

/**
 * MM:SS on a 48×32 board. A NAND and a delay make the heartbeat; four
 * counters (seconds, tens of seconds, minutes, tens of minutes) feed four
 * decoders that light four pixel digits. Returns the parts, plus where each
 * digit's segment pixels are, for reading the time back.
 */
// A beat is (2 × wait + 5 steps) long, steps being 1/120 s; 58 steps of
// wait makes 121/120 s, as near one second as whole steps allow.
export function buildClock({ wait = 58 / 120, pendulum = false } = {}) {
  const parts = [];
  let n = 0;
  const id = (s) => `${s}${n++}`;
  const wire = (a, b) => parts.push({ id: id('w'), type: 'wire', a, b });
  // the beat: a NAND-and-delay heartbeat, or a pendulum swinging through a beam
  const beatAt = pendulum ? [8, 25] : [3, 26];
  if (pendulum) {
    // a rod 5¾ cells long on a free peg, held 30° out; it swings through the
    // beam below it about once a second (real physics, not a timer)
    parts.push({ id: 'rod', type: 'lever', p: [8, 21], angle: 60, l1: 0.5, l2: 5.75 }, { id: 'beat', type: 'beam', a: [8, 25], b: [8, 28] });
  } else {
    parts.push({ id: 'beat', type: 'nand', p: [3, 26] }, { id: 'tick', type: 'delay', p: [3, 29], wait });
    wire([3, 26], [3, 29]);
    wire([3, 29], [3, 26]);
  }
  // digits left to right: tens of minutes, minutes, tens of seconds, seconds
  const digits = [
    { x: 2, mod: 6 },
    { x: 12, mod: 10 },
    { x: 26, mod: 6 },
    { x: 36, mod: 10 },
  ];
  const display = [];
  let carryFrom = beatAt; // the beat drives the seconds
  for (const d of [...digits].reverse()) {
    const counter = { id: id('k'), type: 'chip', p: [d.x, 12], def: counterChip(d.mod) };
    const decoder = { id: id('d'), type: 'chip', p: [d.x + 5, 12], def: decoderChip() };
    parts.push(counter, decoder);
    wire(carryFrom, [d.x, 13]); // clock in
    const bits = counter.def.outputs.length - 1;
    for (let i = 0; i < bits; i++) wire([d.x + 3, 13 + i], [d.x + 5, 13 + i]);
    carryFrom = [d.x + 3, 13 + bits]; // carry out
    // the digit's pixels, above
    const seg = {};
    Object.keys(SEGMENTS).forEach((s, i) => {
      seg[s] = [];
      for (const [px, py] of SEGMENT_PIXELS[s]) {
        const p = [d.x + 1 + px, 3 + py];
        const pid = id('px');
        parts.push({ id: pid, type: 'pixel', p, mode: 'lamp' });
        wire([d.x + 8, 13 + i], p);
        seg[s].push(pid);
      }
    });
    display.unshift(seg);
  }
  // the colon blinks with the beat
  for (const y of [5, 7]) {
    parts.push({ id: id('colon'), type: 'pixel', p: [23, y], mode: 'lamp' });
    wire(beatAt, [23, y]);
  }
  return { parts, display };
}

/** Read MM:SS from a run's signals. */
export function readClock(signals, display) {
  const digit = (seg) => readDigit(Object.fromEntries(Object.entries(seg).map(([s, ids]) => [s, signals.get(ids[0])])));
  const [a, b, c, d] = display.map(digit);
  return `${a}${b}:${c}${d}`;
}

/** The board for the pendulum clock: a ball rests on the rod's tip to set it going. */
// (just off the rod's upper face, near its end, so it starts touching nothing)
const ROD = { c: Math.cos(Math.PI / 3), s: Math.sin(Math.PI / 3) };
export const PENDULUM_BOARD = {
  items: [{ type: 'ball', x: 8 + 5.25 * ROD.c + 0.6 * ROD.s, y: 21 + 5.25 * ROD.s - 0.6 * ROD.c, deliver: false }],
};

/**
 * A mechanical clock: an anchor escapement (a 4-cell pendulum three pegs
 * above a 30-tooth escape wheel) beats about once a second, so the wheel
 * turns once a minute and carries the seconds hand. Gears 15:25, 10:30,
 * 10:40, 10:30 take it down 60 to 1 for the minute hand; a 1:1 chain and
 * 10:40, 10:30 take that down 12 to 1 for the hour hand. Two layers of
 * gears cannot hold six stages side by side without a big gear fouling
 * the next peg's small one, hence the chain.
 */
export const GEAR_CLOCK_BOARD = { w: 26, h: 17 };
export function buildGearClock() {
  const g = (p, teeth, plane) => ({ type: 'gear', p, teeth, plane });
  return [
    { type: 'escape', p: [4, 6] },
    { type: 'pendulum', p: [4, 3], l: 4 },
    { type: 'dial', p: [4, 6], r: 1.25 },
    g([4, 6], 15, 0),
    g([8, 6], 25, 0),
    g([8, 6], 10, 1),
    g([8, 10], 30, 1),
    g([8, 10], 10, 0),
    g([12, 13], 40, 0),
    g([12, 13], 10, 1),
    g([16, 13], 30, 1),
    { type: 'dial', p: [16, 13], r: 2.5 },
    g([23, 13], 30, 1),
    { type: 'chain', a: [16, 13], b: [23, 13], pa: 1, pb: 1 },
    g([23, 13], 10, 0),
    g([20, 9], 40, 0),
    g([20, 9], 10, 1),
    g([20, 5], 30, 1),
    { type: 'dial', p: [20, 5], r: 2.5 },
  ];
}

// The places you can go, and the puzzle in each one.
//
// A level is plain data: the room it happens in, the things standing in it,
// the spells you have with you, and an ordered list of steps. Steps are
// strictly sequential — the next one is not even shown until this one is
// done — so a level reads as a puzzle rather than a checklist. Each step may
// depend on the state an earlier one left behind: the wall only gives up its
// archway once there is light to see the seam by, the book cannot come down
// until its chain is cut, the hall will not show its sky until it is lit.
//
// Two hooks keep the core rules (js/scene.js) free of level trivia:
//   block(world, spellId, o)  — a reason this spell cannot work here, or null
//   onCast(world, spellId, o) — an extra line, and any authored consequence
//
// No DOM here: everything is unit-tested in tests/wand.test.js.

const find = (w, id) => w.objects.find((o) => o.id === id);
const lights = (w) => w.objects.filter((o) => o.lit).length;
const stopped = (o) => o.caged || o.frozen > 0 || o.slowed > 0;

// ---------- the practice chamber ----------

const CHAMBER = {
  id: 'chamber',
  name: 'The Practice Chamber',
  place: 'somewhere under the school',
  blurb: 'A room full of things that answer back. Every glyph in the book, and nothing you can get wrong.',
  kind: 'practice',
  kit: 'all',
  done: 'Every trial in the chamber, and nothing left in here that will not answer you.',
  room: { half: 2.6, top: 2.6, near: 0.6, far: 5.5, palette: 'crypt', backdrop: 'chamber' },
  ordered: false, // the chamber's trials can be done in any order
  props: [
    { id: 'candle', kind: 'candle', label: 'a candle', x: -1.45, z: 2.7, baseY: 1.05, size: 0.36, mass: 'fixed', plinth: true, lightable: true },
    { id: 'urn', kind: 'urn', label: 'a cracked urn', x: -1.25, z: 1.95, baseY: 0.8, size: 0.42, mass: 'normal', plinth: true, broken: true, fragile: true },
    { id: 'vane', kind: 'vane', label: 'a little weather vane', x: -1.95, z: 4.2, baseY: 1.85, size: 0.44, mass: 'fixed', spinnable: true },
    { id: 'brazier', kind: 'brazier', label: 'the brazier', x: -1.7, z: 4.8, baseY: 0, size: 0.7, mass: 'fixed', lightable: true },
    { id: 'crate', kind: 'crate', label: 'a crate', x: -0.8, z: 3.5, baseY: 0, size: 0.85, mass: 'heavy' },
    { id: 'basin', kind: 'basin', label: 'a stone basin', x: -0.05, z: 1.7, baseY: 0.6, size: 0.5, mass: 'fixed', plinth: true, fillable: true },
    { id: 'rune', kind: 'rune', label: 'a mark on the wall', x: -1.0, z: 5.45, baseY: 2.15, size: 0.6, mass: 'fixed', hidden: true },
    { id: 'vine', kind: 'vine', label: 'a potted vine', x: 0.85, z: 3.0, baseY: 0, size: 0.62, mass: 'fixed', growable: true, grown: 0 },
    { id: 'pixie', kind: 'pixie', label: 'a pixie', x: 1.15, z: 2.7, baseY: 1.62, size: 0.24, mass: 'light', alive: true, wander: true },
    { id: 'chest', kind: 'chest', label: 'an iron chest', x: 1.85, z: 4.0, baseY: 0, size: 0.78, mass: 'fixed', locked: true, openable: true },
    { id: 'lantern', kind: 'lantern', label: 'a hanging lantern', x: 1.15, z: 2.15, baseY: 1.9, size: 0.38, mass: 'normal', lightable: true, hangsFrom: 'rope' },
    // `span` makes the rope a line to aim at rather than a point: it is hit
    // anywhere between the ceiling and the lantern it holds up.
    { id: 'rope', kind: 'rope', label: 'the lantern rope', x: 1.15, z: 2.15, baseY: 2.28, size: 0.2, span: 0.32, mass: 'fixed', cuttable: true },
  ],
  steps: [
    { id: 'light', text: 'Light the candle', hint: 'Fire, or just a light.', done: (w) => find(w, 'candle').lit },
    { id: 'douse', text: 'Put the brazier out once it is burning', hint: 'Water, wind, frost or plain darkness.', done: (w) => !!w.latch.brazierLit && !find(w, 'brazier').lit },
    { id: 'pull', text: 'Bring the crate to the front of the room', hint: 'It is too heavy as it is. Make it smaller first.', done: (w) => find(w, 'crate').z < 2.0 },
    { id: 'float', text: 'Float the crate off the floor', hint: 'Same problem: shrink it, then lift it.', done: (w) => find(w, 'crate').y > 0.6 },
    { id: 'chest', text: 'Get the iron chest open', hint: 'Turn the lock, then lift the lid.', done: (w) => find(w, 'chest').open },
    { id: 'urn', text: 'Mend the cracked urn', hint: 'One spell puts broken things back together.', done: (w) => !find(w, 'urn').broken },
    { id: 'vine', text: 'Grow the vine up to the ledge', hint: 'Water the soil, then grow it. Three times over.', done: (w) => find(w, 'vine').grown >= 3 },
    { id: 'pixie', text: 'Stop the pixie', hint: 'Freeze it, cage it, or slow time round it.', done: (w) => find(w, 'pixie').caged || find(w, 'pixie').frozen > 0 },
    { id: 'rune', text: 'Find what is hidden on the back wall', hint: 'Something has to reveal it.', done: (w) => find(w, 'rune').seen },
    { id: 'lantern', text: 'Bring the hanging lantern down', hint: 'Cut the rope. Or burn it.', done: (w) => find(w, 'lantern').fallen },
  ],
  watch(w) {
    if (find(w, 'brazier').lit) w.latch.brazierLit = true;
  },
};

// ---------- the hidden platform ----------

const PLATFORM = {
  id: 'platform',
  name: 'The Hidden Platform',
  place: 'the far end of a railway station, very early',
  blurb: 'The train for the school leaves from a platform that is not on the board. Find the way through the wall, and get your trunk aboard.',
  kind: 'journey',
  kit: ['clario', 'ignito', 'aperio', 'reserato', 'minuito', 'levo', 'repello', 'attraho', 'tardito'],
  done: 'The whistle is still going. Your trunk is somewhere on the other side of a wall, the owl is on your shoulder, and the engine is waiting.',
  room: { half: 3.4, top: 3.8, near: 0.6, far: 9, palette: 'soot', backdrop: 'platform' },
  props: [
    { id: 'lamp', kind: 'stationlamp', label: 'the platform lamp', x: 1.0, z: 2.15, baseY: 1.7, size: 0.62, mass: 'fixed', lightable: true },
    { id: 'wall', kind: 'brickwall', label: 'the brick wall', x: -2.9, z: 4.6, baseY: 1.0, size: 1.6, span: 0.9, mass: 'fixed' },
    { id: 'arch', kind: 'archway', label: 'the archway', x: -2.9, z: 4.6, baseY: 0, size: 2.1, mass: 'fixed', hidden: true, locked: true, openable: true },
    { id: 'trunk', kind: 'trunk', label: 'your trunk', x: -0.2, z: 3.4, baseY: 0, size: 0.95, mass: 'heavy' },
    { id: 'trolley', kind: 'trolley', label: 'a luggage trolley', x: 0.75, z: 4.3, baseY: 0, size: 0.95, mass: 'normal' },
    { id: 'cage', kind: 'owlcage', label: "the owl's cage", x: -0.7, z: 2.1, baseY: 0.85, size: 0.55, mass: 'normal', plinth: true, locked: true, openable: true },
    { id: 'whistle', kind: 'whistle', label: "the guard's whistle", x: 1.95, z: 2.9, baseY: 1.3, size: 0.46, mass: 'fixed', spinnable: true },
    { id: 'clock', kind: 'clock', label: 'the station clock', x: 0.3, z: 7.6, baseY: 2.5, size: 1.0, mass: 'fixed' },
  ],
  steps: [
    { id: 'lamp', text: 'The platform lamp has died. Light it.', hint: 'Any light will do. You cannot search a wall in the dark.', done: (w) => find(w, 'lamp').lit },
    { id: 'seam', text: 'There is a way through this wall. Find it.', hint: 'One spell shows what is hidden. Draw it over the bricks.', done: (w) => find(w, 'arch').seen },
    { id: 'lock', text: 'The archway is sealed. Turn its lock.', hint: 'Straight down, then curl right and up.', done: (w) => !find(w, 'arch').locked },
    { id: 'open', text: 'Open the way.', hint: 'Unlocking is not opening. Lift it.', done: (w) => find(w, 'arch').open },
    { id: 'shrink', text: 'Your trunk will not shift. Make it lighter.', hint: 'Too heavy is a size problem.', done: (w) => find(w, 'trunk').scale <= 0.7 },
    { id: 'lift', text: 'Float the trunk.', hint: 'Now that it is small, it will lift.', done: (w) => find(w, 'trunk').held },
    { id: 'through', text: 'Send the trunk through the archway.', hint: 'Shove it away from you while it floats.', done: (w) => !!find(w, 'trunk').gone },
    { id: 'owl', text: 'The owl is still latched in.', hint: 'The same lock-turning glyph.', done: (w) => !find(w, 'cage').locked },
    { id: 'late', text: 'The clock says you are late. Buy yourself a minute.', hint: 'You cannot stop time, but you can thicken it.', done: (w) => find(w, 'clock').slowed > 0 },
    { id: 'go', text: 'Call the train.', hint: 'The whistle wants a rush of air. Or a spark.', done: (w) => find(w, 'whistle').spun > 0 },
  ],
  authored: { wall: ['aperio'], trunk: ['repello'], whistle: ['ignito'] },
  block(w, spellId, o) {
    if (o.id === 'wall' && spellId === 'aperio' && !find(w, 'lamp').lit) return 'The bricks are a wall of shadow. You need light before you can look for a seam.';
    return null;
  },
  onCast(w, spellId, o) {
    // Revealing the wall is revealing the arch inside it.
    if (o.id === 'wall' && spellId === 'aperio') {
      const arch = find(w, 'arch');
      if (!arch.seen) {
        arch.seen = true;
        return 'The bricks slide apart. There is an archway behind them, and a colder wind.';
      }
    }
    // A floating trunk shoved at an open archway goes through it.
    const trunk = find(w, 'trunk');
    if (o.id === 'trunk' && spellId === 'repello' && trunk.held && find(w, 'arch').open && !trunk.gone) {
      trunk.gone = true;
      trunk.held = false;
      return 'The trunk sails through the archway and thumps down on the other side.';
    }
    if (o.id === 'cage' && spellId === 'reserato') return 'The latch springs. The owl shrugs, steps out, and settles on your shoulder.';
    if (o.id === 'whistle' && (spellId === 'tempesto' || spellId === 'ignito')) {
      o.spun = Math.max(1, o.spun);
      return 'The whistle shrieks. Somewhere down the platform, the engine answers.';
    }
    return null;
  },
};

// ---------- the banquet hall ----------

const HALL = {
  id: 'hall',
  name: 'The Banquet Hall',
  place: 'the long hall, hours before anyone comes down to eat',
  blurb: 'Four hundred places laid in the dark. Light it the way it is meant to be lit, and it will show you its ceiling.',
  kind: 'journey',
  kit: ['clario', 'tenebro', 'ignito', 'unda', 'levo', 'demitto', 'aperio', 'sarcito', 'reserato', 'minuito', 'attraho'],
  done: 'Four hundred empty places, a hearth going like a furnace, and weather indoors. Nobody will believe you did it on your own.',
  room: { half: 4.2, top: 5.4, near: 0.6, far: 11, palette: 'oak', backdrop: 'hall' },
  props: [
    { id: 'hearth', kind: 'hearth', label: 'the great hearth', x: 0, z: 10.3, baseY: 0, size: 2.6, mass: 'fixed', lightable: true },
    { id: 'candleA', kind: 'floatcandle', label: 'the first candle', x: -1.5, z: 3.0, baseY: 0.95, size: 0.34, mass: 'normal', lightable: true },
    { id: 'candleB', kind: 'floatcandle', label: 'the second candle', x: -0.7, z: 4.6, baseY: 0.95, size: 0.34, mass: 'normal', lightable: true },
    { id: 'candleC', kind: 'floatcandle', label: 'the third candle', x: 1.4, z: 3.6, baseY: 0.95, size: 0.34, mass: 'normal', lightable: true },
    { id: 'chandelier', kind: 'chandelier', label: 'the iron chandelier', x: -0.5, z: 6.4, baseY: 3.1, size: 1.5, mass: 'fixed', lightable: true },
    { id: 'goblet', kind: 'goblet', label: 'a pewter goblet', x: -1.8, z: 2.45, baseY: 0.95, size: 0.3, mass: 'normal', fillable: true },
    { id: 'armour', kind: 'armour', label: 'a dented suit of armour', x: 2.55, z: 4.6, baseY: 0, size: 1.2, mass: 'normal', broken: true },
    { id: 'sky', kind: 'skyceiling', label: 'the ceiling', x: 0.2, z: 7.2, baseY: 4.9, size: 3.4, span: 0.8, mass: 'fixed', hidden: true },
  ],
  steps: [
    { id: 'hearth', text: 'Wake the great hearth at the far end.', hint: 'It wants fire, not a spark of light.', done: (w) => find(w, 'hearth').lit },
    { id: 'float', text: 'The candles of this hall are meant to float. Lift all three.', hint: 'One at a time. Draw over each candle in turn.', done: (w) => ['candleA', 'candleB', 'candleC'].every((id) => find(w, id).held) },
    { id: 'lit', text: 'Now light them.', hint: 'A candle in the air takes any light you give it.', done: (w) => ['candleA', 'candleB', 'candleC'].every((id) => find(w, id).lit) },
    { id: 'chandelier', text: 'The chandelier has been dark for years.', hint: 'Same again, higher up.', done: (w) => find(w, 'chandelier').lit },
    { id: 'toast', text: 'Fill a goblet. It is only polite.', hint: 'Water, poured from nothing.', done: (w) => find(w, 'goblet').wet > 0.05 },
    { id: 'sky', text: 'With the hall alight, it should show you something overhead.', hint: 'Reveal the ceiling. It will not work in a dark hall.', done: (w) => find(w, 'sky').seen },
  ],
  authored: {},
  block(w, spellId, o) {
    if (o.kind === 'floatcandle' && !o.held && (spellId === 'ignito' || spellId === 'clario') && !o.lit) {
      return `${o.label[0].toUpperCase()}${o.label.slice(1)} will not take a flame sitting on the table. These ones are meant to float.`;
    }
    if (o.id === 'sky' && spellId === 'aperio' && lights(w) < 5) {
      return `The ceiling stays a ceiling. ${lights(w)} lights burning is not enough to show it — this hall wants five.`;
    }
    return null;
  },
  onCast(w, spellId, o) {
    if (o.id === 'sky' && spellId === 'aperio') return 'The stone goes to gauze and then to nothing. There is a whole winter sky up there, snowing gently, and none of it lands.';
    if (o.id === 'hearth' && spellId === 'ignito') return 'The hearth takes with a thump you feel in the floor.';
    return null;
  },
};

// ---------- the shut stacks ----------

const STACKS = {
  id: 'stacks',
  name: 'The Shut Stacks',
  place: 'the part of the library you need a note for',
  blurb: 'One book, chained behind a grille, with an alarm over the door and nobody due for hours.',
  kind: 'journey',
  kit: ['clario', 'tenebro', 'gelo', 'vincito', 'tardito', 'reserato', 'levo', 'demitto', 'secato', 'aperio', 'sarcito'],
  done: 'The bell is quiet, the book is open, and your name is on a list you were not meant to read.',
  room: { half: 2.4, top: 4.6, near: 0.6, far: 7, palette: 'vellum', backdrop: 'stacks' },
  props: [
    { id: 'bell', kind: 'bell', label: 'the alarm bell', x: 1.45, z: 2.3, baseY: 2.5, size: 0.46, mass: 'normal', ringing: true },
    { id: 'lamp', kind: 'readlamp', label: 'the reading lamp', x: -1.35, z: 2.0, baseY: 0.92, size: 0.38, mass: 'fixed', plinth: true, lightable: true },
    { id: 'desk', kind: 'desk', label: 'the reading desk', x: -0.75, z: 2.9, baseY: 0, size: 1.1, mass: 'fixed' },
    { id: 'grille', kind: 'grille', label: 'the iron grille', x: 0.55, z: 4.6, baseY: 1.0, size: 1.2, span: 0.5, mass: 'fixed', locked: true, openable: true },
    { id: 'book', kind: 'book', label: 'the chained book', x: 0.55, z: 4.75, baseY: 1.25, size: 0.4, mass: 'normal' },
    { id: 'chain', kind: 'chain', label: 'the chain', x: 0.55, z: 4.75, baseY: 1.62, size: 0.22, span: 0.34, mass: 'fixed', cuttable: true },
    { id: 'ladder', kind: 'ladder', label: 'a library ladder', x: -1.9, z: 4.4, baseY: 0, size: 1.3, mass: 'normal' },
  ],
  steps: [
    { id: 'hush', text: 'The alarm is already ringing. Stop it before you do anything else.', hint: 'Frost, a cage or slowed time will all shut a bell up.', done: (w) => !find(w, 'bell').ringing },
    { id: 'lamp', text: 'Light the reading lamp.', hint: 'Quietly. A circle, drawn clockwise.', done: (w) => find(w, 'lamp').lit },
    { id: 'lock', text: 'The grille in front of the book is locked.', hint: 'Turn the lock.', done: (w) => !find(w, 'grille').locked },
    { id: 'grille', text: 'Swing the grille up.', hint: 'Lift it.', done: (w) => find(w, 'grille').open },
    { id: 'chain', text: 'The book is chained to its shelf.', hint: 'One clean slash. Aim at the chain, not the book.', done: (w) => find(w, 'chain').cut },
    { id: 'down', text: 'Bring the book down to the desk.', hint: 'Float it first, then set it down.', done: (w) => !!find(w, 'book').onDesk },
    { id: 'read', text: 'The pages are blank.', hint: 'The same spell that finds hidden things finds hidden ink.', done: (w) => !!find(w, 'book').read },
  ],
  authored: { bell: ['vincito', 'gelo', 'tardito'], book: ['demitto', 'aperio'] },
  block(w, spellId, o) {
    const bell = find(w, 'bell');
    if (bell.ringing && o.id !== 'bell') return 'Not with that bell going. Deal with it first.';
    if (o.id === 'book' && spellId === 'levo' && !find(w, 'chain').cut) return 'The book lifts an inch and the chain snaps it back.';
    if (o.id === 'book' && spellId === 'levo' && !find(w, 'grille').open) return 'The grille is in the way.';
    if (o.id === 'book' && spellId === 'aperio' && !find(w, 'book').onDesk) return 'Too far away to read, even with the ink showing.';
    if (o.id === 'book' && spellId === 'aperio' && !find(w, 'lamp').lit) return 'You cannot read blank pages in the dark either.';
    return null;
  },
  onCast(w, spellId, o) {
    const bell = find(w, 'bell');
    if (o.id === 'bell' && bell.ringing && (stopped(bell) || spellId === 'vincito' || spellId === 'gelo' || spellId === 'tardito')) {
      bell.ringing = false;
      return 'The clapper stops dead. The quiet is enormous.';
    }
    const book = find(w, 'book');
    // The generic rule has already let go of the book by the time we get
    // here, so ask whether it is still up in the air rather than still held.
    if (o.id === 'book' && spellId === 'demitto' && !book.onDesk && book.y > book.baseY + 0.2) {
      const desk = find(w, 'desk');
      book.onDesk = true;
      book.x = desk.x;
      book.z = desk.z;
      book.targetZ = desk.z;
      book.baseY = 0.78;
      return 'The book settles open on the desk, breathing dust.';
    }
    if (o.id === 'book' && spellId === 'aperio' && book.onDesk && !book.read) {
      book.read = true;
      return 'Brown ink crawls out of the paper: a list of names, and one of them is yours.';
    }
    return null;
  },
};

// ---------- the glasshouse ----------

const GLASSHOUSE = {
  id: 'glasshouse',
  name: 'The Cold Glasshouse',
  place: 'the furthest greenhouse, the night of the first frost',
  blurb: 'A pane has gone, the beds are frozen, and something in the corner bites. Get the roof open before the whole house is lost.',
  kind: 'journey',
  kit: ['ignito', 'unda', 'gelo', 'vincito', 'crescito', 'minuito', 'sarcito', 'reserato', 'levo', 'tempesto', 'clario'],
  done: 'The glass is whole, the beds are breathing, and the vent is open on a sky full of cold stars. The snapper is furious.',
  room: { half: 2.9, top: 3.6, near: 0.6, far: 7.5, palette: 'moss', backdrop: 'glasshouse' },
  props: [
    { id: 'pane', kind: 'pane', label: 'the broken pane', x: 0.7, z: 5.0, baseY: 3.3, size: 1.3, mass: 'fixed', broken: true },
    { id: 'bed', kind: 'soilbed', label: 'the planting bed', x: -0.35, z: 2.7, baseY: 0.5, size: 1.2, mass: 'fixed', iced: true, fillable: true },
    { id: 'snapper', kind: 'snapper', label: 'the snapper', x: -1.85, z: 2.5, baseY: 0.75, size: 0.66, mass: 'light', plinth: true, alive: true },
    { id: 'climber', kind: 'climber', label: 'the climber', x: 1.1, z: 3.4, baseY: 0, size: 0.7, mass: 'fixed', growable: true, grown: 0 },
    { id: 'latch', kind: 'latch', label: 'the roof latch', x: 1.1, z: 3.4, baseY: 2.95, size: 0.42, mass: 'fixed', locked: true, openable: true },
    { id: 'tap', kind: 'tap', label: 'the brass tap', x: 1.55, z: 2.3, baseY: 1.05, size: 0.42, mass: 'fixed', fillable: true },
    { id: 'wilted', kind: 'pot', label: 'a wilted fern', x: 2.3, z: 4.4, baseY: 0.62, size: 0.46, mass: 'normal', plinth: true, growable: true, grown: 0 },
  ],
  steps: [
    { id: 'pane', text: 'Frost is pouring in through a broken pane. Close it.', hint: 'Broken things want mending, not replacing.', done: (w) => !find(w, 'pane').broken },
    { id: 'thaw', text: 'The planting bed is frozen solid.', hint: 'Fire melts ice. Gently.', done: (w) => !find(w, 'bed').iced },
    { id: 'water', text: 'Water the bed.', hint: 'Two waves, left to right.', done: (w) => find(w, 'bed').wet > 0.05 },
    { id: 'snapper', text: 'The snapper lunges every time you reach past it. Stop it.', hint: 'Frost buys you a few seconds. A cage holds it for good.', done: (w) => stopped(find(w, 'snapper')) },
    { id: 'grow', text: 'Send the climber up to the roof.', hint: 'Water, grow, water, grow. Three times over.', done: (w) => find(w, 'climber').grown >= 3 },
    { id: 'latch', text: 'The roof latch is seized shut.', hint: 'Turn it first.', done: (w) => !find(w, 'latch').locked },
    { id: 'open', text: 'Let the night in.', hint: 'Lift the vent.', done: (w) => find(w, 'latch').open },
  ],
  authored: { bed: ['ignito'] },
  block(w, spellId, o) {
    if (o.id === 'bed' && spellId === 'unda' && find(w, 'bed').iced) return 'The water freezes where it lands. Thaw the bed first.';
    if (o.id === 'climber' && spellId === 'crescito' && find(w, 'pane').broken) return 'Nothing grows in this draught. The pane first.';
    if (o.id === 'latch' && !stopped(find(w, 'snapper')) && find(w, 'snapper').alive) return 'The snapper snaps at your wand arm every time you aim past it.';
    if (o.id === 'latch' && spellId === 'reserato' && find(w, 'climber').grown < 3) return 'The latch is well out of reach. Something needs to grow up to it.';
    return null;
  },
  onCast(w, spellId, o) {
    const bed = find(w, 'bed');
    if (o.id === 'bed' && spellId === 'ignito' && bed.iced) {
      bed.iced = false;
      bed.wet = 0;
      return 'The ice goes to steam and the soil underneath is black and soft again.';
    }
    if (o.id === 'latch' && spellId === 'levo' && !find(w, 'latch').locked) return 'The vent swings wide. Cold clean air, and the smell of the lake.';
    return null;
  },
};

export const LEVELS = [CHAMBER, PLATFORM, HALL, STACKS, GLASSHOUSE];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || CHAMBER;

// Journeys open in order; the practice chamber is always open.
export function isUnlocked(level, finished = []) {
  if (level.kind === 'practice') return true;
  const journeys = LEVELS.filter((l) => l.kind === 'journey');
  const i = journeys.indexOf(level);
  return i <= 0 || finished.includes(journeys[i - 1].id);
}

// Every spell the player has met, in book order: their kit grows as the
// journeys open up.
export function knownSpells(finished = []) {
  const known = new Set();
  for (const level of LEVELS) {
    if (level.kit === 'all' || !isUnlocked(level, finished)) continue;
    for (const id of level.kit) known.add(id);
  }
  return known;
}

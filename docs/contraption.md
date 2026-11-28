# Contraption — requirements

A physics puzzle game in the spirit of a chain-reaction machine. Each level
gives you an item (a ball, a crate, an egg…), a place it has to reach, and a
small box of parts. You snap the parts onto a pegboard, press Run, and watch
real physics carry (or fail to carry) the item home.

Folder: `games/contraption/`. Name is a plain English word; no other game's
names, characters, art or levels are used.

## 1. Goals

1. **Real physics, simple machines.** Levers transform force and speed about a
   fulcrum, gears change speed and torque by their ratio, chains keep the
   direction, belts carry flat things and let round things roll back.
   Nothing is faked per level: one engine, the same rules everywhere.
2. **Looks great in daylight.** Designed first for reflective, grayscale
   screens (e-paper and "live paper" displays, phones in the sun): black ink
   on white paper, thick strokes, no information carried by colour alone,
   patterns instead of hues, no glow, no blur, no low-contrast greys.
3. **Teach, then combine.** Each chapter introduces one part with levels
   that teach it alone, then levels that need it with the earlier parts.
   The last chapter needs trajectory, force transfer and timing together.
4. **Replayable.** Score from machine time, parts used and tries; three
   stars per level; best results kept; a sandbox.
5. **Every level is winnable, and we prove it.** Each level ships with a
   reference solution, and a test runs it through the engine and checks it
   wins (`tests/contraption.test.js`).
6. The house rules (PLAN.md): offline, installable, no ads/tracking/servers,
   no build step, themes incl. Hallows, achievements, hub card.

## 2. Screens and flow

```
Title ──► Chapters ──► Level card ──► Build ⇄ Run ──► Results ──► next level
  │           │                         ▲      │
  │           └─ Sandbox (unlocked      │      └─ Fail (item lost) ─┐
  │              after chapter 1)       └────────── back to Build ◄─┘
  └─ Continue (straight to the next unsolved level), Parts guide, Settings
```

### 2.1 Title
- Large wordmark "Contraption" drawn in ink, with a small live machine
  running behind it (ball down a ramp, onto a lever, gears turning) that
  loops. It is a real simulation using the same engine.
- Buttons: **Continue** (next unsolved level; "Start" on first visit),
  **Levels**, **Sandbox** (locked until chapter 1 is done), **Parts**
  (guide), **Settings**; trophy button and the way back to the games list.
- Total stars shown (e.g. ★ 41 / 90).

### 2.2 Chapters and levels
- One card per chapter: name, the part it introduces (drawn), its levels as
  numbered tiles with 0–3 stars, and a lock until the previous chapter's
  last level is solved. Within a chapter levels unlock in order
  (the next one opens when the one before it is solved).
- Tile shows the best stars; a small flag marks "flawless" (solved first try).

### 2.3 Level card
- Shown when a level opens: number, name, one-line goal ("Get the ball into
  the cup"), the parts on offer with counts, the targets for stars (parts and
  time), and the best result so far.
- If the level introduces a new part, the card shows the part's explainer
  first (what it does, one sentence of the physics: "A lever trades distance
  for force: the long side moves farther and faster, the short side pushes
  harder").

### 2.4 Build mode
- The board: the level's pegboard (dots at every peg), walls, no-build zones,
  danger zones, the item at its start, the goal, any fixed parts.
- **Tray** along the bottom (side in landscape): one button per part type on
  offer, showing its drawing and how many are left. Parts not yet unlocked
  are not shown.
- **Place**: tap a part in the tray, then tap a peg (or drag from the tray
  onto the board). It snaps to the nearest valid peg; an invalid spot shows
  a dashed outline and a reason ("No building here", "Hits a wall").
- **Select**: tap a placed part. Handles appear:
  - Ramp, conveyor: a handle on each end, snapping to pegs.
  - Lever: a handle on each end; dragging sets that side's length (half-cell
    steps) and the angle (15° steps). The fulcrum stays on its peg.
  - Gear: size toggle (small / large).
  - Motor: direction (clockwise / counter-clockwise) and start delay
    (0–5 s, half-second steps).
  - Chain: tap the first gear, then the second.
  - All: Move (drag the body), Delete, and "fixed" parts show a lock.
- **Stacking**: parts on the same peg turn together (an axle). A motor on a
  gear's peg drives it; a gear on a conveyor drum drives the belt; a lever on
  a driven axle becomes a crank arm.
- **Live readouts**: in a driven train every axle shows its speed relative to
  the motor ("½×", "2×") and the torque factor; a jammed train (gears in a
  loop that disagree) is marked "Jammed".
- Toolbar: **Run**, **Undo**, **Clear** (asks first), **Hint**, level menu
  (restart, level card, levels, settings).
- The last run's item path is drawn as a dotted line (toggle in settings), so
  the player can correct the trajectory.
- Zoom and pan: pinch / wheel to zoom, two-finger or empty-space drag to pan;
  double-tap to fit. Board fits the screen by default.

### 2.5 Run mode
- Everything starts at once (motors honour their delays). Items, levers,
  weights and gears move under the engine at a fixed step (1/120 s).
- HUD: run clock, Stop (back to build, machine unchanged), speed (½×, 1×, 2×).
- **Win**: every item to be delivered has been inside the goal for 0.6 s.
- **Fail** (a "try"): an item touches a danger zone, breaks (fragile items hit
  harder than they can take), leaves the board, or nothing is delivered by
  the level's time limit. The item is marked with a burst; after a beat the
  game returns to build mode with the machine as it was and the tries count
  +1.

### 2.6 Results
- Stars earned, machine time, parts used, tries, score, and whether each was a
  new best. Buttons: Next, Replay, Levels. Chapter complete adds the next
  part's unlock card.

### 2.7 Sandbox
- A large empty board with a ball dropper and a movable goal; every unlocked
  part, unlimited. Items can be added from the tray (ball, crate, weight).
  The machine is saved.

### 2.8 Parts guide
- Every unlocked part with its drawing, what it does, the physics in one or
  two sentences, and a tip. Locked parts show a silhouette.

### 2.9 Settings
- Theme: **Paper** (default, black on white), **Ink** (white on black),
  **Auto**, **Hallows** (seasonal). Sounds. Show last path. Show ratios.
  Reduced motion respected (no camera easing, no particles).

## 3. Parts

| Part | Unlock | Snap | Physics |
|---|---|---|---|
| Ramp | Ch 1 | two pegs (any angle, up to 9 cells) | static plank; items slide or roll |
| Lever | Ch 2 | fulcrum on a peg; arms 0.5–6 cells each, 15° steps (handles or inspector steppers) | rigid bar on the fulcrum; holds its set angle until something moving touches it (engine 2), then turns freely; light, so what lands on it decides the tip |
| Weight | Ch 2 | a peg (sits there until Run) | heavy iron block (dynamic) for counterweights and drops |
| Conveyor | Ch 3 | two drums on pegs (up to 10 cells, any angle) | belt surface moves at drum ω × r; idle unless driven |
| Motor | Ch 3 | a peg (stacks with a drum, gear or lever) | torque falls linearly from stall torque (40) to zero at top speed (1.5 turns/s), solved inside the contact solver; direction; delay |
| Gear (small r=1, medium r=2, large r=3) | Ch 4 | a peg; meshes with a gear whose centre is exactly r₁+r₂ away | ratio −r₁/r₂ (direction flips); behind the board, items pass in front |
| Chain | Ch 5 | between two gears | ratio +r₁/r₂ (same direction), any distance |
| Bouncer | Ch 6 | two pegs | springy pad, restitution 0.9 |

Items (level supplied): **ball** (rolls, rubber), **crate** (flat, rides belts,
tips), **egg** (fragile ball: breaks above an impact speed), **can** (tall,
tips over easily), **steel ball** (heavy).

Level pieces: walls (solid, hatched), cup or zone goal, no-build zones
(light diagonal stripes; parts may not overlap, items fly through),
danger zones (black with white spikes: touching fails), movers (kinematic
platforms, gates and sweepers on a fixed cycle, solid or dangerous),
fixed parts (pre-placed parts the player cannot move).

## 4. Physics engine (`js/physics.js`, pure, no DOM)

- Units: one grid cell = 1 unit; y points down; gravity 40 units/s².
- Fixed step 1/120 s, 10 velocity iterations, warm-started sequential
  impulses with Coulomb friction, restitution with a threshold, Baumgarte
  position correction with slop. Deterministic for a given machine.
- Shapes: rounded convex polygons (circle = 1 vertex + radius, capsule = 2
  vertices + radius, boxes and walls = polygons). Contacts: circle–circle,
  polygon–circle, polygon–polygon (SAT, reference/incident edge clipping, up
  to two points, vertex–vertex regions by segment distance).
- Body kinds: static, kinematic (scripted path), dynamic, and **rotor**.
- **Trains** (the simple-machine core): every axle belongs to a train with a
  single degree of freedom θ. Each axle turns at k·θ̇, where k is found by
  walking gear meshes (k₂ = −k₁·r₁/r₂) and chains/belts (k₂ = k₁·r₁/r₂). A
  loop that disagrees jams the train. A contact impulse J at point p on a
  rotor of ratio k adds k·(p − pivot)×J to the train's generalised momentum;
  a belt adds k·r·(J·t). The train's inertia is Σ k²·I. Motors add torque
  k_m·τ(ω), gravity adds k·(c − pivot)×mg per rotor. So a motor geared down
  lifts what it could not lift directly, and a lever's long arm throws fast.
- Surface velocity on belts drives friction, so a crate on a sloped belt is
  carried (μ > tan θ) while a ball rolls back (rolling needs no friction).
- Fragile items record the largest normal impact speed; above the limit they
  break.
- Events per step: item in goal, item in danger, item out of bounds, broken.

## 5. Levels (`js/levels.js`)

Six chapters of five levels. Each level: size (default 24×16), items, goal,
walls, no-build, danger, movers, fixed parts, parts on offer, star targets
(parts, seconds), time limit, hint, and the reference solution (used by the
test and by the second hint step).

1. **Slopes** (ramp): Downhill, Zigzag, Mind the gap, Over the wall, The long way round.
2. **Levers** (lever, weight): Seesaw, Tipping point, Catapult, Shove, Hammer and anvil.
3. **Belts** (conveyor, motor): Carry it, Which way?, Uphill, Relay, Slide.
4. **Gears** (gear): Remote drive, Heavy haul (direct drive stalls, 2:1 works),
   Gear up (only 3:1 is fast enough), Crank, One motor two belts.
5. **Chains** (chain, motor delay): Long reach, Same way round, Wait for it,
   Crank at a distance, Clockwork.
6. **Timing** (bouncer, movers): Bounce, Ricochet, Sweeper, Going up, The grand machine.

Design note: with only straight ramps, a rolling ball jumps at most about
1.4× the height it fell, and sharp ramp joins absorb most of its speed, so
jumps are short and long throws come from levers, fast belts and bouncers.
Levels were tuned with a search over placements so each has many working
machines, not one knife-edge answer.

## 6. Scoring and progress

- **Stars**: ★ solved; ★★ solved with no more than the target parts;
  ★★★ also within the target time. A hint's ghost part caps the level at ★★.
- **Score** = 1000 + 150 × (parts left in the box) + 40 × (seconds under the
  time limit, to 0.1 s) − 50 × (tries before the win), minimum 100.
- Saved per level: best stars, best score, best time, fewest parts, flawless
  flag, and the player's last machine (so returning to a level restores it).
- Progress, settings and machines live in localStorage under
  `contraption:*`. Nothing leaves the device.

## 7. Achievements (append-only ids)

First run, first solve, flawless (solve a level first try), each chapter
complete, all three stars on a chapter, 30 levels solved, 50 tries (secret:
"Persistence"), a lever throw over 20 cells, a jammed train (secret), a
machine with 15 parts in sandbox, no hints for a whole chapter.

## 8. Visual style (daylight / e-paper)

- Palette tokens only (`ink`, `paper`, `mid`, `faint`), redefined per theme.
  Paper: ink #111, paper #fff, mid #6b6b6b, faint #d8d8d8.
- Stroke 2.5 px at default zoom (scales with zoom, never under 1.5 px).
- Every part distinguished by shape and pattern: walls = 45° hatch,
  no-build = sparse light stripes with dashed edge, danger = solid ink with
  paper spikes, goal = bold dashed outline with a flag, ball = paper with an
  ink seam (rotation visible), crate = planks and a brace, weight = solid ink
  with "kg" in paper, gears = paper teeth, spoked hub; chain = dotted band.
- Front layer (collides) is drawn with heavier ink than the back layer
  (gears, chains, motors), which is lighter so the play path reads first.
- Motion is legible without colour: belts show moving chevrons, motors a
  turning arrow, levers a fulcrum triangle.
- Text and touch targets: at least 44 px targets, 15 px+ text, high contrast.

## 9. Sound
Web Audio only: click on place, ratchet on gear mesh, thud on impacts
(rate-limited, louder for harder hits), motor hum while running, win chime,
fail buzz.

## 10. Non-functional
- 60 fps on a mid phone with ~40 bodies; physics runs at 120 Hz fixed with
  the renderer interpolating nothing (simple and crisp).
- Works at 360×640 portrait up to 2560 wide; the board fits the screen and
  can be zoomed.
- Offline via service worker; installable; no external requests.

## 11. Build plan (work breakdown)

1. Engine: shapes, collision, solver, trains, motors, belts, events + tests.
2. Machine model: parts → bodies/trains, placement rules, validity + tests.
3. Levels with reference solutions; test that each one wins.
4. Renderer: ink style, themes, all parts and level pieces.
5. App: title, chapters, level card, build UI (tray, handles, inspector),
   run HUD, results, sandbox, parts guide, settings, saving.
6. Achievements, sounds, hub card + icon, README/PLAN, offline lists.
7. Headless checks at 390×780 and 1200×900 (tablet), deploy.

## 12. Long-term direction: from puzzles to real machines

Where this goes: the toolkit becomes good enough that players **build
working things** (a clock, a counter, a display, a calculator) from a
small set of parts on a solid engine, and **share them by link**. The
game keeps growing in small, frequent updates: new parts, new chapters, and
featured machines that people made.

The bar is "very few pieces, very deep": every new part has to combine
with the others in ways that are hard to predict. The model is a universal
gate (NAND), not a crate of special-purpose gadgets.

### 12.1 Two ways to compute, both kept

1. **Mechanical logic, from the physics alone.** Marbles, levers, gates,
   ratchets and cams, the way the Digi-Comp toys worked. This is the most
   impressive to watch, but it is slow and fragile, so it needs the engine
   work in 12.4. It lives in puzzle chapters and in show-off sandbox builds.
2. **A signal layer that bridges to the physics.** Parts that sense the
   physical world, discrete wires and gates that compute, and parts that act
   back on the physics. This is how big builds (clocks, displays) stay
   practical. Signals are exact (on/off), so they are also fully
   deterministic.

Both run in the same machine. A ball crossing a beam can start a counter,
and the counter can open a gate that lets the next ball through.

### 12.2 The signal toolkit (planned parts, smallest useful set)

| Part | Kind | What it does |
|---|---|---|
| Wire | link | Carries on/off from an output to inputs. Drawn behind the board, like chains |
| Plate | sensor | On while something presses it (a mass threshold) |
| Beam | sensor | On while something blocks a line between two pegs |
| Switch | actuator | Gates a motor: the motor runs only while its input is on |
| Piston | actuator | Pushes out while on (a kinematic slider with a force limit) |
| NAND | logic | The one universal gate. NOT, AND, OR, XOR and latches are recipes, not parts |
| Delay | logic | Passes its input on after n ticks (0.1 to 5 s). With a NAND this makes an oscillator, which is the heartbeat of a clock |
| Pixel | display and state | A cell that shows black or white. "Set" and "clear" inputs make it a one-bit memory and an output. Black/white is exactly right for e-paper |
| Chip | hierarchy | Wraps a selection into one part with named pins; can be placed many times. Big builds stay readable, and a chip is shared like a machine |

Convenience gates (NOT/AND/OR) can unlock later as shortcuts for NAND
recipes the player has already built in a teaching level, so the core
stays tiny.

**Signal rules (fixed now, so they never break shared machines):**
- Signals update once per physics step (1/120 s), after the physics.
- Every gate has a one-tick delay, so loops are well defined: no glitches,
  no order dependence, and a NOT wired to itself oscillates at a known rate.
- Sensors read the state after the step; actuators apply on the next step.
- The whole state is integers and booleans, with no floats, so it is
  bit-for-bit the same on every device.

### 12.3 Capstone: "build a clock"

There are two clocks, as the final challenges of two late chapters:
- **Mechanical clock.** A pendulum, an escapement (ratchet and pawl) and a
  gear train geared 60:1 and 12:1 to the hands. This needs gears defined
  by **tooth count** (10, 12, 15, 20, 24, 30, 36, 40, 45, 60…), so that
  ratios such as 60:1 = 3·4·5 exist. Today's sizes 1/2/3 only give powers
  of 2 and 3. Pitch radius = teeth / 10, so the existing S/M/L gears are
  exactly 10/20/30 teeth and old saves map across with no change.
- **Digital clock.** A delay oscillator, then counters (pixels used as
  flip-flops), then a 7-segment decoder chip, then a 4-digit pixel
  display. This is the showcase for chips and pixels.

Both are verified by tests the same way levels are: "the minute hand turns
once per 60 turns of the seconds axle", "the display reads 00:01 after
60 s".

### 12.4 Engine work this needs (in order)

1. **A part registry.** Each part type becomes one module with its schema,
   placement rules, physics bodies, signal pins, drawing and inspector
   controls. New parts are then one file each, instead of edits across
   `machine.js`, `draw.js` and `app.js`. Do this before adding any new part.
2. **Versioned machines.** Every saved or shared machine records the
   format version and the engine version. The physics only changes
   behind a version bump, and there are migrations for old formats.
3. **Determinism guard.** A corpus of "golden machines" (every level
   solution plus featured community builds) runs in the tests. Any engine
   change that alters a result fails CI unless it is a deliberate version
   bump. Float physics can differ slightly between browsers (Math.sin/cos),
   so a shared machine's result is always re-checked on the viewer's
   device, never trusted from the link.
4. **Scale.** A spatial-grid broadphase, sleeping for bodies at rest, and
   boards up to about 96×64 with a scrolling camera and a minimap.
   Fast-forward runs headless in a worker. Target: a 300-part clock at
   60 fps on a mid phone.
5. **Mechanical vocabulary.** Tooth-count gears, ratchet and pawl,
   pendulum bob (a weight bolted to a lever), cam, rack and pinion,
   springs, rope and pulley. Each one is added only when a level needs it.

### 12.5 Sharing without a server

No accounts and no servers still holds (PLAN.md principles):
- **A machine in a link.** Parts are packed into bytes (type id, pegs,
  settings), compressed with the browser's CompressionStream and encoded
  as base64url in the fragment: `contraption/#m=…`. A 300-part clock
  should fit in about 2 KB. Opening a link loads the machine (or the
  player-made level) read-only in the sandbox, with "Run" and "Copy to
  my sandbox".
- **Export and import a file** for builds that are too big for a link.
- **Level editor.** Players make their own levels (walls, goal, items,
  parts on offer), and the editor requires a working solution before it
  makes a link, just as our levels do.
- **Featured machines ship with the game.** Players submit a link through
  a GitHub issue. A maintainer (or the agent workflow below) checks that it
  runs, and it lands in an in-game "Gallery" with credit. This is how
  "people share very impressive machines" works with no server, and it
  feeds the regular updates.

### 12.6 Frequent updates, visibly

- A "What's new" card on the title screen after each update (new parts,
  levels, gallery entries), driven by a changelog file in the game folder.
  The service worker already offers "Reload" when a new version is ready.
- Content arrives in small drops: a chapter of 5 levels, one new part with
  its teaching levels, or a handful of gallery machines. Ids stay
  append-only, so progress always carries over.
- A weekly challenge picked by date from a list that ships ahead of time,
  so it works offline: a fixed level with a par in parts and time.
- Later chapters in order: Signals (sensors, wires, switch), Logic
  (NAND to everything), Memory (pixels as bits, counters), Displays
  (chips, 7-segment), Clocks (both capstones), then open-ended "build a…"
  briefs.

## 13. The agent workflow for levels and machines

Chapters 1–6 were tuned with throwaway search scripts. Bigger levels and
machines need that turned into repo tooling with gates that tests enforce,
so that agents (or contributors) can work on many levels in parallel
without lowering quality.

**Tools (`scripts/contraption/`, plain Node, no dependencies). Built:
`sim`, `search`, `centre`, `check`; still to come: `shot` levels and the
builder DSL.**
- `check`: every gate below for one level or all; exits non-zero on a failure.
- `centre`: among a family's winners, the machine with the most slack. Use
  it to choose a level's reference solution.
- `sim`: run a level with a machine headless. Prints the outcome, the
  time, the failure reason and a sampled trace of each item.
- `search`: try a family of placements (written as a JS expression) and
  report the winners, a tally of why the others failed, and the
  solution's **slack** (the share of nearby placements that also win).
- `exploit`: brute-force cheap machines (nothing, one part of each type
  at every peg) and report any that win. A level must not fall to these.
- `shot`: a PNG of a level, a machine, or a moment in a run, through
  `scripts/shot.mjs` with `?level=…&machine=…&t=…`, for visual review.
- `build`: a small builder DSL so machines can be written as code
  (`gear(10, at(4,5))`, `chip('counter4', at(20,8))`). Agents assemble
  big contraptions from tested sub-assemblies and emit ordinary machine
  data.

**Gates every level must pass (in `tests/contraption.test.js`):**
- The reference solution wins within the star targets (true today).
- An empty machine fails (true today).
- Slack (built): at least 25% of the solution's one-step neighbours also
  win (pegs ±1, lever arms ±½, angles ±15°, delays ±½ s where the
  solution waits). Drive pegs (gears, motors, chains) are not nudged: one
  peg off there unhooks the drive, a visible mistake rather than fine
  tuning. A level can lower it with `minSlack`, with a comment saying why.
- No exploit wins (built): no empty machine, and on levels whose parts
  target is above one, no single part of any offered type at any peg.
- Sub-assemblies have their own unit tests (the oscillator period, the
  counter rolling over, a 60:1 train ratio) before a capstone uses them.

**Loop for one level or machine (one agent each, in parallel):**
1. Brief: the concept it teaches, the parts on offer, the target
   difficulty and slack.
2. Draft the geometry, then `search` for solutions and read the failure
   tally to see what the physics actually allows.
3. Reshape until slack and exploit checks pass. Prefer changing the
   level over hunting for knife-edge answers.
4. `shot` the build and the key moments of a run, and check them at
   390×780 and on a 4:3 tablet.
5. Add the level with its solution, run the tests, then open a PR whose
   description has the screenshots and numbers.

A reviewer pass (a second agent) replays the gates, plays the level, and
judges fairness and fun before merge.

## 14. Next steps toward this (in order)

1. ✅ Search and simulate scripts in `scripts/contraption/`; slack and
   exploit gates in the tests; chapter 2 re-tuned (Tipping point now opens
   the chapter, Seesaw comes with its lever built and a stop for the ball).
2. ✅ Part registry (`js/parts/`, one module per part; `parts/index.js`
   lists what a module provides), versioned save format (`js/format.js`,
   with migrations from the first release's bare arrays), and the
   golden-machine corpus (`tests/contraption-golden.json`, written by
   `scripts/contraption/golden.mjs --write` after a deliberate `ENGINE` bump).
3. ✅ Tooth-count gears (10, 15, 20, 25, 30, 40; old S/M/L saves load as
   10/20/30) on two layers: gears mesh within a layer, and a peg holds one
   gear per layer, so compound trains multiply (10→30, 10→40, 15→25 is
   1:20; a test checks it). Chains name the layer at each end. Sandbox is
   48×32; boards too big to touch comfortably start zoomed on the item,
   pan with one finger, and show a tappable minimap.
4. ✅ Machine links (`#m=…`, deflated base64url, about 160 characters for a
   level solution; a 300-part build stays under 4 KB) and save/open file.
   A loaded solution counts as a hint on its level. Still to do: the level
   editor.
5. ✅ "What's new" (`js/changes.js`, shown once to returning players, and
   in Settings) and the Gallery (`js/gallery.js`, each entry tested to
   still work; first entry: a 1:20 compound train). Players send links
   through a prefilled GitHub issue.
6. ✅ (first half) The signal layer: plate, beam and wire, with chapter 7
   "Signals" (Step on it, Break the beam, Chain reaction). There is no
   separate switch part: a wired motor runs only while a wire into it is
   on, and a level can make a fixed motor wait (`switched: true`, drawn with
   a socket). Sensors read the world after each step; motors act on the next
   step.
7. ✅ (first half) Logic: NAND (any number of wires in; one wire is NOT),
   delay (¼–5 s) and pixel (lamp, or toggle: flips on each rising edge, so
   one bit of memory). Gates answer one step late, so loops are well
   defined; at power-up the logic settles with sensors off so the switch-on
   is not counted as an event. Tests cover an oscillator, a binary
   up-counter (toggles chained through NOTs: they flip on falling edges)
   and an SR latch that holds after its set is released. Levels can now
   have a signal goal (a fixed lamp blinks N times, or stays lit N s).
   Chapter 8 "Logic": Upside down, Heartbeat, Remember. The Gallery has a
   4-bit binary counter on the Workbench (an item-free board). Chapter 9
   "Memory": Count to two, Count to three (signal goals can require the
   lamp to stay dark until a time, so lighting on the wrong count fails).
7. ✅ Chips (`js/parts/chip.js`): Make a chip (sandbox menu) wraps the
   logic parts in a box; wires crossing it become input pins (left) and
   output pins (right). The definition travels inside the part (saves and
   links carry it) and a library keeps up to 30 for the tray. At run time a
   chip is unpacked into its gates, so it behaves exactly like them (tested
   with a wrapped NOT and a wrapped 2-bit counter).
8. ✅ Digital clock (`js/clock.js`, in the Gallery): a NAND-and-delay
   heartbeat, four counter chips (toggles in a ripple chain; a NAND spots
   10 or 6 and drives every bit's new clear pin) and four 7-segment decoder
   chips (21 NANDs each: one per digit pattern, one per segment) lighting
   3×5 pixel digits; 138 parts. The test reads the display after every
   beat for two minutes, rollovers included. A beat is 121/120 s: whole
   steps cannot make exactly one second.
9. ✅ Level editor (`js/editor.js` model, tested; "Make a level" on the
   title screen once chapter 1 is done): walls, no-build and spike zones by
   dragging, cup and items by tapping, an eraser, undo; Level settings for
   name, goal and parts on offer. "Try it" plays the draft; the first win
   stores the solution and sets the targets (its parts; its time + 20%),
   and any edit un-solves it. Solved levels share as #lv= links; on opening,
   the maker's solution is re-run and a level whose solution fails here is
   flagged.
10. ✅ Pendulum clock (Gallery): a 5¾-cell rod on a free peg, set going by
   a ball resting on its tip, swings through a beam about once a second
   (beams now see levers as well as items); the beam drives the same
   counter and display chips as the digital clock. Tested: right reading
   after every swing for 75 s, within 3% of real time. A geared
   escapement clock is still open: it needs toothed contact shapes the
   engine does not have yet.
11. ✅ Every chapter has five levels. New: Ride along (Signals: a beam is
   only on while the crate is in it, so stretch it along the belt), One,
   not both (Logic: exclusive or from four NANDs), Keep it going, Set and
   reset and Count to four (Memory: a toggle drives a motor; a toggle's
   clear pin; three toggles count to four). Signal goals can now ask the
   lamp to light, then go dark and stay dark (`darkHold`).
12. ✅ A fresh look: each board is a sheet of paper on a cutting-mat grid
   with a hard ink shadow; buttons, cards and tiles have solid ink shadows.
13. ✅ Editor, part two: a Lamp tool (the goal becomes a lamp: stay lit,
   blink N times, or light then go dark, with an optional "dark until";
   items are all helpers), movers (drag for a slider between two points,
   tap for a spinning arm; a settings dialog picks platform, gate, block
   or arm, period or speed, waits, start offset and spikes; at most four),
   and Machine (the ordinary build tools with every part; Done makes them
   the level's fixed parts, and a fixed motor can be set to wait for a
   signal). Level settings has a time limit. All of it is in level links;
   lists from a link are capped to what the editor makes.
14. ✅ Clockwork: a real anchor escapement. Teeth are rotor bodies (one
   convex triangle each) on the escape wheel's axle, so they touch the
   pendulum's two pallets (rotors on another train) through the ordinary
   contact solver; masks keep teeth and pallets touching only each other.
   The geometry (`js/escapement.js`) puts the pendulum's peg 3 pegs above
   the wheel with pallets at ±45° from the top, so each pallet moves
   radially in and out of the teeth; tooth depth, pallet depth, lift and
   width came from a random search scored on a steady swing and one tooth
   per swing, then checked for slack. The wheel's drive is a gentle
   spring (a motor with low stall torque and light damping); a pendulum
   train is never held and starts with a small push. A 4-cell rod beats
   about once a second (59.5 s a turn: about 1% fast), and the swing
   settles rather than dying away (checked for 30 minutes with the full
   train). New parts: Escape wheel, Pendulum, Dial (a hand showing its
   peg's turn); in the sandbox from the Memory chapter. Gallery:
   Clockwork, with gears 15:25, 10:30, 10:40, 10:30 (60:1) to the minute
   hand and a 1:1 chain plus 10:40, 10:30 (12:1) to the hour hand. Two
   layers of gears cannot hold six stages in a row: a big gear always
   fouls the next peg's small one, hence the chain.
15. ✅ Going up. Cleats (an option on the conveyor): kinematic ribs that
   ride the belt loop, placed each step from the drum's turn, so they
   push items with the belt (they do not load the motor). Geared down
   2:1 or 3:1 they carry balls up slopes to 70°; a smooth belt cannot
   (a ball rolls back). A notched lift wheel was tried first and dropped:
   wherever the feed meets the paddles, a paddle can pin a waiting ball
   against the mouth and stall the train. One belt cannot make a closed
   marble loop (the ball tips off over the top to the far side, and the
   way back would cross the belt), so the showpieces are chains.
   Trapdoor: a flap on a latched train (jammed until a signal reaches its
   hinge, then free for good); it may carry an item from the start.
   Gallery: Trapdoor catapult, Escalator, The long way round (zigzag,
   beam and toggle starting the escalator, beam opening the trapdoor,
   steel on a catapult, crate into a high cup; 12.5 s). Each was built by
   running the physics and putting shelves and cups where things land;
   the Gallery test runs every machine on its own board. Gallery
   machines open fitted to the screen, however small.
16. ✅ Endless loops. The Scoop (a cleated belt's option): a fixed trough
   round the a-end drum from the return side round to the carrying side,
   like a bucket elevator's boot, so the way back passes under the belt.
   Shaped as a spiral (2.4 at the mouth, 1.6 round the drum) with a funnel
   lip: a ball waiting its turn sits out of the cleats' reach, which is
   what made two balls jam; a return ramp that touches the belt wedges the
   ball, so it must stop short. Gallery: Marble machine, two balls (three
   jam the scoop: that is the one-at-a-time gate's job) and a 4-bit lap
   counter; tested for 3 minutes, checked for 10 (124 laps).
17. ✅ The Gate: two kinematic pins one ball apart that pop up through a
   track. No signal: front up, back down. Signal: front down, back up. So
   one ball per signal, however long it lasts; once opened it stays open
   0.4 s, so a ball flashing through a beam is enough (a shorter pulse let
   the pins half-move and deadlocked the queue). The back pin sits a
   little upstream of where two queued balls touch (gap 1.0, balls 0.8):
   a pin rising exactly at the contact wedges both balls up. Parts that
   follow a signal every step use a `follow(run, part, on)` hook. The
   Marble machine now runs five balls: the beam at the top both releases
   the next ball and counts the lap, so only one ball is ever in the
   scoop; checked for 10 minutes.
18. ✅ Chapter 10, Machines: Hold that thought (trapdoor and beam; a
   mover guards the throw for three seconds, so dropping at once fails),
   Up the down slope (cleats and gearing: a smooth belt and a direct
   motor both fail), Back under (the scoop), Metronome (5 blinks in 3.5 s:
   a 3-cell rod wins, the standard 4 fails) and The long way round (the
   Gallery chain, built by the player; a mover guards against dropping
   the steel at once). The gate has no level: one pass of balls through a
   scoop does not crowd it (that takes minutes of looping), so it stays a
   sandbox and Gallery part. "Stopped short" now waits until every item
   is still, helpers included.
19. ✅ Curve (an arc between two pegs, bend in half cells; built from 12
   straight pieces, a convex outline for the placement rules; a quarter-
   pipe turns a straight drop into a roll about three times faster
   across than a straight ramp) and Pusher (a Scotch yoke: a kinematic
   paddle placed from its peg's turn, like cleats, so it never stalls;
   it only reaches what is within its stroke). Gallery: Kick and curve.
20. ✅ Spring (a kinematic plunger: out at 10/15/21 cells a second by power,
   holds, re-cocks; fires on each rising signal, or unwired at its delay;
   power 3 throws a ball about 9 cells up) and Winch (a kinematic bucket
   whose rope length follows its peg's turn; at the top it tips over its
   pouring lip, like a skip, onto a built-in chute beside its path: tipped
   about the rope instead, the ball went back down the far side). Rope
   with real tension (a pulley and a counterweight) still needs a
   constraint the engine does not have. Gallery: Winch.
21. ✅ Polish: the view follows the action on boards bigger than the
   screen (the item still to deliver, else the fastest; only when it
   leaves the middle 40%, eased; dragging stops it), and Replay re-runs
   the machine at half speed without counting (deterministic, so it is the
   same run). Performance: physics runs 125–980 times faster than real time
   here for every Gallery machine; drawing at a 6x CPU slowdown gives
   18–27 frames a second (Clockwork, with its gear teeth and dial ticks,
   is the slowest) while machine time keeps up with real time.
22. ✅ The Gallery pipeline: each showpiece is a module in js/machines/
   (board, parts, note, and a check: seconds, watch(run, s) each step,
   verify(run, s) → null or why not), listed in machines/index.js and
   appended to the Gallery. kit.js has the common pieces (an item resting
   on a ramp, a heartbeat, a counter-and-decoder digit, edge counting).
   scripts/contraption/bench.mjs runs one headless (placement, outcome,
   item paths, where things land, signal timelines); gallery-shot.mjs
   screenshots one in the real game. The test runs every check. First
   batch: Lap counter, Gearbox, Pendulum wave, Traffic lights, Ball
   dispenser, Spring shot, Belt relay, Alarm clock. Dropped for now: a
   weight sorter (the counterweight sits in the path of the balls that
   should roll across the balance). Second batch: Race timer (a toggle
   set and cleared by two beams gates a tenth-second heartbeat; the
   heartbeat's half beat is the delay plus two gate steps, so 4/120 s
   gives 0.05), Adder (a full-adder chip of 15 NANDs, each input through a
   two-NOT buffer because a chip input feeds one gate), Breakfast machine
   (three proven stages chained) and Cuckoo clock (the arm on the slow
   shaft must be balanced: a 3-cell arm out to one side weighs twenty
   times the escape spring's torque and jams the escapement).
8. More mechanical parts as levels call for them: ratchet, pendulum,
   cam, springs, rope and pulley.

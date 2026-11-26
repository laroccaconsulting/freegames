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
| Lever | Ch 2 | fulcrum on a peg; arms 0.5–6 cells each, 15° steps | rigid bar free to rotate about the fulcrum; its own mass; torques from weight and contacts |
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

## 12. Later
- Level editor and share-by-link levels; daily challenge; ropes and pulleys;
  springs and pistons; marble-run track pieces.

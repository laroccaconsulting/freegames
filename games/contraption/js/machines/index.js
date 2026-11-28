// Gallery showpieces, one module per machine. Each exports:
//   id, title, note, board (walls, items, cup… merged over the Workbench),
//   parts, and how to check it still works:
//   seconds   how long the check runs it (a delivering machine stops when it wins)
//   watch?(run, s)   called every step, to note what happens in s
//   verify(run, s)   → null when it did what the note says, else why not
//   show?     seconds to run it in the Gallery's own test when it never stops
// Build and tune one with: node scripts/contraption/bench.mjs <id>
// See it with:             node scripts/contraption/gallery-shot.mjs <id> out.png 3
// Ids are save keys: append only.
import lapCounter from './lap-counter.js';
import gearbox from './gearbox.js';
import pendulumWave from './pendulum-wave.js';
import trafficLights from './traffic-lights.js';
import dispenser from './dispenser.js';
import springShot from './spring-shot.js';
import beltRelay from './belt-relay.js';
import alarmClock from './alarm-clock.js';

export const MACHINES = [lapCounter, gearbox, pendulumWave, trafficLights, dispenser, springShot, beltRelay, alarmClock];

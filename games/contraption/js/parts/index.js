// The part registry: one module per part type. To add a part, write its
// module (see ramp.js for the smallest one), import it here, and give it
// a level that teaches it. Order here is the tray order.
//
// A part module provides:
//   type, name, blurb, physics, tip      text for the tray, cards and guide
//   layer        drawing order (0 gears … 4 motors); front: collides with
//                items, back: drawn behind and may overlap more freely
//   pegs(part)   the pegs it sits on; shape(part) its world shape for checks
//   check?(level, part, others)   extra placement rules → reason or null
//   axles?(part, axle)            its role on the drive train (gear, motor,
//                                 drum, lever); links?(part, axles, link)
//   inertia?(part), motor?(part)  what it adds to its train
//   body?(world, part, ctx)       its physics body
//   draw(view, pal, part, live)   live: { turn(peg), body, phase, all, running }
//   defaults(peg)  candidate parts when dropped on a peg (first legal wins)
//   distance, handles, drag, move  hit-testing and editing
//   controls?(part)  inspector controls; hint(part, ctx) one line of help
//   output?(part) / input?(part)  the peg where a signal leaves or enters
//   sense?(part, run, body)       a sensor's state after each step
//   logic?(part, inputs, state)   a gate's output from last step's inputs
//   link?  placed by tapping two parts (chain, wire): which pins it joins
import ramp from './ramp.js';
import lever from './lever.js';
import weight from './weight.js';
import conveyor from './conveyor.js';
import motor from './motor.js';
import gear from './gear.js';
import chain from './chain.js';
import bouncer from './bouncer.js';
import plate from './plate.js';
import beam from './beam.js';
import wire from './wire.js';
import nand from './nand.js';
import delay from './delay.js';
import pixel from './pixel.js';
import chip from './chip.js';
import escape from './escape.js';
import pendulum from './pendulum.js';
import dial from './dial.js';
import { PARTS_REF } from './ref.js';

export const PARTS = Object.fromEntries([ramp, lever, weight, conveyor, motor, gear, chain, bouncer, plate, beam, wire, nand, delay, pixel, escape, pendulum, dial, chip].map((p) => [p.type, p]));
Object.assign(PARTS_REF, PARTS);
export const PART_TYPES = Object.keys(PARTS);
export const partOf = (part) => PARTS[part.type];

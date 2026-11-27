// Showcase machines for the Gallery: each brings its own board (walls,
// items, cup) and its machine. Built by running the physics and putting
// the shelves and cups where things actually land.

export const TRAPDOOR_CATAPULT = {
  board: {w: 26, h: 16, walls: [[0, 15, 26, 1], [17.6, 12.2, 0.6, 2.8], [16.4, 5, 0.4, 2], [3.75, 9.5, 5.0, 0.5]], goal: {x: 4, y: 6.5, w: 4.5, h: 3, cup: true}, items: [{type: 'ball', x: 24.5, y: 2.4, deliver: false}, {type: 'steel', x: 13.3, y: 2.45, deliver: false}, {type: 'crate', x: 17.0, y: 11.4}]},
  parts: [
    {type: 'ramp', a: [25, 3], b: [20, 5]},
    {type: 'plate', p: [18, 6]},
    {type: 'wire', a: [18, 6], b: [15, 3]},
    {type: 'trapdoor', p: [15, 3], l: 2, angle: 0, side: -1},
    {type: 'lever', p: [15, 12], angle: 0, l1: 2, l2: 2.5},
  ],
};

export const ESCALATOR = {
  board: {w: 24, h: 16, walls: [[0, 15, 24, 1], [12.75, 7, 6.5, 0.5]], goal: {x: 13, y: 4.5, w: 6, h: 2.5, cup: true}, items: [{type: 'ball', x: 1.6, y: 11.5}]},
  parts: [
    {type: 'ramp', a: [1, 12], b: [5, 14]},
    {type: 'conveyor', a: [6, 14], b: [10, 4], cleats: true},
    {type: 'gear', p: [10, 4], teeth: 20, plane: 0},
    {type: 'gear', p: [7, 4], teeth: 10, plane: 0},
    {type: 'motor', p: [7, 4], dir: -1},
    {type: 'ramp', a: [11, 4], b: [12, 4]},
  ],
};

export const LONG_WAY = {
  board: {w: 36, h: 18, walls: [[0, 17, 36, 1], [15, 14, 0.4, 3], [19.6, 8, 0.4, 9], [20.8, 14.2, 0.6, 2.8], [30.25, 11.5, 5, 0.5]], goal: {x: 30.5, y: 8.5, w: 4.5, h: 3, cup: true}, items: [{type: 'ball', x: 1.6, y: 2.5, deliver: false}, {type: 'steel', x: 25.7, y: 4.45, deliver: false}, {type: 'crate', x: 22, y: 13.4}]},
  parts: [
    {type: 'ramp', a: [1, 3], b: [5, 5]},
    {type: 'ramp', a: [6, 7], b: [2, 9]},
    {type: 'ramp', a: [1, 14], b: [5, 16]},
    {type: 'beam', a: [2, 12], b: [6, 12]},
    {type: 'pixel', p: [3, 10], mode: 'toggle'},
    {type: 'wire', a: [2, 12], b: [3, 10]},
    {type: 'conveyor', a: [6, 16], b: [10, 6], cleats: true},
    {type: 'gear', p: [10, 6], teeth: 20, plane: 0},
    {type: 'gear', p: [7, 6], teeth: 10, plane: 0},
    {type: 'motor', p: [7, 6], dir: -1},
    {type: 'wire', a: [3, 10], b: [7, 6]},
    {type: 'ramp', a: [11, 6], b: [17, 7]},
    {type: 'beam', a: [16, 10], b: [19, 10]},
    {type: 'wire', a: [16, 10], b: [24, 5]},
    {type: 'trapdoor', p: [24, 5], l: 2, angle: 0, side: 1},
    {type: 'lever', p: [24, 14], angle: 0, l1: 2.5, l2: 2},
  ],
};


// An endless marble machine: a cleated belt with a scoop lifts two balls,
// they run down and back under the belt into the scoop, for ever; a beam
// on the way down counts the laps in binary.
export const MARBLE_MACHINE = {
  board: {w: 24, h: 16, walls: [[0, 15, 24, 1], [19.15, 3, 0.5, 5]], items: [{type: 'ball', x: 12.5, y: 5.11, deliver: false}, {type: 'ball', x: 15, y: 8.29, deliver: false}]},
  parts: [
    {type: 'conveyor', a: [5, 12], b: [9, 4], cleats: true, scoop: true},
    {type: 'gear', p: [9, 4], teeth: 20, plane: 0},
    {type: 'gear', p: [6, 4], teeth: 10, plane: 0},
    {type: 'motor', p: [6, 4], dir: -1},
    {type: 'ramp', a: [10, 5], b: [17, 7]},
    {type: 'ramp', a: [19, 8], b: [10, 10]},
    {type: 'beam', a: [14, 7], b: [14, 9]},
    {type: 'pixel', p: [21, 12], mode: 'toggle'},
    {type: 'pixel', p: [19, 12], mode: 'toggle'},
    {type: 'pixel', p: [17, 12], mode: 'toggle'},
    {type: 'pixel', p: [15, 12], mode: 'toggle'},
    {type: 'nand', p: [21, 14]},
    {type: 'nand', p: [19, 14]},
    {type: 'nand', p: [17, 14]},
    {type: 'wire', a: [14, 7], b: [21, 12]},
    {type: 'wire', a: [21, 12], b: [21, 14]},
    {type: 'wire', a: [21, 14], b: [19, 12]},
    {type: 'wire', a: [19, 12], b: [19, 14]},
    {type: 'wire', a: [19, 14], b: [17, 12]},
    {type: 'wire', a: [17, 12], b: [17, 14]},
    {type: 'wire', a: [17, 14], b: [15, 12]},
  ],
};

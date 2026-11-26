// Featured machines, shipped with the game. Players send links through a
// GitHub issue (see SUBMIT); good ones are checked by the tests (they must
// still work) and land here with credit. Append only: ids are save keys
// for the copy each player tinkers with.
export const SUBMIT = 'https://github.com/laroccaconsulting/freegames/issues/new?labels=contraption-machine&title=Machine%3A+&body=Link%3A+%0A%0AWhat+it+does%3A+';

export const GALLERY = [
  {
    id: 'twenty-to-one',
    title: 'Twenty to one',
    by: 'The Contraption workshop',
    level: 'sandbox',
    note: 'A compound gear train, 10→30, 10→40, 15→25, turns a crank twenty times slower than the motor: slow enough to tip the ball off gently. A chain from the same train runs the belt.',
    parts: [
      { type: 'motor', p: [16, 4], dir: -1, delay: 0 },
      { type: 'gear', p: [16, 4], teeth: 10, plane: 0 },
      { type: 'gear', p: [12, 4], teeth: 30, plane: 0 },
      { type: 'gear', p: [12, 4], teeth: 10, plane: 1 },
      { type: 'gear', p: [12, 9], teeth: 40, plane: 1 },
      { type: 'gear', p: [12, 9], teeth: 15, plane: 0 },
      { type: 'gear', p: [8, 9], teeth: 25, plane: 0 },
      { type: 'lever', p: [8, 9], angle: 0, l1: 6, l2: 2 },
      { type: 'ramp', a: [10, 12], b: [18, 16] },
      { type: 'conveyor', a: [20, 20], b: [31, 20] },
      { type: 'gear', p: [20, 20], teeth: 10, plane: 0 },
      { type: 'chain', a: [12, 4], b: [20, 20], pa: 0, pb: 0 },
      { type: 'ramp', a: [33, 23], b: [41, 27] },
    ],
  },
];

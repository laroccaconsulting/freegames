// The puzzle types in Logic. Each mode supplies its rules, generator, hint
// and view; app.js does the rest (daily puzzles, saving, results).
import { starsMode } from './stars-view.js';
import { calcMode } from './calc-view.js';
import { bridgesMode } from './bridges-view.js';

export const MODES = {
  stars: starsMode,
  calc: calcMode,
  bridges: bridgesMode,
};

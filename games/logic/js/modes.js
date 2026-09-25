// The puzzle types in Logic. Each mode supplies its rules, generator, hint
// and view; app.js does the rest (daily puzzles, saving, results).
import { starsMode } from './stars-view.js';
import { calcMode } from './calc-view.js';
import { bridgesMode } from './bridges-view.js';
import { futoshikiMode } from './futoshiki-view.js';
import { skyscrapersMode } from './skyscrapers-view.js';
import { lightupMode } from './lightup-view.js';
import { tentsMode } from './tents-view.js';
import { kakuroMode } from './kakuro-view.js';

export const MODES = {
  stars: starsMode,
  calc: calcMode,
  bridges: bridgesMode,
  futoshiki: futoshikiMode,
  skyscrapers: skyscrapersMode,
  lightup: lightupMode,
  tents: tentsMode,
  kakuro: kakuroMode,
};

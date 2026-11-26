// The saved form of a machine, versioned so old saves and shared links keep
// loading as the game grows. Pure, tested in tests/contraption.test.js.
//
//   v0: a bare array of parts (the first release)
//   v1: { v: 1, engine, parts }
// Add a step to MIGRATIONS for every new version; never edit an old one.
import { ENGINE } from './physics.js';
import { PARTS } from './parts/index.js';

export const FORMAT = 1;

const MIGRATIONS = {
  0: (parts) => ({ v: 1, engine: 1, parts }),
};

/** The form to store. */
export function toSave(parts) {
  return { v: FORMAT, engine: ENGINE, parts: parts.map((p) => ({ ...p })) };
}

/** Parts from any stored form; unknown part types are dropped, not fatal. */
export function fromSave(data) {
  if (data == null) return { parts: [], engine: ENGINE, v: FORMAT };
  let d = Array.isArray(data) ? { v: 0, parts: data } : data;
  while ((d.v ?? 0) < FORMAT) {
    const step = MIGRATIONS[d.v ?? 0];
    if (!step) break;
    d = step(d.parts ?? d);
  }
  const parts = (d.parts || []).filter((p) => p && PARTS[p.type]);
  return { v: d.v, engine: d.engine ?? 1, parts };
}

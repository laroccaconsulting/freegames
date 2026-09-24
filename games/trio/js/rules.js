// Trio: triple tile match rules. Pure data, no DOM.
//
// Tiles sit on a board in layers. Positions are in half-tile units, so a tile
// at (x, y) covers [x, x+2) × [y, y+2); z is the layer. A tile is free when no
// higher tile overlaps it. Tapping a free tile moves it to the tray; three of
// a kind in the tray clear. The game is lost when the tray fills up.

export const TRAY = 7;

// For each tile, the tiles directly or indirectly resting on it that block it.
export function coverMap(tiles) {
  return tiles.map((a) =>
    tiles.reduce((list, b, j) => {
      if (b.z > a.z && Math.abs(b.x - a.x) < 2 && Math.abs(b.y - a.y) < 2) list.push(j);
      return list;
    }, []),
  );
}

export function isFree(covers, removed, i) {
  return !removed[i] && covers[i].every((j) => removed[j]);
}

export function freeTiles(covers, removed) {
  const out = [];
  for (let i = 0; i < covers.length; i++) if (isFree(covers, removed, i)) out.push(i);
  return out;
}

// Adds a tile type to the tray, next to others of its kind. Returns the new
// tray, where the tile landed, and the type that cleared (if three matched).
export function addToTray(tray, type) {
  let at = tray.length;
  for (let i = tray.length - 1; i >= 0; i--) {
    if (tray[i] === type) {
      at = i + 1;
      break;
    }
  }
  const next = [...tray.slice(0, at), type, ...tray.slice(at)];
  if (next.filter((t) => t === type).length === 3) return { tray: next.filter((t) => t !== type), at, cleared: type };
  return { tray: next, at, cleared: null };
}

// Plays a tile. Returns null if it isn't free.
export function pick(state, covers, i) {
  if (!isFree(covers, state.removed, i)) return null;
  const removed = state.removed.slice();
  removed[i] = 1;
  const { tray, at, cleared } = addToTray(state.tray, state.types[i]);
  return { ...state, removed, tray, at, cleared };
}

export const isWon = (state) => state.tray.length === 0 && state.removed.every(Boolean);
export const isLost = (state, capacity = TRAY) => state.tray.length >= capacity;

// Tray size after taking tiles in order; the game's score is the peak.
export function trayPeak(types, order) {
  let tray = [];
  let peak = 0;
  for (const i of order) {
    tray = addToTray(tray, types[i]).tray;
    peak = Math.max(peak, tray.length);
  }
  return peak;
}

# Free Games — notes for Claude

Start here, then read:
- **README.md**: every game, its folder and its key files.
- **PLAN.md**: principles (no ads/tracking/servers, offline, installable, no build step), "Next up", roadmap, the "Every game has" checklist, and per-game feature notes.
- **docs/DEVELOPING.md**: game anatomy, shared `core/` API, recipes, checking changes in a browser, gotchas.

## Rules

- Each `games/<slug>/` is a self-contained static site with relative paths only.
- Edit shared code in `template/core/`, then run `node scripts/sync-core.mjs`. Never edit a game's `core/` copy directly.
- Run `node scripts/build-sw.mjs` after changing any game files, and `npm test` before committing.
- Keep game rules pure (no DOM) so they can be unit-tested in `tests/`.
- `games/corridors/js/engine.js` is also bundled into the online server in `worker/`; keep it free of browser APIs.
- Never use trademarked game names (Tetris, Wordle, Scrabble, Yahtzee, Boggle, Uno…). See "Avoid" in PLAN.md.
- The utilities idea (QR, PDF tools, tuner, white noise…) belongs in a separate `freeutilities` repo. See the end of PLAN.md.
- Add every new game to `site/index.html` with its icon in `site/` (`tests/hub.test.js` checks) and to the README games table (`tests/docs.test.js` checks); the hub saves each game for offline.
- Every game must meet "Every game has" in PLAN.md: themes (incl. seasonal looks), achievements (`achievements.js` + `makeAchievements`), hub card, offline. `tests/achievements.test.js` enforces it; new games from the template start compliant.
- Achievement ids and fixed content indexes (e.g. Nonograms pictures) are save keys: append only, never rename or reorder.

## Working style the owner expects

- Ship each finished game or change to `main`: PR, then merge. Merging deploys to GitHub Pages, and the owner wants to play it.
- Before pushing: build-sw, `npm test`, and a headless check of changed screens with `node scripts/shot.mjs` (no page errors, looks right at 390×780).
- When a game is added or changes notably, update its README row and its PLAN.md notes, and tick off "Next up".

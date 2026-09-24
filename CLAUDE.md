# Free Games — notes for Claude

- Read PLAN.md first: principles (no ads/tracking/servers, offline, installable, no build step) and roadmap.
- Each `games/<slug>/` is a self-contained static site with relative paths only.
- Edit shared code in `template/core/`, then run `node scripts/sync-core.mjs`. Never edit a game's `core/` copy directly.
- Run `node scripts/build-sw.mjs` after changing any game files, and `npm test` before committing.
- Keep game rules pure (no DOM) so they can be unit-tested in `tests/`.
- Never use trademarked game names (Tetris, Wordle, Scrabble, Yahtzee, Boggle, Uno…).
- The utilities idea (QR, PDF tools, tuner, white noise…) belongs in a separate `freeutilities` repo. See the end of PLAN.md.

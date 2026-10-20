# Free Games

Classic games without the ads: no tracking, no accounts, and they work offline.
Each game is a static web app you can install to your home screen.

**Play:** https://laroccaconsulting.github.io/freegames/ (the games list, which
can save every game for offline use).

## Games

Main code is in `games/<folder>/app.js` (screen, input, saving) plus the files
below in `js/` (rules, kept free of the DOM and unit-tested in `tests/`).

| Game | Folder | What it is | Key files in `js/` |
|---|---|---|---|
| [Sudoku](https://laroccaconsulting.github.io/freegames/sudoku/) | [`games/sudoku`](games/sudoku) | Four levels, hints that teach | `sudoku.js` (generator, technique grader), `worker.js` |
| [Solitaire](https://laroccaconsulting.github.io/freegames/solitaire/) | [`games/solitaire`](games/solitaire) | Klondike, Spider & FreeCell | `engine.js` (rules), `variants.js`, `board.js` (view), `cards.js`/`art.js` |
| [Peaks](https://laroccaconsulting.github.io/freegames/peaks/) | [`games/peaks`](games/peaks) | TriPeaks, Pyramid and Golf solitaire | `peaks.js` (TriPeaks, Pyramid, Golf rules), `cards.js`/`art.js` |
| [Hearts](https://laroccaconsulting.github.io/freegames/hearts/) | [`games/hearts`](games/hearts) | Dodge the queen, or shoot the moon | `hearts.js` (rules + computer players) |
| [Spades](https://laroccaconsulting.github.io/freegames/spades/) | [`games/spades`](games/spades) | Bid your tricks with a partner | `spades.js` (bidding, tricks, scoring, computer) |
| [Mahjong](https://laroccaconsulting.github.io/freegames/mahjong/) | [`games/mahjong`](games/mahjong) | Every deal winnable | `mahjong.js` (layouts, winnable deals), `faces.js` (tile art) |
| [Pour](https://laroccaconsulting.github.io/freegames/sort/) | [`games/sort`](games/sort) | Water sort with a par for every level; Mono theme with patterns for grayscale screens | `rules.js`, `solver.js` (A* par + dead-end check), `levels.js`, `render.js`, `worker.js` |
| [Slide](https://laroccaconsulting.github.io/freegames/slide/) | [`games/slide`](games/slide) | Unblock the key, or order the tiles | `unblock.js`, `tiles.js` (solvers), `render.js`, `worker.js` |
| [Words](https://laroccaconsulting.github.io/freegames/words/) | [`games/words`](games/words) | Codeword, Wheel, Ladder, Grid, Search | `dict.js` (word list), `codeword.js`, `wheel.js`, `ladder.js`, `grid.js`, `search.js` |
| [Four in a Row](https://laroccaconsulting.github.io/freegames/four/) | [`games/four`](games/four) | Line up four before the computer | `engine.js`, `bot.js` + `bot-worker.js` |
| [Reversi](https://laroccaconsulting.github.io/freegames/reversi/) | [`games/reversi`](games/reversi) | Flip, trap and take the corners | `engine.js`, `bot.js` + `bot-worker.js` |
| [Code Breaker](https://laroccaconsulting.github.io/freegames/codebreaker/) | [`games/codebreaker`](games/codebreaker) | Crack the colour code in par | `rules.js` (scoring, minimax par) |
| [Fleet](https://laroccaconsulting.github.io/freegames/fleet/) | [`games/fleet`](games/fleet) | Find and sink the hidden ships | `fleet.js` (placement, heat-map computer) |
| [Logic](https://laroccaconsulting.github.io/freegames/logic/) | [`games/logic`](games/logic) | Eight logic puzzles: Star Battle to Kakuro | `modes.js` (mode registry); per puzzle `<mode>.js` (rules/generator) + `<mode>-view.js`; `latin.js`, `number-view.js` shared |
| [Minesweeper](https://laroccaconsulting.github.io/freegames/mines/) | [`games/mines`](games/mines) | Never a guess, hints that explain | `mines.js` (no-guess generator, logic solver) |
| [Clusters](https://laroccaconsulting.github.io/freegames/clusters/) | [`games/clusters`](games/clusters) | Pop big groups for big points | `clusters.js` |
| [Nonograms](https://laroccaconsulting.github.io/freegames/nonograms/) | [`games/nonograms`](games/nonograms) | Reveal 100 hidden pictures | `nonogram.js` (line solver, generator), `pictures.js` (100 fixed pictures, append only) |
| [Pipes](https://laroccaconsulting.github.io/freegames/pipes/) | [`games/pipes`](games/pipes) | Turn tiles, connect the network | `pipes.js` |
| [Flood](https://laroccaconsulting.github.io/freegames/flood/) | [`games/flood`](games/flood) | One colour, fewest moves | `flood.js` (beam-search par), `worker.js` |
| [Trio](https://laroccaconsulting.github.io/freegames/trio/) | [`games/trio`](games/trio) | Tile match you can see through | `rules.js`, `solver.js`, `levels.js`, `render.js` |
| [Blocks](https://laroccaconsulting.github.io/freegames/blocks/) | [`games/blocks`](games/blocks) | Block puzzle with a daily bot to beat | `rules.js`, `bot.js`, `render.js` |
| [Gems](https://laroccaconsulting.github.io/freegames/gems/) | [`games/gems`](games/gems) | Match-3 puzzles, nothing random | `rules.js`, `solver.js`, `levels.js`, `render.js` |
| [Dice](https://laroccaconsulting.github.io/freegames/dice/) | [`games/dice`](games/dice) | Yacht and Ten Thousand | `yacht.js`, `tenk.js` |
| [Checkers](https://laroccaconsulting.github.io/freegames/checkers/) | [`games/checkers`](games/checkers) | Jump, crown, and outwit the computer | `engine.js`, `bot.js` + `bot-worker.js` |
| [Mancala](https://laroccaconsulting.github.io/freegames/mancala/) | [`games/mancala`](games/mancala) | Sow, capture, fill your store | `engine.js` (Kalah + computer) |
| [Corridors](https://laroccaconsulting.github.io/freegames/corridors/) | [`games/corridors`](games/corridors) | Race and wall in your rivals | `engine.js` (also bundled into `worker/`), `bot.js`, `online.js` |
| [Snake](https://laroccaconsulting.github.io/freegames/snake/) | [`games/snake`](games/snake) | Swipe, eat, grow. Or play Zen | `snake.js` |
| [Bricks](https://laroccaconsulting.github.io/freegames/bricks/) | [`games/bricks`](games/bricks) | Paddle, ball, smash every brick | `bricks.js` |
| [Rally](https://laroccaconsulting.github.io/freegames/rally/) | [`games/rally`](games/rally) | Paddle tennis vs the computer or a friend | `rally.js` |
| [Flap](https://laroccaconsulting.github.io/freegames/flap/) | [`games/flap`](games/flap) | Tap to fly through the gaps | `flap.js` |
| [Drift](https://laroccaconsulting.github.io/freegames/drift/) | [`games/drift`](games/drift) | Fly, shoot, dodge the rocks | `drift.js` |
| [Pulse](https://laroccaconsulting.github.io/freegames/pulse/) | [`games/pulse`](games/pulse) | Tap to jump, hold to fly, feel the beat | `engine.js`, `levels.js`, `chunks.js`, `bot.js`/`proof.js` (beatability), `music.js` |
| [Dots and Boxes](https://laroccaconsulting.github.io/freegames/boxes/) | [`games/boxes`](games/boxes) | Close a box, go again | `boxes.js` (rules + chain-aware computer) |
| [Nine Men's Morris](https://laroccaconsulting.github.io/freegames/morris/) | [`games/morris`](games/morris) | Make mills, take pieces | `morris.js` (rules + alpha-beta) |
| [Backgammon](https://laroccaconsulting.github.io/freegames/backgammon/) | [`games/backgammon`](games/backgammon) | Race, hit and bear off against the computer | `engine.js`, `bot.js`, `board.js` |
| [Wand](https://laroccaconsulting.github.io/freegames/wand/) | [`games/wand`](games/wand) | Trace the shape, cast the spell | `recognizer.js`, `glyphs.js`, `levels.js`, `scene.js` |

## Docs

- [PLAN.md](PLAN.md): principles, roadmap (what's built, what's next), architecture,
  the "Every game has" checklist, and feature notes per game.
- [docs/DEVELOPING.md](docs/DEVELOPING.md): how to work on a game. Covers anatomy, the
  shared `core/` API, recipes, checking changes in a browser, gotchas and shipping.
- [CLAUDE.md](CLAUDE.md): the short rules list for AI sessions.

## Develop

No build step and no runtime dependencies. Plain HTML, CSS and ES modules.

```sh
npm run serve        # http://localhost:8080/games/sort/  (or: python3 -m http.server 8080)
npm test             # rules, hub and checklist tests (node:test)
```

## Add a game

```sh
node scripts/new-game.mjs sudoku "Sudoku"
node scripts/icons.mjs games/sudoku      # after drawing icons/icon.svg
node scripts/build-sw.mjs                # refresh offline cache lists
```

Shared code lives in `template/core/`; `node scripts/sync-core.mjs` copies it into every game.
Then add a card to `site/index.html` and a row to the table above (`tests/docs.test.js` checks).

## Deploy

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`: tests,
service-worker versions, then the hub at the root and each game at `/<folder>/`).

Corridors' optional online play is a small Cloudflare Worker in [`worker/`](worker/README.md), deployed separately with `wrangler`.

# Free Games — Plan

Free, beautiful, offline games for the things people usually play with an ad
after every round. No ads, no tracking, no accounts, no servers. Each game is a
static web app you can install to your home screen, and each one gets its own
cheap domain (or subdomain).

## Principles

1. **No ads, no trackers, no analytics, no accounts.** Nothing leaves the device.
2. **Fully offline after the first visit.** A service worker caches everything.
3. **Installable.** Web app manifest, proper icons, iOS meta tags, safe-area aware.
4. **Mobile-first, polished.** Big touch targets, drag *and* tap-to-move, smooth
   animations, light/dark themes, respects reduced motion.
5. **Zero running cost.** Static files only, deployable to any free static host.
   The one exception is Corridors' *optional* online play (see below): a tiny
   Worker on Cloudflare's free plan. The game never needs it, and it is hidden
   unless a server is configured.
6. **No build step.** Plain HTML/CSS/ES modules. Anyone can read, fork, or host it.
7. **Clean names.** Generic game names only — never a trademark (see below).

## How a game is picked

A good candidate meets all four:

| Test | Why |
|---|---|
| People put up with heavy ads for it today | The free version is a real improvement |
| Works 100% offline, no server | Free to run forever |
| No content to license or keep producing | The rules are the product |
| Evergreen search demand | People find it without marketing |

## How we stand out

"Free with no ads" earns trust but is not a reason to switch: clean clones of
Sudoku and 2048 already exist. Every game should use some of these, built once
in `template/core` so each new game gets them for free:

1. **Social without a server.** The puzzle lives in the link (`#d=2026-09-24&m=22`
   means "beat my 22 on today's puzzle"). Daily puzzles come from a date seed, so
   everyone gets the same one, with a spoiler-free result to share.
2. **Every game can be won, and we say so.** Winnable deals, no-guess boards,
   unique solutions. No luck, no dead ends.
3. **Hints that teach.** Explain why a move works, don't just make it.
4. **Built for older players.** Large print, no timers, no streak guilt, high contrast.
5. **Print it.** Print stylesheets for grid puzzles (teachers, activity coordinators).
6. **Puzzles you make yourself, shared by link.** For example, a teacher's word list becomes a word search link.
7. **No dark patterns.** No energy, no fake rewards, no nagging notifications.

### Puzzle golf

Ad-driven casual games (match-3, tile match, block and sort puzzles) run on
*hidden* randomness so they can sell boosters and revives. We remove it:

- **Nothing hidden.** Visible queues and see-through stacks: the game becomes a real puzzle.
- **A solver sets par**, the fewest moves possible, so every level is winnable
  and scoring is honest. Unlimited undo is fine because par is the challenge.
- **Help is free but marked.** Hints (💡) and extra space (🧪) are one tap away,
  never sold; results that used them can't be "Perfect".
- **Daily seed + share line**, e.g. `Pour · Daily #1 💎 / 22 moves · par 22 (par) / 🟩🟩🟩…`.

Shared pieces live in `template/core/golf.js` (seeds, dates, links, rating,
share text). Games in this family: Pour (sort puzzle), Trio (tile match), Blocks
(block puzzle), Gems (match-3 puzzle) and Slide (sliding blocks and tiles) are built.

Blocks is endless and scores points (higher is better), so its daily target
is a bot's score on the same 90 pieces: `golf.scoreRating` / `scoreSquares`.
The daily seed is re-rolled until the bot places every piece, so every daily
can be finished.

Par has to measure something a player can do better or worse. Pour counts
pours. In tile match every tile is tapped exactly once, so Trio scores the
**tray peak** (most tiles held at once). With the whole stack visible, the
solver can nearly always clear triple by triple, so par is usually 2–3: the
challenge is spotting free triples among many tiles, not deep planning.

**Visual bar:** these games should feel as rewarding as the ad-driven ones:
glow, particles, sound that climbs with combos, and a jackpot moment on a win.
The difference is that the rewards come from solving the puzzle, not from buying anything.
Themes are plug-ins (see `games/sort/js/themes.js`).

## Roadmap

### Wave 1 — Flagships (own domains)

| Game | Scope | Notes |
|---|---|---|
| **Solitaire** | Klondike (draw 1/3), Spider (1/2/4 suits), FreeCell | ✅ Built first — `games/solitaire/`. Card engine is reused by later card games |
| **Sudoku** | ✅ Built — `games/sudoku/`. Unique-solution generator; four levels graded by the hardest human technique needed (singles → pairs/pointing → hidden pairs, triples, X-Wing → beyond); hints name and explain the technique; notes, large print, print stylesheet, daily | No puzzle files to ship; generate on device (in a worker) |
| **Mahjong Solitaire** | ✅ Built — `games/mahjong/`. Turtle (144), Pyramid and Quick layouts; deals built backwards so every deal is winnable; winnable reshuffles; hints; daily deal | Tiles drawn as SVG in code with big corner indexes |

### Wave 2 — Quick wins (subdomains)

| Game | Notes |
|---|---|
| **Pour** (water sort) | ✅ Built — `games/sort/`. First puzzle-golf game: solver par, daily, share links, 4 themes |
| **Trio** (triple tile match) | ✅ Built — `games/trio/`. X-ray through the stack, every board winnable, par = lowest tray peak |
| **Blocks** (block puzzle) | ✅ Built — `games/blocks/`. Next hand always visible, daily 90 pieces vs a bot, Zen with no game over |
| **Minesweeper** | ✅ Built — `games/mines/`. Every board solvable by logic from the start square (solver checked against real mines), hints that explain the rule used, daily board, one take-back after a mine |
| **Word Search** | ✅ Built (in Words): daily and numbered 10×10 searches of common base words in eight directions, each word hidden exactly once, filler checked against the blocklist; drag or tap both ends. Still to do: custom word lists shared by link, printable |
| **Gems** (match-3 puzzle mode) | ✅ Built — `games/gems/`. Fixed boards, no refills, clear the board in par swaps |
| **Dots and Boxes** | ✅ Built — `games/boxes/`: 3×3 to 6×6, computer at three levels (Hard plays the double-dealing handout to keep control of chains), pass-and-play, undo. Still to do: a lesson on the chain rule |
| **Corridors** (wall-race board game) | ✅ Built — `games/corridors/`. Computer at three levels, pass-and-play for 2 or 4, optional online rooms by link |
| **Number Link** | Generated boards with a unique solution, daily |
| **Four in a Row** | ✅ Built — `games/four/`. Strong computer (three levels) whose hints explain why; pass and play; optional threat overlay |
| **Slide** (sliding blocks + tiles) | ✅ Built — `games/slide/`. Unblock (parking-lot puzzle) and 3×3 / 4×4 number tiles; solver-exact par, daily, levels |
| **Pulse** (one-tap rhythm platformer) | ✅ Built — `games/pulse/`. Five hand-made levels, daily and endless generated levels, practice mode; a bot proves every level beatable without frame-perfect timing |
| ~~2048~~ | Dropped: too many clean clones already, so nothing to stand out on |

### Wave 2½ — Words without a content treadmill

Crosswords normally need a steady stream of new clues. These formats don't:
they need only a **word list**, and the generator makes endless puzzles from
a seed (daily + share line, like the puzzle-golf games).

| Game | Notes |
|---|---|
| **Words** app | ✅ Built — `games/words/`: Codeword and Word Wheel share one word list (ENABLE + a public-domain common-words list, built by `scripts/build-words.mjs`, offensive words filtered) |
| **Codeword** (cipher crossword) | ✅ Built (in Words). Criss-cross grid of common words; the solver adds given letters until only one solution fits the full word list | A real crossword grid where every letter is a number. No clues at all. Solver proves a unique solution; a few letters given to start |
| **Word Wheel** | ✅ Built (in Words): nine letters, one in the middle; targets from common words, rarer words count as bonus. Was: seven letters, make words; one word uses all seven. Not "Spelling Bee" |
| **Word Grid** | ✅ Built (in Words): trace words through a 4×4 grid (drag or tap), grids with 25+ common words, points by length. Not "Boggle" |
| **Word Ladder** | ✅ Built (in Words): par is the shortest ladder through the whole word list (BFS); hints give the next word on a shortest path |
| **Fill-in** (criss-cross) | Given the word list, fit every word into the grid |
| **Mini crossword** (5×5) | Needs clues, so later: a one-time clue bank of ~5–10k common words that we own, drafted from Open English WordNet definitions (CC BY 4.0) and edited by hand. The generator fills a new grid each day from the fixed bank |

Word lists: **ENABLE** and **12dicts** (public domain), **SCOWL** (permissive).
Filter out slurs and profanity. Avoid scraped newspaper clue sets (copyrighted)
and raw Wiktionary text (CC BY-SA: share-alike would follow the data).
Shared code goes in one word module used by all of these games.

### Wave 2¾ — More generated logic puzzles

Every one is generated on the device with a unique solution, so they are
endless without shipping puzzle files. Simon Tatham's Portable Puzzle
Collection (MIT) is a good reference for generators and rules.

- **Logic** app ✅ Built — `games/logic/`: one app for these puzzles (modes share daily, saving, results). **Star Battle** ✅ (6×6, 8×8, 10×10 two-star; regions repaired until the solver proves one answer; automatic dots, hints). **Calcudoku** ✅ (4×4 to 6×6; random Latin square cut into cages, kept when the solver proves one answer; notes, hints). **Bridges** ✅ (7×7 to 10×12; islands grown as a tree of bridges, solver with bound propagation proves one answer; drag or tap to build). **Futoshiki** ✅ and **Skyscrapers** ✅ (4×4 to 6×6; shared Latin-square solver in `js/latin.js`, clues thinned while the answer stays unique within a small search budget; shared number-pad view)
- **Star Battle** (not "Queens"), **Calcudoku** (not "KenKen"), Kakuro, Futoshiki ✅, Skyscrapers ✅
- **Bridges** (Hashi), Slitherlink, Nurikabe, Light Up, Tents, Pipes
- More for Slide: Klotski-style blocks, box pushing

### Board, dice and arcade (vs. the computer, no content)

- **Reversi** (not "Othello") ✅ Built — `games/reversi/`: three levels (Hard searches ~1 s, solves the endgame), hints that explain corners and mobility, pass and play
- **Checkers** ✅ Built — `games/checkers/`: American rules (forced captures, multi-jumps, kings, 40-move draw), three levels, hints, board flips when you play Light
- **Mancala** ✅ Built — `games/mancala/`: Kalah rules, 3–6 seeds per pit, animated sowing, three levels, hints
- Nine Men's Morris, 9×9 Go
- **Code Breaker** (not "Mastermind") ✅ Built — `games/codebreaker/`: classic 4×6 and hard 5×8, par from a minimax solver, daily, shapes on every colour. **Fleet** (not "Battleship") ✅ Built — `games/fleet/`: battle the computer (three levels; Hard aims with a probability heat map) or the daily solo sea, sink every ship in fewer shots than the Hard computer (par)
- Dice ✅ Built — `games/dice/`: **Yacht** (the public-domain ancestor; solo, vs computer, pass and play; daily dice seeded per turn, roll and die so the computer's score on the same dice is the target) and **Ten Thousand** (vs computer or pass and play)
- Quick arcade: **Snake** ✅ Built — `games/snake/` (Classic, Wrap, Zen; three speeds; swipe/keys/arrow pad; smooth drawing between ticks), **Bricks** ✅ Built — `games/bricks/` (Breakout-style: seeded mirrored levels, tough bricks, wide/multi/slow power-ups, combos), **Rally** ✅ Built — `games/rally/` (paddle tennis: computer at three levels or two players on one phone, matches to 3/5/7/11), **Clusters** ✅ Built — `games/clusters/` (SameGame-style: (n−2)² scoring, clear bonus, playout target, daily + three sizes, undo), **Flood** ✅ Built — `games/flood/` (puzzle golf: beam-search par, daily, levels 8×8 → 18×18), **Flap** ✅ Built — `games/flap/` (one-tap flyer: seeded daily course the same for everyone, endless, medals; a bot proves courses flyable), **Drift** ✅ Built — `games/drift/` (space-rocks shooter: hold to steer and thrust, auto-fire, wrap-around field, waves, extra ships)

### Wave 3 — Bigger builds

| Game | Notes |
|---|---|
| **Chess vs. computer** | Low priority: lichess already does this free and well. Stockfish is GPL |
| **Jigsaw** | Public-domain art from Met / Rijksmuseum / Art Institute of Chicago open access |
| **Backgammon** | ✅ Built — `games/backgammon/`. Computer at three levels, pass-and-play, hits, doubles, bear-off, gammon/backgammon scoring |
| **Hearts, Spades, Dominoes, Checkers** | Offline vs. AI; reuse the solitaire card engine |
| **Nonograms / Picross** | Generated puzzles with unique-solution check |
| **Dice poker** (Yahtzee-style) | Must *not* be called Yahtzee |

### Avoid

- **Trademarked names or trade dress**: Tetris (very aggressive enforcement,
  including look-alikes), Wordle, Scrabble, Boggle, Yahtzee, Candy Crush, Uno,
  Bejeweled, Two Dots, Flow Free, Block Blast, 1010!, Zen Match, Blokus, Geometry Dash,
  KenKen (use "Calcudoku"), LinkedIn's Queens (the generic name is "Star Battle"),
  Connect Four (use "Four in a Row"; also avoid the blue grid with red and yellow
  discs), Rush Hour (use "Unblock"), Othello, Mastermind, Battleship, Spelling Bee.
  Build the genre under a generic name.
- **Anything needing a server**: online multiplayer, global leaderboards, cloud sync.
  Exception: Corridors' online rooms, because a two-player board game needs them.
  They run on Cloudflare's free plan, in `worker/`, and are strictly optional.
- **Content treadmills**: trivia, and crosswords that need new clues every day.
  Clue-free word puzzles and a fixed clue bank are fine (see Wave 2½).

## Architecture

```
template/              Starter app — copy this to begin a new game
  core/                Shared code, identical in every game (synced by script)
    base.css           Design tokens, light/dark themes, dialogs, toasts, buttons
    storage.js         Safe localStorage wrapper (never throws)
    settings.js        Persistent settings with change events
    ui.js              Dialogs, toasts, theme application
    sound.js           Tiny synthesized sound effects (Web Audio, no files)
    rng.js             Seeded RNG so every deal has a replayable number
    golf.js            Puzzle golf: daily seeds, share links, par rating, share text
    results.js         Slot-reel results card shared by the puzzle-golf games
    fx.js              Canvas particles: bursts, rings, fountains, floating text
    jewels.js          Glossy jewel shapes drawn in code
    pwa.js             Service worker registration + update notice
    hub.js             Back button to the games list, when opened from it; records recently played
    hallows.js         Autumn "Hallows" scenery (moon, castle, candles, bats, leaves); also copied to site/
  sw.js                Offline cache; file list + version generated by script
  manifest.webmanifest
  icons/               icon.svg → PNGs generated by script
site/                  The games list (hub): index.html, arcade.js (search, categories,
                       "Jump back in", saves every game for offline), hub service worker
games/<name>/          One self-contained, deployable static site per game
scripts/
  new-game.mjs         Copy the template into games/<name> and fill in names
  sync-core.mjs        Copy template/core into every game
  build-sw.mjs         Regenerate each game's precache list + content-hash version
  icons.mjs            Render icon.svg to PNG sizes with the preinstalled Chromium
tests/                 node:test unit tests for game rules (no dependencies)
worker/                Optional Corridors online server (Cloudflare Worker + Durable Object)
```

Each `games/<name>/` folder is a complete static site. It uses only relative
paths, so it works at a domain root *or* in a subfolder.

### Making a new game

```sh
node scripts/new-game.mjs sudoku "Sudoku"
# build the game in games/sudoku/
node scripts/icons.mjs games/sudoku       # after editing icons/icon.svg
node scripts/build-sw.mjs                 # before every deploy
```

### Release checklist (per game)

- [ ] Works offline (DevTools → Network → Offline, reload)
- [ ] Installs on Android Chrome and iOS Safari (Share → Add to Home Screen)
- [ ] Portrait and landscape on a small phone (360×640) and a tablet
- [ ] Light and dark themes; reduced-motion respected
- [ ] Progress survives closing the app mid-game
- [ ] `node scripts/build-sw.mjs` run so the cache version changed
- [ ] `node --test` passes
- [ ] Lighthouse PWA / accessibility pass

## Domains and hosting

- **Now: GitHub Pages.** `.github/workflows/pages.yml` runs the tests, refreshes the
  service-worker versions, and publishes on every push to `main`:
  - `https://laroccaconsulting.github.io/freegames/` — hub page (`site/`)
  - `https://laroccaconsulting.github.io/freegames/solitaire/` — each game in its own folder
  - One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
  - Limit: Pages allows one custom domain per repo, so per-game domains wait for Cloudflare.
- **Later: Cloudflare Pages.** One Cloudflare Pages project per game, each with build
  output directory `games/<name>` and its own custom domain. No build command needed
  (optionally `node scripts/build-sw.mjs`).
- **Domains:** own domains for flagships (Solitaire, Sudoku, Mahjong) where search
  matters most; everything else as subdomains of one umbrella domain
  (`minesweeper.<brand>.org`). Each subdomain still installs as its own app,
  and it keeps renewals down (~$15/yr each adds up across a dozen games).
- Pick a short umbrella brand and put a footer link on every game to the others.

## Solitaire — feature list (v1)

- Klondike (draw 1 or 3, standard scoring), Spider (1, 2 or 4 suits, classic
  scoring), FreeCell (Microsoft-compatible deal numbers 1–32000)
- Drag and drop **and** tap-to-move (picks the best legal destination)
- Unlimited undo, hints (repeat to cycle), auto-finish, optional auto-move of safe cards
- Numbered deals: replay a deal or enter a deal number
- Stats per game and mode: played, won, win rate, streaks, best time, fewest moves, best score
- Game in progress saved automatically and resumed on next launch
- Classic bouncing-card win celebration (skipped with reduced motion)
- Settings: theme, felt colour, card back, left-handed layout, sounds, timer/score display
- Keyboard shortcuts on desktop: `Z` / `Ctrl+Z` undo, `H` hint, `N` new game
- Responsive layout that sizes cards to any screen, portrait or landscape

### Ideas for later

- "Winnable deals only" for Klondike (needs a solver running in a Web Worker)
- Daily deal with a streak
- More variants: Pyramid ✅, TriPeaks ✅ and Golf ✅ (built as the separate **Peaks** app, `games/peaks/`: tap-to-play layouts, solver-checked winnable deals, Golf par from a search), Yukon, Forty Thieves
- Manifest screenshots for a richer Android install sheet

## Pour — feature list (v1)

- Water sort: pour the top run onto a matching colour or an empty tube
- Endless levels (3 → 12 colours), generated on device from a seed; an A* solver
  (in a Web Worker) proves each level solvable and sets par = fewest pours
- Daily puzzle (same for everyone), streaks, share line + link with your score as a challenge
- Unlimited undo, restart, hints from the solver (💡), one free extra tube (🧪)
- Canvas renderer: liquid stays level as tubes tip, pour stream, splashes, bubbles,
  stoppers, combo chimes that climb, win marquee + jackpot fountain, slot-reel results
- Themes as plug-ins: Neon, Aurora, Sunny, Calm (colour-blind safe, symbols on)
- Colour symbols, reduced motion, effects off, keyboard play, screen-reader announcements

## Trio — feature list (v1)

- Triple tile match: tap free tiles into a 7-slot tray; three of a kind clear
- Symmetric pyramid boards, generated from a seed; types dealt along a clearing
  order so every board is winnable; a solver sets par (lowest tray peak)
- X-ray (hold) shows through the stack; nothing is hidden
- Undo, restart, hints (💡), daily board, streaks, challenge links, slot-reel results
- Queued taps (tapped tiles go see-through at once, so fast play never drops a tap)
- Themes: Jewels (tiles drawn in code), Orchard and Garden (emoji), Calm (shape + colour)

## Blocks — feature list (v1)

- 8×8 board, hand of three, full rows and columns clear; streak and multi-line bonuses
- The next hand is always shown, so you can plan
- Daily: 90 pieces in the same order for everyone; beat the bot's score
- Classic (endless, best score) and Zen (no game over: the fullest lines clear
  themselves when stuck; undo and hints)
- Drag with a ghost and a preview of the lines that will clear; tap-to-place and keyboard too
- Clears ripple out from the piece with particles, shake and callouts; jackpot on a win
- Themes: Neon, Wood, Glass, Calm

## Gems — feature list (v1)

- Match-3 with nothing random: fixed boards, no refills; clear every gem
- Boards are built backwards from empty (each step un-clears a line and
  un-does a swap), so every board is solvable; a solver sets par (fewest swaps),
  often finding cascades shorter than the construction
- Swipe or tap to swap; cascades pop, fall with gravity and chain with rising chimes
- Undo, restart, hints, daily board, streaks, challenge links, slot-reel results
- Themes: Jewels (drawn), Sweets and Ocean (emoji), Calm (flat shapes)

### Ideas for later

- Ball-sort look (one ball per move) as a rules variant
- Harder shapes: 5-unit tubes, a single spare tube
- More themes (seasonal); theme packs anyone can contribute as a single object

## Corridors — feature list (v1)

- The wall-race board game under a generic name: 9×9 board, walls two squares long,
  jumps and diagonal side-steps; 2 players (10 walls each) or 4 (5 each)
- One pure rules engine (`js/engine.js`) shared by the UI, the bot and the online server
- Computer opponent in a Web Worker: Easy (wanders), Medium (one move deep),
  Hard (alpha-beta, iterative deepening, ~1 s); pick who goes first
- Pass-and-play for 2 or 4; undo; hints that explain themselves
  ("a wall here makes Red's route 3 steps longer"); steps-to-go shown for everyone
- Tap a groove to preview a wall, tap again to place it (a mouse click places at once);
  arrow keys move
- Online (optional, `worker/`): make a room, share the link; seats are kept by a random
  token in localStorage so refreshes reconnect; extra visitors watch; rematch
- Board turns so your pawn is always at the bottom in online games

### Ideas for later

- Bot seats in online rooms; move timers via DO alarms; a lobby of open rooms; replays

## Pulse — feature list (v1)

- The one-tap rhythm platformer under a generic name. Tap to jump, hold to keep jumping;
  cube, ship (hold to fly), ball (tap to flip) and wave (hold to zig, release to zag)
- Spikes, blocks, slabs, jump pads and orbs (yellow, pink, blue gravity), mode, gravity
  and speed portals, three coins per hand-made level
- Pure, deterministic physics at a fixed 240 Hz tick (`js/engine.js`), shared by the
  game, the bot and the tests
- A depth-first bot (`js/bot.js`) proves every level beatable, and *fair*: it finds a
  run where every press and release still works when made a little early or late
  (copies of the player with the mistimed input must survive too), so no jump needs
  frame-perfect timing. Hand-made levels give every input a 50 ms window (tested,
  with every coin); generated levels at least 33 ms
- Input is timestamped and applied at the tick it happened, not at the next frame,
  so timing is the same at 30, 60 or 120 fps
- Levels are built from chunks (`js/chunks.js`): five hand-made levels (Easy → Insane),
  a daily level (same for everyone, share line + challenge link with your attempts),
  and endless generated levels at four difficulties, shareable by link. Generated
  levels are re-rolled until the bot proves them fair (in a Web Worker; which
  re-roll worked is remembered)
- Practice mode: checkpoints drop by themselves (only once you have survived past
  them) or by hand; calm practice music; optional hitboxes
- "Watch a run": the bot plays the level for you, so you can see how it is done
- Music synthesized per level from a seed (tempo, key, chords, patterns) with Web
  Audio; the background, ground and orbs pulse on the beat
- Attempt counter in the level, progress bar with best, death explosion and restart,
  level-complete fireworks, colour changes between sections, parallax background
- Icon kit: six faces and twelve colours, drawn in code (our own designs, not the
  original's trade dress)

### Ideas for later

- A level editor with levels shared by link (the builder format is already compact)
- Slopes, saws, dash orbs, mini/mirror portals, a UFO mode
- Beat-synced level layouts (obstacles placed on the music's beats)

## The arcade (hub) — feature list

- One page lists every game; install it and the whole arcade is on your home screen
- **Every game works offline after one visit to the hub.** The hub registers each
  game's own service worker (`site/arcade.js`), so each game caches itself right
  away and keeps itself up to date, exactly as if it had been opened. A status line
  says when all games are saved. With Data Saver on, it asks first
- Search (`/` to focus, Enter opens the first match), category chips (Puzzles, Board,
  Cards, Arcade), and a "Jump back in" row of recently played games
- Phones get a launcher layout: three games to a row, one-line chips
- `tests/hub.test.js` fails if a game folder is missing from the list

## Four in a Row — feature list (v1)

- 7×6 (and 9×7) board; drop discs, first to line up four wins
- Pure rules engine (`js/engine.js`); saved games are rebuilt from the move list
- Computer in a Web Worker (`js/bot.js`): negamax with alpha-beta, a Zobrist
  transposition table, iterative deepening, centre-first ordering, and an
  evaluation that knows the odd/even threat rule. Easy (sometimes plays by feel),
  Medium (5 moves deep), Hard (about a second of search)
- Hints that teach: "wins", "blocks", "makes two threats at once", "you can force a
  win in N moves", and which columns to avoid because a disc there lets the
  opponent win on top of it
- Optional "Show threats" overlay: every empty space that would complete four
- Pass and play; who goes first (or take turns); undo; stats per level with streaks
- Discs: black and white stones by default, coral and gold as an option; Hallows theme

## Slide — feature list (v1)

- **Unblock**: 6×6 sliding blocks; get the gold block out through the gap.
  Levels are generated on the device: random layouts, then hill-climbing (change one
  block, keep it if the puzzle didn't get easier), then start the player exactly
  *par* moves from a solution. The whole position graph is searched, so par is exact
- **Tiles**: 3×3 and 4×4 number tiles; tap a tile in line with the gap to slide a
  row of them. Scrambled by a seeded random walk; IDA* (Manhattan distance plus
  linear conflicts) proves the exact par
- Daily Unblock puzzle (par 18), levels that ramp up to par 22, share line and
  challenge links (`#d=`, `#u=`, `#t=4-12`)
- Drag blocks, or tap a block to see where it can go; keyboard play too
- Hints from the solver, results marked as helped; generated puzzles cached

### Ideas for later

- Klotski-style blocks (2×2 key piece), box pushing, picture tiles from public-domain art
- Unblock par above 22 needs a faster generator (bitboards) or pre-made packs

## Hallows — the autumn theme

A wizarding, spooky autumn look shared by the hub and every game. All art is
drawn in code (no fonts, images or licensed material), and nothing from any
book or film is used: no names, crests, house colours, lightning bolts or logos.

- `core/hallows.js` draws the scenery behind the game: starry sky, harvest
  moon, a castle with lit windows on a hill of pines, floating candles, bats
  and falling leaves. Paused with Effects off; bats and leaves hidden with reduced motion.
- `base.css` `:root[data-theme='hallows']`: midnight-plum surfaces, candle-gold
  accent, parchment text, serif display font (Luminari → Palatino → Georgia).
- Canvas games: a `hallows` theme plug-in. Shapes in `core/jewels.js`: hat,
  pumpkin, bat, potion, moon, star, crystal orb, maple leaf, owl, cauldron,
  candle, key. New `leaves` particle style in `core/fx.js`. Minor-key chimes.
- Pulse: its canvas covers the page, so it draws its own night instead
  (`drawNight` in `js/render.js`): stars, a harvest moon, and pines and castles
  scrolling along the horizon, with night palettes in place of the level colours.
  Theme picker in Settings (Neon / Hallows).
- Solitaire: parchment faces and a crescent-moon card back. Corridors:
  flagstone board, candlelight walls. Both get it as a fourth theme option.
- **One switch for every game:** the hub's "Theme for every game" (Hallows /
  Classic) is saved in localStorage (`freegames:look`) and read by each game
  through `themeFor` in `core/hallows.js`. The newest choice wins: the hub
  switch applies to every game, and picking a theme inside a game afterwards
  overrides it for that game only. Classic keeps each game's own non-Hallows
  theme. It works while the games share the hub's site; a game on its own
  domain just uses its own setting.
- **Seasonal default:** with no choice anywhere, games show Hallows from
  1 September to 7 November (`isHallowsSeason`). Players who picked another
  theme in a game (and never used the hub switch) get a one-time toast.

---

## Sister project: `freeutilities` (separate repo, not started)

Same principles and template, for ad-supported utilities. Candidates, roughly by priority:

- **QR code scanner / generator** — app-store QR apps are notoriously ad/tracker heavy
- **PDF tools** (merge, split, rotate, compress) — on-device, files never uploaded
- **Guitar tuner + metronome** — Web Audio
- **White noise / sleep sounds** — synthesized, no audio licensing
- **Interval / workout / pomodoro timers**, board-game scorekeeper, dice roller
- **Recipe keeper** — clean offline recipe box, no life stories

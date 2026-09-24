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
(block puzzle) and Gems (match-3 puzzle) are built.

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
| **Sudoku** | Generator with unique-solution check, 4 difficulties, pencil marks, daily puzzle | No puzzle files to ship; generate on device |
| **Mahjong Solitaire** | Several layouts, shuffle, hint, solvable-deal generation | Tiles drawn as SVG; generate deals backwards so every deal is winnable |

### Wave 2 — Quick wins (subdomains)

| Game | Notes |
|---|---|
| **Pour** (water sort) | ✅ Built — `games/sort/`. First puzzle-golf game: solver par, daily, share links, 4 themes |
| **Trio** (triple tile match) | ✅ Built — `games/trio/`. X-ray through the stack, every board winnable, par = lowest tray peak |
| **Blocks** (block puzzle) | ✅ Built — `games/blocks/`. Next hand always visible, daily 90 pieces vs a bot, Zen with no game over |
| **Minesweeper** | No-guess boards by default, plus "why is this safe?" |
| **Word Search** | Custom word lists shared by link, printable |
| **Gems** (match-3 puzzle mode) | ✅ Built — `games/gems/`. Fixed boards, no refills, clear the board in par swaps |
| **Dots and Boxes** | Strong AI that teaches the chain rule; pass-and-play |
| **Number Link** | Generated boards with a unique solution, daily |
| ~~2048~~ | Dropped: too many clean clones already, so nothing to stand out on |

### Wave 3 — Bigger builds

| Game | Notes |
|---|---|
| **Chess vs. computer** | Low priority: lichess already does this free and well. Stockfish is GPL |
| **Jigsaw** | Public-domain art from Met / Rijksmuseum / Art Institute of Chicago open access |
| **Hearts, Spades, Dominoes, Checkers, Backgammon** | Offline vs. AI; reuse the solitaire card engine |
| **Nonograms / Picross** | Generated puzzles with unique-solution check |
| **Dice poker** (Yahtzee-style) | Must *not* be called Yahtzee |

### Avoid

- **Trademarked names or trade dress**: Tetris (very aggressive enforcement,
  including look-alikes), Wordle, Scrabble, Boggle, Yahtzee, Candy Crush, Uno,
  Bejeweled, Two Dots, Flow Free, Block Blast, 1010!, Zen Match, Blokus,
  KenKen (use "Calcudoku"), LinkedIn's Queens (the generic name is "Star Battle").
  Build the genre under a generic name.
- **Anything needing a server**: online multiplayer, global leaderboards, cloud sync.
- **Content treadmills**: crosswords, trivia — they need a constant supply of new content.

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
  sw.js                Offline cache; file list + version generated by script
  manifest.webmanifest
  icons/               icon.svg → PNGs generated by script
games/<name>/          One self-contained, deployable static site per game
scripts/
  new-game.mjs         Copy the template into games/<name> and fill in names
  sync-core.mjs        Copy template/core into every game
  build-sw.mjs         Regenerate each game's precache list + content-hash version
  icons.mjs            Render icon.svg to PNG sizes with the preinstalled Chromium
tests/                 node:test unit tests for game rules (no dependencies)
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
- More variants: Pyramid, TriPeaks, Golf, Yukon, Forty Thieves
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

---

## Sister project: `freeutilities` (separate repo, not started)

Same principles and template, for ad-supported utilities. Candidates, roughly by priority:

- **QR code scanner / generator** — app-store QR apps are notoriously ad/tracker heavy
- **PDF tools** (merge, split, rotate, compress) — on-device, files never uploaded
- **Guitar tuner + metronome** — Web Audio
- **White noise / sleep sounds** — synthesized, no audio licensing
- **Interval / workout / pomodoro timers**, board-game scorekeeper, dice roller
- **Recipe keeper** — clean offline recipe box, no life stories

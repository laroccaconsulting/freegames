# Developing

How to work on the games. Read [PLAN.md](../PLAN.md) for the why (principles,
roadmap, per-game feature notes); this file is the how. The game list with
each game's key files is in the [README](../README.md#games).

## Setup

Nothing to install. Node 22 runs the tests and scripts. Serve the repo root
for local play:

```sh
npm run serve                      # or: python3 -m http.server 8080
# http://localhost:8080/games/<folder>/   and   http://localhost:8080/site/
```

The games list at `site/` links to `<folder>/` siblings, which only exist in the
deployed layout. To click through from the list locally, assemble it the way
the Pages workflow does: copy `site/.` and each `games/<folder>` into one
directory and serve that.

## Anatomy of a game

```
games/<folder>/
  index.html            Top bar, board element, tool buttons; loads app.js
  app.css               Game styles; theme blocks such as :root[data-theme='hallows']
  app.js                Screen, input, saving, dialogs, achievements (the glue)
  achievements.js       Plain data: [{ id, title, desc, goal?, secret? }]
  js/                   Rules and helpers. Rules are pure (no DOM) and tested
  core/                 COPY of template/core. Never edit here
  sw.js                 Offline cache; list + version written by build-sw
  manifest.webmanifest, icons/
```

Rules live in `js/*.js` and take/return plain data, so `tests/<game>.test.js`
can import them under Node. Heavy work (solvers, generators, computer
players) runs in a module worker (`js/worker.js` or `js/bot-worker.js`) with
a same-thread fallback; see `run()` in `games/sort/app.js` for the pattern.

Bigger apps hold several modes behind one shell:
- **Logic**: `js/modes.js` registers each puzzle (`<mode>.js` rules +
  `<mode>-view.js` view); `app.js` handles daily, saving and results for all.
- **Words**: one word list (`js/dict.js`, built by `scripts/build-words.mjs`)
  shared by Codeword, Wheel, Ladder, Grid and Search.
- **Solitaire, Peaks, Hearts, Spades**: card rendering in `js/cards.js` +
  `js/art.js` (copied per game, not shared through core).

## The shared core (`template/core/`)

Edit only in `template/core/`, then `node scripts/sync-core.mjs` copies it to
every game (and `hallows.js` to `site/`).

| File | What you use |
|---|---|
| `storage.js` | `makeStore('<slug>')` → `get(key, fallback)`, `set`, `remove`. Keys are `<slug>:<key>` in localStorage; never throws |
| `settings.js` | `makeSettings(store, defaults)` → `get`, `set`, `onChange(fn)` |
| `ui.js` | `el(tag, attrs, ...children)`, `openDialog({ title, body, actions })` (resolves to the picked value), `toast(msg, { duration, action, position: 'top' })` (`duration: 0` stays up), `hideToast()`, `applyTheme`, `watchSystemTheme`, `offerHallows`, `segmented`, `toggle`, `formatTime` |
| `hallows.js` | Seasonal look: `themeFor(picked, pickedAt, normal)`, `onLookChange(fn)`, `isHallowsSeason()`; draws the autumn scenery |
| `achievements.js` | `makeAchievements('<slug>', ACHIEVEMENTS)` → `unlock(id)`, `add(id, n = 1)`, `at(id, value)`, `has(id)`, `open()` |
| `golf.js` | Puzzle golf: `dailySeed`, `dateKey`, `dailyNumber`, `dailyStreak`, `rating(moves, par)`, `squares`, `shareText`, `parseHash`/`buildHash` share links |
| `results.js` | `showResults({...})`: the slot-reel results card |
| `rng.js` | `mulberry32(seed)`, `shuffle(array, random)`, `randomSeed()` |
| `sound.js` | `sounds.*`, `tone`, `noiseBurst`, `setSoundEnabled` (Web Audio, no files) |
| `fx.js`, `jewels.js` | Canvas particles; glossy jewel shapes |
| `icons.js` | `icon(name)`, `medal(name)`, `withIcon(name, text)`: inline SVG line icons |
| `hub.js` | `addHubLink()`: back button to the games list |
| `pwa.js` | `registerServiceWorker({ onUpdateReady })` |

## Recipes

**Change a game's rules.** Edit `js/<rules>.js`, add or adjust a case in
`tests/<game>.test.js`, run `npm test`.

**Add an achievement.** Append `{ id, title, desc }` (plus `goal` for counts,
`secret: true` to hide it) to the game's `achievements.js`, then call
`ach.unlock/add/at('<id>')` where it's earned. Ids are save keys: never rename
or reuse one. `tests/achievements.test.js` fails if an id is never used.

**Add a theme or season.** CSS games: add a `:root[data-theme='<id>']` block
of variables in `app.css` and an option in the Settings segmented control.
Canvas games with a theme plug-in list (`js/themes.js` in Pour, Trio, Gems,
Blocks): append an object as the file's header describes. Seasons are
planned in PLAN.md ("Seasons (planned)"); Hallows is the model to copy.

**Add a mode to Logic.** Write `js/<mode>.js` (generator with a uniqueness
check, rules, hint) and `js/<mode>-view.js`, register it in `js/modes.js`,
add achievements, test the generator in `tests/logic-<mode>.test.js`.

**Add a game.** `node scripts/new-game.mjs <folder> "Name"` (starts compliant
with "Every game has" in PLAN.md), draw `icons/icon.svg`, run
`node scripts/icons.mjs games/<folder>`, add its card and icon to
`site/index.html` / `site/`, add a row to the README table, add a roadmap
note in PLAN.md. Never use a trademarked name (see "Avoid" in PLAN.md).

**Fixed content (e.g. Nonograms pictures).** Progress is saved by index, so
only append; never reorder or remove.

## After every change

```sh
node scripts/sync-core.mjs     # only if template/core changed
node scripts/build-sw.mjs      # always: offline cache lists + site/achievements.js
npm test
```

## Checking a change in a browser

`scripts/shot.mjs` opens a page in headless Chromium, runs an optional
script, saves a screenshot and prints page errors:

```sh
node scripts/shot.mjs http://localhost:8080/games/sort/ shot.png 390 780 steps.js
```

Phone size (390×780) is the main target; check a wide size too. For hard to
reach states (a dead end, a near win, a gallery full of solves), write the
saved game into localStorage (`<slug>:game` and friends) from the script and
`page.reload()`, rather than clicking through long sequences. Rules modules
can be imported in-page (`await import('./js/rules.js')`) to compute such
states.

## Gotchas

- Paths are relative everywhere: a game must work at a domain root and in a subfolder.
- A hash-only link (`#p=12`) doesn't reload the page; listen for `hashchange`.
- `let` state used by a function that runs at startup must be declared above that call (temporal dead zone).
- Workers can fail to start (old browsers, file://); keep the same-thread fallback and avoid long solves on the main thread.
- Daily puzzles must be seeded from the date only (`dailySeed`), so everyone gets the same one; budgets are node counts, not time, so every device agrees.
- `games/corridors/js/engine.js` is bundled into `worker/`: no browser APIs there.
- Full-screen layouts use `var(--app-height)`, never `100dvh`: some browsers (Android installed apps) count the navigation bar in `100dvh`, so the page scrolls. `core/ui.js` sets it to the measured window height. Boards sized in JS should measure what they drew and shrink to fit (see `size()` in Nonograms), not trust an estimate; landscape side-panel layouts must cap the board by width too.
- Top bars are crowded on phones: keep subtitles short; the trophy button is compact by design.

## Shipping

Work on a branch, then PR to `main` and merge; merging deploys to GitHub
Pages within a couple of minutes. Before pushing: build-sw, `npm test`, and
a headless check of any changed screen with no page errors.

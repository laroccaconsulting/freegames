# Free Games

Classic games without the ads: no tracking, no accounts, and they work offline.
Each game is a static web app you can install to your home screen.

| Game | Folder | Live |
|---|---|---|
| Solitaire (Klondike, Spider, FreeCell) | [`games/solitaire`](games/solitaire) | https://laroccaconsulting.github.io/freegames/solitaire/ |
| Corridors (wall-race board game) | [`games/corridors`](games/corridors) | https://laroccaconsulting.github.io/freegames/corridors/ |

See [PLAN.md](PLAN.md) for the roadmap, principles and architecture.

## Develop

No build step and no dependencies. Plain HTML, CSS and ES modules.

```sh
npm run serve        # http://localhost:8080/games/solitaire/
npm test             # rules engine tests (node:test)
```

## Add a game

```sh
node scripts/new-game.mjs sudoku "Sudoku"
node scripts/icons.mjs games/sudoku      # after drawing icons/icon.svg
node scripts/build-sw.mjs                # refresh offline cache lists
```

Shared code lives in `template/core/`; `node scripts/sync-core.mjs` copies it into every game.

## Deploy

Pushing to `main` deploys to GitHub Pages (enable **Settings → Pages → Source: GitHub Actions** once).

Corridors' optional online play is a small Cloudflare Worker in [`worker/`](worker/README.md), deployed separately with `wrangler`.

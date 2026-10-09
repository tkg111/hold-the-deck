# Hold the Deck

A Grow Castle-style idle defense game. Defend your pirate ship from waves of
drowned sailors, iron crabs, storm harpies, keg runners, barnacle knights,
sirens and the Kraken with a crew of heroes found in treasure chests. Free to play: no real money, no ads, no timers.

**Play:** https://tkg111.github.io/hold-the-deck/

Built with [Phaser 3](https://phaser.io/) and [Vite](https://vite.dev/). Art
is placeholder shapes for now; progress auto-saves in your browser.

## Development

```bash
npm install
npm run dev       # dev server at http://localhost:5173 (dev-only test buttons included)
npm run build     # production build in dist/
npm run preview   # serve the production build
npm run sim       # headless auto-play balance simulation (see DESIGN.md)
```

Every push to `main` builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml`.

## Docs

- [DESIGN.md](DESIGN.md): how the game works (loop, heroes, enemies, chests,
  saving).
- [CLAUDE.md](CLAUDE.md): project rules and conventions.
- All balance numbers live in [src/config.js](src/config.js).

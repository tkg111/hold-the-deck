# Hold the Deck

Grow Castle-style idle defense game with a pirate theme (originally "Kampung
Defense"; only the save key keeps the old name). Phaser 3 + Vite, deployed to
GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
Game title: `GAME_TITLE` in `src/config.js` and `<title>` in `index.html`.

## Rules

- **After each feature, update DESIGN.md to match.** The design doc must
  describe how the game actually works now, including decisions made while
  building (new mechanics, changed rules, new screens, reward sources).
- All balance and presentation numbers live in `src/config.js`. Don't hardcode
  tunable values elsewhere. Numbers quoted in DESIGN.md should match config.
- The localStorage key stays `kampung-defense/save` so existing saves keep loading.
- Changing the saved shape (`Progress.toSave()`) means bumping `SAVE_VERSION`
  in `src/systems/Save.js` and adding a migration from the previous version.

## Conventions

- The base resolution is 480x270 art pixels, shown at the largest whole-number
  scale that fits the window. Layout uses 960x540 logical units (`DISPLAY` in
  config, 2 per art pixel; sprites are drawn at `SPRITES.scale`). Battle scene
  positions come from `public/sprites/layout.json` (see `src/layout.js`).
  Every scene must call `applyRenderScale(this)` first
  in `create()` (see `src/display.js`).
- Dev-only tools live in `src/dev/` and are loaded via a dynamic import behind
  `import.meta.env.DEV`, so they never ship in production builds.
- Stop the dev server before running `npm ci` on Windows (it locks a native
  binary in `node_modules`).

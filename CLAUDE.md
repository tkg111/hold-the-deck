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

- The base resolution is 480x270 pixels (`DISPLAY` in config). The game area
  is always 480 wide, scaled (fractionally) to the window's width, and 270
  (16:9) to 360 (4:3) tall, with bars outside that range (`src/display.js`).
  Its size is `scene.view`, updated with a `view-resize` scene event, so
  anchor UI to its edges rather than to 480x270. All positions, sizes,
  distances and speeds are in these pixels, and sprites and text are drawn at
  1x. Battle scene positions come from `public/sprites/layout.json` (see
  `src/layout.js`).
  Every scene must call `applyRenderScale(this)` first
  in `create()` (see `src/display.js`); full-view backdrops use `fillView()`.
- UI uses the kit in `src/ui/kit.js`: create text with its `text()` (bitmap
  fonts from `public/sprites/ui/fonts/`, unscaled, snapped to whole pixels),
  never `scene.add.text`. Use the light fonts on wood, wood buttons and over
  the scene, and the dark ones on parchment and gold buttons.
- Dev tools live in `src/dev/` and are loaded via a dynamic import behind
  `DEV_TOOLS` (`src/devFlag.js`): always in dev builds, and on the live site
  only when the URL has `?dev`, so players don't see them.
- Stop the dev server before running `npm ci` on Windows (it locks a native
  binary in `node_modules`).

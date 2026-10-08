import { ENEMIES, SHIP, SPRITES } from './config.js';
import { initLayout, LAYOUT } from './layout.js';

export const SHIP_SLOTS_KEY = 'ship_slots';
const ANIMATIONS_KEY = 'animations';
const LAYOUT_KEY = 'layout';
export const BACKGROUND_KEY = 'bg';
export const FOREGROUND_KEY = 'fg_sheet';
export const FOREGROUND_ANIM = 'fg_loop';
export const SPLASH_ANIM = 'kraken_splash';

export const shipStageKey = (decks) => `ship_stage${decks}`;
export const shipFrontKey = (decks) => `ship_stage${decks}_front`;

// Characters in the game are animated from <name>_sheet.png; the single
// <name>.png is still used for hero cards.
export const sheetKey = (name) => `${name}_sheet`;
export const animKey = (name, anim) => `${name}_${anim}`;

// Load every sprite the game uses. Textures are global, so loading once in the
// first scene makes them available everywhere. animations.json gives each
// sheet's frame size, so the sheets are queued once it has loaded.
export function preloadSprites(scene) {
  const load = scene.load;
  load.setPath(`${import.meta.env.BASE_URL}${SPRITES.path}`);
  for (let d = 1; d <= SHIP.maxDecks; d++) {
    load.image(shipStageKey(d), `${shipStageKey(d)}.png`);
    load.image(shipFrontKey(d), `${shipFrontKey(d)}.png`);
  }
  load.json(SHIP_SLOTS_KEY, `${SHIP_SLOTS_KEY}.json`);
  for (const { key } of Object.values(SPRITES.heroes)) load.image(key, `${key}.png`);
  for (const def of Object.values(ENEMIES)) if (def.sprite) load.image(def.sprite, `${def.sprite}.png`);
  load.image(BACKGROUND_KEY, `${BACKGROUND_KEY}.png`);
  const splash = SPRITES.krakenSplash;
  load.spritesheet(splash.key, `${splash.key}.png`, { frameWidth: splash.frameWidth, frameHeight: splash.frameHeight });
  // The foreground sheet's frames are each the size of the scene.
  load.json(LAYOUT_KEY, `${LAYOUT_KEY}.json`);
  load.once(`filecomplete-json-${LAYOUT_KEY}`, (key, type, data) => {
    load.spritesheet(FOREGROUND_KEY, `${FOREGROUND_KEY}.png`, { frameWidth: data.size[0], frameHeight: data.size[1] });
  });
  load.json(ANIMATIONS_KEY, `${ANIMATIONS_KEY}.json`);
  load.once(`filecomplete-json-${ANIMATIONS_KEY}`, (key, type, data) => {
    for (const [name, { frameWidth, frameHeight }] of Object.entries(data)) {
      load.spritesheet(sheetKey(name), `${sheetKey(name)}.png`, { frameWidth, frameHeight });
    }
  });
}

// Read layout.json and register every animation: animations.json's as
// "<name>_<anim>", plus the foreground loop and the Kraken's splash.
export function createAnimations(scene) {
  initLayout(scene.cache.json.get(LAYOUT_KEY));
  if (!scene.anims.exists(FOREGROUND_ANIM)) {
    scene.anims.create({
      key: FOREGROUND_ANIM,
      frames: scene.anims.generateFrameNumbers(FOREGROUND_KEY, { start: 0, end: LAYOUT.foreground.frames - 1 }),
      frameRate: LAYOUT.foreground.fps,
      repeat: -1,
    });
  }
  const splash = SPRITES.krakenSplash;
  if (!scene.anims.exists(SPLASH_ANIM)) {
    scene.anims.create({
      key: SPLASH_ANIM,
      frames: scene.anims.generateFrameNumbers(splash.key, { start: 0, end: splash.frames - 1 }),
      frameRate: splash.fps,
      repeat: -1,
    });
  }
  const data = scene.cache.json.get(ANIMATIONS_KEY);
  for (const [name, { frameWidth, frameHeight, ...anims }] of Object.entries(data)) {
    for (const [anim, { frames, fps, repeat }] of Object.entries(anims)) {
      const key = animKey(name, anim);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheetKey(name), { frames }),
        frameRate: fps,
        repeat,
      });
    }
  }
}

// The animation "<name>_<anim>" if animations.json defines it, else null.
export function findAnim(scene, name, anim) {
  const key = animKey(name, anim);
  return scene.anims.exists(key) ? key : null;
}

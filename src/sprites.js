import { ENEMIES, SHIP, SPRITES } from './config.js';

export const SHIP_SLOTS_KEY = 'ship_slots';
const ANIMATIONS_KEY = 'animations';

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
  load.json(ANIMATIONS_KEY, `${ANIMATIONS_KEY}.json`);
  load.once(`filecomplete-json-${ANIMATIONS_KEY}`, (key, type, data) => {
    for (const [name, { frameWidth, frameHeight }] of Object.entries(data)) {
      load.spritesheet(sheetKey(name), `${sheetKey(name)}.png`, { frameWidth, frameHeight });
    }
  });
}

// Register every animation in animations.json as "<name>_<anim>" (once per game).
export function createAnimations(scene) {
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

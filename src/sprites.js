import { ENEMIES, SHIP, SPRITES } from './config.js';

export const SHIP_SLOTS_KEY = 'ship_slots';

export const shipStageKey = (decks) => `ship_stage${decks}`;
export const shipFrontKey = (decks) => `ship_stage${decks}_front`;

// Load every sprite the game uses. Textures are global, so loading once in the
// first scene makes them available everywhere.
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
  load.setPath();
}

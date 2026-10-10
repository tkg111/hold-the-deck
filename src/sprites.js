import { ENEMIES, FX, MAP, SHIP, SPRITES, STORM } from './config.js';
import { initLayout, LAYOUT } from './layout.js';
import { preloadUi } from './ui/kit.js';
import { versioned } from './version.js';

export const SHIP_SLOTS_KEY = 'ship_slots';
// Character sheets and their animations: crew in animations.json, enemies
// in animations_new_enemies.json (which also has the Ghost Galleon's gunPorts).
const ANIMATION_FILES = ['animations', 'animations_new_enemies'];
const FX_JSON_KEY = 'fx_list';
const LAYOUT_KEY = 'layout';
export const BACKGROUND_KEY = 'bg_tall';  // bg.png's picture with more sky and sea (see SCENERY)
export const FOREGROUND_KEY = 'fg_sheet';
export const FOREGROUND_ANIM = 'fg_loop';
export const SPLASH_ANIM = 'kraken_splash';

export const shipStageKey = (decks) => `ship_stage${decks}`;
export const shipFrontKey = (decks) => `ship_stage${decks}_front`;

// Characters in the game are animated from <name>_sheet.png; the single
// <name>.png is still used for hero cards.
export const sheetKey = (name) => `${name}_sheet`;
export const animKey = (name, anim) => `${name}_${anim}`;
// Effect sheets from fx/fx.json: texture and animation key per name.
export const fxKey = (name) => `fx_${name}`;

// The finale's storm (storm/storm.json and the images it names; see
// src/storm.js) and the world map (map/map.json and its images; see
// MapScene): texture keys and JSON cache keys.
export const STORM_JSON_KEY = 'storm';
export const stormKey = (name) => `storm_${name}`;
export const MAP_JSON_KEY = 'map';
export const mapKey = (name) => `map_${name}`;

function preloadStorm(load) {
  load.json(STORM_JSON_KEY, `${STORM.path}storm.json`);
  load.once(`filecomplete-json-${STORM_JSON_KEY}`, (key, type, spec) => {
    load.image(stormKey('clouds'), `${STORM.path}${spec.clouds.file}`);
    for (const name of ['rain', 'lightning']) {
      const { file, frameWidth, frameHeight } = spec[name];
      load.spritesheet(stormKey(name), `${STORM.path}${file}`, { frameWidth, frameHeight });
    }
  });
}

function preloadMap(load) {
  load.image(mapKey('bg'), `${MAP.path}map_bg.png`);
  load.image(mapKey('flag'), `${MAP.path}flag_cleared.png`);
  load.json(MAP_JSON_KEY, `${MAP.path}map.json`);
  load.once(`filecomplete-json-${MAP_JSON_KEY}`, (key, type, data) => {
    for (const island of data.islands) load.image(mapKey(island.id), `${MAP.path}${island.image}`);
    const { frameWidth, frameHeight } = data.shipToken;
    load.spritesheet(mapKey('ship_token'), `${MAP.path}ship_token_sheet.png`,
      { frameWidth, frameHeight: frameHeight ?? frameWidth });
  });
}

// Load every sprite the game uses. Textures are global, so loading once in the
// first scene makes them available everywhere. animations.json gives each
// sheet's frame size, so the sheets are queued once it has loaded.
export function preloadSprites(scene) {
  const load = scene.load;
  // Version every file's URL as it's queued (once: the loader outlives a
  // scene restart).
  if (!load.versioned) {
    load.versioned = true;
    load.on('addfile', (key, type, loader, file) => { file.url = versioned(file.url); });
  }
  load.setPath(`${import.meta.env.BASE_URL}${SPRITES.path}`);
  for (let d = 1; d <= SHIP.maxDecks; d++) {
    load.image(shipStageKey(d), `${shipStageKey(d)}.png`);
    load.image(shipFrontKey(d), `${shipFrontKey(d)}.png`);
  }
  load.json(SHIP_SLOTS_KEY, `${SHIP_SLOTS_KEY}.json`);
  for (const { key } of Object.values(SPRITES.heroes)) load.image(key, `${key}.png`);
  for (const def of Object.values(ENEMIES)) {
    if (def.sprite && !def.sheetOnly) load.image(def.sprite, `${def.sprite}.png`);
  }
  load.image(BACKGROUND_KEY, `${BACKGROUND_KEY}.png`);
  const splash = SPRITES.krakenSplash;
  load.spritesheet(splash.key, `${splash.key}.png`, { frameWidth: splash.frameWidth, frameHeight: splash.frameHeight });
  // The foreground sheet's frames are each the size of the scene.
  load.json(LAYOUT_KEY, `${LAYOUT_KEY}.json`);
  load.once(`filecomplete-json-${LAYOUT_KEY}`, (key, type, data) => {
    load.spritesheet(FOREGROUND_KEY, `${FOREGROUND_KEY}.png`, { frameWidth: data.size[0], frameHeight: data.size[1] });
  });
  preloadUi(scene);
  // Projectile, impact, status and ability effects: fx/fx.json gives each
  // sheet's file and frame size.
  load.json(FX_JSON_KEY, `${FX.path}fx.json`);
  load.once(`filecomplete-json-${FX_JSON_KEY}`, (key, type, data) => {
    for (const [name, { file, frameWidth, frameHeight }] of Object.entries(data)) {
      load.spritesheet(fxKey(name), `${FX.path}${file}`, { frameWidth, frameHeight });
    }
  });
  preloadStorm(load);
  preloadMap(load);
  for (const file of ANIMATION_FILES) {
    load.json(file, `${file}.json`);
    load.once(`filecomplete-json-${file}`, (key, type, data) => {
      for (const [name, { frameWidth, frameHeight }] of Object.entries(data)) {
        load.spritesheet(sheetKey(name), `${sheetKey(name)}.png`, { frameWidth, frameHeight });
      }
    });
  }
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
  // Effects with more than one frame animate as fx_<name>; repeat 0 ones
  // play once and hold their last frame.
  for (const [name, { frames, fps, repeat }] of Object.entries(scene.cache.json.get(FX_JSON_KEY))) {
    const key = fxKey(name);
    if (frames < 2 || scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }),
      frameRate: fps,
      repeat,
    });
  }
  const sheets = ANIMATION_FILES.flatMap((file) => Object.entries(scene.cache.json.get(file) ?? {}));
  for (const [name, { frameWidth, frameHeight, ...anims }] of sheets) {
    for (const [anim, spec] of Object.entries(anims)) {
      const key = animKey(name, anim);
      // Skip extra data (gunPorts) and animations already made.
      if (!spec?.frames || scene.anims.exists(key)) continue;
      const { frames, fps, repeat } = spec;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheetKey(name), { frames }),
        frameRate: fps,
        repeat,
      });
    }
  }
}

// A character sheet's entry in the animation files (frame size, animations
// and any extra data such as the Ghost Galleon's gunPorts), or null.
export function sheetSpec(scene, name) {
  for (const file of ANIMATION_FILES) {
    const spec = scene.cache.json.get(file)?.[name];
    if (spec && !Array.isArray(spec)) return spec;
  }
  return null;
}

// The animation "<name>_<anim>" if the animation files define it, else null.
export function findAnim(scene, name, anim) {
  const key = animKey(name, anim);
  return scene.anims.exists(key) ? key : null;
}

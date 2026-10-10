import { ASHFALL, ENEMIES, FX, ISLANDS, MAP, SHIP, SPRITES, STORM } from './config.js';
import { initLayout, LAYOUT } from './layout.js';
import { preloadUi } from './ui/kit.js';
import { versioned } from './version.js';

export const SHIP_SLOTS_KEY = 'ship_slots';
// Character sheets and their animations (key: the JSON's cache key, dir: the
// folder of it and its sheets): crew in animations.json, enemies in
// animations_new_enemies.json (which also has the Ghost Galleon's gunPorts)
// and Ember Isle's in ember/animations_ember.json (with the Molten
// Leviathan's mouth and position).
const ANIMATION_FILES = [
  { key: 'animations', dir: '' },
  { key: 'animations_new_enemies', dir: '' },
  { key: 'animations_ember', dir: 'ember/' },
];
// Effect sheet lists: fx/fx.json, and Ember Isle's ember/fx/fx_ember.json.
const FX_FILES = [
  { key: 'fx_list', dir: FX.path, file: 'fx.json' },
  { key: 'fx_ember', dir: 'ember/fx/', file: 'fx_ember.json' },
];
const LAYOUT_KEY = 'layout';
const BACKGROUND_KEY = 'bg_tall';  // bg.png's picture with more sky and sea (see SCENERY)
const FOREGROUND_KEY = 'fg_sheet';
export const SPLASH_ANIM = 'kraken_splash';

// The battle backdrop of an island (ISLANDS entry): its own scenery, or
// Skull Cove's. bg: the tall background's texture key; fg: the foreground
// sheet's; anim: the foreground loop.
export function sceneryKeys(island) {
  const id = island?.scenery ? island.id : null;
  return id
    ? { bg: `bg_${id}`, fg: `fg_${id}`, anim: `fg_loop_${id}` }
    : { bg: BACKGROUND_KEY, fg: FOREGROUND_KEY, anim: 'fg_loop' };
}
// Ember Isle's falling ash sheet (ASHFALL).
export const ASH_KEY = 'ash';

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
  for (const island of ISLANDS) {
    if (island.scenery) load.image(sceneryKeys(island).bg, `${island.scenery.path}${island.scenery.bg}.png`);
  }
  load.spritesheet(ASH_KEY, `${ASHFALL.path}${ASHFALL.file}`, { frameWidth: ASHFALL.frameWidth, frameHeight: ASHFALL.frameHeight });
  const splash = SPRITES.krakenSplash;
  load.spritesheet(splash.key, `${splash.key}.png`, { frameWidth: splash.frameWidth, frameHeight: splash.frameHeight });
  // The foreground sheets' frames are each the size of the scene.
  load.json(LAYOUT_KEY, `${LAYOUT_KEY}.json`);
  load.once(`filecomplete-json-${LAYOUT_KEY}`, (key, type, data) => {
    const frame = { frameWidth: data.size[0], frameHeight: data.size[1] };
    load.spritesheet(FOREGROUND_KEY, `${FOREGROUND_KEY}.png`, frame);
    for (const island of ISLANDS) {
      if (island.scenery) load.spritesheet(sceneryKeys(island).fg, `${island.scenery.path}${island.scenery.fg}.png`, frame);
    }
  });
  preloadUi(scene);
  // Projectile, impact, status, ability and hazard effects: each fx list
  // gives its sheets' files and frame sizes.
  for (const { key: listKey, dir, file: listFile } of FX_FILES) {
    load.json(listKey, `${dir}${listFile}`);
    load.once(`filecomplete-json-${listKey}`, (key, type, data) => {
      for (const [name, { file, frameWidth, frameHeight }] of Object.entries(data)) {
        load.spritesheet(fxKey(name), `${dir}${file}`, { frameWidth, frameHeight });
      }
    });
  }
  preloadStorm(load);
  preloadMap(load);
  for (const { key: file, dir } of ANIMATION_FILES) {
    load.json(file, `${dir}${file}.json`);
    load.once(`filecomplete-json-${file}`, (key, type, data) => {
      for (const [name, { frameWidth, frameHeight }] of Object.entries(data)) {
        load.spritesheet(sheetKey(name), `${dir}${sheetKey(name)}.png`, { frameWidth, frameHeight });
      }
    });
  }
}

// Read layout.json and register every animation: the animation files' as
// "<name>_<anim>", plus each foreground loop and the Kraken's splash.
export function createAnimations(scene) {
  initLayout(scene.cache.json.get(LAYOUT_KEY));
  for (const island of [null, ...ISLANDS.filter((i) => i.scenery)]) {
    const { fg, anim } = sceneryKeys(island);
    if (scene.anims.exists(anim)) continue;
    scene.anims.create({
      key: anim,
      frames: scene.anims.generateFrameNumbers(fg, { start: 0, end: LAYOUT.foreground.frames - 1 }),
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
  const effects = FX_FILES.flatMap(({ key }) => Object.entries(scene.cache.json.get(key) ?? {}));
  for (const [name, { frames, fps, repeat }] of effects) {
    const key = fxKey(name);
    if (frames < 2 || scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }),
      frameRate: fps,
      repeat,
    });
  }
  const sheets = ANIMATION_FILES.flatMap(({ key }) => Object.entries(scene.cache.json.get(key) ?? {}));
  for (const [name, { frameWidth, frameHeight, ...anims }] of sheets) {
    for (const [anim, spec] of Object.entries(anims)) {
      const key = animKey(name, anim);
      // Skip extra data (gunPorts, mouth, position) and animations already made.
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
  for (const { key } of ANIMATION_FILES) {
    const spec = scene.cache.json.get(key)?.[name];
    if (spec && !Array.isArray(spec)) return spec;
  }
  return null;
}

// The animation "<name>_<anim>" if the animation files define it, else null.
export function findAnim(scene, name, anim) {
  const key = animKey(name, anim);
  return scene.anims.exists(key) ? key : null;
}

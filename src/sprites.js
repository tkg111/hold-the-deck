import {
  ABYSS, ASHFALL, ENEMIES, FISHING, FX, ISLANDS, MAP, MERCHANTS, MIST, MOTES, PACKS, PARTS, SHIP, SNOWFALL, SPRITES, STORM,
} from './config.js';
import { initLayout, LAYOUT } from './layout.js';
import {
  MATERIALS_KEY, overlayFile, overlayKey, PARTS_JSON_KEY, partIconKey,
} from './systems/Parts.js';
import { bannerKey, PACKS_JSON_KEY } from './systems/Packs.js';
import { preloadUi } from './ui/kit.js';
import { versioned } from './version.js';

export const SHIP_SLOTS_KEY = 'ship_slots';
// Character sheets and their animations (key: the JSON's cache key, dir: the
// folder of it and its sheets): crew in animations.json, enemies in
// animations_new_enemies.json (which also has the Ghost Galleon's gunPorts)
// Ember Isle's in ember/animations_ember.json (with the Molten Leviathan's
// mouth and position), Frostbite Reef's in frost/animations_frost.json
// (with the Yeti Raider's handOnRelease, the Frost Wyrm's mouth and perchPos
// and the Frost Giant's feet and slamPoint) and Fogbound Isle's in
// fog/animations_fog.json (with the Cursed Cannoneer's muzzle, the Lantern
// Ghoul's lantern, the Siren Queen's pos, mouth and waveHand and Captain
// Blackbones' feet and muzzle), and the pack crew's (with the ally
// skeleton) in newcrew2/animations_newcrew.json.
const ANIMATION_FILES = [
  { key: 'animations', dir: '' },
  { key: 'animations_new_enemies', dir: '' },
  { key: 'animations_ember', dir: 'ember/' },
  { key: 'animations_frost', dir: 'frost/' },
  { key: 'animations_fog', dir: 'fog/' },
  { key: 'animations_newcrew', dir: 'newcrew2/' },
];
// Effect sheet lists: fx/fx.json, Ember Isle's ember/fx/fx_ember.json,
// Frostbite Reef's frost/fx/fx_frost.json and Fogbound Isle's
// fog/fx/fx_fog.json, and the pack crew's newcrew2/fx/fx_newcrew.json.
const FX_FILES = [
  { key: 'fx_list', dir: FX.path, file: 'fx.json' },
  { key: 'fx_ember', dir: 'ember/fx/', file: 'fx_ember.json' },
  { key: 'fx_frost', dir: 'frost/fx/', file: 'fx_frost.json' },
  { key: 'fx_fog', dir: 'fog/fx/', file: 'fx_fog.json' },
  { key: 'fx_newcrew', dir: 'newcrew2/fx/', file: 'fx_newcrew.json' },
];
const LAYOUT_KEY = 'layout';
const BACKGROUND_KEY = 'bg_tall';  // bg.png's picture with more sky and sea (see SCENERY)
const FOREGROUND_KEY = 'fg_sheet';
export const SPLASH_ANIM = 'kraken_splash';

// The battle backdrop of an island (ISLANDS entry): its own scenery, or
// Skull Cove's. bg: the tall background's texture key; fg: the foreground
// sheet's; anim: the foreground loop; front: the still layer over it (or null).
export function sceneryKeys(island) {
  const id = island?.scenery ? island.id : null;
  return id
    ? { bg: `bg_${id}`, fg: `fg_${id}`, anim: `fg_loop_${id}`, front: island.scenery.front ? `front_${id}` : null }
    : { bg: BACKGROUND_KEY, fg: FOREGROUND_KEY, anim: 'fg_loop', front: null };
}
// Every battlefield with a backdrop of its own: the islands that have one,
// and the Abyss (whose island-shaped stand-in, Abyss.abyssIsland, has the
// same id and scenery).
const SCENERIES = [...ISLANDS.filter((i) => i.scenery), ABYSS];
// Weather sheets (ASHFALL, SNOWFALL, the Abyss's MOTES): the light one, and
// its heavy one when that has a file of its own.
export const WEATHER = [ASHFALL, SNOWFALL, MOTES];

// The Abyss (ABYSS.path): abyss.json (the currents' names, effect lines and
// icon order), the current icons, the depth icon, the Elites' aura (texture
// and animation key) and the map icon (mapKey(ABYSS.id)).
export const ABYSS_JSON_KEY = 'abyss';
export const CURRENTS_KEY = 'abyss_currents';
export const DEPTH_ICON_KEY = 'abyss_depth';
export const ELITE_AURA_KEY = 'abyss_elite_aura';
export const weatherKey = (spec, heavy = false) => `weather_${spec.flag}${heavy ? '_heavy' : ''}`;
// Fogbound Isle's mist strip and fog bank sheets (MIST; see src/fog.js).
export const MIST_KEY = 'mist';
export const FOG_BANK_KEY = 'fog_bank';

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

// Ship parts (parts/parts.json and the images it names): each part's
// overlay (the lantern's for every ship stage) and 32x32 icon, and the
// materials' 16x16 icons.
function preloadParts(load) {
  load.json(PARTS_JSON_KEY, `${PARTS.path}parts.json`);
  load.once(`filecomplete-json-${PARTS_JSON_KEY}`, (key, type, data) => {
    const size = data.materials.size;
    load.spritesheet(MATERIALS_KEY, `${PARTS.path}${data.materials.sheet}`, { frameWidth: size, frameHeight: size });
    const overlays = new Map();   // key -> file (most parts look the same on every stage)
    for (const part of data.parts) {
      load.image(partIconKey(part), `${PARTS.path}${part.icon}`);
      for (let d = 1; d <= SHIP.maxDecks; d++) overlays.set(overlayKey(part, d), overlayFile(part, d));
    }
    for (const [key, file] of overlays) load.image(key, `${PARTS.path}${file}`);
  });
}

// The chest packs (packs/packs.json, see src/systems/Packs.js): each pack's
// banner and the locked overlay.
function preloadPacks(load) {
  load.json(PACKS_JSON_KEY, `${PACKS.path}packs.json`);
  load.once(`filecomplete-json-${PACKS_JSON_KEY}`, (key, type, data) => {
    for (const file of [...data.packs.map((p) => p.banner), data.lockedOverlay].filter(Boolean)) {
      load.image(bannerKey(file), `${PACKS.path}${file}`);
    }
  });
}

function preloadAbyss(load) {
  const { path } = ABYSS;
  load.json(ABYSS_JSON_KEY, `${path}abyss.json`);
  load.once(`filecomplete-json-${ABYSS_JSON_KEY}`, (key, type, data) => {
    const { sheet, size } = data.currents;
    load.spritesheet(CURRENTS_KEY, `${path}${sheet}`, { frameWidth: size, frameHeight: size });
  });
  load.image(DEPTH_ICON_KEY, `${path}${ABYSS.hud.depthIcon}`);
  const { aura } = ABYSS.elites;
  load.spritesheet(ELITE_AURA_KEY, `${path}${aura.file}`, { frameWidth: aura.frameWidth, frameHeight: aura.frameHeight });
  load.image(mapKey(ABYSS.id), `${path}${ABYSS.map.file}`);
}

// Passing merchant ships (MERCHANTS.path, merchants.json: each ship's frame
// size, frames, waterline and wake anchor, and the effects' frames): a
// sheet per ship, the wake, hit puff and loot crate sheets and the
// cannonball. Ships animate as merchantKey(<ship>) + '_sail'.
export const MERCHANTS_JSON_KEY = 'merchants';
export const merchantKey = (name) => `merchant_${name}`;

function preloadMerchants(load) {
  const { path } = MERCHANTS;
  load.json(MERCHANTS_JSON_KEY, `${path}merchants.json`);
  load.once(`filecomplete-json-${MERCHANTS_JSON_KEY}`, (key, type, data) => {
    const sheet = (name, file, [frameWidth, frameHeight]) => load.spritesheet(merchantKey(name), `${path}${file}`, { frameWidth, frameHeight });
    for (const [id, ship] of Object.entries(data.ships)) sheet(id, `${id}_sheet.png`, ship.frame);
    for (const name of ['wake', 'hit_puff', 'loot_crate']) sheet(name, `${name}_sheet.png`, data[name].frame);
  });
  load.image(merchantKey('cannonball'), `${path}cannonball.png`);
}

// Fishing and the Galley (FISHING.path, fishing.json: the fish and meals in
// their sheets' order, the angler's poses and rod tips, the bobber's frames
// and waterline): a sheet per name in FISHING_SHEETS (texture
// fishingKey(name)), the alert and the reel marker.
export const FISHING_JSON_KEY = 'fishing';
export const fishingKey = (name) => `fishing_${name}`;
// Sheet name -> [fishing.json entry, file].
const FISHING_SHEETS = {
  fish: ['fish', 'fish_sheet.png'],
  meals: ['meals', 'meals_sheet.png'],
  items: ['items', 'items_sheet.png'],
  icons: ['icons12', 'icons12.png'],
  angler: ['angler', 'angler_sheet.png'],
  bobber: ['bobber', 'bobber_sheet.png'],
  splash: ['splash', 'splash_sheet.png'],
};

function preloadFishing(load) {
  const { path } = FISHING;
  load.json(FISHING_JSON_KEY, `${path}fishing.json`);
  load.once(`filecomplete-json-${FISHING_JSON_KEY}`, (key, type, data) => {
    for (const [name, [entry, file]] of Object.entries(FISHING_SHEETS)) {
      const [frameWidth, frameHeight] = data[entry].frame;
      load.spritesheet(fishingKey(name), `${path}${file}`, { frameWidth, frameHeight });
    }
  });
  load.image(fishingKey('alert'), `${path}alert.png`);
  load.image(fishingKey('reel_marker'), `${path}reel_marker.png`);
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
  for (const { key, dir = '' } of Object.values(SPRITES.heroes)) load.image(key, `${dir}${key}.png`);
  for (const def of Object.values(ENEMIES)) {
    if (def.sprite && !def.sheetOnly) load.image(def.sprite, `${def.dir ?? ''}${def.sprite}.png`);
  }
  load.image(BACKGROUND_KEY, `${BACKGROUND_KEY}.png`);
  for (const island of SCENERIES) {
    const { path, bg, front } = island.scenery;
    load.image(sceneryKeys(island).bg, `${path}${bg}.png`);
    if (front) load.image(sceneryKeys(island).front, `${path}${front}.png`);
  }
  for (const spec of WEATHER) {
    const frame = { frameWidth: spec.frameWidth, frameHeight: spec.frameHeight };
    load.spritesheet(weatherKey(spec), `${spec.path}${spec.file}`, frame);
    if (spec.heavy.file) load.spritesheet(weatherKey(spec, true), `${spec.path}${spec.heavy.file}`, frame);
  }
  load.spritesheet(MIST_KEY, `${MIST.path}${MIST.file}`, { frameWidth: MIST.frameWidth, frameHeight: MIST.frameHeight });
  load.spritesheet(FOG_BANK_KEY, `${MIST.path}${MIST.bank.file}`,
    { frameWidth: MIST.bank.frameWidth, frameHeight: MIST.bank.frameHeight });
  const splash = SPRITES.krakenSplash;
  load.spritesheet(splash.key, `${splash.key}.png`, { frameWidth: splash.frameWidth, frameHeight: splash.frameHeight });
  // The foreground sheets' frames are each the size of the scene.
  load.json(LAYOUT_KEY, `${LAYOUT_KEY}.json`);
  load.once(`filecomplete-json-${LAYOUT_KEY}`, (key, type, data) => {
    const frame = { frameWidth: data.size[0], frameHeight: data.size[1] };
    load.spritesheet(FOREGROUND_KEY, `${FOREGROUND_KEY}.png`, frame);
    for (const island of SCENERIES) {
      load.spritesheet(sceneryKeys(island).fg, `${island.scenery.path}${island.scenery.fg}.png`, frame);
    }
  });
  preloadUi(scene);
  preloadAbyss(load);
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
  preloadParts(load);
  preloadPacks(load);
  preloadMerchants(load);
  preloadFishing(load);
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
  for (const island of [null, ...SCENERIES]) {
    const { fg, anim } = sceneryKeys(island);
    if (scene.anims.exists(anim)) continue;
    scene.anims.create({
      key: anim,
      frames: scene.anims.generateFrameNumbers(fg, { start: 0, end: LAYOUT.foreground.frames - 1 }),
      frameRate: LAYOUT.foreground.fps,
      repeat: -1,
    });
  }
  const { aura } = ABYSS.elites;
  if (!scene.anims.exists(ELITE_AURA_KEY)) {
    scene.anims.create({
      key: ELITE_AURA_KEY,
      frames: scene.anims.generateFrameNumbers(ELITE_AURA_KEY, { start: 0, end: aura.frames - 1 }),
      frameRate: aura.fps,
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
  createGalleyAnimations(scene);
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
      // Skip extra data (gunPorts, mouth, position, feet...) and animations already made.
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

// The merchants' (a ship's sail bob, the wake, the hit puff, the loot
// crate) and fishing's (the angler's idle, the bobber floating, the splash)
// animations: "<texture>_<anim>".
function createGalleyAnimations(scene) {
  const make = (texture, anim, frames, frameRate, repeat = -1) => {
    const key = `${texture}_${anim}`;
    if (scene.anims.exists(key) || !scene.textures.exists(texture)) return;
    scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(texture, { frames }), frameRate, repeat });
  };
  const ships = scene.cache.json.get(MERCHANTS_JSON_KEY);
  if (ships) {
    for (const [id, ship] of Object.entries(ships.ships)) make(merchantKey(id), 'sail', ship.anims.sail, MERCHANTS.bobFps);
    const range = (n) => [...Array(n).keys()];
    make(merchantKey('wake'), 'loop', range(ships.wake.frames), 6);
    make(merchantKey('hit_puff'), 'pop', range(ships.hit_puff.frames), 10, 0);
    make(merchantKey('loot_crate'), 'loop', range(ships.loot_crate.frames), 4);
  }
  const fishing = scene.cache.json.get(FISHING_JSON_KEY);
  // icons12.png's icons each as a texture of its own, fishingKey('icon_<name>')
  // (the UI kit's buttons take a texture key).
  if (fishing && scene.textures.exists(fishingKey('icons'))) {
    fishing.icons12.order.forEach((name, frame) => {
      const key = fishingKey(`icon_${name}`);
      if (scene.textures.exists(key)) return;
      const [w, h] = fishing.icons12.frame;
      scene.textures.createCanvas(key, w, h).drawFrame(fishingKey('icons'), frame).refresh();
    });
  }
  if (fishing) {
    make(fishingKey('angler'), 'idle', fishing.angler.anims.idle, 2);
    make(fishingKey('bobber'), 'float', fishing.bobber.anims.float, 2);
    make(fishingKey('splash'), 'pop', [...Array(fishing.splash.frames).keys()], 12, 0);
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

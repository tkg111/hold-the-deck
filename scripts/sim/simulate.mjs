// Headless auto-play balance simulation:
// `npm run sim [-- runs maxWave [voyage] [parts=id:level,...]]`.
//
// Runs the real battle code (waves, enemies, crew, abilities, Progress) with
// Phaser stubbed out, from a fresh save, with a simple bot playing between
// waves: it opens every affordable chest and puts its best crew on the ship
// (The Captain beside the strongest, someone anti-air once harpies come).
// Auto abilities are on. Two ways of spending gold:
//   greedy: spends it all after every wave (saving up for a deck while crew
//           wait for a slot), so it only loses where the curve outpaces it
//   lazy:   only spends after losing a wave, so its waves between losses
//           show how often upgrades are needed
// Frozen crewmates (Frostbite Reef) and charmed ones (Fogbound Isle) are
// tapped free like a player would (TAP).
// Each run plays Skull Cove and stops at maxWave, or when one wave has been
// lost MAX_TRIES times in a row (a wall). With "voyage", a cleared island is
// followed by the next one the ship can sail to (Ember Isle after Skull
// Cove), and maxWave is the wave to reach on the last island it gets to.
//
// parts=kraken_figurehead:3,ghostweave_sails:5 starts every run with those
// ship parts (parts.json ids) crafted to those levels and on the ship.
// Without it no part is ever made, so results are as before parts existed.
//
// To try numbers without editing config.js, set SIM_CONFIG to JSON merged
// into its exports, e.g. SIM_CONFIG='{"WAVES":{"hpGrowth":0.1}}'.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as config from '../../src/config.js';
import { HEROES, ISLANDS, RARITY, SHIP } from '../../src/config.js';
import { initLayout } from '../../src/layout.js';
import { Ship } from '../../src/entities/Ship.js';
import { Hero } from '../../src/entities/Hero.js';
import { AbilitySystem } from '../../src/systems/Abilities.js';
import { Progress } from '../../src/systems/Progress.js';
import { Volcano } from '../../src/systems/Volcano.js';
import { Blizzard } from '../../src/systems/Blizzard.js';
import { Mists } from '../../src/systems/Mists.js';
import { Currents } from '../../src/systems/Currents.js';
import { WaveManager } from '../../src/systems/WaveManager.js';
import { initParts, partOf } from '../../src/systems/Parts.js';
import { ShipParts } from '../../src/systems/ShipParts.js';

const RUNS = Number(process.argv[2] ?? 5);
const MAX_WAVE = Number(process.argv[3] ?? 50);
const FLAGS = process.argv.slice(4);
const VOYAGE = FLAGS.includes('voyage');
// parts=id:level,... -> { id: level }
export function parseParts(arg) {
  const parts = {};
  for (const item of (arg ?? '').split(',').filter(Boolean)) {
    const [id, level] = item.split(':');
    if (!partOf(id)) throw new Error(`Unknown part: ${id}`);
    parts[id] = Math.max(1, Math.min(config.PARTS.maxLevel, Number(level) || 1));
  }
  return parts;
}
const MAX_TRIES = 15;
const DT = 50;                   // ms per step (the game clamps to 100)
const WAVE_TIMEOUT = 10 * 60e3;  // a wave this long counts as lost
// The player taps frozen (Frostbite Reef) and charmed (Fogbound Isle)
// crewmates free: `chance` of the time, afterMs after one freezes or is
// charmed; otherwise it lasts its full time.
const TAP = { chance: 0.6, afterMs: 800 };

// Deep-merge overrides into the (mutable) config objects.
// An array patches the config's array of objects item by item (e.g.
// {"ISLANDS":[{},{},{"finale":{"hpFactor":0.9}}]}); any other array replaces it.
function override(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const mergeable = value && typeof value === 'object' && target[key] && typeof target[key] === 'object'
      && Array.isArray(value) === Array.isArray(target[key]) && (!Array.isArray(value) || typeof target[key][0] === 'object');
    if (mergeable) override(target[key], value);
    else target[key] = value;
  }
}
if (process.env.SIM_CONFIG) override(config, JSON.parse(process.env.SIM_CONFIG));

const sprites = new URL('../../public/sprites/', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, sprites), 'utf8'));
const fxSheets = {
  ...readJson('fx/fx.json'), ...readJson('ember/fx/fx_ember.json'), ...readJson('frost/fx/fx_frost.json'),
  ...readJson('fog/fx/fx_fog.json'),
};
initLayout(readJson('layout.json'));
initParts(readJson('parts/parts.json'));
const PARTS_ARG = parseParts(FLAGS.find((a) => a.startsWith('parts='))?.slice(6));
// The JSON files the battle code reads from the cache (ship slots; the
// Ghost Galleon's gun ports, the Molten Leviathan's mouth and position, and
// Frostbite Reef's and Fogbound Isle's animation timings and points).
const jsonCache = {
  ship_slots: readJson('ship_slots.json'),
  animations_new_enemies: readJson('animations_new_enemies.json'),
  animations_ember: readJson('ember/animations_ember.json'),
  animations_frost: readJson('frost/animations_frost.json'),
  animations_fog: readJson('fog/animations_fog.json'),
};

// --- A stand-in scene: game objects are inert stubs that keep x / y ---

function stub(props = {}) {
  const t = {
    x: 0, y: 0, width: 32, height: 32, displayWidth: 32, displayHeight: 32, scaleX: 1, scaleY: 1,
    anims: { isPlaying: false, isPaused: false, timeScale: 1, pause() {}, resume() {}, stop() {} },
    ...props,
  };
  const proxy = new Proxy(t, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'then') return undefined;
      if (key === 'setPosition') return (x, y = x) => { target.x = x; target.y = y; return proxy; };
      return () => proxy;
    },
  });
  return proxy;
}

// Effect sheets get their real frame size (some effects are sized by them).
const fxSize = (key) => {
  const sheet = typeof key === 'string' && key.startsWith('fx_') && fxSheets[key.slice(3)];
  return sheet ? { width: sheet.frameWidth, height: sheet.frameHeight } : { width: 32, height: 32 };
};

function makeScene() {
  const listeners = {};
  const scene = {
    add: new Proxy({}, {
      get: () => (x = 0, y = 0, key) => {
        const { width, height } = fxSize(key);
        return stub({ x, y, width, height, displayWidth: width, displayHeight: height });
      },
    }),
    tweens: { add() {}, addCounter() {}, killTweensOf() {} },
    time: { delayedCall() {} },
    anims: { exists: () => false, get: () => null },
    textures: { exists: (key) => key.startsWith('fx_'), getFrame: fxSize },
    cameras: { main: { shake() {} } },
    cache: { json: { get: (key) => jsonCache[key] }, bitmapFont: { exists: () => true } },
    events: {
      on(name, fn, ctx) { (listeners[name] ??= []).push(fn.bind(ctx)); },
      emit(name, ...args) { for (const fn of listeners[name] ?? []) fn(...args); },
    },
    view: { left: 0, top: 0, right: 480, bottom: 270, width: 480, height: 270 },
    floatText() {},
    enemies: [],
    projectiles: [],
    heroes: [],
  };
  return scene;
}

// --- Seeded Math.random, so runs are repeatable ---

function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- One battle ---

// Taps still to come this wave: { hero, at (wave ms) }, and the wave's clock.
let taps = [];
let waveClock = 0;
const freeze = Hero.prototype.freeze;
Hero.prototype.freeze = function freezeAndMaybeTap(ms, cause) {
  const fresh = !this.isFrozen;
  freeze.call(this, ms, cause);
  if (fresh && Math.random() < TAP.chance) taps.push({ hero: this, at: waveClock + TAP.afterMs });
};
const charm = Hero.prototype.charm;
Hero.prototype.charm = function charmAndMaybeTap(ms, charmer) {
  const fresh = !this.isCharmed;
  charm.call(this, ms, charmer);
  // (A crewmate still immune from the last charm isn't charmed.)
  if (fresh && this.isCharmed && Math.random() < TAP.chance) taps.push({ hero: this, at: waveClock + TAP.afterMs });
};

// hunt: a boss (ENEMIES key) to fight a Boss Hunt against on the current
// island instead of the next wave (a win pays its drops and raises its
// level, see Progress.winHunt). During a dive in the Abyss it plays the
// current depth (a win: Progress.winDepth; a loss is for the caller to end).
export function playWave(scene, progress, onStep = null, { hunt = null } = {}) {
  const {
    ship, waves, volcano, blizzard, mists, currents, abilities, shipParts,
  } = scene;
  const dive = progress.inAbyss && !hunt;
  const options = hunt ? progress.huntOptions(hunt, progress.islandId) : dive ? progress.abyssOptions : progress.waveOptions;
  const wave = hunt || dive ? options.wave : progress.wave;
  scene.hunting = !!hunt;
  ship.sync(progress);
  rebuildHeroes(scene, progress);
  scene.enemies = [];
  scene.projectiles = [];
  waves.start(wave, options);
  volcano.start(options);
  blizzard.start(wave, options);
  mists.start(wave, options);
  currents.start(options);
  shipParts.start(progress);
  abilities.resetCooldowns();
  let time = 0;
  let won = false;
  taps = [];
  for (;;) {
    time += DT;
    waveClock = time;
    scene.enemies.push(...waves.update(DT));
    for (const e of scene.enemies) e.update(DT, ship);
    volcano.update(DT);
    blizzard.update(DT);
    mists.update(DT);
    currents.update(DT);
    shipParts.update(DT);
    abilities.update(DT, true);
    for (const h of scene.heroes) {
      const shot = h.update(DT, scene.enemies);
      if (shot) scene.projectiles.push(shot);
    }
    for (const p of scene.projectiles) p.update(DT);
    taps = taps.filter((t) => {
      if (t.at > time) return true;
      t.hero.tapFree();
      return false;
    });
    scene.enemies = scene.enemies.filter((e) => e.alive);
    scene.projectiles = scene.projectiles.filter((p) => !p.done);
    onStep?.(time);
    if (ship.isDestroyed || time > WAVE_TIMEOUT) break;
    // Lava bombs still falling don't hold up a win.
    if (waves.doneSpawning && !scene.enemies.some((e) => !e.def.hazard)) {
      won = true;
      break;
    }
  }
  waves.stop();
  volcano.stop();
  blizzard.stop();
  mists.stop();
  currents.stop();
  shipParts.stop();
  abilities.clear();
  for (const h of scene.heroes) h.clearAbilities();
  if (won && hunt) progress.winHunt(hunt, progress.islandId);
  else if (won && dive) progress.winDepth();
  else if (won) progress.winWave();
  return { won, time, hullLeft: ship.hp / ship.maxHp };
}

function rebuildHeroes(scene, p) {
  const buffs = p.deckBuffs;
  scene.heroes = p.activeHeroes.map(({ id, slot }) => new Hero(scene, id, scene.ship.slotPosition(slot), {
    damage: p.heroDamage(id) * buffs[slot].damage,
    attackInterval: (HEROES[id].attackInterval ?? 0) / buffs[slot].attackSpeed,
    buffed: buffs[slot].buffed,
  }));
  scene.abilities.setCrew(scene.heroes, p);
}

// --- The bot ---

const RARITY_RANK = Object.keys(RARITY);
const canHitAir = (id) => !!(HEROES[id].antiAir || HEROES[id].netsFlyers);

// Rough worth of a crewmate on the ship: rarity first, then damage.
const worth = (p, id) => RARITY_RANK.indexOf(HEROES[id].rarity) * 1000 + (HEROES[id].aura ? 500 : p.heroDamage(id));

function arrangeCrew(p) {
  const owned = p.ownedHeroes.sort((a, b) => worth(p, b) - worth(p, a));
  const crew = owned.slice(0, p.slotCount);
  // Harpies from wave 8: make sure someone can hit them.
  if (p.wave >= 8 && !crew.some(canHitAir)) {
    const flyerHunter = owned.find(canHitAir);
    if (flyerHunter) crew[crew.length - 1] = flyerHunter;
  }
  // The Captain shares deck 1 with the strongest attacker.
  const captain = crew.find((id) => HEROES[id].aura);
  const attackers = crew.filter((id) => !HEROES[id].aura);
  const order = captain ? [attackers[0], captain, ...attackers.slice(1)].filter(Boolean) : attackers;
  p.slots = Array(SHIP.maxDecks * SHIP.slotsPerDeck).fill(null);
  order.forEach((id, i) => { p.slots[i] = id; });
}

// Chests (Buy 10 whenever it's affordable) and crew after every wave; gold
// only when spending (see top).
function between(p, spend) {
  while (p.canOpenBulk) p.openBulk();
  while (p.canOpenPack) p.openPack();
  arrangeCrew(p);
  if (spend) spendGold(p);
}

function spendGold(p) {
  // Crew waiting for a slot: save up for the next deck.
  if (p.canBuildDeck && p.ownedHeroes.length > p.slotCount) {
    if (p.buildDeck()) arrangeCrew(p);
    return;
  }
  if (p.canBuildDeck && p.deckCost() <= p.gold) p.buildDeck();
  for (;;) {
    const options = [{ cost: p.hullHpCost() * 1.5, buy: () => p.buyHullHp() }];
    for (const { id } of p.activeHeroes) options.push({ cost: p.heroLevelCost(id), buy: () => p.levelHero(id) });
    options.sort((a, b) => a.cost - b.cost);
    if (!options.some((o) => o.buy())) break;
  }
}

// --- Runs ---

// A stand-in battle scene for this progress, with its systems.
export function makeBattle(progress) {
  const scene = makeScene();
  scene.progress = progress;
  scene.ship = new Ship(scene, progress);
  scene.waves = new WaveManager(scene);
  scene.volcano = new Volcano(scene);
  scene.blizzard = new Blizzard(scene);
  scene.mists = new Mists(scene);
  scene.currents = new Currents(scene);
  scene.abilities = new AbilitySystem(scene);
  scene.shipParts = new ShipParts(scene);
  return scene;
}

// Ship parts crafted to these levels ({ id: level }) and put on the ship.
export function equipParts(progress, parts) {
  for (const [id, level] of Object.entries(parts)) {
    progress.parts[id] = level;
    progress.equipPart(id);
  }
}

// Kills pay as in the game (GameScene.onEnemyKilled); scene.hunting: a
// Boss Hunt is on (its boss pays on the win instead).
export function payKills(scene, progress) {
  scene.events.on('enemy-killed', (e) => {
    if (e.def.hazard) return;   // a lava bomb shot down
    progress.recordDefeat(e.key);   // bounties pay Pearls
    progress.earnGold(progress.boostGold(e.gold));
    if (e.def.boss && progress.inAbyss) {
      progress.abyssBossDrop(e.key);   // double, and no Pearls
    } else if (e.def.boss && !scene.hunting) {
      progress.claimBossPearls();
      progress.bossDrop(e.key);
      scene.waves.bossDown();   // the finale's other boss enrages
    }
  });
}

export function run(seed, policy, {
  maxWave = MAX_WAVE, voyage = VOYAGE, maxTries = MAX_TRIES, stopAt = null, parts = PARTS_ARG,
} = {}) {
  seedRandom(seed);
  const progress = new Progress();
  equipParts(progress, parts);
  const scene = makeBattle(progress);
  payKills(scene, progress);
  scene.events.on('enemy-stole', (e) => {
    progress.gold -= Math.min(progress.gold, Math.ceil(progress.gold * e.def.stealPercent));
  });

  const log = [];
  let tries = 0;
  let attempts = 0;
  let playTime = 0;
  between(progress, true);
  // Voyage: on to the next island once this one is cleared.
  const sailOn = () => {
    if (!voyage || !progress.isIslandCleared(progress.islandId)) return;
    const next = ISLANDS[ISLANDS.indexOf(progress.island) + 1];
    if (next && progress.sailTo(next.id)) tries = 0;
  };
  // stopAt(progress): stop as soon as it's true (checked between waves).
  while (progress.wave <= maxWave && tries < maxTries && !stopAt?.(progress)) {
    const wave = progress.wave;
    const island = progress.islandId;
    const result = playWave(scene, progress);
    attempts++;
    playTime += result.time;
    tries = result.won ? 0 : tries + 1;
    log.push({ wave, island, ...result });
    between(progress, policy === 'greedy' || !result.won);
    sailOn();
  }
  const crew = progress.activeHeroes.map(({ id }) => `${HEROES[id].shortName} ${progress.heroLevel(id)}`).join(', ');
  return { progress, log, attempts, playTime, crew, wall: tries >= maxTries };
}

export { seedRandom, between };

const mins = (ms) => `${Math.round(ms / 60000)}m`;
const bandOf = (wave) => Math.floor((wave - 1) / 10);
// A wave on an island, e.g. "34" on Skull Cove and "E12" further on: its
// first letter, or two where an earlier island has it (Fogbound Isle "Fo").
const TAGS = ISLANDS.reduce((tags, d, i) => {
  const one = d.name[0];
  tags[d.id] = i === 0 ? '' : Object.values(tags).includes(one) ? d.name.slice(0, 2) : one;
  return tags;
}, {});
const islandTag = (id) => TAGS[id];
const waveTag = ({ island, wave }) => `${islandTag(island)}${wave}`;

// Run as `npm run sim` (not when imported by another script).
const main = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const partsNote = Object.keys(PARTS_ARG).length
  ? `, parts: ${Object.entries(PARTS_ARG).map(([id, l]) => `${id} ${l}`).join(', ')}` : '';
for (const policy of main ? ['greedy', 'lazy'] : []) {
  console.log(`--- ${policy}: ${RUNS} runs from a fresh save, up to wave ${MAX_WAVE}${partsNote} ---`);
  const bands = new Map();   // per island and 10 waves: first tries, first-try wins, losses
  for (let r = 0; r < RUNS; r++) {
    const res = run(1000 + r, policy);
    const lost = [...new Set(res.log.filter((l) => !l.won).map(waveTag))];
    const retries = res.log.filter((l) => !l.won).length;
    const at = waveTag({ island: res.progress.islandId, wave: res.progress.wave });
    console.log(`run ${r + 1}: wave ${at}${res.wall ? ' (wall)' : ''}, ${mins(res.playTime)} of battle, `
      + `${retries} losses on ${lost.length} waves: ${lost.join(' ') || '-'}`);
    console.log(`  hull LV ${res.progress.hullHpLevel}, decks ${res.progress.decks}, crew: ${res.crew}`);
    const seen = new Set();
    for (const { island, wave, won } of res.log) {
      const key = `${ISLANDS.findIndex((d) => d.id === island)}:${bandOf(wave)}`;
      if (!bands.has(key)) bands.set(key, { island, band: bandOf(wave), tries: 0, firstWins: 0, losses: 0, cleared: 0 });
      const b = bands.get(key);
      const tag = waveTag({ island, wave });
      if (!seen.has(tag)) {
        seen.add(tag);
        b.tries++;
        if (won) b.firstWins++;
      }
      if (won) b.cleared++;
      else b.losses++;
    }
  }
  const sorted = [...bands.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  console.log(sorted.map(([, b]) => `${islandTag(b.island)}waves ${b.band * 10 + 1}-${b.band * 10 + 10}: `
    + `${Math.round(100 * b.firstWins / b.tries)}% first try, `
    + `${b.losses ? (b.cleared / b.losses).toFixed(1) : '-'} clears per loss`).join('\n'));
}

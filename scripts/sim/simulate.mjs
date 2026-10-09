// Headless auto-play balance simulation: `npm run sim [-- runs maxWave]`.
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
// Each run stops at maxWave, or when one wave has been lost MAX_TRIES times
// in a row (a wall).
//
// To try numbers without editing config.js, set SIM_CONFIG to JSON merged
// into its exports, e.g. SIM_CONFIG='{"WAVES":{"hpGrowth":0.1}}'.
import { readFileSync } from 'node:fs';
import * as config from '../../src/config.js';
import { HEROES, RARITY, SHIP } from '../../src/config.js';
import { initLayout } from '../../src/layout.js';
import { Ship } from '../../src/entities/Ship.js';
import { Hero } from '../../src/entities/Hero.js';
import { AbilitySystem } from '../../src/systems/Abilities.js';
import { Progress } from '../../src/systems/Progress.js';
import { WaveManager } from '../../src/systems/WaveManager.js';

const RUNS = Number(process.argv[2] ?? 5);
const MAX_WAVE = Number(process.argv[3] ?? 50);
const MAX_TRIES = 15;
const DT = 50;                   // ms per step (the game clamps to 100)
const WAVE_TIMEOUT = 10 * 60e3;  // a wave this long counts as lost

// Deep-merge overrides into the (mutable) config objects.
function override(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) override(target[key], value);
    else target[key] = value;
  }
}
if (process.env.SIM_CONFIG) override(config, JSON.parse(process.env.SIM_CONFIG));

const sprites = new URL('../../public/sprites/', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, sprites), 'utf8'));
const fxSheets = readJson('fx/fx.json');
initLayout(readJson('layout.json'));
const shipSlots = readJson('ship_slots.json');

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
    cache: { json: { get: () => shipSlots }, bitmapFont: { exists: () => true } },
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

function playWave(scene, progress) {
  const { ship, waves, abilities } = scene;
  ship.sync(progress);
  rebuildHeroes(scene, progress);
  scene.enemies = [];
  scene.projectiles = [];
  waves.start(progress.wave, progress.waveOptions);
  abilities.resetCooldowns();
  let time = 0;
  let won = false;
  for (;;) {
    time += DT;
    scene.enemies.push(...waves.update(DT));
    for (const e of scene.enemies) e.update(DT, ship);
    abilities.update(DT, true);
    for (const h of scene.heroes) {
      const shot = h.update(DT, scene.enemies);
      if (shot) scene.projectiles.push(shot);
    }
    for (const p of scene.projectiles) p.update(DT);
    scene.enemies = scene.enemies.filter((e) => e.alive);
    scene.projectiles = scene.projectiles.filter((p) => !p.done);
    if (ship.isDestroyed || time > WAVE_TIMEOUT) break;
    if (waves.doneSpawning && scene.enemies.length === 0) {
      won = true;
      break;
    }
  }
  waves.stop();
  abilities.clear();
  for (const h of scene.heroes) h.clearAbilities();
  if (won) progress.winWave();
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

// Chests and crew after every wave; gold only when spending (see top).
function between(p, spend) {
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

function run(seed, policy) {
  seedRandom(seed);
  const scene = makeScene();
  const progress = new Progress();
  scene.progress = progress;
  scene.ship = new Ship(scene, progress);
  scene.waves = new WaveManager(scene);
  scene.abilities = new AbilitySystem(scene);
  scene.events.on('enemy-killed', (e) => {
    progress.recordDefeat(e.key);   // bounties pay Pearls
    progress.earnGold(e.gold);
    if (e.def.boss) {
      progress.claimBossPearls();
      scene.waves.bossDown();   // the finale's other boss enrages
    }
  });
  scene.events.on('enemy-stole', (e) => {
    progress.gold -= Math.min(progress.gold, Math.ceil(progress.gold * e.def.stealPercent));
  });

  const log = [];
  let tries = 0;
  let attempts = 0;
  let playTime = 0;
  between(progress, true);
  while (progress.wave <= MAX_WAVE && tries < MAX_TRIES) {
    const wave = progress.wave;
    const result = playWave(scene, progress);
    attempts++;
    playTime += result.time;
    tries = result.won ? 0 : tries + 1;
    log.push({ wave, ...result });
    between(progress, policy === 'greedy' || !result.won);
  }
  const crew = progress.activeHeroes.map(({ id }) => `${HEROES[id].shortName} ${progress.heroLevel(id)}`).join(', ');
  return { progress, log, attempts, playTime, crew, wall: tries >= MAX_TRIES };
}

const mins = (ms) => `${Math.round(ms / 60000)}m`;
const bandOf = (wave) => Math.floor((wave - 1) / 10);

for (const policy of ['greedy', 'lazy']) {
  console.log(`--- ${policy}: ${RUNS} runs from a fresh save, up to wave ${MAX_WAVE} ---`);
  const bands = [];   // per 10 waves: first tries, first-try wins, losses
  for (let r = 0; r < RUNS; r++) {
    const res = run(1000 + r, policy);
    const lost = [...new Set(res.log.filter((l) => !l.won).map((l) => l.wave))];
    const retries = res.log.filter((l) => !l.won).length;
    console.log(`run ${r + 1}: wave ${res.progress.wave}${res.wall ? ' (wall)' : ''}, ${mins(res.playTime)} of battle, `
      + `${retries} losses on ${lost.length} waves: ${lost.join(' ') || '-'}`);
    console.log(`  hull LV ${res.progress.hullHpLevel}, decks ${res.progress.decks}, crew: ${res.crew}`);
    const seen = new Set();
    for (const { wave, won } of res.log) {
      const b = (bands[bandOf(wave)] ??= { tries: 0, firstWins: 0, losses: 0, cleared: 0 });
      if (!seen.has(wave)) {
        seen.add(wave);
        b.tries++;
        if (won) b.firstWins++;
      }
      if (won) b.cleared++;
      else b.losses++;
    }
  }
  console.log(bands.map((b, i) => b && `waves ${i * 10 + 1}-${i * 10 + 10}: `
    + `${Math.round(100 * b.firstWins / b.tries)}% first try, `
    + `${b.losses ? (b.cleared / b.losses).toFixed(1) : '-'} clears per loss`).filter(Boolean).join('\n'));
}

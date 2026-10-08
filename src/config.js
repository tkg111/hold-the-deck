// All balance numbers live here. Placeholders — tune during playtesting.
// Times are in milliseconds, speeds in pixels/second, distances in pixels.

export const DISPLAY = {
  width: 960,
  height: 540,
  groundY: 460,
};

export const HOUSE = {
  x: 60,              // left edge of the house
  width: 140,
  floorHeight: 90,
  stiltHeight: 50,    // kampung houses sit on stilts
  baseHp: 100,
  startingFloors: 1,
  maxFloors: 3,
  slotsPerFloor: 2,
};

export const HEROES = {
  budakLastik: {
    name: 'Budak Lastik',
    rarity: 'common',
    color: 0x4caf50,
    damage: 5,
    attackInterval: 450,
    range: 700,
    projectileSpeed: 650,
    projectileColor: 0xdddddd,
    projectileSize: 5,
  },
};

export const ENEMIES = {
  jerangkung: {
    name: 'Jerangkung',
    color: 0xe8e2c8,
    width: 22,
    height: 44,
    hp: 20,
    speed: 45,
    damage: 5,          // per hit on the house
    attackInterval: 1000,
    gold: 2,            // per kill, before wave scaling
  },
  toyol: {
    name: 'Toyol',
    color: 0x7cb342,
    width: 16,
    height: 24,
    hp: 8,
    speed: 130,
    damage: 0,          // doesn't attack the house...
    attackInterval: 1000,
    gold: 3,
    stealPercent: 0.05, // ...steals this share of current gold, then vanishes
  },
  hantuGalah: {
    name: 'Hantu Galah',
    boss: true,
    color: 0x37474f,
    width: 28,
    height: 140,
    hp: 400,
    speed: 18,
    damage: 25,
    attackInterval: 1500,
    gold: 50,
  },
};

export const WAVES = {
  spawnX: DISPLAY.width + 30,
  // Enemy count: baseCount + (wave - 1) * countPerWave
  baseCount: 5,
  countPerWave: 2,
  // Enemy HP multiplier: 1 + (wave - 1) * hpGrowth
  hpGrowth: 0.2,
  // Enemy damage multiplier: 1 + (wave - 1) * damageGrowth
  damageGrowth: 0.1,
  // Spawn interval shrinks each wave down to a floor.
  spawnInterval: 900,
  spawnIntervalPerWave: -30,
  minSpawnInterval: 350,
  // Small random vertical offset so enemies don't stack perfectly.
  laneJitter: 10,

  // Toyol share of a wave: toyolShare + (wave - toyolFromWave) * toyolSharePerWave, capped.
  toyolFromWave: 3,
  toyolShare: 0.15,
  toyolSharePerWave: 0.01,
  toyolShareMax: 0.4,

  // Every bossEvery-th wave: Hantu Galah plus a reduced escort of regular enemies.
  bossEvery: 10,
  bossEscortFactor: 0.5,   // fraction of the normal enemy count
  bossSpawnAt: 0.3,        // boss enters this far through the spawn queue
};

export const ECONOMY = {
  startingGold: 0,
  // Kill gold multiplier: 1 + (wave - 1) * killGoldGrowth
  killGoldGrowth: 0.1,
  // Wave clear bonus: waveClearBase + (wave - 1) * waveClearPerWave
  waveClearBase: 10,
  waveClearPerWave: 4,
};

// Upgrade cost at level L: round(baseCost * costGrowth ^ L)
export const UPGRADES = {
  houseHp: {
    hpPerLevel: 25,
    baseCost: 20,
    costGrowth: 1.25,
  },
  floor: {
    costs: [100, 300],  // cost of floor 2, floor 3
    hpPerFloor: 50,     // bonus max HP for each floor built
  },
  heroLevel: {
    // Damage at level L: baseDamage * (1 + (L - 1) * damagePerLevel)
    damagePerLevel: 0.2,
    baseCost: 15,
    costGrowth: 1.25,
  },
};

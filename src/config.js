// All balance numbers live here. Placeholders — tune during playtesting.
// Times are in milliseconds, speeds in pixels/second, distances in pixels.

// Logical game size: all positions and layout use these units. The canvas is
// rendered at a multiple of it (see src/display.js) so it stays sharp.
export const DISPLAY = {
  width: 960,
  height: 540,
  groundY: 460,
  maxRenderScale: 3,  // caps the backing canvas at 2880x1620
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

export const RARITY = {
  common: { label: 'Common', color: 0xb0bec5 },
  rare: { label: 'Rare', color: 0x42a5f5 },
  epic: { label: 'Epic', color: 0xba68c8 },
  legendary: { label: 'Legendary', color: 0xff9800 },
};

// catchphrase: one-line Manglish intro shown the first time the hero is pulled.
// Optional effects per hero:
//   stun:   { chance, duration }    — stunned enemies can't move or attack
//   area:   { radius }              — hit lands on everything within radius of the target
//   slow:   { factor, duration }    — movement and attack speed multiplied by factor
//   curse:  { bonus, duration }     — enemy takes (1 + bonus)x damage from ALL heroes
//   poison: { ratio, duration }     — deals ratio x hit damage per second for duration
//   pierce: { maxTargets, length, hitRadius } — skims along the enemy line from the
//                                     front enemy for `length` px, hitting each enemy once
//   lob:    { flightTime, arcHeight } — arcing shot aimed where the target will be
//   crit:   { chance, multiplier }  — chance for a multiplied hit
//   aura:   { damageBonus, damageBonusPerLevel, attackSpeedBonus } — doesn't attack;
//           buffs the other heroes on the same floor. damageBonus grows per level
//           and with stars (same star bonus as damage).
export const HEROES = {
  budakLastik: {
    name: 'Budak Lastik',
    shortName: 'Lastik',
    rarity: 'common',
    color: 0x4caf50,
    damage: 5,
    attackInterval: 450,
    range: 700,
    projectileSpeed: 650,
    projectileColor: 0xdddddd,
    projectileSize: 5,
    catchphrase: 'Aiyo, sure kena one lah! Ready, aim, tembak!',
  },
  makCikSelipar: {
    name: 'Mak Cik Selipar',
    shortName: 'Selipar',
    rarity: 'common',
    color: 0xff7043,
    damage: 9,
    attackInterval: 900,
    range: 650,
    projectileSpeed: 500,
    projectileColor: 0xffab91,
    projectileSize: 7,
    stun: { chance: 0.25, duration: 1000 },
    catchphrase: 'You want to kena selipar ah? Come, come!',
  },
  nelayan: {
    name: 'Nelayan',
    shortName: 'Nelayan',
    rarity: 'rare',
    color: 0x29b6f6,
    damage: 6,
    attackInterval: 2200,
    range: 600,
    projectileSpeed: 380,
    projectileColor: 0x81d4fa,
    projectileSize: 9,
    area: { radius: 75 },
    slow: { factor: 0.5, duration: 2500 },
    catchphrase: 'Relax lah boss, one net can catch all.',
  },
  bomoh: {
    name: 'Bomoh',
    shortName: 'Bomoh',
    rarity: 'epic',
    color: 0x7e57c2,
    damage: 8,
    attackInterval: 1100,
    range: 650,
    projectileSpeed: 450,
    projectileColor: 0xce93d8,
    projectileSize: 7,
    curse: { bonus: 0.3, duration: 4000 },
    catchphrase: "Don't play-play ah, later I sumpah you!",
  },
  pemburuSumpit: {
    name: 'Pemburu Sumpit',
    shortName: 'Sumpit',
    rarity: 'rare',
    color: 0x558b2f,
    damage: 4,
    attackInterval: 900,
    range: 720,
    projectileSpeed: 850,
    projectileColor: 0xc5e1a5,
    projectileSize: 3,
    poison: { ratio: 0.75, duration: 4000 },
    catchphrase: 'One tiup only. Slowly-slowly you feel it.',
  },
  pakcikMamak: {
    name: 'Pakcik Mamak',
    shortName: 'Mamak',
    rarity: 'rare',
    color: 0xeceff1,
    damage: 8,
    attackInterval: 1700,
    range: 650,
    projectileSpeed: 430,
    projectileColor: 0xf3d9a4,
    projectileSize: 9,
    pierce: { maxTargets: 6, length: 300, hitRadius: 22 },
    catchphrase: 'Roti canai satu, terbang! Boss, tambah lagi?',
  },
  uncleDurian: {
    name: 'Uncle Durian',
    shortName: 'Durian',
    rarity: 'epic',
    color: 0x9e9d24,
    damage: 24,
    attackInterval: 3200,
    range: 650,
    projectileColor: 0x827717,
    projectileSize: 11,
    area: { radius: 95 },
    lob: { flightTime: 1000, arcHeight: 150 },
    catchphrase: 'Smell also can kill you, you know or not?',
  },
  pendekarSilat: {
    name: 'Pendekar Silat',
    shortName: 'Silat',
    rarity: 'legendary',
    color: 0x263238,
    damage: 40,
    attackInterval: 1300,
    range: 680,
    projectileSpeed: 950,
    projectileColor: 0xffca28,
    projectileSize: 6,
    crit: { chance: 0.35, multiplier: 2.5 },
    catchphrase: 'Steady, bang. One hit enough lah.',
  },
  tokPenghulu: {
    name: 'Tok Penghulu',
    shortName: 'Penghulu',
    rarity: 'legendary',
    color: 0x1565c0,
    damage: 0,
    aura: { damageBonus: 0.5, damageBonusPerLevel: 0.04, attackSpeedBonus: 0.3 },
    catchphrase: 'Everybody listen to me, can? Gotong-royong time!',
  },
};

export const STARTING_HEROES = ['budakLastik'];

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
    statusResist: 0.5,  // stun and slow durations multiplied by this
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

  // Ang Pow: earned from wave clears, milestone waves and boss kills; spent on packs.
  startingAngPow: 3,        // enough for one pack right away
  angPowPerWave: 1,         // every wave clear
  angPowMilestoneEvery: 5,  // clearing every Nth wave pays a bonus on top
  angPowPerMilestone: 5,
  angPowPerBoss: 5,         // first kill of each boss wave only
};

export const PACKS = {
  cost: 3,
  // Rarity weights; renormalized over rarities that actually have heroes.
  rates: { common: 0.45, rare: 0.3, epic: 0.18, legendary: 0.07 },
  // Pity: a Legendary is guaranteed within this many packs.
  legendaryPity: 30,
  maxStars: 5,
  // Total damage bonus at each star count (index = stars). Each star adds more than the last.
  starDamageBonus: [0, 0.1, 0.25, 0.45, 0.7, 1.0],
  // Duplicate of a max-star hero refunds this much Ang Pow instead.
  maxStarRefund: 1,
};

// Pack-opening presentation, per rarity of the hero being pulled.
export const PACK_FX = {
  // How long the envelope shakes and glows before flipping (ms). Rarer = longer.
  buildUp: { common: 700, rare: 1300, epic: 2000, legendary: 2900 },
  // The glow starts gold and shifts to the rarity colour over this last
  // fraction of the build-up, so the hint lands just before the reveal.
  hintFraction: 0.45,
  // Maximum shake angle (degrees) at the end of the build-up.
  shakeAngle: { common: 4, rare: 7, epic: 10, legendary: 14 },
  // Confetti pieces fired when a NEW hero is revealed.
  confetti: { common: 40, rare: 90, epic: 160, legendary: 280 },
  // Full-screen flash on reveal (ms, 0 = none).
  revealFlash: { common: 0, rare: 0, epic: 0, legendary: 450 },
  // Pause between the card reveal and the new-hero splash (ms).
  splashDelay: 700,
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

// Prestige: "Pindah Kampung". Resets the run (wave, gold, house, hero levels)
// for Semangat, a permanent currency spent in the Semangat shop.
export const PRESTIGE = {
  unlockWave: 20,
  // Semangat = floor(semangatBase * (waveReached / unlockWave) ^ semangatExponent)
  semangatBase: 10,
  semangatExponent: 1.5,
  // Ang Pow lump = floor(waveReached * angPowPerWave)
  angPowPerWave: 0.5,
};

// Permanent bonuses bought with Semangat. Cost at level L:
// round(baseCost * costGrowth ^ L). maxLevel: null = unlimited.
export const SEMANGAT_SHOP = {
  heroDamage: {
    name: 'Semangat Pahlawan',
    description: 'All hero damage',
    perLevel: 0.1,          // +10% per level
    baseCost: 5,
    costGrowth: 1.5,
    maxLevel: null,
  },
  gold: {
    name: 'Rezeki Melimpah',
    description: 'Gold from kills and wave clears',
    perLevel: 0.1,
    baseCost: 5,
    costGrowth: 1.5,
    maxLevel: null,
  },
  houseHp: {
    name: 'Rumah Kukuh',
    description: 'House max HP',
    perLevel: 0.1,
    baseCost: 4,
    costGrowth: 1.5,
    maxLevel: null,
  },
  packDiscount: {
    name: 'Ang Pow Murah',
    description: 'Pack cost',
    perLevel: 1,            // -1 Ang Pow per level
    baseCost: 20,
    costGrowth: 2.5,
    maxLevel: 2,            // packs never cost less than 1
  },
};

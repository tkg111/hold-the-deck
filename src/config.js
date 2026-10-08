// All balance numbers live here. Placeholders — tune during playtesting.
// Times are in milliseconds, speeds in pixels/second, distances in pixels.

export const GAME_TITLE = 'Hold the Deck';

// The game's base resolution: 480x270 pixels, shown at the largest whole-number
// scale that fits the window (see src/display.js). All positions, sizes,
// distances and speeds are in these base pixels, and sprites and text are
// drawn at 1x in them.
export const DISPLAY = {
  width: 480,
  height: 270,
};

// Pixel art, drawn with Phaser's pixelArt setting. Scene positions come from
// public/sprites/layout.json.
export const SPRITES = {
  path: 'sprites/',   // under public/
  // Heroes without a sprite yet are drawn as a rectangle this size, standing
  // on the slot like a sprite would.
  placeholderHero: { width: 12, height: 25 },
  // Visible height of each hero sprite in sprite pixels (feet on the bottom
  // row), so shots and labels come from the body rather than empty space.
  heroes: {
    // faceTop: first row of the head; the UI crops a FACE-sized face from there.
    cabinBoy: { key: 'cabin_boy', height: 29, faceTop: 3 },
    shipsCook: { key: 'ships_cook', height: 32, faceTop: 0 },
    netThrower: { key: 'net_thrower', height: 29, faceTop: 3 },
    voodooPriestess: { key: 'voodoo_priestess', height: 32, faceTop: 0 },
    grogBrewer: { key: 'grog_brewer', height: 28, faceTop: 4 },
    harpooner: { key: 'harpooner', height: 28, faceTop: 4 },
    cannoneer: { key: 'cannoneer', height: 27, faceTop: 5 },
    duelist: { key: 'the_duelist', height: 32, faceTop: 0 },
    captain: { key: 'the_captain', height: 31, faceTop: 1 },
  },
  // Crew faces in the UI: this box of each hero's 32x32 sprite (x, width and
  // height in art pixels; y comes from faceTop).
  face: { x: 6, width: 16, height: 14 },
  // The Kraken's splash while it rises (layout.json describes it in a note):
  // 64x24 frames, drawn with its top this many art pixels above the waterline.
  krakenSplash: { key: 'splash_sheet', frameWidth: 64, frameHeight: 24, frames: 3, fps: 8, aboveWater: 23 },
  // Clickable area over each ship slot (standing on the slot);
  // narrower where a deck's slots are closer together than maxWidth.
  slotZone: { maxWidth: 20, height: 30 },
};

// The UI kit (public/sprites/ui/): panels, buttons, bar, icons and ui.json
// (9-slice sizes, icon order, colours) and bitmap fonts in ui/fonts/.
export const UI_KIT = {
  path: 'ui/',
  starColor: '#ffc83a',
  starEmptyColor: '#c9b48a',
  dividerColor: '#d9c39a', // lines between parchment rows
  dotRadius: 3,           // red "something to do" dot on buttons
  shipwrightRows: 5,      // rows visible at once; more scroll
  rowHeight: 28,
};

export const SHIP = {
  // The ship sprites are 160x160 art pixels (ship_stage1..3 plus a _front
  // railing layer each), all at layout.json's shipPos; enemies stop at its
  // shipContactX.
  baseHp: 100,
  startingDecks: 1,
  maxDecks: 3,
  slotsPerDeck: 2,
};

export const RARITY = {
  common: { label: 'Common', color: 0xb0bec5 },
  rare: { label: 'Rare', color: 0x42a5f5 },
  epic: { label: 'Epic', color: 0xba68c8 },
  legendary: { label: 'Legendary', color: 0xff9800 },
};

// catchphrase: one-line pirate intro shown the first time the hero is pulled.
// Heroes with art are listed in SPRITES.heroes; the rest use `color` rectangles.
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
//           buffs the other heroes on the same deck. damageBonus grows per level
//           and with stars (same star bonus as damage).
export const HEROES = {
  cabinBoy: {
    name: 'Cabin Boy',
    shortName: 'Cabin',
    rarity: 'common',
    color: 0x66bb6a,
    damage: 5,
    attackInterval: 450,
    range: 350,
    projectileSpeed: 325,
    projectileColor: 0xdddddd,
    projectileSize: 2.5,
    catchphrase: "Aye aye! Point me at 'em and I'll sling till they sink!",
  },
  shipsCook: {
    name: "Ship's Cook",
    shortName: 'Cook',
    rarity: 'common',
    color: 0xff7043,
    damage: 9,
    attackInterval: 900,
    range: 325,
    projectileSpeed: 250,
    projectileColor: 0xffab91,
    projectileSize: 3.5,
    stun: { chance: 0.25, duration: 1000 },
    catchphrase: 'Complain about me stew one more time, I dare ye!',
  },
  netThrower: {
    name: 'Net Thrower',
    shortName: 'Netter',
    rarity: 'rare',
    color: 0x29b6f6,
    damage: 6,
    attackInterval: 2200,
    range: 300,
    projectileSpeed: 190,
    projectileColor: 0x81d4fa,
    projectileSize: 4.5,
    area: { radius: 37.5 },
    slow: { factor: 0.5, duration: 2500 },
    catchphrase: 'Hold still, ye barnacle-brained bilge rats!',
  },
  voodooPriestess: {
    name: 'Voodoo Priestess',
    shortName: 'Voodoo',
    rarity: 'epic',
    color: 0x7e57c2,
    damage: 8,
    attackInterval: 1100,
    range: 325,
    projectileSpeed: 225,
    projectileColor: 0xce93d8,
    projectileSize: 3.5,
    curse: { bonus: 0.3, duration: 4000 },
    catchphrase: "The spirits whisper yer name... and they're hungry.",
  },
  grogBrewer: {
    name: 'Grog Brewer',
    shortName: 'Grog',
    rarity: 'rare',
    color: 0x558b2f,
    damage: 4,
    attackInterval: 900,
    range: 360,
    projectileSpeed: 425,
    projectileColor: 0x9ccc65,
    projectileSize: 1.5,
    poison: { ratio: 0.75, duration: 4000 },
    catchphrase: "One sip o' me brew and ye'll feel it for days.",
  },
  harpooner: {
    name: 'Harpooner',
    shortName: 'Harpoon',
    rarity: 'rare',
    color: 0x5d7a8c,
    damage: 8,
    attackInterval: 1700,
    range: 325,
    projectileSpeed: 215,
    projectileColor: 0xcfd8dc,
    projectileSize: 4.5,
    pierce: { maxTargets: 6, length: 150, hitRadius: 11 },
    catchphrase: "Line 'em up, and I'll skewer the lot of 'em!",
  },
  cannoneer: {
    name: 'Cannoneer',
    shortName: 'Cannon',
    rarity: 'epic',
    color: 0x8d6e63,
    damage: 24,
    attackInterval: 3200,
    range: 325,
    projectileColor: 0x263238,
    projectileSize: 5.5,
    area: { radius: 47.5 },
    lob: { flightTime: 1000, arcHeight: 75 },
    catchphrase: 'FIRE IN THE HOLE! Mind yer heads, lads!',
  },
  duelist: {
    name: 'The Duelist',
    shortName: 'Duelist',
    rarity: 'legendary',
    color: 0xb71c1c,
    damage: 40,
    attackInterval: 1300,
    range: 340,
    projectileSpeed: 475,
    projectileColor: 0xeceff1,
    projectileSize: 3,
    crit: { chance: 0.35, multiplier: 2.5 },
    catchphrase: "En garde. This won't take long.",
  },
  captain: {
    name: 'The Captain',
    shortName: 'Captain',
    rarity: 'legendary',
    color: 0x1a237e,
    damage: 0,
    aura: { damageBonus: 0.5, damageBonusPerLevel: 0.04, attackSpeedBonus: 0.3 },
    catchphrase: 'All hands on deck! Make me proud, ye scurvy dogs!',
  },
};

export const STARTING_HEROES = ['cabinBoy'];

export const ENEMIES = {
  drownedSailor: {
    name: 'Drowned Sailor',
    color: 0x8fb8a8,
    sprite: 'drowned_sailor',  // 32x32, feet on the bottom row
    width: 13,          // torso width; its arms reach further out front
    height: 30,         // visible height
    hp: 20,
    speed: 22.5,
    damage: 5,          // per hit on the ship
    attackInterval: 1000,
    gold: 2,            // per kill, before wave scaling
  },
  thiefMonkey: {
    name: 'Thief Monkey',
    color: 0x8d5a3b,
    sprite: 'thief_monkey',   // 32x32, feet on the bottom row
    width: 14,
    height: 25,
    hp: 8,
    speed: 65,
    damage: 0,          // doesn't attack the ship...
    attackInterval: 1000,
    gold: 3,
    stealPercent: 0.05, // ...steals this share of current gold, then vanishes
  },
  kraken: {
    name: 'The Kraken',
    boss: true,
    color: 0x6a1b9a,
    sprite: 'the_kraken',     // 64x64, flat bottom on the waterline
    width: 56,
    height: 60,
    hp: 400,
    speed: 9,
    damage: 25,
    attackInterval: 1500,
    gold: 50,
    statusResist: 0.5,  // stun and slow durations multiplied by this
    emerges: true,      // rises out of the sea at layout.json's kraken position
  },
};

// Battle speeds the x-button cycles through during a wave (1 = normal).
// Session only: it isn't saved, and between waves everything runs at 1x.
export const GAME_SPEEDS = [1, 2];

export const WAVES = {
  // Enemy count: baseCount + (wave - 1) * countPerWave
  baseCount: 5,
  countPerWave: 2,
  // Enemy HP multiplier: 1 + (wave - 1) * hpGrowth
  hpGrowth: 0.2,
  // Enemy damage multiplier: 1 + (wave - 1) * damageGrowth
  damageGrowth: 0.1,
  // Spawn interval shrinks each wave down to a minimum.
  spawnInterval: 900,
  spawnIntervalPerWave: -30,
  minSpawnInterval: 350,

  // Thief Monkey share of a wave: thiefMonkeyShare + (wave - thiefMonkeyFromWave) * thiefMonkeySharePerWave, capped.
  thiefMonkeyFromWave: 3,
  thiefMonkeyShare: 0.15,
  thiefMonkeySharePerWave: 0.01,
  thiefMonkeyShareMax: 0.4,

  // Every bossEvery-th wave: The Kraken plus a reduced escort of regular enemies.
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

  // Pearls: earned from wave clears, milestone waves and boss kills; spent on
  // treasure chests (packs).
  startingPearls: 3,        // enough for one chest right away
  pearlsPerWave: 1,         // every wave clear
  pearlsMilestoneEvery: 5,  // clearing every Nth wave pays a bonus on top
  pearlsPerMilestone: 5,
  pearlsPerBoss: 5,         // first kill of each boss wave only
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
  // Duplicate of a max-star hero refunds this many Pearls instead.
  maxStarRefund: 1,
};

// Treasure-chest presentation, per rarity of the hero being pulled.
export const PACK_FX = {
  // How long the chest rattles and glows before opening (ms). Rarer = longer.
  buildUp: { common: 700, rare: 1300, epic: 2000, legendary: 2900 },
  // The glow starts white and shifts to the rarity colour over this last
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
  hullHp: {
    hpPerLevel: 25,
    baseCost: 20,
    costGrowth: 1.25,
  },
  deck: {
    costs: [100, 300],  // cost of deck 2, deck 3
    hpPerDeck: 50,     // bonus max HP for each deck built
  },
  heroLevel: {
    // Damage at level L: baseDamage * (1 + (L - 1) * damagePerLevel)
    damagePerLevel: 0.2,
    baseCost: 15,
    costGrowth: 1.25,
  },
};

// Prestige: "New Voyage". Resets the run (wave, gold, ship, hero levels)
// for Renown, a permanent currency spent in the Renown shop.
export const PRESTIGE = {
  unlockWave: 20,
  // Renown = floor(renownBase * (waveReached / unlockWave) ^ renownExponent)
  renownBase: 10,
  renownExponent: 1.5,
  // Pearls lump = floor(waveReached * pearlsPerWave)
  pearlsPerWave: 0.5,
};

// Permanent bonuses bought with Renown. Cost at level L:
// round(baseCost * costGrowth ^ L). maxLevel: null = unlimited.
export const RENOWN_SHOP = {
  heroDamage: {
    name: 'Fearsome Crew',
    description: 'All hero damage',
    perLevel: 0.1,          // +10% per level
    baseCost: 5,
    costGrowth: 1.5,
    maxLevel: null,
  },
  gold: {
    name: 'Plunder',
    description: 'Gold from kills and wave clears',
    perLevel: 0.1,
    baseCost: 5,
    costGrowth: 1.5,
    maxLevel: null,
  },
  hullHp: {
    name: 'Reinforced Hull',
    description: 'Hull max HP',
    perLevel: 0.1,
    baseCost: 4,
    costGrowth: 1.5,
    maxLevel: null,
  },
  packDiscount: {
    name: 'Pearl Broker',
    description: 'Treasure chest cost',
    perLevel: 1,            // -1 Pearl per level
    baseCost: 20,
    costGrowth: 2.5,
    maxLevel: 2,            // chests never cost less than 1
  },
};

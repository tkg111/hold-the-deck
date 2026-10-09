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

// Filling a view bigger than the base resolution (see src/display.js and
// src/scenery.js). The battle scene keeps bg.png's island at the right edge
// and the ship at the bottom-left; extra width is sea in between, extra height
// is sky above.
export const SCENERY = {
  // Sea and sky to the left of bg.png (and the near water of fg_sheet.png) are
  // its leftmost mirrorWidth columns, repeated mirror-wise so the seams match.
  // Stays left of the beach (sand starts at x = 302 on the bottom row).
  mirrorWidth: 288,
  // Above bg.png the sky bands keep going: each band darker than the one
  // below it by the same step as bg.png's top two, as tall as its second
  // band, up to this many; higher than that the last colour carries on.
  maxExtraSkyBands: 5,
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
  // The hero picker: wider than the Shipwright (it extends left over the
  // sea) with taller rows that also show each crewmate's ability.
  pickerWidth: 260,
  pickerRows: 4,
  pickerRowHeight: 36,
};

// Effect sprite sheets in public/sprites/fx/ (fx.json gives each one's frame
// size, frame count, fps and whether it loops), drawn at 1x.
export const FX = {
  path: 'fx/',          // under SPRITES.path
  hitFlashColor: 0xffffff,  // enemies flash this colour when hit
  hitFlashMs: 60,
  // Status sprites over enemies: gap in px between the HP bar and the stun
  // stars above it, and between stacked status marks.
  statusGap: 1,
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
// projectile: { sprite, impact, rotate } — fx sheets (see FX) for the shot and
// what plays where it hits; rotate turns the shot (drawn flying right) to its
// flight angle. Lobbed heroes (lob) throw in an arc, the rest fly straight.
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
    projectile: { sprite: 'pebble', impact: 'hit_spark' },
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
    projectile: { sprite: 'frying_pan', impact: 'hit_spark' },
    lob: { flightTime: 800, arcHeight: 45 },
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
    projectile: { sprite: 'net_throw', impact: 'hit_spark' },
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
    projectile: { sprite: 'spirit_orb', impact: 'hit_spark' },
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
    projectile: { sprite: 'grog_bottle', impact: 'grog_splash' },
    lob: { flightTime: 650, arcHeight: 40 },
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
    projectile: { sprite: 'harpoon', impact: 'hit_spark', rotate: true },
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
    projectile: { sprite: 'cannonball', impact: 'explosion' },
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
    projectile: { sprite: 'blade_arc', impact: 'hit_spark', rotate: true },
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

// Active abilities, one per crewmate (keyed like HEROES), used from the
// ability bar during waves. cooldown and every duration are in ms; damage
// values are multiples of the hero's own damage (so they grow with level and
// stars like it does), and every `duration` / `stun` grows with
// ABILITY_SCALING. `effect` is the line shown in the crew picker and Crew
// Roster; {placeholders} are filled from the ability's numbers (see
// describeAbility in src/ui/HeroPicker.js). `color` tints its name as it
// floats up. Sprite fields name fx sheets (see FX): `fx` stands on each
// boosted crewmate's slot while the boost lasts (behind them with behind),
// `sprite` is what's thrown or dropped and `impact` plays where it hits.
// Abilities need a targetable enemy on screen to fire; needsRange ones (the
// attack speed boosts) need one within range of the crew (ABILITY_BAR.supportRange).
export const ABILITIES = {
  cabinBoy: {
    name: 'Rapid Fire', cooldown: 15000, color: 0xfff176,
    attackSpeed: 3, duration: 4000, needsRange: true,
    fx: { sprite: 'rapid_fire', behind: true },
    effect: 'Triple attack speed for {duration}',
  },
  shipsCook: {
    name: 'Hot Stew', cooldown: 18000, color: 0xff8a50,
    stun: 2000, radius: 45, flightTime: 700, arcHeight: 70,
    sprite: 'stew_pot', impact: 'stew_splash',
    effect: 'Pot stuns all in an area for {stun}',
  },
  netThrower: {
    name: 'Big Net', cooldown: 20000, color: 0x81d4fa,
    slow: 0.5, duration: 5000,
    sprite: 'big_net',   // tiled along the lane
    dropTime: 350, fadeTime: 400,   // the net drops in, and fades as the slow ends
    effect: 'Slows every enemy {slow} for {duration}',
  },
  grogBrewer: {
    name: 'Grog Barrel', cooldown: 18000, color: 0x9ccc65,
    duration: 6000, damagePerSecond: 2.5, lingerTime: 500,
    flightTime: 600, arcHeight: 60,
    sprite: 'grog_barrel', impact: 'grog_splash', puddle: 'poison_puddle',
    fadeTime: 400,     // the puddle (as wide as poison_puddle.png) fades at the end
    effect: 'Poison puddle on the lane for {duration}',
  },
  harpooner: {
    name: 'Whale Harpoon', cooldown: 20000, color: 0xcfd8dc,
    damage: 5, speed: 520,
    sprite: 'whale_harpoon', impact: 'hit_spark',
    effect: 'Pierces the whole lane for {damage} dmg',
  },
  voodooPriestess: {
    name: 'Hex', cooldown: 25000, color: 0xce93d8,
    bonus: 0.5, duration: 6000,
    effect: 'Curse all: +{bonus} dmg taken for {duration}',
  },
  cannoneer: {
    name: 'Broadside', cooldown: 25000, color: 0xffb74d,
    balls: 6, damage: 2, radius: 40, interval: 160, fallTime: 550,
    sprite: 'cannonball', impact: 'explosion',
    effect: '{balls} cannonballs on the lane, {damage} dmg',
  },
  duelist: {
    name: 'Lunge', cooldown: 22000, color: 0xff5252,
    hits: 5,
    impact: 'lunge_cross',   // on the target with each crit
    effect: 'Next {hits} hits on toughest foe crit',
  },
  captain: {
    name: 'All Hands!', cooldown: 30000, color: 0xffd54f,
    attackSpeed: 1.5, duration: 6000, needsRange: true,
    fx: { sprite: 'all_hands' },
    effect: 'Whole crew +{attackSpeed} attack speed {duration}',
  },
};

// How abilities grow: each duration (and the Hot Stew stun) is multiplied by
// min(maxScale, 1 + (level - 1) * perLevel + stars * perStar).
export const ABILITY_SCALING = {
  perLevel: 0.02,
  perStar: 0.1,
  maxScale: 2,
};

// The ability bar shown at the bottom centre during waves: a wood portrait
// button per crewmate on the ship (keys 1-6, in slot order) and an Auto toggle.
export const ABILITY_BAR = {
  buttonSize: 26,
  gap: 5,              // room for the glow between buttons
  autoGap: 8,          // between the last portrait and the Auto toggle
  autoWidth: 40,
  bottomMargin: 3,
  sweepColor: 0x000000,
  sweepAlpha: 0.6,
  glowColor: 0xffd54f,
  glowWidth: 2,        // px
  glowPulseMs: 450,    // ready glow pulse period
  autoOnColor: '#ffd86a',
  // needsRange abilities only fire with an enemy this close to the crewmate.
  supportRange: 350,
};

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

  // Saves from before prestige was removed (save v6): all Renown, held plus
  // what was spent in the Renown shop, is paid back as this many Pearls each.
  pearlsPerOldRenown: 2,
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

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
    parrotKeeper: { key: 'parrot_keeper', height: 27, faceTop: 5 },
    shipsDoctor: { key: 'ships_doctor', height: 25, faceTop: 7 },
    sharpshooter: { key: 'sharpshooter', height: 28, faceTop: 4 },
    ghostPirate: { key: 'ghost_pirate', height: 28, faceTop: 4 },
    stormCaller: { key: 'storm_caller', height: 32, faceTop: 1 },
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
  antiAirColor: '#2f6db5', // anti-air mark on crew cards and picker rows
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
  // Ring under the feet of a boosted crewmate (ability boosts and The
  // Captain's deck buff): this row of the sheet sits on their feet. The
  // Captain, as the buff's source, always stands on a still (frame 0),
  // dimmed one at sourceAlpha, unless he's boosted himself.
  buffRing: { sprite: 'buff_ring', footRow: 5, sourceAlpha: 0.6 },
};

export const SHIP = {
  // The ship sprites are 160x160 art pixels (ship_stage1..3 plus a _front
  // railing layer each), all at layout.json's shipPos; enemies stop at its
  // shipContactX.
  baseHp: 120,          // max hull HP at hull level 0 (see UPGRADES.hullHp)
  startingDecks: 1,
  maxDecks: 3,
  slotsPerDeck: 2,
  // The hull, where the Ghost Galleon's cannonballs land and Patch Up's
  // crosses rise: from `left` px right of the ship's left edge to `right` px
  // short of shipContactX, between minAbove and maxAbove px over layout.waterY.
  hull: { left: 24, right: 12, minAbove: 10, maxAbove: 34 },
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
//   aura:   { damageBonus, damageBonusPerLevel, damageBonusPerStar, maxDamageBonus,
//           attackSpeedBonus } — doesn't attack; buffs the other heroes on the
//           same deck. The damage bonus grows per level and per star, up to
//           maxDamageBonus.
//   levelSpeed: { perLevel, max }    — attack speed +perLevel per level above 1, up to +max
//   antiAir: true                   — can hit flying enemies (Storm Harpies)
//   netsFlyers: true                — can't hurt flyers in the air, but can aim
//                                     at them: the net grounds them (see slow)
//   flyerBonus: n                   — n x damage against flyers
//   targets: 'furthest'             — aims at the enemy furthest from the ship
//   ignoresArmor: true              — armour doesn't reduce its hits (area hits too)
//   passesShields: true             — straight shots that pass through shields
//   muzzle: { x, y, fx }            — shots start here (from the hero's centre x
//                                     and feet), with fx playing there
//   chain: { targets, jump, falloff, from: { x, y }, segment, segmentMs, impact }
//          — instant lightning from `from` (off centre x / feet) to the target,
//            then jumping to the nearest enemy not yet hit within `jump` px,
//            up to `targets`; each jump does falloff x the last hit. segment is
//            tiled along each link for segmentMs, impact plays on each enemy.
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
    antiAir: true,
    levelSpeed: { perLevel: 0.01, max: 0.5 },
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
    damage: 10,
    attackInterval: 1800,
    range: 300,
    projectileSpeed: 190,
    projectile: { sprite: 'net_throw', impact: 'hit_spark' },
    area: { radius: 37.5 },
    slow: { factor: 0.5, duration: 2500 },
    netsFlyers: true,
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
    antiAir: true,
    catchphrase: "The spirits whisper yer name... and they're hungry.",
  },
  grogBrewer: {
    name: 'Grog Brewer',
    shortName: 'Grog',
    rarity: 'rare',
    color: 0x558b2f,
    damage: 5,
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
    antiAir: true,
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
    ignoresArmor: true,
    lob: { flightTime: 1000, arcHeight: 75 },
    catchphrase: 'FIRE IN THE HOLE! Mind yer heads, lads!',
  },
  duelist: {
    name: 'The Duelist',
    shortName: 'Duelist',
    rarity: 'legendary',
    color: 0xb71c1c,
    damage: 24,
    attackInterval: 1300,
    range: 340,
    projectileSpeed: 475,
    projectile: { sprite: 'blade_arc', impact: 'hit_spark', rotate: true },
    crit: { chance: 0.3, multiplier: 2.2 },
    antiAir: true,
    catchphrase: "En garde. This won't take long.",
  },
  captain: {
    name: 'The Captain',
    shortName: 'Captain',
    rarity: 'legendary',
    color: 0x1a237e,
    damage: 0,
    aura: { damageBonus: 0.4, damageBonusPerLevel: 0.02, damageBonusPerStar: 0.05, maxDamageBonus: 1, attackSpeedBonus: 0.3 },
    catchphrase: 'All hands on deck! Make me proud, ye scurvy dogs!',
  },
  parrotKeeper: {
    name: 'Parrot Keeper',
    shortName: 'Parrots',
    rarity: 'common',
    color: 0x43a047,
    damage: 5,
    attackInterval: 750,
    range: 340,
    projectileSpeed: 210,
    projectile: { sprite: 'parrot_fly', impact: 'hit_spark' },
    antiAir: true,
    flyerBonus: 4,
    catchphrase: "Polly wants a harpy! Sic 'em, me beauties!",
  },
  shipsDoctor: {
    name: "Ship's Doctor",
    shortName: 'Doctor',
    rarity: 'rare',
    color: 0xeceff1,
    damage: 7,
    attackInterval: 1000,
    range: 320,
    projectileSpeed: 260,
    projectile: { sprite: 'scalpel', impact: 'hit_spark', rotate: true },
    catchphrase: "Hold still. This'll only hurt a great deal.",
  },
  sharpshooter: {
    name: 'Sharpshooter',
    shortName: 'Sharp',
    rarity: 'epic',
    color: 0x6d4c41,
    damage: 26,
    attackInterval: 2100,
    range: 430,
    projectileSpeed: 620,
    projectile: { sprite: 'musket_shot', impact: 'hit_spark', rotate: true },
    // The musket's tip in sharpshooter.png (column 31, row 15).
    muzzle: { x: 16, y: -16, fx: 'muzzle_flash' },
    targets: 'furthest',
    ignoresArmor: true,
    catchphrase: 'One shot. One sailor. No refunds.',
  },
  ghostPirate: {
    name: 'Ghost Pirate',
    shortName: 'Ghost',
    rarity: 'epic',
    color: 0x80cbc4,
    damage: 13,
    attackInterval: 1100,
    range: 330,
    projectileSpeed: 240,
    projectile: { sprite: 'ghost_cutlass', impact: 'hit_spark' },
    passesShields: true,
    catchphrase: "Ye can't sink what's already drowned, matey. Ooooh.",
  },
  stormCaller: {
    name: 'Storm Caller',
    shortName: 'Storm',
    rarity: 'legendary',
    color: 0x5c6bc0,
    damage: 28,
    attackInterval: 1500,
    range: 340,
    antiAir: true,
    // The staff's tip in storm_caller.png (about column 26, row 1).
    chain: {
      targets: 3, jump: 80, falloff: 0.8, from: { x: 10, y: -30 },
      segment: 'lightning_seg', segmentMs: 200, impact: 'lightning_hit',
    },
    catchphrase: 'The sea answers to me, and today she be angry.',
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
// Only abilities with air: true count (and reach) flying Storm Harpies; the
// rest work on the lane. `needs` narrows what lets one fire: 'flyers' (a
// flyer on screen), 'movable' (a ground enemy that walks, so not the Siren or
// the Ghost Galleon) or 'repairs' (the hull below full, no enemy needed).
export const ABILITIES = {
  cabinBoy: {
    name: 'Rapid Fire', cooldown: 15000, color: 0xfff176,
    attackSpeed: 3, duration: 4000, needsRange: true, air: true,
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
    slow: 0.5, duration: 5000, air: true,   // grounds flyers like the Net Thrower's net
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
    shake: { duration: 300, intensity: 0.0015 },  // light camera shake as it's thrown
    effect: 'Pierces the whole lane for {damage} dmg',
  },
  voodooPriestess: {
    name: 'Hex', cooldown: 25000, color: 0xce93d8,
    bonus: 0.5, duration: 6000, air: true,
    // hex_cast plays on her, its ring (this row of the 48px frame) at her
    // feet; curseAt ms in, the curse lands on every enemy with a hex_hit
    // burst, and their curse mark shows once the burst is over.
    cast: 'hex_cast', castRingRow: 34, curseAt: 300, impact: 'hex_hit',
    effect: 'Curse all: +{bonus} dmg taken for {duration}',
  },
  cannoneer: {
    name: 'Broadside', cooldown: 25000, color: 0xffb74d,
    balls: 6, damage: 2, radius: 40, interval: 160, fallTime: 550,
    shake: { duration: 60, intensity: 0.002 },   // light camera shake per impact
    sprite: 'cannonball', impact: 'explosion',
    effect: '{balls} cannonballs on the lane, {damage} dmg',
  },
  duelist: {
    name: 'Lunge', cooldown: 22000, color: 0xff5252,
    hits: 5, air: true,
    impact: 'lunge_cross',   // on the target with each crit
    mark: 'lunge_target',    // loops on the target while crits remain
    effect: 'Next {hits} hits on toughest foe crit',
  },
  captain: {
    name: 'All Hands!', cooldown: 30000, color: 0xffd54f,
    attackSpeed: 1.5, duration: 6000, needsRange: true, air: true,
    fx: { sprite: 'all_hands' },
    effect: 'Whole crew +{attackSpeed} attack speed {duration}',
  },
  parrotKeeper: {
    name: 'Flock', cooldown: 16000, color: 0x9ccc65,
    damage: 4, air: true, needs: 'flyers',   // only fires with a flyer on screen
    // A parrot (speed) homes on every flyer on screen; `extra` more fly
    // across the sky from the ship for show, spread over `spread` px of height.
    sprite: 'parrot_fly', impact: 'hit_spark', speed: 300, extra: 6, extraSpeed: 170, spread: 70,
    effect: 'Parrots hit every flyer for {damage} dmg',
  },
  shipsDoctor: {
    name: 'Patch Up', cooldown: 24000, color: 0x81c784,
    heal: 0.15, needs: 'repairs',   // only fires with the hull below full
    // heal_plus sprites rise over the hull: count of them, staggered by
    // interval ms, each rising `rise` px while it fades.
    sprite: 'heal_plus', count: 5, interval: 90, rise: 22, riseMs: 700,
    effect: 'Repairs {heal} of max hull HP',
  },
  sharpshooter: {
    name: 'Deadeye', cooldown: 22000, color: 0xffe082,
    damage: 10, aimMs: 1000, speed: 900,
    shake: { duration: 80, intensity: 0.002 },   // as the shot lands
    mark: 'deadeye_mark',   // on the target (the toughest) while he aims
    effect: 'Marks the toughest foe: one {damage} dmg shot',
  },
  ghostPirate: {
    name: 'Haunt', cooldown: 24000, color: 0x80cbc4,
    duration: 3000, needs: 'movable',   // ground enemies that walk (not the Siren or the Galleon)
    mark: 'fear_mark',
    effect: 'Ground foes flee backwards for {duration}',
  },
  stormCaller: {
    name: 'Tidal Wave', cooldown: 28000, color: 0x4fc3f7,
    damage: 2, push: 110, speed: 240, needs: 'movable',
    // tidal_wave (72px wide) rolls right along the lane from the ship;
    // every walker it reaches is pushed `push` px back toward the island.
    sprite: 'tidal_wave', sink: 6,   // its bottom sits this far below the lane
    effect: 'Pushes ground foes back, {damage} dmg',
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

// Every enemy is 32x32 (The Kraken 64x64, the Siren 48x48) with its feet on
// the bottom row; width and height are its visible body, used for hits and
// where it stops. sprite: the <sprite>_sheet.png animations (animations.json);
// sheetOnly: there is no single <sprite>.png. walkAnim / idleAnim rename the
// "walk" / "idle" animation. Numbers scale per wave (see WAVES): hp,
// shield.hp and blast.enemyDamage with the HP multiplier, damage with the
// damage multiplier, gold with the gold multiplier.
//   armor:     share of each hit's damage it shrugs off, down to minDamage;
//              poison, curse bonus damage and ignoresArmor crew/abilities get through
//   hullShare: { normal, elite } — its one hit on the ship is this share of
//              the hull's max HP (instead of damage; not scaled by wave)
//   flies:     cruises at layout.harpyFlightY, then dives at the top deck; only
//              antiAir crew can hit it while airborne, and a net grounds it
//   blast:     blows up on reaching the ship (damage, to the hull); killed
//              first, its keg hits enemies within radius for enemyDamage
//   shield:    blocks straight shots until its hp is gone; lobbed ones hit
//   stationary + song: the Siren (see below)
//   galleon:   the Ghost Galleon's emerge, volleys and boats (see below)
//   boards:    deals its damage once on reaching the ship, then is gone
//   floats:    keeps its bottom on layout.boardingBoat.waterlineY
//   minion:    spawned by a boss; no Wanted poster or defeat count
// Wanted Board: description is the one-line text on its poster's page,
// weakTo the crew (HEROES keys) shown as good against it, and face (for
// sprites bigger than 32x32) where the 32x32 portrait is cropped from.
export const ENEMIES = {
  drownedSailor: {
    name: 'Drowned Sailor',
    description: 'Shambles up from the deep and claws at the hull.',
    weakTo: ['stormCaller', 'harpooner', 'cannoneer'],
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
    description: 'Dashes aboard, grabs a fistful of gold and runs.',
    weakTo: ['cabinBoy', 'netThrower'],
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
  ironCrab: {
    name: 'Iron Crab',
    description: 'Plated shell shrugs off weak hits. Hit it hard.',
    weakTo: ['sharpshooter', 'duelist', 'cannoneer'],
    color: 0x5a6470,
    sprite: 'iron_crab',
    sheetOnly: true,
    width: 26,
    height: 23,
    hp: 60,
    speed: 12,
    damage: 8,
    attackInterval: 1200,
    gold: 6,
    armor: 0.6,
    minDamage: 1,
  },
  stormHarpy: {
    name: 'Storm Harpy',
    description: 'Dives at the top deck. Shoot it down or net it.',
    weakTo: ['parrotKeeper', 'stormCaller', 'netThrower'],
    color: 0x6b6fb5,
    sprite: 'storm_harpy',
    sheetOnly: true,
    idleAnim: 'fly',    // loops the whole time; "dive" shows while diving
    width: 18,
    height: 22,
    hp: 22,
    speed: 30,
    damage: 6,
    attackInterval: 1100,
    gold: 5,
    flies: {
      // Where it hovers to attack: off the front of the top deck (from the
      // frontmost slot on it: x to the right, y up from its feet).
      hoverX: 22,
      hoverY: -14,
      hoverSpread: 8,   // each picks a spot up to this far off it, so they don't stack
      diveFrom: 70,     // starts diving this far right of the hover point
      diveSpeed: 110,
      climbSpeed: 40,   // back up to its height after a net
      fallSpeed: 120,   // dropping to the lane when netted
    },
  },
  kegRunner: {
    name: 'Keg Runner',
    description: 'Blows up on the hull. Pop it early to blast its friends.',
    weakTo: ['netThrower', 'stormCaller', 'cannoneer'],
    color: 0x9c6b3a,
    sprite: 'keg_runner',
    sheetOnly: true,
    width: 16,
    height: 31,
    hp: 12,
    speed: 55,
    damage: 30,         // Wanted Board only; the hull takes hullShare
    hullShare: { normal: 0.12, elite: 0.22 },   // of max hull HP when it blows up at the ship
    attackInterval: 1000,
    gold: 4,
    blast: {
      radius: 40, enemyDamage: 40,
      fx: 'explosion', fxScale: 2,
      shake: { duration: 120, intensity: 0.004 },
    },
  },
  barnacleKnight: {
    name: 'Barnacle Knight',
    description: 'Shield stops straight shots. Lob over it.',
    weakTo: ['ghostPirate', 'shipsCook', 'cannoneer'],
    color: 0x4f7a6a,
    sprite: 'barnacle_knight',
    sheetOnly: true,
    walkAnim: 'walk_shield',
    width: 18,
    height: 29,
    hp: 50,
    speed: 16,
    damage: 10,
    attackInterval: 1100,
    gold: 8,
    // brokenAnim: its walk once the shield is gone; fx plays at (offsetX,
    // offsetY) from its feet, where the shield is. barColor: the shield bar
    // over its HP bar.
    shield: {
      hp: 60, brokenAnim: 'walk_noshield',
      fx: 'shield_break', offsetX: -10, offsetY: -14, barColor: 0xb0bec5,
    },
  },
  siren: {
    name: 'Siren',
    description: 'Her song stuns the crew and spurs the horde on.',
    weakTo: ['duelist', 'harpooner', 'voodooPriestess'],
    color: 0x26a69a,
    sprite: 'siren',     // 48x48; layout.siren is the frame's top-left
    face: { x: 6, y: 4 },  // Wanted Board: 32x32 crop of frame 0 from here
    sheetOnly: true,
    width: 30,
    height: 48,
    hp: 100,
    speed: 0,
    damage: 0,
    attackInterval: 1000,
    gold: 20,
    stationary: true,   // appears at layout.siren (fading in) and stays
    fadeInMs: 500,
    // Every interval ms (the first after firstAt) she plays "sing" for
    // singMs and sends a siren_note (at noteSpeed) to a random crewmate on
    // the ship, stunning them for stun ms, and every other enemy within
    // hasteRadius of her moves and attacks hasteMult x as fast for
    // hasteDuration ms.
    song: {
      firstAt: 2500, interval: 6000, singMs: 1200,
      note: 'siren_note', noteSpeed: 120, stun: 1500,
      hasteRadius: 110, hasteMult: 1.5, hasteDuration: 4000,
    },
  },
  kraken: {
    name: 'The Kraken',
    description: 'Rises on waves 10, 30, 50. Bring your best blades.',
    weakTo: ['duelist', 'voodooPriestess', 'grogBrewer'],
    boss: true,
    color: 0x6a1b9a,
    sprite: 'the_kraken',     // 64x64, flat bottom on the waterline
    face: { x: 14, y: 22 },   // Wanted Board: 32x32 crop of frame 0 from here
    width: 56,
    height: 60,
    hp: 400,
    speed: 9,
    damage: 12,
    attackInterval: 1500,
    gold: 50,
    statusResist: 0.5,  // stun and slow durations multiplied by this
    emerges: true,      // rises out of the sea at layout.json's kraken position
    banner: 'THE KRAKEN RISES!',   // when its wave sets sail
  },
  ghostGalleon: {
    name: 'The Ghost Galleon',
    description: 'A drowned warship that will not stay sunk. Placeholder.',
    weakTo: ['sharpshooter', 'duelist', 'shipsDoctor'],
    boss: true,
    color: 0x4a6b5c,
    sprite: 'ghost_galleon',  // 96x80; layout.ghostGalleon is the frame's top-left
    face: { x: 0, y: 30 },    // Wanted Board: 32x32 crop of frame 0 (its skull bow)
    width: 90,
    height: 60,
    hp: 450,
    speed: 0,
    damage: 4,          // per ghost cannonball that hits the hull
    attackInterval: 1000,
    gold: 50,
    statusResist: 0.5,
    banner: 'THE GHOST GALLEON!',
    // Plays "emerge" once at layout.ghostGalleon (can't be hit for emergeMs),
    // then loops "idle". Every fireEvery ms (the first after firstFireAt) it
    // plays "fire" and lobs a ghost_cannonball from each gun port (gunPorts in
    // animations_new_enemies.json) at a random spot on the hull, landing
    // flightTime ms later. Every boatEvery ms (the first after firstBoatAt) a
    // boarding boat sets off from boatX px in from its frame's left edge.
    // On death it plays "sink" and fades out over sinkFadeMs.
    galleon: {
      emergeMs: 2500,
      firstFireAt: 1500, fireEvery: 5000,
      shot: 'ghost_cannonball', impact: 'explosion', flightTime: 1300, arcHeight: 60,
      firstBoatAt: 4000, boatEvery: 9000, boatX: 4,
      sinkFadeMs: 600,
    },
  },
  // Rows from the Ghost Galleon to the ship (it has no poster of its own).
  boardingBoat: {
    name: 'Boarding Boat',
    color: 0x5d7a6a,
    sprite: 'boarding_boat',  // 32x20; its bottom on layout.boardingBoat.waterlineY
    sheetOnly: true,
    walkAnim: 'row',
    minion: true,       // no Wanted poster, no defeats counted
    floats: true,       // stays on the waterline instead of following the lane
    width: 30,
    height: 15,
    hp: 30,
    speed: 18,
    damage: 15,         // Wanted Board only; the hull takes hullShare
    hullShare: { normal: 0.15, elite: 0.25 },  // of max hull HP, once, when it reaches the ship
    attackInterval: 1000,
    gold: 3,
    boards: true,       // deals its damage on arrival, then is gone
  },
};

// From fromWave, any enemy but the boss can spawn as an Elite: gold tint,
// hpMultiplier x HP (and shield), goldMultiplier x gold. Chance per enemy:
// chance + (wave - fromWave) * chancePerWave, up to maxChance.
export const ELITE = {
  fromWave: 20,
  chance: 0.08,
  chancePerWave: 0.004,
  maxChance: 0.3,
  hpMultiplier: 3,
  goldMultiplier: 3,
  tint: 0xffd54f,
};

// The Wanted Board (enemy book): art in public/sprites/ui/wanted/ with
// poster positions in its wanted.json. Every enemy type has a poster,
// unlocked the first time one spawns. Defeating enough of one type pays a
// bounty in Pearls (claimed automatically) and stamps its poster.
export const WANTED = {
  path: 'ui/wanted/',   // under SPRITES.path
  bounties: [
    { tier: 'bronze', defeats: 25, pearls: 10 },
    { tier: 'silver', defeats: 250, pearls: 25 },
    { tier: 'gold', defeats: 1000, pearls: 50 },
  ],
  // Board layout (base pixels): posters in a grid on the left, the details
  // page on the right.
  columns: 4,
  gap: 6,
  gridX: 10,
  gridY: 34,
  page: { x: 228, y: 32, width: 244, height: 230 },
  portraitScale: 2,
  unseenDot: { x: 44, y: 3 },   // red dot on a poster not opened yet
  // "NEW ENEMY!" alert the first time a type spawns (game keeps running).
  alert: { ms: 3000, fadeMs: 250, y: 30, width: 236, height: 66 },  // min height; grows with the description
  // Bounty toasts, under the wave and hull plaque.
  toast: { ms: 2500, fadeMs: 300, x: 6, y: 52, gap: 3 },
};

// Battle speeds the x-button cycles through during a wave (1 = normal).
// Session only: it isn't saved, and between waves everything runs at 1x.
export const GAME_SPEEDS = [1, 2];

// The battle runs in fixed steps of stepMs of game time, however many fit in
// each frame's time (x the battle speed), so a wave plays out the same at any
// frame rate. A frame counts as at most maxFrameMs of real time, so a
// backgrounded tab doesn't teleport enemies on return.
export const SIM = {
  stepMs: 1000 / 240,
  maxFrameMs: 100,
};

// Development builds only (see src/dev/).
export const DEV = {
  extraSpeed: 4,          // added to the speed button's cycle
  autoContinueMs: 2000,   // auto-continue: pause before the next wave / retry
};

export const WAVES = {
  // Enemies per wave (at least): baseCount + (wave - 1) * countPerWave.
  // Waves are built from FORMATIONS until they hold that many.
  baseCount: 5,
  countPerWave: 2.5,
  // Enemy HP multiplier: 1 + n * hpPerWave + n^2 * hpPerWaveSquared, n = wave - 1
  hpPerWave: 0.5,
  hpPerWaveSquared: 0.012,
  // Enemy damage multiplier: (1 + damageGrowth) ^ (wave - 1)
  damageGrowth: 0.04,
  // Time between formations shrinks each wave down to a minimum; members of
  // a formation enter formationSpacing ms apart.
  spawnInterval: 1400,
  spawnIntervalPerWave: -20,
  minSpawnInterval: 700,
  formationSpacing: 350,
  // In an escorted formation the others keep at least this far behind the
  // leader while it walks (they're free once it dies or reaches the ship).
  followGap: 16,

  // A Siren joins every sirenEvery-th wave from sirenFromWave (not boss
  // waves), entering this far through the wave.
  sirenFromWave: 16,
  sirenEvery: 3,
  sirenSpawnAt: 0.25,

  // Every bossEvery-th wave: a boss plus a reduced escort of regular enemies.
  // The bosses take turns: The Kraken on waves 10, 30, 50..., The Ghost
  // Galleon on 20, 40...
  bossEvery: 10,
  bosses: ['kraken', 'ghostGalleon'],
  bossEscortFactor: 0.65,   // fraction of the normal enemy count
  bossSpawnAt: 0.3,        // boss enters this far through the spawn queue

  // Endless grace: the first endlessGraceWaves waves after an island's finale
  // is beaten bring fewer enemies (and Elites): endlessGraceStart x the usual
  // count on the first, rising evenly to the full count on the wave after
  // the last.
  endlessGraceWaves: 10,
  endlessGraceStart: 0.5,
};

// The voyage is split into islands of `waves` waves each, in map.json's
// order (public/sprites/map/). Ship, crew, upgrades and Pearls carry over;
// each island keeps its own wave counter and best wave. Later islands are
// harder: enemy HP, damage, kill gold and Elite chance are those of wave
// (wave + waveOffset), while new enemies still arrive on the usual waves.
// Only `available` islands can be unlocked (by clearing the one before); the
// rest are placeholders on the map. hazard / boss: the map card's lines.
// Clearing an island's finale wave opens Endless mode there: its waves go on
// past `waves` as before.
export const ISLANDS = [
  {
    id: 'skull_cove', name: 'Skull Cove', waves: 50, waveOffset: 0, available: true,
    hazard: 'Harpies, Sirens', boss: 'Kraken & Galleon',
    // Wave 50: "Wrath of Skull Cove". A storm rolls in (STORM), then the
    // Ghost Galleon emerges (galleonAt ms in) and The Kraken surfaces
    // krakenAfter ms after it, each with hpFactor x its usual HP, while a
    // trickle of regular enemies comes in (trickle x the usual count, a group
    // every trickleInterval ms from trickleFrom). When one boss dies the
    // other enrages: tinted, attacking (and firing, launching boats) rage x
    // as fast. Winning pays `pearls` and a free Legendary chest, clears the
    // storm and unlocks the world map.
    finale: {
      wave: 50,
      title: 'WRATH OF SKULL COVE',
      detail: 'WAVE 50 - FINAL BATTLE',
      galleonAt: 1500, krakenAfter: 20000, hpFactor: 1.5,
      trickle: 1.0, trickleFrom: 5000, trickleInterval: 3200,
      rage: 1.6, rageTint: 0xff5a5a,
      pearls: 40, legendaryChests: 1,
      clearedTitle: 'SKULL COVE CLEARED!',
    },
  },
  { id: 'ember_isle', name: 'Ember Isle', waves: 50, waveOffset: 30, available: false, hazard: 'Lava bombs', boss: '???' },
  { id: 'frostbite_reef', name: 'Frostbite Reef', waves: 50, waveOffset: 60, available: false, hazard: '???', boss: '???' },
  { id: 'fogbound_isle', name: 'Fogbound Isle', waves: 50, waveOffset: 90, available: false, hazard: '???', boss: '???' },
];

// The finale's storm (public/sprites/storm/, storm.json gives the tint,
// clouds, rain sheet and lightning sheet). Layers sit over the battle but
// under the HUD. A lightning bolt strikes at a random x in the sky every
// lightningMin-lightningMax ms with a flashMs white flash; the storm fades in
// and out over fadeMs.
export const STORM = {
  path: 'storm/',       // under SPRITES.path
  lightningMin: 4000,
  lightningMax: 8000,
  flashMs: 100,
  flashAlpha: 0.7,
  fadeMs: 1200,
};

// The world map (public/sprites/map/, map.json gives the islands, the route
// and the ship token), drawn at 1x over map_bg.png.
export const MAP = {
  path: 'map/',         // under SPRITES.path
  title: 'THE CURSED SEAS',
  lockedAlpha: 0.45,    // locked islands: greyscale at this alpha, with a "?"
  routeColor: 0xb03a2e, // travelled legs: solid red dots
  inkColor: 0x7a5a3a,   // the rest: dotted ink
  inkAlpha: 0.7,
  ringColor: 0xd9962b,  // dotted ring round the selected island
  ringRadius: 40,
  shipTokenOffset: { x: -30, y: -22 },   // from the current island's centre
  bob: { px: 1, ms: 700 },               // the ship token bobs this much
  clearedColor: '#3a8a3a',
  card: { x: 306, y: 132, width: 166, height: 126, valueX: 64 },
};

// Groups a wave is built from, picked at random by weight from those
// unlocked (from: first wave); a formation's first wave always has one.
// members: ENEMIES keys, front first. escort: the rest keep behind the first
// while it walks, so e.g. Keg Runners shelter behind a Barnacle Knight's
// shield. A wave's line-up is seeded by its number, so a retry meets the
// same formations.
export const FORMATIONS = [
  { from: 1, weight: 4, members: ['drownedSailor'] },
  { from: 2, weight: 3, members: ['drownedSailor', 'drownedSailor', 'drownedSailor'] },
  { from: 3, weight: 1.5, members: ['thiefMonkey'] },
  { from: 4, weight: 1.5, escort: true, members: ['drownedSailor', 'thiefMonkey', 'thiefMonkey'] },
  { from: 6, weight: 2, escort: true, members: ['ironCrab', 'drownedSailor', 'drownedSailor'] },
  { from: 8, weight: 2, members: ['stormHarpy', 'stormHarpy'] },
  { from: 10, weight: 1.5, members: ['kegRunner', 'kegRunner'] },
  { from: 12, weight: 1.5, escort: true, members: ['ironCrab', 'kegRunner', 'kegRunner'] },
  { from: 14, weight: 2, escort: true, members: ['barnacleKnight', 'kegRunner', 'kegRunner'] },
  { from: 15, weight: 1.5, escort: true, members: ['barnacleKnight', 'barnacleKnight', 'drownedSailor', 'drownedSailor'] },
  { from: 18, weight: 1.5, escort: true, members: ['barnacleKnight', 'ironCrab', 'stormHarpy', 'stormHarpy'] },
];

export const ECONOMY = {
  startingGold: 0,
  // Kill gold multiplier: (1 + killGoldGrowth) ^ (wave - 1)
  killGoldGrowth: 0.07,
  // Wave clear bonus: (waveClearBase + (wave - 1) * waveClearPerWave) times
  // the kill gold multiplier
  waveClearBase: 10,
  waveClearPerWave: 4,

  // Pearls: earned from wave clears, milestone waves and boss kills; spent on
  // treasure chests (packs).
  startingPearls: 3,        // enough for one chest right away
  pearlsPerWave: 1,         // every wave clear
  pearlsMilestoneEvery: 5,  // clearing every Nth wave pays a bonus on top
  pearlsPerMilestone: 3,
  pearlsPerBoss: 5,         // first kill of each boss wave only

  // Saves from before prestige was removed (save v6): all Renown, held plus
  // what was spent in the Renown shop, is paid back as this many Pearls each.
  pearlsPerOldRenown: 2,
};

export const PACKS = {
  cost: 5,
  // "Buy 10": bulkCount chests at once for bulkCost Pearls.
  bulkCount: 10,
  bulkCost: 45,
  // Rarity weights; renormalized over rarities that actually have heroes.
  rates: { common: 0.45, rare: 0.3, epic: 0.18, legendary: 0.07 },
  // Pity: a Legendary is guaranteed within this many packs.
  legendaryPity: 30,
  maxStars: 5,
  // Total damage bonus at each star count (index = stars). Each star adds more than the last.
  starDamageBonus: [0, 0.1, 0.25, 0.45, 0.7, 1.0],
  // A duplicate of a max-star hero gives a Bonus Level instead: each one is
  // +bonusLevelDamage damage (on top of level and stars), uncapped.
  bonusLevelDamage: 0.05,
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
    // Max hull HP at level L: round(SHIP.baseHp * hpGrowth ^ L), plus decks.
    hpGrowth: 1.07,
    baseCost: 20,
    costGrowth: 1.15,
  },
  deck: {
    costs: [100, 300],  // cost of deck 2, deck 3
    hpPerDeck: 50,     // bonus max HP for each deck built
  },
  heroLevel: {
    // Damage at level L: baseDamage * (1 + (L - 1) * damagePerLevel)
    damagePerLevel: 0.2,
    baseCost: 15,
    costGrowth: 1.22,
  },
};

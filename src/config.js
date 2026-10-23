// All balance numbers live here. Placeholders — tune during playtesting.
// Times are in milliseconds, speeds in pixels/second, distances in pixels.

export const GAME_TITLE = 'Hold the Deck';

// The game's base resolution: 480x270 pixels. The game area is always 480
// wide, scaled to fill the window's width, and between 270 (16:9) and 360
// (4:3) tall; outside that range it's centred with bars (see src/display.js).
// All positions, sizes, distances and speeds are in these base pixels, and
// sprites and text are drawn at 1x in them.
export const DISPLAY = {
  width: 480,
  height: 270,
  maxAspect: 16 / 9,   // wider windows get bars left and right
  minAspect: 4 / 3,    // taller ones get bars above and below
  bars: {
    color: '#141a30',
    // The frame round the game area, rings from the inside out: [width in
    // CSS px, colour].
    border: [[1, '#2a170a'], [3, '#8a5a2e'], [1, '#2a170a']],
  },
};

// The battle backdrop in a view taller than 270: bg_tall.png (480x430) holds
// bg.png's picture at y = originY, so that row sits at the battlefield's
// y = 0. skyShare of the extra height goes above (more sky), the rest below
// (more sea). An island with its own `scenery` (see ISLANDS) swaps in its
// tall background and foreground sheet, laid out the same way.
export const SCENERY = {
  originY: 100,
  skyShare: 0.6,
};

// Weather tiled over the whole game area under the HUD (src/weather.js), at
// fps (real time), while the ship is at an island with its `flag` (`ash`,
// `snow`): frames of frameWidth x frameHeight from `file` (under path).
// Changes fade over fadeMs. `heavy` is the weather getting worse (Ember
// Isle's eruption, Frostbite Reef's blizzard): a tint over the battle and
// extra layers, of the same sheet or of heavy.file, each offset by a
// fraction of a tile and drifting at drift px/s (x, y; layer i drifts i x as
// fast), fading in and out over heavy.fadeMs.
// Ember Isle's falling ash. The finale's eruption: a red tint and two more
// layers of ash drifting down.
export const ASHFALL = {
  flag: 'ash',
  path: 'ember/',       // under SPRITES.path
  file: 'ash_sheet.png',
  frameWidth: 64,
  frameHeight: 64,
  frames: 4,
  fps: 6,
  fadeMs: 1200,
  heavy: { tint: 0xd8380c, tintAlpha: 0.22, layers: 2, drift: { x: 0, y: 14 }, fadeMs: 1200 },
};
// Frostbite Reef's snow, always falling. A blizzard (the island's hazard, and
// the whole finale) adds a pale tint and blizzard_sheet.png, scrolling
// diagonally, over the snow with a quick fade.
export const SNOWFALL = {
  flag: 'snow',
  path: 'frost/',
  file: 'snow_sheet.png',
  frameWidth: 64,
  frameHeight: 64,
  frames: 4,
  fps: 6,
  fadeMs: 1200,
  heavy: {
    file: 'blizzard_sheet.png', frames: 4, fps: 10,
    tint: 0xdcecff, tintAlpha: 0.16, layers: 1, drift: { x: -90, y: 60 }, fadeMs: 400,
  },
};
// Fogbound Isle's mist, always there (src/fog.js): mist_sheet.png's frames
// (at fps) tiled in a strip along the waterline, its top aboveWater px over
// layout.waterY, scrolling left at drift px/s, over the enemies, crew and
// ship but under status marks and enemy HP bars. It fades in and out over
// fadeMs when sailing there or away (real time, like the ash). A fog bank
// (the island's hazard, and the whole finale; see its fogBank) is
// bank.file tiled over the whole view at bank.fps, drifting at bank.drift
// px/s, at the same depth as the mist; it fades in and out with the bank
// (game time).
export const MIST = {
  flag: 'mist',
  path: 'fog/',
  file: 'mist_sheet.png',
  frameWidth: 128,
  frameHeight: 48,
  frames: 4,
  fps: 5,
  aboveWater: 34,
  drift: 6,
  fadeMs: 1200,
  bank: { file: 'fogbank_sheet.png', frameWidth: 128, frameHeight: 128, frames: 4, fps: 6, drift: { x: -10, y: 0 } },
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
    // faceTop: top row of the UI's FACE-sized face crop: the head, with tall
    // hats cut off so the eyes sit about halfway down.
    cabinBoy: { key: 'cabin_boy', height: 29, faceTop: 3 },
    shipsCook: { key: 'ships_cook', height: 32, faceTop: 3 },
    netThrower: { key: 'net_thrower', height: 29, faceTop: 3 },
    voodooPriestess: { key: 'voodoo_priestess', height: 32, faceTop: 3 },
    grogBrewer: { key: 'grog_brewer', height: 28, faceTop: 4 },
    harpooner: { key: 'harpooner', height: 28, faceTop: 4 },
    cannoneer: { key: 'cannoneer', height: 27, faceTop: 5 },
    duelist: { key: 'the_duelist', height: 32, faceTop: 3 },
    captain: { key: 'the_captain', height: 31, faceTop: 4 },
    parrotKeeper: { key: 'parrot_keeper', height: 27, faceTop: 5 },
    shipsDoctor: { key: 'ships_doctor', height: 25, faceTop: 7 },
    sharpshooter: { key: 'sharpshooter', height: 28, faceTop: 4 },
    ghostPirate: { key: 'ghost_pirate', height: 28, faceTop: 4 },
    stormCaller: { key: 'storm_caller', height: 32, faceTop: 4 },
    // The pack crew (public/sprites/newcrew2/: dir is their folder).
    anchorBosun: { key: 'anchor_bosun', dir: 'newcrew2/', height: 26, faceTop: 6 },
    powderMonkey: { key: 'powder_monkey', dir: 'newcrew2/', height: 29, faceTop: 4 },
    fireBreather: { key: 'fire_breather', dir: 'newcrew2/', height: 27, faceTop: 5 },
    blacksmith: { key: 'blacksmith', dir: 'newcrew2/', height: 29, faceTop: 4 },
    whaler: { key: 'whaler', dir: 'newcrew2/', height: 28, faceTop: 4 },
    auroraSeer: { key: 'aurora_seer', dir: 'newcrew2/', height: 28, faceTop: 4 },
    banshee: { key: 'banshee', dir: 'newcrew2/', height: 28, faceTop: 4 },
    boneCaller: { key: 'bone_caller', dir: 'newcrew2/', height: 32, faceTop: 3 },
  },
  // Crew faces in the UI: this box of each hero's 32x32 sprite (x, width and
  // height in art pixels; y comes from faceTop).
  face: { x: 6, width: 16, height: 14 },
  // The Kraken's splash while it rises (layout.json describes it in a note):
  // 64x24 frames, drawn with its top this many art pixels above the waterline.
  krakenSplash: { key: 'splash_sheet', frameWidth: 64, frameHeight: 24, frames: 3, fps: 8, aboveWater: 23 },
  // Clickable area over each ship slot (standing on the slot);
  // narrower where a deck's slots are closer together than maxWidth.
  // During a wave, tapping one breaks the ice on a frozen crewmate.
  slotZone: { maxWidth: 20, height: 30 },
};

// A frozen crewmate (Frostbite Reef's blizzard, the Frost Wyrm's breath, the
// Frost Giant's smash): can't attack, with `sprite` (an fx sheet) drawn over
// them, standing on their slot. Tapping them breaks the ice early, playing
// `breakFx` on them.
export const FREEZE = {
  sprite: 'ice_block',
  breakFx: 'frost_hit',
};

// A charmed crewmate (the Siren Queen's song): its attacks go into its own
// hull instead, selfDamage x its damage each, and it turns to face the ship,
// with `status` (an fx sheet) looping over its head. Tapping them breaks the
// charm early, playing `breakFx` on them. The Captain (who doesn't attack)
// is never charmed. For immuneMs after a charm ends (worn off or tapped)
// that crewmate can't be charmed again.
export const CHARM = {
  status: 'charm_status',
  breakFx: 'ghost_hit',
  selfDamage: 1,
  immuneMs: 3000,
};

// The UI kit (public/sprites/ui/): panels, buttons, bar, icons and ui.json
// (9-slice sizes, icon order, colours) and bitmap fonts in ui/fonts/.
export const UI_KIT = {
  path: 'ui/',
  starColor: '#ffc83a',
  starEmptyColor: '#c9b48a',
  dividerColor: '#d9c39a', // lines between parchment rows
  dotRadius: 3,           // red "something to do" dot on buttons
  // Red badge with a count inside a button's top-right corner (small font,
  // in textColor): padding round the digits, and its inset from the corner.
  badge: { textColor: '#ffffff', padX: 1, padY: 1, inset: 1 },
  antiAirColor: '#2f6db5', // anti-air mark on crew cards and picker rows
  affordColor: '#3fae3f',  // green ▲: a Shipwright upgrade you can afford
  dragThreshold: 4,       // px a press moves before it scrolls a list instead
  // The Shipwright: its width, rows visible at most (fewer if the view is
  // short; more scroll), row height, the buy button, the header strip with
  // the Ship / Crew tabs and the buy amount toggle, and the handle on its
  // left edge that slides it off the right of the view (slideMs) and back.
  shipwrightWidth: 236,
  shipwrightRows: 7,
  rowHeight: 28,
  buyButton: { width: 66, height: 19 },
  shipwrightHeader: { height: 17, buttonHeight: 14, tabWidth: 38, amountWidths: [22, 26, 30] },
  buyAmounts: ['1', '10', 'max'],   // labels: x1, x10, MAX
  maxedRowAlpha: 0.55,              // rows with nothing left to buy
  shipwrightHandle: { width: 13, height: 32, y: 14, slideMs: 180 },
  // Top HUD plaques (art pixels): the wave plaque ("FOGBOUND · WAVE 15",
  // between minWidth and maxWidth wide; past that the island's map art,
  // scaled to islandIcon px wide, stands in for the skull and its name), the
  // hull HP plaque under it (its bar at least barMin wide, wider if a
  // formatted HP needs it), and the gold and Pearls plaques top right.
  hud: {
    wave: { minWidth: 110, maxWidth: 166, islandIcon: 16 },
    hull: { y: 32, height: 18, barMin: 92 },
    goldWidth: 82,
    pearlsWidth: 74,
    plaqueGap: 3,
  },
  bottomButtonHeight: 30,   // the between-waves button bar (room for badges)
  // Its buttons' widths, left to right from `left`, `gap` apart: each fits
  // its icon and label (Log and Map are icons alone, to make room).
  bottomBar: {
    left: 4,
    gap: 2,
    widths: {
      log: 24, map: 24, voyage: 65, galley: 57, start: 106, chests: 62, crew: 51, wanted: 66,
    },
  },
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
  // The ship sprites are 176x160 art pixels (ship_stage1..3 plus a _front
  // railing layer each, and the ship parts' overlays), all drawn by their
  // top-left at layout.json's shipPos; enemies stop at its shipContactX
  // (the bowsprit reaches past it, over them).
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
//   jet: { from: { x, y }, splash } — a flame from `from` (off centre x /
//          feet; the projectile sprite's left edge, turned to the target):
//          the hit lands at once, on the target and everything within
//          splash px of it
//   knockback: { px, speed }        — each hit pushes a non-boss walker back px
//                                     (at speed px/s)
//   burn:   { ratio, duration }     — like poison, a burn of ratio x hit damage
//                                     per second (burns and poison both tick)
//   chill:  { factor, duration }    — slows like slow, without a net (flyers
//                                     stay in the air)
//   shotSound: name                 — its shot's sound effect (AUDIO.sfx;
//                                     cannon_small if not set)
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
    shotSound: 'cannon',
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

  // The pack crew (see PACKS): each balanced against crew of its rarity
  // and role.
  // Rare, like the Harpooner and the Net Thrower: slow, heavy hits.
  anchorBosun: {
    name: 'Anchor Bosun',
    shortName: 'Bosun',
    rarity: 'rare',
    color: 0x4e6a80,
    damage: 30,
    attackInterval: 2400,
    range: 320,
    projectileSpeed: 170,
    projectile: { sprite: 'thrown_anchor', impact: 'hit_spark' },
    knockback: { px: 6, speed: 120 },
    catchphrase: 'Lower the anchor. On them.',
  },
  // Common: a lobbed bomb with a small splash (a little Cannoneer).
  powderMonkey: {
    name: 'Powder Monkey',
    shortName: 'Powder',
    rarity: 'common',
    shotSound: 'cannon',
    color: 0x8d6e4a,
    damage: 6,
    attackInterval: 1000,
    range: 330,
    projectile: { sprite: 'powder_bomb', impact: 'powder_blast' },
    lob: { flightTime: 700, arcHeight: 40 },
    area: { radius: 16 },
    catchphrase: 'Who wants a present?!',
  },
  // Rare: short range, but everything near the target burns.
  fireBreather: {
    name: 'Fire Breather',
    shortName: 'Fire',
    rarity: 'rare',
    shotSound: 'cook',
    color: 0xe65100,
    damage: 9,
    attackInterval: 800,
    range: 200,
    projectile: { sprite: 'flame_jet', impact: 'hit_spark' },
    // The torch in fire_breather_sheet.png's attack frames.
    jet: { from: { x: 13, y: -17 }, splash: 20 },
    burn: { ratio: 0.6, duration: 3000 },
    catchphrase: "Feel that? That's the warm-up.",
  },
  // Epic: a steady hitter whose hammer goes through armour.
  blacksmith: {
    name: 'Blacksmith',
    shortName: 'Smith',
    rarity: 'epic',
    color: 0x6d6d6d,
    damage: 14,
    attackInterval: 1200,
    range: 330,
    projectileSpeed: 260,
    projectile: { sprite: 'thrown_hammer', impact: 'hit_spark' },
    ignoresArmor: true,
    catchphrase: "Steel's hot. Swing harder.",
  },
  // Rare: a javelin through the first few in the line, chilling them.
  whaler: {
    name: 'Whaler',
    shortName: 'Whaler',
    rarity: 'rare',
    color: 0x90a4ae,
    damage: 16,
    attackInterval: 1500,
    range: 340,
    projectileSpeed: 330,
    projectile: { sprite: 'ice_javelin', impact: 'hit_spark', rotate: true },
    pierce: { maxTargets: 3, length: 110, hitRadius: 8 },
    chill: { factor: 0.85, duration: 2000 },
    catchphrase: "I've hunted bigger. Not by much.",
  },
  // Legendary: a strong bolt that bursts on a small area, with a little chill.
  auroraSeer: {
    name: 'Aurora Seer',
    shortName: 'Aurora',
    rarity: 'legendary',
    color: 0x4dd0e1,
    damage: 30,
    attackInterval: 1100,
    range: 350,
    projectileSpeed: 280,
    projectile: { sprite: 'aurora_bolt', impact: 'hit_spark' },
    area: { radius: 40 },
    chill: { factor: 0.85, duration: 1500 },
    antiAir: true,
    catchphrase: 'The sky remembers every storm.',
  },
  // Rare, like the Harpooner: anti-air.
  banshee: {
    name: 'Banshee',
    shortName: 'Banshee',
    rarity: 'rare',
    color: 0xb0bec5,
    damage: 12,
    attackInterval: 1000,
    range: 330,
    projectileSpeed: 230,
    projectile: { sprite: 'wail_bolt', impact: 'hit_spark' },
    antiAir: true,
    catchphrase: '*an unholy shriek*',
  },
  // Legendary: his skeletons hold the line (see ALLIES).
  boneCaller: {
    name: 'Bone Caller',
    shortName: 'Bones',
    rarity: 'legendary',
    color: 0xd7ccc8,
    damage: 20,
    attackInterval: 1100,
    range: 340,
    projectileSpeed: 250,
    projectile: { sprite: 'bone_shard', impact: 'hit_spark' },
    antiAir: true,
    catchphrase: 'Up, lads. One more voyage.',
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

  // The pack crew's (fx sheets in newcrew2/fx/).
  // anchor_drop (64x64) slams down bottom-centre on the frontmost enemy on
  // the lane; impactAt ms in (its frame 3) it hits for the damage, stuns
  // and pushes it `push` px back (bosses resist both, as usual).
  anchorBosun: {
    name: 'Drop Anchor', cooldown: 20000, color: 0x90a4ae,
    damage: 8, stun: 2000, push: 20, pushSpeed: 200,
    sprite: 'anchor_drop', impactAt: 300,
    shake: { duration: 150, intensity: 0.004 },
    effect: 'Anchor on the front foe: {damage} dmg, {stun} stun',
  },
  // `bombs` powder bombs lobbed from him, `interval` ms apart, to spots
  // spread along the lane, each blasting everything within radius.
  powderMonkey: {
    name: 'Powder Barrage', cooldown: 18000, color: 0xffb74d,
    bombs: 6, damage: 2, radius: 20, interval: 120, flightTime: 700, arcHeight: 60,
    sprite: 'powder_bomb', impact: 'powder_blast',
    effect: '{bombs} powder bombs on the lane, {damage} dmg',
  },
  // `tiles` inferno_wall tiles side by side on the lane, centred on x, for
  // the duration (fading over fadeTime at the end): ground enemies in it burn
  // for damagePerSecond x his damage, and keep burning burnMs after.
  fireBreather: {
    name: 'Inferno', cooldown: 22000, color: 0xff7043,
    x: 300, tiles: 3, duration: 5000, damagePerSecond: 1.5, burnMs: 3000, fadeTime: 400,
    sprite: 'inferno_wall',
    effect: 'Wall of fire on the lane for {duration}',
  },
  // The whole crew hits bonus harder for the duration, temper_aura on each.
  blacksmith: {
    name: 'Temper Steel', cooldown: 26000, color: 0xffa726,
    bonus: 0.25, duration: 7000, needsRange: true, air: true,
    fx: { sprite: 'temper_aura' },
    effect: 'Whole crew +{bonus} damage for {duration}',
  },
  // One whale_spear at the enemy with the most HP (bosses and flyers too),
  // through armour.
  whaler: {
    name: 'Whale Hunt', cooldown: 24000, color: 0xb3e5fc,
    damage: 10, speed: 420, air: true,
    sprite: 'whale_spear', impact: 'hit_spark',
    shake: { duration: 100, intensity: 0.003 },
    effect: 'Spears the toughest foe for {damage} dmg',
  },
  // aurora_veil tiled across the sky (its top skyY px under the view's top)
  // for the duration: every enemy but the bosses is frozen (ENEMY_FREEZE),
  // bosses slowed to slow x their pace.
  auroraSeer: {
    name: 'Aurora Veil', cooldown: 30000, color: 0x80deea,
    duration: 2500, slow: 0.6, air: true,
    sprite: 'aurora_veil', skyY: 12, fadeTime: 300,
    effect: 'Freezes every foe {duration}, bosses slowed {slow}',
  },
  // wail_ring from the ship (its left edge ringX px from where walkers stop,
  // on the lane ringY px up, scaled ringScale x): every enemy within radius
  // px of the ship takes the damage, and walkers are pushed `push` px back
  // and scared for the duration (bosses resist). Needs one that near.
  banshee: {
    name: 'Wail', cooldown: 22000, color: 0xcfd8dc,
    radius: 200, damage: 3, push: 30, pushSpeed: 220, duration: 2000, air: true, needs: 'near',
    sprite: 'wail_ring', ringX: -40, ringY: 30, ringScale: 3,
    effect: 'Hits foes near the ship, scares them {duration}',
  },
  // `count` friendly skeletons (ALLIES.skeleton) rise from summon_circles
  // `spread` px apart from x and walk out to fight for the duration.
  boneCaller: {
    name: 'Raise the Crew', cooldown: 30000, color: 0xd7ccc8,
    count: 3, x: 170, spread: 14, duration: 12000, needs: 'movable',
    circle: 'summon_circle',
    effect: 'Raises {count} skeletons for {duration}',
  },
};

// Friendly units on the lane (the Bone Caller's skeletons; src/entities/
// Ally.js). The skeleton rises ("rise" in newcrew2/animations_newcrew.json,
// riseMs without it), then walks right at speed until the first ground
// enemy, and hits it every attackInterval for damage x the Bone Caller's
// damage; it has hp x his damage, so both grow with his level and stars.
// Walking enemies that reach it stop and fight it instead of walking on
// (a Keg Runner blows up on it); flyers and boats pass it by. It crumbles
// (fadeMs) when its time is up or it's beaten. width: its body, for where
// enemies stop.
export const ALLIES = {
  skeleton: {
    sprite: 'ally_skeleton', width: 12, height: 28, riseMs: 667,
    speed: 30, attackInterval: 900, hp: 4, damage: 0.6,
    hpBarColor: 0x66bb6a, fadeMs: 300,
  },
};

// Enemies frozen by the Aurora Veil: like a stun, with `sprite` (an fx
// sheet) over them. Bosses aren't frozen.
export const ENEMY_FREEZE = { sprite: 'ice_block' };

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

// Every enemy is 32x32 (The Kraken 64x64, the Siren 48x48, the Ghost Galleon
// and the Molten Leviathan 96x80, the Frost Wyrm 112x96, the Frost Giant
// 144x144, the Siren Queen 96x96, Captain Blackbones 64x64) with its feet on
// the bottom row; width and height are its visible
// body, used for hits and where it stops. sprite: the <sprite>_sheet.png
// animations (animations.json, animations_new_enemies.json,
// ember/animations_ember.json, frost/animations_frost.json,
// fog/animations_fog.json); sheetOnly: no
// single <sprite>.png is loaded
// (there is none, or it isn't used). walkAnim / idleAnim rename the
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
//   minion:    spawned by a boss or a hazard; no Wanted poster or defeat count
//   firePuddle: leaves a fire puddle on the lane where it dies (see below)
//   splits:    on death, breaks into `count` of `into` (ENEMIES key), spread
//              `spread` px apart, scaled like it (never Elite)
//   leviathan: the Molten Leviathan's rise, spits and roars (see below)
//   falls + hazard: a lava bomb (see below); not part of the wave's count
//   dir:       the folder of its art (under SPRITES.path); with portrait, its
//              single <sprite>.png is loaded and is its Wanted Board portrait
//   origin:    [x, y] share of its frame that stands on its feet, where that
//              isn't the bottom middle (the Sled Penguin's sled, the Frost Giant)
//   rams:      on reaching the ship, hits it once for mult x its damage
//              (`impact` there) and is gone
//   ranged:    stops at stopX and lobs `shot` at the hull, or fires it
//              straight with flat (see below)
//   witch:     stops at stopX and shields the front enemy (see below)
//   wyrm / giant: Frostbite Reef's bosses (see below)
//   rises:     summoned or raised, it plays `anim` where it stands first,
//              out of reach until it's up; Lantern Ghouls raise where it fell
//   wraith:    floats over the lane and fades out of reach now and then
//   lantern:   stops at stopX and raises fallen `rises` enemies (see below)
//   queen / blackbones: Fogbound Isle's bosses (see below)
//   resist:    boss resistance on top of statusResist (which halves stun,
//              slow, fear and push-back): immovable — Haunt and Tidal Wave
//              can't move it (scared, it stands its ground instead of
//              fleeing); stunGuardMs — after a stun it can't be stunned
//              again until this long after that stun ends
//   animSpeed: the walking speed its walk animation's fps is drawn for, so
//              the animation keeps step when it walks faster
//   bannerOnEntrance: a boss whose banner shows when it arrives, not when
//              the wave sets sail
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

  // Ember Isle (art in public/sprites/ember/, all facing left).
  cinderSkeleton: {
    name: 'Cinder Skeleton',
    description: 'Smouldering bones that stagger on through anything. Placeholder.',
    weakTo: ['stormCaller', 'harpooner', 'cannoneer'],
    color: 0x8a5a4a,
    sprite: 'cinder_skeleton',
    sheetOnly: true,
    width: 13,
    height: 30,
    hp: 20,
    speed: 22.5,
    damage: 5,
    attackInterval: 1000,
    gold: 2,
  },
  magmaCrab: {
    name: 'Magma Crab',
    description: 'Armoured shell; burns a puddle that hurries others. Placeholder.',
    weakTo: ['sharpshooter', 'duelist', 'cannoneer'],
    color: 0xb5482a,
    sprite: 'magma_crab',
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
    // Where it dies, fire_puddle (an ember fx sheet) lies on the lane for ms;
    // ground enemies in it move speedBonus faster (for linger ms after
    // leaving it). It fades out over its last fadeMs.
    firePuddle: { sprite: 'fire_puddle', ms: 4000, speedBonus: 0.3, linger: 100, fadeMs: 400 },
  },
  ashBat: {
    name: 'Ash Bat',
    description: 'Swoops at the top deck in threes. Fragile. Placeholder.',
    weakTo: ['parrotKeeper', 'cabinBoy', 'netThrower'],
    color: 0x4a4048,
    sprite: 'ash_bat',
    sheetOnly: true,
    idleAnim: 'fly',    // loops the whole time (it has no dive animation)
    width: 22,
    height: 14,
    hp: 9,
    speed: 55,
    damage: 3,
    attackInterval: 1000,
    gold: 3,
    flies: {
      hoverX: 22,
      hoverY: -14,
      hoverSpread: 10,
      diveFrom: 60,
      diveSpeed: 150,
      climbSpeed: 50,
      fallSpeed: 140,
    },
  },
  obsidianGolem: {
    name: 'Obsidian Golem',
    description: 'Slow and huge. Breaks into two Magma Crabs. Placeholder.',
    weakTo: ['duelist', 'voodooPriestess', 'grogBrewer'],
    color: 0x2e2a35,
    sprite: 'obsidian_golem',
    sheetOnly: true,
    width: 24,
    height: 30,
    hp: 180,
    speed: 8,
    damage: 14,
    attackInterval: 1600,
    gold: 12,
    splits: { into: 'magmaCrab', count: 2, spread: 12 },
  },
  moltenLeviathan: {
    name: 'Molten Leviathan',
    description: 'Rises from the lava sea to spit fire and call down bombs. Placeholder.',
    weakTo: ['duelist', 'sharpshooter', 'parrotKeeper'],
    boss: true,
    color: 0x6a2a1e,
    sprite: 'molten_leviathan',  // 96x80; its sheet's `position` is the frame's top-left
    face: { x: 10, y: 15 },      // Wanted Board: 32x32 crop of frame 0 (its head)
    sheetOnly: true,
    width: 80,
    height: 64,
    hp: 450,
    speed: 0,
    damage: 6,          // per magma glob that hits the hull
    attackInterval: 1000,
    gold: 50,
    statusResist: 0.5,
    banner: 'THE MOLTEN LEVIATHAN!',
    // It rises in place from riseFrom px below its `position` over riseMs
    // (can't be hit meanwhile), a steam burst at the waterline (its top
    // aboveWater px over layout.waterY) every steamEvery ms, then loops
    // "idle". Every spitEvery ms (the first after firstSpitAt; faster when
    // enraged) it plays "spit" and lobs a magma glob from its `mouth` (in
    // animations_ember.json) at a random spot on the hull, landing
    // flightTime ms later with `impact`. Every roarEvery ms (the first after
    // firstRoarAt) it roars: "spit", a shake and roarBombs lava bombs at once.
    // On death it plays "sink" and fades out over sinkFadeMs.
    leviathan: {
      riseMs: 2500, riseFrom: 60,
      steam: 'steam_burst', steamEvery: 600, aboveWater: 23,
      firstSpitAt: 1500, spitEvery: 4000,
      glob: 'magma_glob', impact: 'lava_splash', flightTime: 1100, arcHeight: 50,
      firstRoarAt: 7000, roarEvery: 12000, roarBombs: 3,
      roarShake: { duration: 400, intensity: 0.004 },
      sinkFadeMs: 600,
    },
  },
  // Ember Isle's hazard (no poster; see the island's lavaBombs). It falls
  // from the sky onto a deck: only anti-air crew can hit it on the way down.
  // Landing, it takes hullShare of the hull's max HP (not scaled by wave),
  // stuns that deck's crew for stun ms, plays `impact` and shakes the camera;
  // shot down, it bursts in the air harmlessly. Its HP isn't scaled by the
  // wave either: any anti-air hit pops it.
  lavaBomb: {
    name: 'Lava Bomb',
    color: 0xff7a1a,
    fx: 'lava_bomb',    // drawn from an fx sheet (ember/fx/fx_ember.json)
    minion: true,
    hazard: true,
    width: 10,
    height: 15,
    hp: 1,
    speed: 0,
    damage: 0,
    hullShare: { normal: 0.06, elite: 0.06 },
    attackInterval: 1000,
    gold: 0,
    falls: {
      warning: 'bomb_warning', impact: 'lava_splash', stun: 1000,
      shake: { duration: 150, intensity: 0.004 },
    },
  },

  // Frostbite Reef (art in public/sprites/frost/, all facing left; base
  // stats relative to the Cinder Skeleton's).
  frozenCorsair: {
    name: 'Frozen Corsair',
    description: "Went overboard in the wrong sea. Still hasn't thawed.",
    weakTo: ['stormCaller', 'harpooner', 'cannoneer'],
    color: 0x9fc4d8,
    sprite: 'frozen_corsair',
    dir: 'frost/',
    portrait: true,
    width: 14,
    height: 29,
    hp: 20,
    speed: 22.5,
    damage: 5,
    attackInterval: 1000,
    gold: 2,
  },
  sledPenguin: {
    name: 'Sled Penguin',
    description: 'No brakes. No regrets.',
    weakTo: ['netThrower', 'harpooner', 'stormCaller'],
    color: 0x2a3a4a,
    sprite: 'sled_penguin',
    dir: 'frost/',
    portrait: true,
    walkAnim: 'slide',
    origin: [0.5, 28 / 32],   // the sled's runners are on row 27
    width: 24,
    height: 13,
    hp: 10,
    speed: 49.5,
    damage: 5,          // its contact damage; the ram is mult x this
    attackInterval: 1000,
    gold: 2,
    rams: { mult: 2, impact: 'frost_hit' },
  },
  yetiRaider: {
    name: 'Yeti Raider',
    description: 'Throws snowballs. The snowballs have rocks in them.',
    weakTo: ['sharpshooter', 'duelist', 'cannoneer'],
    color: 0xd8e4ec,
    sprite: 'yeti_raider',
    dir: 'frost/',
    portrait: true,
    width: 20,
    height: 30,
    hp: 44,
    speed: 13.5,
    damage: 5,
    attackInterval: 4000,   // a throw every
    gold: 5,
    maxOnScreen: 3,     // more wait their turn in the wave
    // Stops at stopX (in reach of every crewmate from every slot) and plays
    // "throw" every attackInterval ms; on its
    // releaseFrame a `shot` (fx sheet) arcs from handOnRelease (in its
    // sheet's entry, frame-relative) to a random spot on the hull over
    // flightTime ms, hitting for damageMult x its damage with `impact`.
    ranged: {
      stopX: 300, anim: 'throw', releaseFrame: 5, firstAt: 600,
      shot: 'snowball', impact: 'frost_hit', flightTime: 1100, arcHeight: 45, damageMult: 0.8,
    },
  },
  iceWitch: {
    name: 'Ice Witch',
    description: 'Never hurts you herself. Makes sure nothing else gets hurt.',
    weakTo: ['sharpshooter', 'stormCaller', 'grogBrewer'],
    color: 0x7ab0e0,
    sprite: 'ice_witch',
    dir: 'frost/',
    portrait: true,
    walkAnim: 'glide',
    width: 14,
    height: 29,
    hp: 24,
    speed: 18,
    damage: 0,
    attackInterval: 1000,
    gold: 6,
    maxOnScreen: 2,     // more wait their turn in the wave
    // Stops at stopX; every `every` ms (the first firstAt ms after stopping)
    // she plays "cast" and gives the front enemy without one an ice shield
    // (`fx`, looping over it) that absorbs share x its max HP of damage
    // (every hit but poison) before it can be hurt. breakFx plays when it
    // breaks; barColor is its bar over the HP bar. Bosses only with
    // shieldsBosses.
    witch: {
      stopX: 340, anim: 'cast', every: 5000, firstAt: 800,
      share: 0.4, fx: 'ice_shield', breakFx: 'frost_hit', barColor: 0x9fe0ff,
      shieldsBosses: false,
    },
  },
  frostWyrm: {
    name: 'Frost Wyrm',
    description: 'Nests on the iceberg. Its breath freezes the sea and anyone on the bow.',
    weakTo: ['duelist', 'sharpshooter', 'voodooPriestess'],
    boss: true,
    color: 0x6a9ac8,
    sprite: 'frost_wyrm',      // 112x96; its sheet's perchPos is the frame's top-left
    dir: 'frost/',
    portrait: true,
    face: { x: 8, y: 22 },     // Wanted Board: 32x32 crop of its head
    idleAnim: 'perch',
    width: 80,
    height: 70,
    hp: 450,
    speed: 0,
    damage: 7,          // per breath on the hull
    attackInterval: 1000,
    gold: 50,
    statusResist: 0.5,
    banner: 'FROST WYRM',
    bannerOnEntrance: true,
    // Swoops in playing "fly" from `from` (its frame's top-left) to its perch
    // over flyInMs (can't be hit meanwhile), then loops "perch". Every
    // breathEvery ms (the first firstBreathAt after landing) it plays
    // "breath": breathAt ms in, frost_breath plays with its right edge at
    // the `mouth` (in its sheet's entry), the hull takes its damage, and on
    // every freezeEvery-th breath the crewmate nearest the bow freezes for
    // freezeMs. Below liftAt of its HP
    // (once) it lifts liftPx off the iceberg ("fly") for airMs, out of reach,
    // then lands and breathes twice, gapMs apart. Beaten, it plays "fall",
    // drops sinkPx into the sea over fallMs and splashes there.
    wyrm: {
      from: { x: 500, y: -110 }, flyInMs: 1500,
      firstBreathAt: 1200, breathEvery: 4000, breathAt: 250, breath: 'frost_breath', freezeEvery: 2, freezeMs: 2000,
      liftAt: 0.5, liftPx: 34, liftMs: 400, airMs: 3000, gapMs: 900,
      fallMs: 1000, sinkPx: 80, aboveWater: 23,
      shake: { duration: 200, intensity: 0.003 },
    },
  },
  frostGiant: {
    name: 'Frost Giant',
    description: 'Uproots a pine, shakes off the snow, and uses it on your hull.',
    weakTo: ['duelist', 'voodooPriestess', 'grogBrewer'],
    boss: true,
    color: 0x7aa8c8,
    sprite: 'frost_giant',     // 144x144, feet at its sheet's `feet`
    dir: 'frost/',
    portrait: true,
    face: { x: 62, y: 32 },    // Wanted Board: 32x32 crop of its head
    origin: [88 / 144, 136 / 144],
    width: 56,
    height: 105,
    hp: 520,
    speed: 11.3,        // 84% of the Yeti Raider's
    animSpeed: 8.1,     // the speed its walk animation's fps is drawn for
    damage: 18,         // per smash on the hull
    attackInterval: 2500,   // a smash every
    gold: 50,
    statusResist: 0.5,
    resist: { immovable: true, stunGuardMs: 4000 },
    banner: 'FROST GIANT',
    bannerOnEntrance: true,
    // Comes in at spawnX behind the front pines, walking at entranceSpeed and
    // out of reach until it roars; while in the trees (x > treesX) the pines jump 1px every
    // shakeEvery ms and snow puffs every puffEvery ms. At roarX it plays "roar" for roarMs
    // (a shake and its banner), then walks on at its speed, a tiny shake on
    // each footstep (walk frames `steps`). At the ship it plays "smash" every
    // attackInterval ms: on impactFrame (smashAt ms in) the hull takes its
    // damage, the camera shakes hard and ground_quake plays on its slamPoint;
    // every freezeEvery-th smash freezes the crewmate nearest the bow for
    // freezeMs. Beaten, it plays "shatter" and is gone.
    // Every boulderEvery ms while walking (finaleBoulderEvery in the finale)
    // it stops, raises its club ("roar") for throwMs and hurls an ice_boulder
    // from throwFrom (frame-relative) to the hull, spinning at spin rad/s,
    // for boulderMult x its damage.
    // Below angry.at of its HP (once) it gets angry: a quick "roar" for
    // roarMs, its tint flashing between angry.flash colours flashes times
    // (flashMs each), a shake; then it walks speed x as fast and smashes
    // every smashEvery ms.
    giant: {
      spawnX: 530, entranceSpeed: 24, treesX: 420, shakeEvery: 100, puffEvery: 300, roarX: 410, roarMs: 1000,
      steps: [1, 3], smashAt: 400, freezeEvery: 3, freezeMs: 1500,
      roarShake: { duration: 400, intensity: 0.004 },
      stepShake: { duration: 60, intensity: 0.0012 },
      smashShake: { duration: 260, intensity: 0.01 },
      boulderEvery: 8000, finaleBoulderEvery: 6000, throwMs: 500, throwFrom: [76, 18], boulder: 'ice_boulder', boulderMult: 0.6,
      flightTime: 1300, arcHeight: 55, spin: 9, impact: 'frost_hit',
      angry: {
        at: 0.5, speed: 1.25, smashEvery: 1800, roarMs: 600,
        flash: [0xff4a4a, 0xffffff], flashes: 4, flashMs: 80,
        shake: { duration: 350, intensity: 0.006 },
      },
    },
  },

  // Fogbound Isle (art in public/sprites/fog/, all facing left; base stats
  // relative to the Frozen Corsair's).
  boneDeckhand: {
    name: 'Bone Deckhand',
    description: 'Signed on for life. Stayed on after.',
    weakTo: ['stormCaller', 'harpooner', 'cannoneer'],
    color: 0xd8d0b8,
    sprite: 'bone_deckhand',
    dir: 'fog/',
    portrait: true,
    width: 14,
    height: 29,
    hp: 20,
    speed: 22.5,
    damage: 5,
    attackInterval: 1000,
    gold: 2,
    rises: { anim: 'rise' },
  },
  fogWraith: {
    name: 'Fog Wraith',
    description: "Now you see it. Mostly you don't.",
    weakTo: ['stormCaller', 'sharpshooter', 'duelist'],
    color: 0xb8c8c0,
    sprite: 'fog_wraith',
    dir: 'fog/',
    portrait: true,
    walkAnim: 'glide',
    width: 18,
    height: 25,
    hp: 18,
    speed: 20.25,
    damage: 5,
    attackInterval: 1000,
    gold: 3,
    // Glides hoverPx over the lane. Every `every` ms it plays "fadeOut" with
    // `puff` and is invisible and out of reach for hideMs (shots already
    // flying at it miss), then plays "fadeIn".
    wraith: { hoverPx: 8, every: 5000, hideMs: 1500, puff: 'fog_puff' },
  },
  cursedCannoneer: {
    name: 'Cursed Cannoneer',
    description: 'Still firing at a ship that sank a hundred years ago. Close enough.',
    weakTo: ['sharpshooter', 'duelist', 'cannoneer'],
    color: 0x5a4a3a,
    sprite: 'cursed_cannoneer',
    dir: 'fog/',
    portrait: true,
    width: 18,
    height: 31,
    hp: 36,
    speed: 15.75,
    damage: 5,
    attackInterval: 3500,   // a shot every
    gold: 5,
    maxOnScreen: 3,     // more wait their turn in the wave
    // Like the Yeti Raider's throw, but "fire" fires `shot` flat from its
    // `muzzle` (in its sheet's entry) at shotSpeed, at the hull at that
    // height, on its releaseFrame.
    ranged: {
      stopX: 300, anim: 'fire', releaseFrame: 5, firstAt: 600, from: 'muzzle',
      shot: 'grapeshot', impact: 'ghost_hit', flat: true, shotSpeed: 260, damageMult: 1,
    },
  },
  lanternGhoul: {
    name: 'Lantern Ghoul',
    description: 'Where its lantern goes, the dead get back up.',
    weakTo: ['sharpshooter', 'stormCaller', 'grogBrewer'],
    color: 0x4a4a5a,
    sprite: 'lantern_ghoul',
    dir: 'fog/',
    portrait: true,
    width: 15,
    height: 25,
    hp: 28,
    speed: 13.5,
    damage: 0,
    attackInterval: 1000,
    gold: 6,
    maxOnScreen: 2,     // more wait their turn in the wave
    // Stops at stopX; from firstAt ms after stopping, every `every` ms it
    // looks for a Bone Deckhand that died in the last graveMs (the latest):
    // it plays "raise" and sends a `wisp` (at wispSpeed) from its `lantern`
    // (in its sheet's entry) to where it fell, and the deckhand rises there
    // with hpShare of its HP. At most `raises` times per ghoul.
    lantern: {
      stopX: 350, anim: 'raise', every: 6000, firstAt: 1000, graveMs: 8000,
      raises: 2, hpShare: 0.5, wisp: 'soul_wisp', wispSpeed: 90,
    },
  },
  sirenQueen: {
    name: 'Siren Queen',
    description: 'One song and your own crew turns on you.',
    weakTo: ['duelist', 'sharpshooter', 'voodooPriestess'],
    boss: true,
    color: 0x2a9a8a,
    sprite: 'siren_queen',     // 96x96; its sheet's `pos` is the frame's top-left
    dir: 'fog/',
    portrait: true,
    face: { x: 22, y: 6 },     // Wanted Board: 32x32 crop of her head
    origin: [0.5, 86 / 96],    // her waterline (frame row 86) on the water
    width: 60,
    height: 80,
    hp: 450,
    speed: 0,
    damage: 10,         // per tidal wave on the hull
    attackInterval: 1000,
    gold: 50,
    statusResist: 0.5,
    resist: { immovable: true, stunGuardMs: 4000 },
    banner: 'SIREN QUEEN',
    bannerOnEntrance: true,
    // She rises in place ("rise", out of reach meanwhile), then her banner
    // shows and she loops "idle". From firstSongAt ms after rising, every
    // songEvery ms (angrySongEvery below angryAt of her HP), while nobody is
    // charmed, she plays "sing" and sends `notes` charm_notes, noteGap ms
    // apart at noteSpeed, from her `mouth` to a random crewmate who attacks
    // (not The Captain): when the last lands, they're charmed for charmMs
    // (see CHARM). From firstWaveAt, every waveEvery ms she plays "wave" and
    // (waveAt ms in) a siren_wave rolls left from her `waveHand` at waveSpeed
    // with its bottom on the water, into the hull for her damage. A song or a
    // wave that falls due during the other waits for it. Beaten, she plays
    // "sink" with the Kraken's splash (its top aboveWater px over the water).
    queen: {
      firstSongAt: 2500, songEvery: 7000, angrySongEvery: 6000, angryAt: 0.5,
      notes: 3, noteGap: 150, note: 'charm_note', noteSpeed: 120, charmMs: 3000,
      firstWaveAt: 5000, waveEvery: 5000, waveAt: 200, wave: 'siren_wave', waveSpeed: 110,
      shake: { duration: 200, intensity: 0.003 },   // as a wave hits
      aboveWater: 23,
    },
  },
  captainBlackbones: {
    name: 'Captain Blackbones',
    description: 'Lost his ship, his crew and his life. Wants yours.',
    weakTo: ['duelist', 'voodooPriestess', 'cannoneer'],
    boss: true,
    color: 0x8a1a1a,
    sprite: 'captain_blackbones',   // 64x64, feet at its sheet's `feet`
    dir: 'fog/',
    portrait: true,
    face: { x: 10, y: 2 },     // Wanted Board: 32x32 crop of his head
    origin: [32 / 64, 62 / 64],
    width: 30,
    height: 60,
    hp: 520,
    speed: 22.5,        // a Bone Deckhand's
    damage: 16,         // per slash on the hull
    attackInterval: 2000,   // a slash every
    gold: 50,
    statusResist: 0.5,
    resist: { immovable: true, stunGuardMs: 4000 },
    banner: 'CAPTAIN BLACKBONES',
    bannerOnEntrance: true,
    // Steps out of the fog at spawnX ("fogRise" with `puff`, out of reach
    // until it's done) with a cackle (a short shake) and his banner, then
    // walks the lane. While walking: every stepEvery ms he sinks into the fog
    // ("fogSink" with `puff`), out of reach for hideMs, and rises ("fogRise",
    // `puff`) stepPx further left (never past where he stops at the ship);
    // every shootEvery ms (the first firstShotAt) he plays "shoot" and on its
    // fireFrame muzzle_flash plays at his `muzzle` and the hull takes
    // shotMult x his damage. At raiseAt of his HP (each once) he stops and
    // plays "summon" (twice through): raiseCount `circle`s show on the lane
    // raiseAhead px in front of him, raiseSpread apart (behind him where
    // there's no room), and a `raise` (ENEMIES key) rises from each when it's
    // done. At
    // the ship he plays "slash" every attackInterval: on its impactFrame the
    // hull takes his damage with `slashFx` there. Beaten, he plays "death"
    // and his hat lies on the bones for deathHoldMs, then fades.
    blackbones: {
      spawnX: 430, puff: 'fog_puff', cackle: { duration: 300, intensity: 0.003 },
      stepEvery: 10000, hideMs: 1500, stepPx: 60,
      firstShotAt: 3000, shootEvery: 6000, shotMult: 0.5, flash: 'muzzle_flash',
      raiseAt: [0.66, 0.33], raise: 'boneDeckhand', raiseCount: 3, raiseAhead: 26, raiseSpread: 18, circle: 'summon_circle',
      slashFx: 'ghost_slash',
      deathHoldMs: 2000, fadeMs: 400,
    },
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
  rows: 3,              // posters per page = columns x rows; more turn the page
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

// The Captain's Log (battle stats): what each crewmate did in the last few
// waves and which enemies hurt the hull, opened from the Log button between
// waves, plus an MVP plaque after every wave.
export const BATTLE_LOG = {
  keep: 5,              // waves kept (in the save)
  // Damage bar segments (on parchment): attacks / abilities / poison & effects.
  colors: { attack: '#c0582c', ability: '#3d78c2', effect: '#5e9e3a' },
  // The panel (base pixels): parchment, tab buttons, rows.
  panel: { x: 16, y: 30, width: 448, height: 236 },
  tabWidth: 60,         // at least; wider where the label needs it
  infoY: 60,            // the line under the tabs: summary and bar legend
  rowsY: 70,            // first row's top
  rowHeight: 32,
  visibleRows: 6,       // more scroll (mouse wheel or the arrows)
  // The Fish Log tab's grid: fish per row and each one's cell.
  fishLog: { cols: 6, cellWidth: 70, cellHeight: 90 },
  barX: 136,            // from the row's left
  barWidth: 170,
  // MVP plaque under the wave banner after each wave (doesn't block
  // anything; real time, so as long at any speed). x is its centre in the
  // base layout, y its top below the view's top.
  mvp: { ms: 2500, fadeMs: 300, x: 188, y: 126 },
};

// Battle speeds the x-button cycles through during a wave (1 = normal).
// Session only: it isn't saved, and between waves everything runs at 1x.
export const GAME_SPEEDS = [1, 2, 4];

// Auto-continue (src/ui/AutoContinue.js): its toggle's centre and width in
// the view's bottom-left corner (base pixels), and the pause before it
// starts the next wave or retries a lost one.
export const AUTO_CONTINUE = { x: 76, y: 229, width: 148, delayMs: 2000 };

// The battle runs in fixed steps of stepMs of game time, however many fit in
// each frame's time (x the battle speed), so a wave plays out the same at any
// frame rate. A frame counts as at most maxFrameMs of real time, so a
// backgrounded tab doesn't teleport enemies on return.
export const SIM = {
  stepMs: 1000 / 240,
  maxFrameMs: 100,
};


export const WAVES = {
  // Enemies per wave (at least): baseCount + (wave - 1) * countPerWave.
  // Waves are built from FORMATIONS until they hold that many.
  baseCount: 5,
  countPerWave: 2.5,
  // Enemy HP multiplier: 1 + n * hpPerWave + n^2 * hpPerWaveSquared, n = wave - 1
  hpPerWave: 0.5,
  hpPerWaveSquared: 0.012,
  // Enemy damage multiplier: (1 + damageGrowth) ^ (wave - 1) up to wave
  // lateDamage.from (the wave whose scaling it is, island offset included),
  // then (1 + lateDamage.growth) more per wave after it, but never above
  // lateDamage.cap (or the island's own damageCap): Frostbite Reef (from
  // effective wave 99) levels off at x62 from its wave 10 instead of reaching
  // x319, so its damage doesn't outgrow the hull. Skull Cove and Ember Isle's
  // 50 waves all come before it. Fogbound Isle (from effective wave 148) is
  // past its own cap from its first wave.
  damageGrowth: 0.04,
  lateDamage: { from: 100, growth: 0.03, cap: 62 },
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
  // waves), entering this far through the wave. (An island can set its own
  // sirenFromWave.)
  sirenFromWave: 16,
  sirenEvery: 3,
  sirenSpawnAt: 0.25,

  // Every bossEvery-th wave: a boss plus a reduced escort of regular enemies.
  // The bosses take turns: The Kraken on waves 10, 30, 50..., The Ghost
  // Galleon on 20, 40... (Skull Cove's; an island can set its own `bosses`.)
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

// Ember Isle's formations (like FORMATIONS, below): Cinder Skeletons instead
// of Drowned Sailors, its own Magma Crabs, Ash Bats (in threes) and Obsidian
// Golems, with Skull Cove's Keg Runners and Barnacle Knights mixed in.
export const EMBER_FORMATIONS = [
  { from: 1, weight: 4, members: ['cinderSkeleton'] },
  { from: 2, weight: 3, members: ['cinderSkeleton', 'cinderSkeleton', 'cinderSkeleton'] },
  { from: 3, weight: 2, escort: true, members: ['magmaCrab', 'cinderSkeleton', 'cinderSkeleton'] },
  { from: 5, weight: 2, members: ['ashBat', 'ashBat', 'ashBat'] },
  { from: 6, weight: 1, members: ['kegRunner', 'kegRunner'] },
  { from: 8, weight: 1.5, escort: true, members: ['magmaCrab', 'kegRunner', 'kegRunner'] },
  { from: 9, weight: 1.5, escort: true, members: ['obsidianGolem', 'cinderSkeleton', 'cinderSkeleton'] },
  { from: 12, weight: 1.5, escort: true, members: ['barnacleKnight', 'kegRunner', 'kegRunner'] },
  { from: 14, weight: 1.5, escort: true, members: ['barnacleKnight', 'cinderSkeleton', 'ashBat', 'ashBat', 'ashBat'] },
  { from: 18, weight: 1.5, escort: true, members: ['obsidianGolem', 'barnacleKnight', 'cinderSkeleton', 'cinderSkeleton'] },
];

// Frostbite Reef's formations: Frozen Corsairs throughout, Sled Penguins in
// packs from 3 (pack: [min, max] of its one member, sized by the wave's
// seeded generator), Yeti Raiders from 6 and Ice Witches (always alone) from
// 11, with bigger mixed groups later on.
export const FROST_FORMATIONS = [
  { from: 1, weight: 4, members: ['frozenCorsair'] },
  { from: 2, weight: 3, members: ['frozenCorsair', 'frozenCorsair', 'frozenCorsair'] },
  { from: 3, weight: 2, pack: [3, 5], members: ['sledPenguin'] },
  { from: 6, weight: 2, escort: true, members: ['yetiRaider', 'frozenCorsair', 'frozenCorsair'] },
  { from: 11, weight: 1.5, members: ['iceWitch'] },
  { from: 18, weight: 1.5, escort: true, members: ['frozenCorsair', 'frozenCorsair', 'yetiRaider', 'yetiRaider'] },
  { from: 22, weight: 1.5, escort: true, members: ['yetiRaider', 'sledPenguin', 'sledPenguin', 'sledPenguin'] },
  { from: 26, weight: 1.5, members: ['frozenCorsair', 'frozenCorsair', 'frozenCorsair', 'frozenCorsair', 'frozenCorsair'] },
  { from: 30, weight: 1.5, escort: true, members: ['yetiRaider', 'yetiRaider', 'frozenCorsair', 'frozenCorsair', 'frozenCorsair'] },
];

// Fogbound Isle's formations: Bone Deckhands throughout, Fog Wraiths in
// pairs from 4, Cursed Cannoneers (escorted by deckhands) from 8 and Lantern
// Ghouls from 12, walking behind deckhands for it to raise, with bigger mixed
// groups later on. The finale's trickle is deckhands only (FOG_FINALE_FORMATIONS).
export const FOG_FORMATIONS = [
  { from: 1, weight: 4, members: ['boneDeckhand'] },
  { from: 2, weight: 3, members: ['boneDeckhand', 'boneDeckhand', 'boneDeckhand'] },
  { from: 4, weight: 2, members: ['fogWraith', 'fogWraith'] },
  { from: 8, weight: 2, escort: true, members: ['cursedCannoneer', 'boneDeckhand', 'boneDeckhand'] },
  { from: 12, weight: 1.5, members: ['boneDeckhand', 'boneDeckhand', 'boneDeckhand', 'lanternGhoul'] },
  { from: 16, weight: 1.5, members: ['fogWraith', 'fogWraith', 'fogWraith', 'boneDeckhand', 'boneDeckhand'] },
  { from: 22, weight: 1.5, escort: true, members: ['cursedCannoneer', 'cursedCannoneer', 'fogWraith', 'fogWraith'] },
  { from: 26, weight: 1.5, members: ['boneDeckhand', 'boneDeckhand', 'boneDeckhand', 'boneDeckhand', 'boneDeckhand'] },
  { from: 32, weight: 1.5, members: ['boneDeckhand', 'boneDeckhand', 'cursedCannoneer', 'boneDeckhand', 'lanternGhoul'] },
];
export const FOG_FINALE_FORMATIONS = [
  { from: 1, weight: 2, members: ['boneDeckhand'] },
  { from: 1, weight: 1, members: ['boneDeckhand', 'boneDeckhand', 'boneDeckhand'] },
];

// The voyage is split into islands of `waves` waves each, in map.json's
// order (public/sprites/map/). Ship, crew, upgrades and Pearls carry over;
// each island keeps its own wave counter and best wave. Later islands are
// harder: enemy HP, damage, kill gold and Elite chance are those of wave
// (wave + waveOffset), while new enemies still arrive on the usual waves.
// Each island opens on the map once the one before is cleared; only
// `available` ones (with content) can be sailed to, the rest say "coming
// soon". hazard / boss: the map card's lines; shortName: its name where
// room is tight (the Wanted Board's "first wave" label).
// Clearing an island's finale wave opens Endless mode there: its waves go on
// past `waves` as before.
// What an island fights, where it differs from Skull Cove's (the defaults):
//   formations: its FORMATIONS list; bosses: its WAVES.bosses (taking turns);
//   sirenFromWave: its first Siren wave
//   scenery: { path, bg, fg, front } its own tall background and foreground
//            sheet (same sizes and layout positions as bg_tall.png /
//            fg_sheet.png), and optionally a still `front` layer (480x270)
//            over the foreground, enemies and bosses but under the ship's
//            railings
//   ash: ASHFALL over the scene while the ship is there; snow: SNOWFALL
//   spawnPuff: { fx, x: [min, max], y: [min, max] } an fx sheet played at a
//            random point in that box as each enemy of a wave comes in
//   earlyBoost: { until, count, hp } its first waves bring count x as many
//            enemies with hp x their HP on wave 1, fading evenly to x1 on
//            wave `until` (and after)
//   bossBoost: { [wave]: { hp, damage } } that boss wave's boss gets hp x
//            its HP and damage x its damage (not the finale)
//   lavaBombs: during every wave a lava bomb (ENEMIES.lavaBomb) every
//            min-max ms: bomb_warning shows on a random built deck while the
//            bomb falls onto it from fromY (battlefield y) over warnMs.
//            Several at once go to different decks while there are enough,
//            then up to jitter px apart on the same one.
//   blizzard: from wave `from`, every every-th wave (but not boss waves
//            with skipBossWaves) a blizzard (SNOWFALL's heavy weather) rolls
//            in `at` ms into the wave for `ms`: every
//            freezeEvery ms a random crewmate (not frozen yet) freezes for
//            freezeMs (see FREEZE), and enemies walk chill x as fast.
//   mist: MIST along the waterline while the ship is there
//   fogBank: like blizzard (from, every, skipBossWaves, at, ms), a fog bank
//            (MIST.bank) that fades in and out over fadeMs; while it's in,
//            the crew's attack range is `range` x as long
//   damageCap: its own lateDamage.cap (see WAVES)
// finale: the island's last wave (`wave`): its banner (title, detail),
// weather ('storm': STORM; 'eruption': ASHFALL's heavy weather; 'blizzard':
// a blizzard the whole wave, without its freezes; 'fog': a fog bank the
// whole wave, with fogRange in place of its range), its bosses ({ key, at: ms
// into the wave }, each with hpFactor x its usual HP, or its own hpFactor and
// damageFactor), and a trickle of
// regular enemies (trickle x the usual count, a group every trickleInterval
// ms from trickleFrom). enrage 'onBossDown': when one boss dies the other
// enrages; 'fromStart': they arrive enraged; none: neither. Enraged bosses
// are tinted rageTint and attack (fire, launch boats, spit) rage x as fast.
// onBossDown 'summon': when one boss dies, Captain Blackbones raises his
// crew at once (as soon as he's out, if he isn't yet). formations: the
// trickle's own formations (the island's by default).
// bombs overrides lavaBombs' min / max for the wave; boulders: the Frost
// Giant throws ice boulders while walking. Winning pays `pearls` and
// legendaryChests free Legendary chests, and its banner says clearedTitle
// and `unlocks`; with `ending`, the ending (EndingScene) plays after it.
export const ISLANDS = [
  {
    id: 'skull_cove', name: 'Skull Cove', waves: 50, waveOffset: 0, available: true,
    hazard: 'Harpies, Sirens', boss: 'Kraken & Galleon',
    // Wave 50: "Wrath of Skull Cove". A storm rolls in, the Ghost Galleon
    // emerges, and The Kraken surfaces 20s after it. Unlocks the world map.
    finale: {
      wave: 50,
      title: 'WRATH OF SKULL COVE',
      detail: 'WAVE 50 - FINAL BATTLE',
      weather: 'storm',
      bosses: [{ key: 'ghostGalleon', at: 1500 }, { key: 'kraken', at: 21500 }],
      hpFactor: 1.5,
      trickle: 1.0, trickleFrom: 5000, trickleInterval: 3200,
      enrage: 'onBossDown', rage: 1.6, rageTint: 0xff5a5a,
      pearls: 40, legendaryChests: 1,
      clearedTitle: 'SKULL COVE CLEARED!',
      unlocks: 'WORLD MAP UNLOCKED',
    },
  },
  {
    // Ember Isle's wave 1 is as hard as Skull Cove's wave 50.
    id: 'ember_isle', name: 'Ember Isle', waves: 50, waveOffset: 49, available: true,
    hazard: 'Lava bombs', boss: 'Molten Leviathan',
    scenery: { path: 'ember/', bg: 'bg_ember_tall', fg: 'fg_ember_sheet' },
    ash: true,
    formations: EMBER_FORMATIONS,
    bosses: ['moltenLeviathan'],
    sirenFromWave: 7,
    lavaBombs: { min: 8000, max: 12000, warnMs: 1200, fromY: -70, jitter: 8 },
    // Wave 50: "Eruption". The volcano erupts (red tint, heavier ash, a bomb
    // every ~4s) and an enraged Leviathan rises with a strong escort.
    // Unlocks Frostbite Reef on the map.
    finale: {
      wave: 50,
      title: 'ERUPTION',
      detail: 'WAVE 50 - FINAL BATTLE',
      weather: 'eruption',
      bosses: [{ key: 'moltenLeviathan', at: 3500 }],   // after the banner
      hpFactor: 1.5,
      trickle: 1.3, trickleFrom: 4000, trickleInterval: 2800,
      enrage: 'fromStart', rage: 1.6, rageTint: 0xff5a5a,
      bombs: { min: 3500, max: 4500 },
      pearls: 40, legendaryChests: 1,
      clearedTitle: 'EMBER ISLE CLEARED!',
      unlocks: 'FROSTBITE REEF UNLOCKED',
    },
  },
  {
    // Frostbite Reef's wave 1 is as hard as Ember Isle's wave 50.
    id: 'frostbite_reef', name: 'Frostbite Reef', shortName: 'Frostbite', waves: 50, waveOffset: 98, available: true,
    hazard: 'Blizzards', boss: 'Wyrm & Giant',
    scenery: { path: 'frost/', bg: 'bg_frost_tall', fg: 'fg_frost_sheet', front: 'fg_pines' },
    snow: true,
    // Enemies step out from between the pines.
    spawnPuff: { fx: 'snow_puff', x: [420, 470], y: [150, 220] },
    formations: FROST_FORMATIONS,
    bosses: ['frostWyrm', 'frostGiant'],
    sirenFromWave: Infinity,   // no Sirens here
    // Waves 1-15 bring count x as many enemies with hp x their HP, fading
    // evenly back to x1 by wave `until` (see Progress.earlyBoost).
    earlyBoost: { until: 16, count: 2, hp: 2.6 },
    // Per boss wave: its boss with hp x its HP and damage x its damage. The
    // Frost Giant's damage is capped like everyone's while his HP keeps
    // growing, so wave 40 has him tougher but softer-hitting than wave 20.
    bossBoost: {
      10: { hp: 1.35, damage: 1.4 },
      20: { hp: 1, damage: 1.2 },
      40: { hp: 0.7, damage: 0.5 },
    },
    blizzard: { from: 6, every: 4, skipBossWaves: true, at: 8000, ms: 10000, freezeEvery: 3000, freezeMs: 2000, chill: 0.85 },
    // Wave 50: "Wrath of the Reef". A blizzard the whole wave; the Frost Wyrm
    // swoops in (landing 5s in), and the Frost Giant comes out of the trees
    // 5s after it lands (it spends ~5.4s behind the pines, slowed by the
    // blizzard like every walker), the Wyrm at 120% HP and the Giant at 90%
    // with 60% of his damage, with small trickles
    // of regular enemies. Unlocks Fogbound Isle on the map.
    finale: {
      wave: 50,
      title: 'WRATH OF THE REEF',
      detail: 'WAVE 50 - FINAL BATTLE',
      weather: 'blizzard',
      bosses: [{ key: 'frostWyrm', at: 3500 }, { key: 'frostGiant', at: 4600, hpFactor: 0.9, damageFactor: 0.6 }],
      hpFactor: 1.2,
      trickle: 0.6, trickleFrom: 6000, trickleInterval: 3500,
      boulders: true,
      pearls: 60, legendaryChests: 2,
      clearedTitle: 'FROSTBITE REEF CLEARED!',
      unlocks: 'FOGBOUND ISLE UNLOCKED',
    },
  },
  {
    // Fogbound Isle's wave 1 is as hard as Frostbite Reef's wave 50. The
    // last island.
    id: 'fogbound_isle', name: 'Fogbound Isle', shortName: 'Fogbound', waves: 50, waveOffset: 147, available: true,
    hazard: 'Fog banks', boss: 'Siren & Blackbones',
    scenery: { path: 'fog/', bg: 'bg_fog_tall', fg: 'fg_fog_sheet' },
    mist: true,
    // Enemy damage levels off at x68 (Frostbite Reef's x62 at its wave 10);
    // the curve itself is already past that from wave 1 (x201).
    damageCap: 68,
    formations: FOG_FORMATIONS,
    bosses: ['sirenQueen', 'captainBlackbones'],
    sirenFromWave: Infinity,   // no Skull Cove Sirens here
    // Waves 1-11 bring count x as many enemies with hp x their HP, fading
    // evenly back to x1 by wave 12.
    earlyBoost: { until: 12, count: 1.75, hp: 2 },
    // The wave-10 Siren Queen is tougher; the wave-20 Blackbones has far less
    // HP but hits much harder (his HP grows with the wave while his damage
    // is capped, so at wave 20 the base numbers left him a wall the crew
    // couldn't scratch without upgrades).
    bossBoost: {
      10: { hp: 1.6, damage: 1.4 },
      20: { hp: 0.4, damage: 3.3 },
    },
    fogBank: { from: 6, every: 4, skipBossWaves: true, at: 8000, ms: 10000, fadeMs: 1000, range: 0.7 },
    // Wave 50: "The Last Voyage". A fog bank the whole wave (at fogRange);
    // the Siren Queen rises 3.5s in and Captain Blackbones steps out of the
    // fog 6s later, each at hpFactor x its HP, with a trickle of Bone
    // Deckhands. When the Queen dies Blackbones raises his crew. Then the
    // ending.
    finale: {
      wave: 50,
      title: 'THE LAST VOYAGE',
      detail: 'WAVE 50 - FINAL BATTLE',
      weather: 'fog',
      fogRange: 0.85,
      bosses: [{ key: 'sirenQueen', at: 3500 }, { key: 'captainBlackbones', at: 9500 }],
      hpFactor: 1.2,
      formations: FOG_FINALE_FORMATIONS,
      trickle: 0.8, trickleFrom: 6000, trickleInterval: 3500,
      onBossDown: 'summon',
      pearls: 100, legendaryChests: 3,
      clearedTitle: 'FOGBOUND ISLE CLEARED!',
      unlocks: 'THE SEAS ARE YOURS',
      ending: true,
    },
  },
];

// The ending (EndingScene), delayMs after Fogbound Isle's finale is won: the
// world map with every island's flag, and the ship token sailing the route
// from the first island to the last over sailMs (then on off the map's right
// edge over exitMs). textAt ms in, the title and line fade in over fadeMs,
// with a Continue button.
export const ENDING = {
  sailMs: 9000,
  exitMs: 1500,
  delayMs: 2500,      // after the finale ends, so its CLEARED banner shows first
  title: 'HOLD THE DECK',
  line: 'THE SEAS ARE YOURS',
  textAt: 1500,
  fadeMs: 800,
};

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
  // The selected island's (or the Abyss's) card: on the right, or at leftX
  // when what's selected is right of splitX, so it never covers it (nor,
  // with the left half selected, anything on the right half).
  card: { x: 306, leftX: 8, splitX: 240, y: 132, width: 166, height: 126, valueX: 64 },
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
  startingPearls: 3,        // a first chest after wave 5 (with PACKS.cost 8)
  pearlsPerWave: 1,         // every wave clear
  pearlsMilestoneEvery: 5,  // clearing every Nth wave pays a bonus on top
  pearlsPerMilestone: 3,
  pearlsPerBoss: 5,         // first kill of each boss wave only

  // Saves from before prestige was removed (save v6): all Renown, held plus
  // what was spent in the Renown shop, is paid back as this many Pearls each.
  pearlsPerOldRenown: 2,
};

// Chests come from packs (public/sprites/packs/packs.json: each pack's id,
// name, banner, unlock and crew; src/systems/Packs.js). A pack unlocks
// "always" or on reaching an island ("reach Ember Isle": that island open
// on the map), and only rolls its own crew. The free chests are opened from
// whichever unlocked pack the player picks.
export const PACKS = {
  path: 'packs/',       // under SPRITES.path
  cost: 8,
  // "Buy 10": bulkCount chests at once for bulkCost Pearls.
  bulkCount: 10,
  bulkCost: 72,
  // Rarity weights; renormalized over the rarities the pack has crew of (a
  // roll of a rarity it has none of is rolled again).
  rates: { common: 0.45, rare: 0.3, epic: 0.18, legendary: 0.07 },
  // The Abyss blessing: once the Abyss's best depth reaches `depth`,
  // Legendary weight x legendary in every pack, for good.
  abyssBlessing: { depth: 25, legendary: 2 },
  // The chest screen (PackScene, base pixels): the banner carousel (banners
  // `gap` px apart, the others shaded sideShade black; a drag of swipe px
  // turns it, over slideMs), the details panel under it with a cell per crewmate
  // (cols to a row), and GameScene's "NEW PACK" banner: its hold, and how
  // long after a finale's win it waits (for the CLEARED banner).
  carousel: { y: 28, gap: 136, sideShade: 0.6, swipe: 24, slideMs: 180 },
  details: { x: 76, y: 82, width: 328, cell: { width: 40, height: 42 }, cols: 8 },
  newPack: { hold: 2500, afterFinale: 5000 },
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

// Expeditions (src/systems/Expeditions.js, ExpeditionScene): crewmates sent
// on timed voyages in real time (Date.now), which keep going while the game
// is closed and come back with loot. Art and data in public/sprites/ui/
// expedition/ (expedition.json: the destinations, each crewmate's trait and
// the trait icons' order).
export const EXPEDITIONS = {
  path: 'ui/expedition/',   // under SPRITES.path
  // The board opens once this wave of this island has been cleared.
  unlock: { island: 'skull_cove', wave: 10 },
  // An island's destinations open on reaching this wave there (its record's
  // wave counter); the first island's open with the board.
  destinationWave: 25,
  destinationWaveByIsland: { skull_cove: 10 },
  // Expedition slots: 1 at unlock, and one more as each of these islands
  // unlocks on the map.
  slotIslands: ['ember_isle', 'frostbite_reef'],
  maxParty: 3,
  // Longer runs pay more per run (mult) but less per hour. betterChests: a
  // chest found may be a better tier (chestOdds).
  durations: [
    { id: '30m', label: '30M', ms: 30 * 60e3, mult: 1 },
    { id: '2h', label: '2H', ms: 2 * 3600e3, mult: 3.2 },
    { id: '8h', label: '8H', ms: 8 * 3600e3, mult: 10, betterChests: true },
  ],
  // Party bonus: +traitBonus for each crewmate with the destination's
  // favoured trait, +starBonus for every star in the party. A full party
  // (maxParty) all with the favoured trait always makes a bonus find.
  traitBonus: 0.25,
  starBonus: 0.05,
  // Gold: the gold per minute of battle (game time) over the last
  // recentWaves waves x goldMinutes x the duration's mult x the reward
  // focus's gold x the party bonus, give or take spread. So a 30-minute run
  // is worth goldMinutes minutes of battle gold before the party bonus.
  // Until 3 waves are logged (an old save) the gold per minute is estimated
  // from the current wave, as if it took fallbackWaveMs.
  goldMinutes: 4,
  recentWaves: 10,
  minLoggedWaves: 3,
  fallbackWaveMs: 60000,
  spread: 0.2,
  // Pearls on a 30-minute pearls run (x the duration's mult, the focus's
  // pearls and the party bonus).
  pearls: 3,
  // What each reward focus brings: gold and pearls are factors on the bases
  // above; chest: chests found; chestChance: the chance of one chest on a
  // 30-minute run, x the duration's mult (up to certain).
  focus: {
    gold: { label: 'Mostly gold', gold: 1, pearls: 0 },
    pearls: { label: 'Mostly Pearls', gold: 0.25, pearls: 1 },
    chest: { label: 'A chest + some gold', gold: 0.25, pearls: 0, chest: 1 },
    mixed: { label: 'A bit of everything', gold: 0.5, pearls: 0.5, chestChance: 0.15 },
  },
  // Chest tiers, waiting in the chest screen as free chests: a Chest rolls
  // like a bought one, a Rare Chest is Rare or better, a Legendary Chest is
  // a Legendary (the finales' free chests).
  chestTiers: ['common', 'rare', 'legendary'],
  chests: {
    common: { label: 'Chest', color: 0xb0bec5 },
    rare: { label: 'Rare Chest', color: 0x42a5f5 },
    legendary: { label: 'Legendary Chest', color: 0xff9800 },
  },
  // On a betterChests run, the tier of each chest found.
  chestOdds: { common: 0.7, rare: 0.25, legendary: 0.05 },
  // Bonus find: one extra reward, revealed last. Pearls runs double their
  // Pearls; the rest find a chest one tier above the best chest found (a
  // Rare Chest if none).
  bonusChance: 0.1,
  // Trait names and the glow behind a favoured crewmate's trait icon.
  traits: {
    fighter: { label: 'Fighter' },
    sailor: { label: 'Sailor' },
    scout: { label: 'Scout' },
    mystic: { label: 'Mystic' },
    caretaker: { label: 'Caretaker' },
  },
  glowColor: 0xffd54f,
  // The one-line story on the reveal screen: {name} is a crewmate in the party.
  stories: {
    coral_shallows: [
      '{name} dove for sunken coins among the coral.',
      '{name} hauled in something enormous.',
      '{name} traded shells with a very polite crab.',
      '{name} found a purse tangled in the kelp.',
    ],
    smugglers_cave: [
      '{name} spotted a chest behind a loose rock.',
      '{name} followed a smuggler\'s chalk marks to the loot.',
      '{name} hid from the smugglers, then took their stash.',
      '{name} counted every crate twice. One was ours.',
    ],
    obsidian_mines: [
      '{name} chipped gold out of the black glass.',
      '{name} fought off a magma crab for its nugget.',
      '{name} came back covered in soot and grinning.',
      '{name} kicked a cart of ore all the way to the boat.',
    ],
    hot_springs: [
      '{name} found pearls at the bottom of the spring.',
      '{name} soaked for hours and came back glowing.',
      '{name} brewed tea from the spring and sold it.',
      '{name} fished a shining clam out of the steam.',
    ],
    frozen_wreck: [
      '{name} chipped a chest out of the ice.',
      '{name} read the frozen captain\'s log and found the hold.',
      '{name} slid down the hull straight into the loot.',
      '{name} thawed the lock with a lot of patience.',
    ],
    aurora_peak: [
      '{name} caught pearls falling from the lights.',
      '{name} read the aurora like a map.',
      '{name} climbed the peak and sang to the sky.',
      '{name} came down with frost in the beard and pearls in hand.',
    ],
    ghost_market: [
      '{name} haggled with a ghost and won.',
      '{name} sold a spooky story for real gold.',
      '{name} bought a lantern that keeps whispering.',
      '{name} found the stall that only opens at midnight.',
    ],
    blackbones_vault: [
      '{name} picked the lock while the skeletons slept.',
      '{name} fought a bone guard for the vault key.',
      '{name} found Blackbones\' spare treasure.',
      '{name} left a note: "Thanks for the gold."',
    ],
  },
  // The screens (base pixels; ExpeditionScene).
  board: { cardWidth: 148, cardHeight: 204, gap: 8, top: 32 },
  // Reveal: the party's story, then each reward flips in revealStepMs apart.
  reveal: { storyMs: 500, stepMs: 650, flipMs: 160, cardWidth: 64, cardHeight: 78, gap: 8, bonusConfetti: 160 },
};

// Boss materials and ship parts (src/systems/Parts.js, src/systems/ShipParts.js,
// ShipyardScene). Art and data in public/sprites/parts/: parts.json lists
// the materials (one per boss, in materials.png's order), the four slots and
// the parts (each one's slot, material, effect text, overlay and icon).
// A material, and the parts made from it, only show once its boss is in the
// game (an ENEMIES boss with that sprite, on an available island).
export const PARTS = {
  path: 'parts/',       // under SPRITES.path
  maxLevel: 5,
  // Material to reach each level: [craft (level 1), level 2, 3, 4, 5].
  material: [5, 8, 12, 18, 25],
  // Gold to reach each level, in waves of gold (kills and clear bonus) of
  // the wave where the part's boss first appears (on its island, offset
  // included), so Skull Cove's parts cost thousands and Fogbound Isle's
  // billions.
  goldWaves: [3, 5, 8, 12, 18],
  // Every boss killed in a wave (not a Boss Hunt) drops its material, once
  // per boss per wave (like boss Pearls, a retry doesn't pay it again):
  // firstKill the first time that boss is ever beaten, perKill after.
  drops: { perKill: 3, firstKill: 5 },
  // An expedition to one of an island's destinations: this chance of
  // min-max of one of that island's boss materials (bosses beaten at least
  // once), as an extra reward card.
  expedition: { chance: 0.15, min: 1, max: 2 },
  // The ship's cannon ports (ship image pixels): the Magma and Heartwood
  // Cannons fire from a random one.
  ports: { x: [44, 64, 84, 104, 124], y: 120 },
  // Where the figurehead's tentacle and charm come from (ship image pixels).
  bow: { x: 160, y: 104 },
  // The Blackbones' Lantern glow pulses (an added-light copy of the
  // overlay, between 0 and glowAlpha) every glowMs.
  glowAlpha: 0.45,
  glowMs: 900,
  // Combat parts grow along levelCurve: an effect "atMax" is its level-5
  // value, and level L has atMax x (1 + levelCurve x (L - 1)) / (1 +
  // levelCurve x (maxLevel - 1)), so level 1 is a third of level 5.
  // economy: parts the Shipyard tags ECONOMY (gold, not combat).
  // What each part does (level L = 1-5):
  //   kraken_figurehead: every `every` ms a tentacle grabs the most
  //     dangerous enemy whose front edge is within `range` px of where
  //     walkers stop (on the lane or in the air): an Elite first, then a Keg
  //     Runner, then a flyer, else the frontmost. It stuns it for stun + (L -
  //     1) x stunPerLevel ms (bosses resist as usual: statusResist,
  //     stunGuardMs) and hits it for damageAtMax (on the level curve) x the
  //     strongest crewmate's DMG. The tentacle shows for slapMs, in `color`
  //     (its outline in `edge`).
  //   siren_figurehead: every `every` ms charms the frontmost enemy that
  //     walks the lane (not a boss, boat or flyer) for charm + (L - 1) x
  //     charmPerLevel ms: it turns round and fights the nearest other enemy,
  //     each hit `hitScale` x its own damage scaled like HP (so it matters
  //     at every wave), and the crew leave it alone.
  //   ghostweave_sails: the crew's attack speed x (1 + attackSpeedAtMax on
  //     the level curve).
  //   frostwing_sails: enemies within `range` px of the ship (their front
  //     edge from where walkers stop) move and attack slowAtMax (on the
  //     level curve) slower; bosses by statusResist x that.
  //   magma_cannons: every `every` ms a lava shot (magma_glob, lobbed over
  //     flightTime ms) at the frontmost enemy on the lane: damageAtMax (on
  //     the level curve) x the strongest crewmate's DMG, and a fire puddle
  //     where it lands for puddleMs that burns ground enemies in it for
  //     puddleDps x the shot's damage per second.
  //   heartwood_cannons: every `every` ms a frozen log flies from a port
  //     and skims along the lane, hitting the first `targets` enemies for
  //     damageAtMax (on the level curve) x the strongest crewmate's DMG and
  //     slowing them to slow x their pace for slowMs.
  //   blackbones_lantern (economy, not on the curve): gold from kills, wave
  //     clears and Boss Hunts x (1 + L x goldPerLevel), and a fog bank's
  //     range penalty x fogPenalty.
  // A timed part fires as soon as it has a target once its timer is up, and
  // first fires `every` ms into a wave.
  levelCurve: 0.5,
  economy: ['blackbones_lantern'],
  effects: {
    kraken_figurehead: {
      every: 8000, range: 160, stun: 1500, stunPerLevel: 250, damageAtMax: 1.5,
      slapMs: 220, color: 0x8a3a6a, edge: 0x1a1014,
    },
    siren_figurehead: { every: 12000, charm: 3000, charmPerLevel: 500, hitScale: 1 },
    ghostweave_sails: { attackSpeedAtMax: 0.2 },
    frostwing_sails: { range: 90, slowAtMax: 0.3 },
    magma_cannons: {
      every: 6000, damageAtMax: 2, flightTime: 900, arcHeight: 40,
      shot: 'magma_glob', impact: 'lava_splash', puddle: 'fire_puddle', puddleMs: 3000, puddleDps: 0.25, puddleFadeMs: 400,
    },
    heartwood_cannons: {
      every: 5000, damageAtMax: 1.25, targets: 3, speed: 260, length: 260, hitRadius: 4,
      slow: 0.7, slowMs: 2000, impact: 'frost_hit',
    },
    blackbones_lantern: { goldPerLevel: 0.05, fogPenalty: 0.5 },
  },
  // The Shipyard (ShipyardScene, base pixels): the ship preview on the left
  // (the whole ship at 1x; zoomed to zoom x on the slot being chosen for,
  // centred on that slot's focus, in ship image pixels: the lantern's y per
  // ship stage), the slot cards on the right (or a slot's parts, one row
  // each), and the materials along the bottom.
  shipyard: {
    preview: { x: 8, y: 30, width: 196, height: 214, sea: 0x2b4a6b },
    zoom: 2,
    focus: {
      figurehead: { x: 152, y: 106 },
      sails: { x: 112, y: 42 },
      cannons: { x: 84, y: 118 },
      lantern: { x: 24, y: [85, 59, 33] },
    },
    cards: { x: 212, y: 30, width: 260, cardHeight: 50, gap: 4 },
    rowHeight: 94,
    materials: { y: 248, height: 20 },
  },
  // The chest screen's Materials strip (base pixels): a parchment column
  // down its left edge, a row per material.
  strip: { x: 4, y: 68, width: 58, rowHeight: 17 },
};

// Boss Hunts (Progress, WaveManager.composeHunt, the map's island card): a
// single fight against one boss with its island's enemies trickling in, at
// the plain scaling of that boss's first wave on the island (no bossBoost
// or earlyBoost), opened on the island's card once that boss has been beaten.
// Each boss has its own hunt level, from 1: every win raises it, and its
// HP and damage, and the trickle's, are x (1 + growth) ^ (level - 1). A loss
// costs nothing. The boss comes in bossAt ms into the fight; the trickle is
// trickle x a normal wave's enemy count, a group every trickleInterval ms
// from trickleFrom.
// A win drops dropBase + floor(level / dropEvery) of the boss's material,
// doubled for the first dailyDoubles wins over each boss each day (local
// time, from midnight), and gold: gold x the fight's wave-clear bonus.
export const HUNTS = {
  growth: 0.08,
  bossAt: 1500,
  trickle: 0.6,
  trickleFrom: 4000,
  trickleInterval: 3000,
  dropBase: 2,
  dropEvery: 3,
  dailyDoubles: 3,
  gold: 2,
};

// The Abyss (src/systems/Abyss.js, src/systems/Currents.js, AbyssEndScene):
// the endless endgame, opened once unlockIsland's finale is won. Art and
// data in public/sprites/abyss/ (abyss.json: the currents' names, effect
// lines and icon order). A run (a "dive") goes depth after depth, one wave
// each, until the ship sinks; upgrades between depths work as between waves.
//   start: depth 1 is that island's wave: its enemy count, spawn rate, HP,
//          kill gold and damage; every depth after is one wave on.
//   damageGrowth: enemy damage x (1 + damageGrowth) per depth on top of
//          depth 1's (the islands' lateDamage.growth, with no cap).
//   hpGrowth: enemy HP (and shields) x (1 + hpGrowth) per depth on top of
//          the wave curve, so the Abyss Tide's crew damage doesn't run away.
//   goldMult: kill gold and clear bonus x this in the Abyss, so upgrading
//          between depths keeps up with it.
//   hullShare: enemies whose hit is a share of the hull (Keg Runners,
//          boarding boats; ENEMIES hullShare) hit for this x that share, so
//          a depth's walls are what the crew can't kill rather than a
//          fixed share no upgrade outgrows. Lava bombs are as on Ember Isle.
//   enemies: the island enemies a depth draws from, each with the group it
//          comes in (members front first; escort and pack as in FORMATIONS),
//          its weight, and its size: how many enemies the group counts as
//          toward the depth's count (default: its members), so a tough one
//          (an Obsidian Golem and the crabs it splits into) fills more of it. A depth uses types.start of them at random, one
//          more every types.every depths, up to types.max.
//   elites: from fromDepth, chance at fromDepth rising evenly to maxChance
//          at maxDepth (and after): hp x HP, damage x damage, gold x kill
//          gold, `tint` on the sprite and `aura` (an animated sheet) behind it.
//   bosses: every `every` depths, `order` taking turns; from pairsFrom, each
//          boss depth brings a pair (`pairs` taking turns; null: a random
//          other boss), entering at spawnAt of the depth's groups. Each boss
//          has its usual HP at the depth (no bossBoost) and drops `drops` x
//          its material (PARTS.drops).
//   checkpoints: a dive can start at depth 1 or any multiple of `every` up
//          to share x the best depth (rounded down); starting at one pays
//          that depth's gold (its kills and clear bonus).
//   currents: stacking modifiers. `counts` [depth, how many] active from
//          that depth; at every multiple of swapEvery from the first, a new
//          one joins if the count grows there, else the oldest is swapped for
//          a new random one (never the one it replaced). A run's seed
//          decides them. Each one's numbers below (ids in abyss.json's order).
//   milestones: first time a depth is cleared (once per save): chests (free
//          chest tiers, EXPEDITIONS.chestTiers) and Pearls; past the last
//          listed, every `every` depths pays `after`.
//   map: its icon's centre on the world map; the card shows there.
//   reveal: the one-time "something stirs" on the map: the map zooms
//          `zoom` x on the icon over zoomMs while the icon fades in over fadeMs.
export const ABYSS = {
  id: 'abyss',
  name: 'The Abyss',
  shortName: 'Abyss',
  path: 'abyss/',       // under SPRITES.path
  unlockIsland: 'fogbound_isle',
  start: { island: 'fogbound_isle', wave: 40 },
  damageGrowth: 0.03,
  hpGrowth: 0.03,
  goldMult: 8,
  hullShare: 0.5,
  scenery: { path: 'abyss/', bg: 'bg_abyss_tall', fg: 'fg_abyss_sheet' },
  enemies: {
    ironCrab: { weight: 1, size: 4, members: ['ironCrab'] },
    stormHarpy: { weight: 0.5, size: 5, members: ['stormHarpy', 'stormHarpy'] },
    kegRunner: { weight: 0.5, size: 8, members: ['kegRunner', 'kegRunner'] },
    barnacleKnight: { weight: 1, size: 5, members: ['barnacleKnight'] },
    cinderSkeleton: { weight: 1, members: ['cinderSkeleton', 'cinderSkeleton', 'cinderSkeleton'] },
    magmaCrab: { weight: 1, size: 4, members: ['magmaCrab'] },
    ashBat: { weight: 0.7, size: 6, members: ['ashBat', 'ashBat', 'ashBat'] },
    obsidianGolem: { weight: 1, size: 9, members: ['obsidianGolem'] },
    frozenCorsair: { weight: 1, members: ['frozenCorsair', 'frozenCorsair', 'frozenCorsair'] },
    sledPenguin: { weight: 1, pack: [3, 5], members: ['sledPenguin'] },
    yetiRaider: { weight: 1, size: 2, members: ['yetiRaider'] },
    iceWitch: { weight: 0.5, size: 2, members: ['iceWitch'] },
    boneDeckhand: { weight: 1, members: ['boneDeckhand', 'boneDeckhand', 'boneDeckhand'] },
    fogWraith: { weight: 1, members: ['fogWraith', 'fogWraith'] },
    cursedCannoneer: { weight: 1, size: 2, members: ['cursedCannoneer'] },
    // Its deckhands come with it, for its lantern to raise.
    lanternGhoul: { weight: 0.5, size: 4, members: ['boneDeckhand', 'boneDeckhand', 'lanternGhoul'] },
  },
  types: { start: 2, every: 5, max: 6 },
  elites: {
    fromDepth: 10, chance: 0.1, maxDepth: 60, maxChance: 0.25,
    hp: 3, damage: 1.5, gold: 3, tint: 0xc8a6ff,
    aura: { file: 'elite_aura.png', frameWidth: 32, frameHeight: 32, frames: 4, fps: 8 },
  },
  bosses: {
    every: 10,
    order: ['kraken', 'ghostGalleon', 'moltenLeviathan', 'frostWyrm', 'frostGiant', 'sirenQueen', 'captainBlackbones'],
    pairsFrom: 80,
    pairs: [['kraken', 'ghostGalleon'], ['moltenLeviathan', 'frostWyrm'], ['frostGiant', 'sirenQueen'], ['captainBlackbones', null]],
    spawnAt: [0.3, 0.55],
    drops: 2,
  },
  checkpoints: { every: 10, share: 0.5 },
  currents: {
    counts: [[5, 1], [15, 2], [30, 3]],
    swapEvery: 5,
    ids: ['frenzied', 'armoured', 'shielded', 'volcanic', 'blizzard', 'fogbound', 'sirens_call', 'risen_dead'],
    frenzied: { pace: 1.25 },                    // enemies move and attack this much faster
    armoured: { hp: 1.4 },                       // enemy HP (and shields) x this
    shielded: { every: 4 },                      // every n-th enemy (not bosses) gets an Ice Witch's shield
    volcanic: { island: 'ember_isle' },          // that island's lavaBombs, the whole depth
    // Frostbite Reef's blizzard rolling in `at` ms into the depth and
    // blowing to its end, freezing a crewmate every freezeEvery ms
    // (freezeMs each); enemies walk chill x as fast.
    blizzard: { island: 'frostbite_reef', at: 1500, freezeEvery: 8000, freezeMs: 2000, chill: 1 },
    // Fogbound Isle's fog bank from `at` ms to the depth's end: crew range x range.
    fogbound: { island: 'fogbound_isle', at: 1500, range: 0.8 },
    sirens_call: { every: 15000, charmMs: 2000 },   // a crewmate who attacks is charmed (CHARM)
    risen_dead: { chance: 0.15, into: 'boneDeckhand' },   // a killed enemy (not a boss) rises as one
  },
  milestones: {
    10: { chests: { rare: 1 } },
    20: { chests: { rare: 2 } },
    30: { chests: { legendary: 1 } },
    every: 10,
    after: { chests: { legendary: 1 }, pearls: 100 },
  },
  map: { x: 420, y: 200, file: 'map_abyss.png', lockedTint: 0x1a1a24, lockedAlpha: 0.8 },
  // The Abyss's map card is this much taller than an island's (upward).
  cardExtra: 14,
  reveal: { zoom: 2, zoomMs: 1600, fadeMs: 1400, message: 'SOMETHING STIRS IN THE DEEP...' },
  // The battle: rising motes (Weather, like ASHFALL) over the scene the whole
  // time; the HUD's depth icon; the row of current icons under the hull
  // plaque (icons iconSize px, gap apart) and the note a tapped one shows
  // (noteMs real time); the current banner, and a boss banner that waits
  // bossBannerDelay ms (game time) after it.
  hud: { depthIcon: 'icon_depth.png', iconSize: 12, gap: 2, y: 52, noteMs: 2500, bossBannerDelay: 1800 },
  // The end-of-run screen (AbyssEndScene) opens this long after the ship
  // sinks, so the sinking banner shows first.
  endScreenDelay: 2000,
  // The Abyss Tide: each depth cleared in a dive adds a stack (for that
  // dive only), each worth +damage crew damage.
  tide: { damage: 0.02 },
  // Skip the shallows: a dive from depth 1, with the best depth at least
  // minBest and the setting on (the Abyss card), clears its first `depths`
  // depths at once: their gold and Tide stacks, no fight.
  skip: { minBest: 20, depths: 5 },
};

// Rising motes over the Abyss (src/weather.js, flag `motes`): no heavy weather.
export const MOTES = {
  flag: 'motes',
  path: 'abyss/',
  file: 'motes_sheet.png',
  frameWidth: 64,
  frameHeight: 64,
  frames: 4,
  fps: 5,
  fadeMs: 1200,
  heavy: { tint: 0x000000, tintAlpha: 0, layers: 0, drift: { x: 0, y: 0 }, fadeMs: 1200 },
};

// Passing merchant ships (src/systems/Merchants.js; art and frame data in
// public/sprites/merchants/, merchants.json). During island waves and Abyss
// depths (not Boss Hunts, not while a boss is alive or an overlay is open)
// a merchant sails across the far sea, behind the ship; tapping it fires a
// cannonball at it for plunder. Never required: one nobody taps just leaves.
//   firstAt / every: [min, max] game ms of battle (waves only; the clock
//          carries over between waves) before the first ship, then between
//          ships. One on screen at a time.
//   types: weight (chance), speed (px/s) and plunder of each ship: gold x G
//          (G = goldSeconds of the player's gold income: gold per second
//          of battle over the last goldWindowMs, at least floorKills kills
//          of the wave's basic enemy), Spice (spiceChance of one more),
//          Bait, and materialChance of one random boss material from a boss
//          already beaten.
//   lane: the ship's waterline on screen (waterY) and where its bow starts
//          fading out (fadeX), over fadeMs; `lanes` overrides it per
//          battlefield (island id, or the Abyss's) where the backdrop has
//          something in the way (Frostbite Reef's iceberg, Fogbound Isle's
//          wreck, the Abyss's pillar), so a merchant is gone before it.
//   bobFps: its sail frames (0-2); hitPad: px round the frame that still
//          count as a tap on it; tapFromX: it can be tapped once its middle
//          is past this x (clear of our ship's sails and rigging).
//   shot: a cannonball from the bow (ship image pixels) in an arc of
//          arcHeight px over ms. On a hit: the struck frame, speed x slow,
//          a loot crate rising crateRise px while the plunder text rises,
//          both fading over crateMs, and the ship fading over fadeMs.
export const MERCHANTS = {
  path: 'merchants/',   // under SPRITES.path
  firstAt: [45000, 75000],
  every: [70000, 130000],
  types: {
    trade_cog: { name: 'Trade Cog', weight: 0.7, speed: 24, gold: 1 },
    spice_runner: {
      name: 'Spice Runner', weight: 0.22, speed: 34, gold: 0.5, spice: 1, spiceChance: 0.3, bait: 1,
    },
    treasure_galleon: {
      name: 'Treasure Galleon', weight: 0.08, speed: 18, gold: 3, spice: 2, bait: 2, materialChance: 0.15,
    },
  },
  goldSeconds: 10,
  goldWindowMs: 60000,
  floorKills: 5,
  lane: { waterY: 160, fadeX: 360, fadeMs: 1000 },
  lanes: {
    frostbite_reef: { fadeX: 195 },
    fogbound_isle: { fadeX: 232 },
    abyss: { waterY: 156, fadeX: 195 },
  },
  bobFps: 3,
  hitPad: 6,
  tapFromX: 160,
  shot: { from: { x: 150, y: 100 }, ms: 500, arcHeight: 28 },
  slow: 0.4,
  fadeMs: 2000,
  crateRise: 20,
  crateMs: 1400,
  // Plunder text colours (over the scene): gold, Spice, Bait, materials.
  colors: { gold: '#ffd86a', spice: '#ff9a4a', bait: '#ff8a9a', material: '#c8ffe0' },
};

// Fishing (GalleyScene's Fishing tab, src/systems/Fishing.js). Art and the
// fish list (ids, names, rarities, home island) in public/sprites/fishing/,
// fishing.json. The angler stands in deck 1's forward slot: his frame's
// top-left at the ship's position + angler, between the ship and its front
// railing.
//   bait: a cast costs one. Up to cap (capWithWhaler once the Whaler is in
//          the crew) come back on their own, one per regenMs of real time
//          (offline too); merchants and expeditions can bring more than
//          that. A new save starts full.
//   cast: the wind-up (castBackMs), then the bobber flies over flightMs in an
//          arc arcHeight px high to a random x in bobberX, its waterline
//          on layout.waterY. lineColor: the line, from the rod tip.
//   wait: [min, max] ms before the bite; nibbleChance of a fake nibble first
//          (the bobber dips for nibbleMs, no "!"; tapping then reels in
//          early and the bait is gone).
//   bite: biteMs to tap once the "!" shows, or it gets away.
//   reel: the timing bar (bar_frame, width x height) with its catch zone
//          and marker sweeping across it (rarities: zone width share and
//          one sweep's ms). hits to land it (legendaryHits for a
//          Legendary), strikes misses and it escapes; every hit moves the
//          zone and speeds the marker up by speedUp.
//   rarities: chance of each (rolled at the bite, not shown), and the
//          name's colour.
//   pools: the fish of each rarity by spot (an island id, the Abyss's, or
//          `any`): [fish id, weight] pairs. An island's own uncommon fish
//          is `local` of its uncommon rolls (the rest split the plain ones).
//   firstCatchSpice: Spice for the first ever catch of each fish.
//   holdFish: the fish shown at 2x when it's held up, centred here in the
//          angler's frame.
export const FISHING = {
  path: 'fishing/',     // under SPRITES.path
  bait: { cap: 6, capWithWhaler: 8, whaler: 'whaler', regenMs: 20 * 60e3 },
  angler: { x: 110, y: 73 },
  cast: { castBackMs: 250, flightMs: 600, arcHeight: 36, bobberX: [250, 330], lineColor: 0xe8eef2, sag: 3 },
  wait: { min: 2000, max: 6000, nibbleChance: 0.3, nibbleMs: 200 },
  bite: { ms: 800 },
  reel: {
    width: 140, height: 12, y: 196, hits: 3, legendaryHits: 4, strikes: 2, speedUp: 0.15,
    zone: 0x3fae3f, hitColor: '#7fd36a', missColor: '#ff6a5a',
  },
  rarities: {
    junk: { chance: 0.08, zone: 0.35, sweepMs: 1200, color: '#a8a8a8', label: 'Junk' },
    common: { chance: 0.52, zone: 0.30, sweepMs: 1100, color: '#fff3d6', label: 'Common' },
    uncommon: { chance: 0.28, zone: 0.22, sweepMs: 1000, color: '#7fd36a', label: 'Uncommon' },
    rare: { chance: 0.11, zone: 0.15, sweepMs: 900, color: '#5aa9f0', label: 'Rare' },
    legendary: { chance: 0.01, zone: 0.10, sweepMs: 800, color: '#ffb03a', label: 'Legendary' },
  },
  pools: {
    junk: { any: [['old_boot', 1]] },
    common: { any: [['sardine', 1], ['mackerel', 1]] },
    uncommon: {
      any: [['red_snapper', 1], ['pufferfish', 1]],
      local: 0.5,
      ember_isle: [['ember_eel', 1]],
      frostbite_reef: [['ice_cod', 1]],
      fogbound_isle: [['ghost_carp', 1]],
      abyss: [['red_snapper', 1], ['pufferfish', 1], ['ember_eel', 1], ['ice_cod', 1], ['ghost_carp', 1]],
    },
    rare: {
      any: [['swordfish', 1]],
      skull_cove: [['moonfish', 1], ['swordfish', 1]],
      abyss: [['abyss_angler', 0.6], ['swordfish', 0.4]],
    },
    legendary: { any: [['golden_koi', 1]] },
  },
  firstCatchSpice: 1,
  // Expeditions to `dest` also bring bait [min, max] Bait and at fishChance
  // one of `fish` (into the hold; it doesn't count as caught).
  expedition: { dest: 'coral_shallows', bait: [1, 2], fishChance: 0.3, fish: ['sardine', 'mackerel'] },
  holdFish: { x: 22, y: -12, scale: 2 },
  messageMs: 1600,
};

// Meals (GalleyScene's Cooking tab): a recipe shows once each of its fish
// has been caught; cooking puts the meal in the Pantry, Eat makes it the
// active meal (one at a time) for `waves` cleared waves (an Abyss depth and
// a Boss Hunt count as one), caretakerWaves more if anyone on the ship has
// the Caretaker trait. needs: fish (fishing.json ids) and Spice. Effects
// (shares, e.g. 0.1 = +10%):
//   gold: gold from kills, wave clears, depths and hunts
//   damage / attackSpeed: the crew's
//   hull: max hull HP
//   heal: max hull mended every healEveryMs of a wave (the hull is full when
//         each wave starts)
//   bossDamage: crew attacks on bosses
//   lavaDamage: lava bomb hits (negative = less)
//   freeze: how long blizzard freezes last (Frostbite Reef's and the
//         Abyss's), negative = shorter
//   charm / fog: Siren charms' length (the Siren Queen's, Siren's Call) and
//         a fog bank's range penalty, negative = less
//   abyssGrowth: the Abyss's rising tide (enemy HP and damage growth per
//         depth) counts this much lower
// note: an extra line on the recipe card.
export const MEALS = {
  caretakerWaves: 5,
  caretakerTrait: 'caretaker',
  healEveryMs: 10000,
  list: {
    fish_stew: { needs: { sardine: 3 }, waves: 10, gold: 0.1 },
    grilled_mackerel: { needs: { mackerel: 3 }, waves: 10, attackSpeed: 0.08 },
    snapper_curry: { needs: { red_snapper: 2, spice: 1 }, waves: 10, damage: 0.12 },
    puffer_sashimi: { needs: { pufferfish: 2 }, waves: 10, damage: 0.18, hull: -0.15 },
    moonfish_pie: { needs: { moonfish: 1, sardine: 2 }, waves: 10, heal: 0.02 },
    swordfish_steak: { needs: { swordfish: 1, spice: 1 }, waves: 10, bossDamage: 0.2 },
    ember_eel_skewers: { needs: { ember_eel: 2, spice: 1 }, waves: 10, lavaDamage: -0.5, damage: 0.05 },
    ice_cod_chowder: { needs: { ice_cod: 2, spice: 1 }, waves: 10, freeze: -0.5, hull: 0.1 },
    ghost_carp_soup: { needs: { ghost_carp: 2, spice: 1 }, waves: 10, charm: -0.5, fog: -0.5 },
    angler_bake: { needs: { abyss_angler: 1, spice: 2 }, waves: 10, abyssGrowth: -0.25 },
    golden_koi_feast: {
      needs: { golden_koi: 1, spice: 2 }, waves: 20, gold: 0.4, damage: 0.1, attackSpeed: 0.1,
    },
    boot_soup: { needs: { old_boot: 3 }, waves: 10, gold: 0.01, note: 'It tastes awful.' },
  },
};

// The Galley screen (GalleyScene, base pixels): its tabs, the fishing
// spot picker and the cooking tab; and the battle HUD's active meal (its
// icon and waves left on a small plaque left of the settings buttons, at
// x / y, width wide).
export const GALLEY = {
  tabWidth: 84,
  spots: { y: 36, width: 70, height: 18, gap: 3 },
  recipes: { x: 12, y: 46, cols: 3, cardWidth: 148, cardHeight: 44, gapX: 4, gapY: 4, rows: 4 },
  // The Cooking tab: the Spice / active meal strip, the recipe list (a row
  // per meal) and the chosen recipe's panel (needsY: where its ingredients
  // start).
  cooking: {
    stripY: 30,
    list: { x: 8, y: 54, width: 196, height: 212, rowHeight: 17 },
    detail: { x: 208, y: 54, width: 264, height: 212, needsY: 96 },
  },
  hud: { x: 352, y: 34, width: 56 },
};

// The Captain's tutorial (src/tutorial/, TutorialScene): the onboarding for
// a new save and one-time tips. Art in public/sprites/tutorial/
// (tutorial.json: the frame sizes, the portrait's and mini face's order,
// the pointer's fingertip). Base pixels and ms (real time):
//   typeCps: the text types out at this many characters a second;
//     talkFps: the talking faces' swap (talk0 / point with talk1).
//   dim: the shade over the scene; pad: the spotlight's hole round its
//     target; bracketPulseMs: the corner brackets step out 1px and back;
//     pointerFps / pointerBob: the pointer's frame swap and its bob (px).
//   box: the dialogue box (width x height; up to `lines` lines wrapped at
//     wrap px). It sits barGap px over the bottom button bar, or `lift` px
//     higher (room for the pointer over a bar button), or at the top or
//     middle of the view (margin px in from its edges), wherever it first
//     clears the spotlight; arrowFps: the next arrow's bob.
//   banner: the banner tip's strip (y under the view's top, at most
//     maxWidth wide), how long it holds and its slide.
//   missingMs: a guided step whose target is gone (or disabled) this long
//     moves on. waveDelayMs: steps after a wave wait this long (the wave's
//     banner shows first).
//   merchantSpeed: the battle's speed while the first merchant is guided.
//   galleyRig: the first Galley cast's catch (fish, rarity) and its catch
//     zone's share of the bar; it can't get away and misses don't count.
export const TUTORIAL = {
  path: 'tutorial/',    // under SPRITES.path
  typeCps: 45,
  talkFps: 8,
  dim: 0.6,
  pad: 4,
  bracketPulseMs: 400,
  pointerFps: 3,
  pointerBob: 2,
  box: {
    width: 300, height: 58, lines: 3, wrap: 228, barGap: 2, lift: 26, margin: 2, arrowFps: 3,
  },
  banner: {
    y: 30, maxWidth: 300, height: 28, holdMs: 4000, slideMs: 250,
  },
  skip: { width: 40, height: 14 },
  missingMs: 1000,
  waveDelayMs: 2300,
  merchantSpeed: 0.5,
  galleyRig: { fish: 'sardine', rarity: 'common', zone: 0.45 },
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

// Sound and music (src/audio/). Files under `path` (public/audio/): the
// music as note data (music/<track>.json, played live by the synth in
// src/audio/Music.js), and each sound effect as sfx/<name>.ogg and .mp3.
// Volumes are the Settings sliders (0-100); a slider at v plays its bus at
// (v / 100)^2 x the bus's gain. Mute silences both buses and keeps the
// sliders. Both buses go through a limiter (DynamicsCompressor) so busy
// waves don't clip.
export const AUDIO = {
  path: 'audio/',
  defaults: { music: 60, sfx: 80 },
  musicGain: 0.6,
  sfxGain: 0.9,
  limiter: { threshold: -6, knee: 0, ratio: 12, attack: 0.003, release: 0.15 },
  music: {
    crossfadeSec: 0.8,
    // The lookahead scheduler: every intervalMs, notes due in the next
    // lookaheadSec are scheduled on the AudioContext's clock.
    intervalMs: 25,
    lookaheadSec: 0.15,
    startDelaySec: 0.05,      // a new track's first note, after it's asked for
    pulseHarmonics: 32,       // terms in the pulse waves' Fourier series
    noiseSec: 1,              // the drums' shared white-noise buffer
    // Which track plays where (GameScene.syncMusic): the island's own in
    // battle, boss while a boss is alive and through a Boss Hunt, abyss on
    // a dive; title on the title screen, the map and the ending; galley in
    // the Galley.
    islands: {
      skull_cove: 'skull_cove', ember_isle: 'ember_isle', frostbite_reef: 'frostbite_reef', fogbound_isle: 'fogbound_isle',
    },
    title: 'title',
    boss: 'boss',
    abyss: 'abyss',
    galley: 'galley',
    tracks: ['title', 'skull_cove', 'ember_isle', 'frostbite_reef', 'fogbound_isle', 'boss', 'abyss', 'galley'],
  },
  // Each sound effect: its volume (the files are all normalised to the
  // same peak); gapMs, the least time between two plays of it (closer ones
  // are skipped); jitter, a random +-share of playback rate.
  maxCopies: 4,               // of one sound playing at once
  sfx: {
    ui_click: { volume: 0.45 },
    ui_back: { volume: 0.45 },
    ui_open: { volume: 0.45 },
    ui_error: { volume: 0.45 },
    buy: { volume: 0.55 },
    upgrade: { volume: 0.65 },
    deck_build: { volume: 0.8 },
    chest_open: { volume: 0.75 },
    legendary: { volume: 0.85 },
    cannon: { volume: 0.5, gapMs: 40 },
    cannon_small: { volume: 0.28, gapMs: 50 },
    hit: { volume: 0.3, gapMs: 40, jitter: 0.06 },
    hit_heavy: { volume: 0.45, gapMs: 40 },
    enemy_die: { volume: 0.35, gapMs: 30 },
    coin: { volume: 0.3, gapMs: 40, jitter: 0.06 },
    hull_hit: { volume: 0.45, gapMs: 60 },
    wave_start: { volume: 0.7 },
    wave_clear: { volume: 0.7 },
    island_clear: { volume: 0.85 },
    defeat: { volume: 0.8 },
    boss_roar: { volume: 0.85 },
    boss_die: { volume: 0.85 },
    lava_bomb: { volume: 0.6 },
    freeze: { volume: 0.6 },
    thunder: { volume: 0.75 },
    siren_song: { volume: 0.6 },
    merchant_bell: { volume: 0.55 },
    plunder: { volume: 0.7 },
    cast: { volume: 0.55 },
    splash: { volume: 0.55 },
    bite: { volume: 0.65 },
    reel_hit: { volume: 0.6 },
    reel_miss: { volume: 0.6 },
    reel_tick: { volume: 0.25 },
    fish_escape: { volume: 0.7 },
    fish_catch: { volume: 0.75 },
    fish_legendary: { volume: 0.85 },
    cook: { volume: 0.65 },
    eat: { volume: 0.65 },
    captain_blip: { volume: 0.3, jitter: 0.04 },
    tip: { volume: 0.55 },
  },
  blipEvery: 2,               // the Captain's typing: a blip every Nth character
  // Crew who attack faster than this (ms between shots) play their shot at
  // rapidVolume x its volume.
  rapidShotMs: 600,
  rapidVolume: 0.5,
  // A lava bomb's sound (a whistle, then the boom) starts this long (game
  // time) before the bomb lands, so the boom lands with it.
  lavaBombLeadMs: 300,
  // Events with no sound of their own play the closest one, at volume x
  // its volume (see DESIGN.md).
  quiet: 0.6,
};

// The title screen (src/scenes/TitleScene.js). Positions come from
// sprites/title/title.json, in title_bg.png's 480x430 space, whose rows
// SCENERY.originY.. are the 480x270 safe view (the battle's tall layout).
export const TITLE = {
  path: 'title/',              // under SPRITES.path
  logoDropMs: 600,             // from above the view, Back.easeOut
  logoFloat: { px: 2, ms: 1600 },
  blink: { onMs: 600, offMs: 400, reducedMs: 1000 },
  fadeMs: 300,                 // the logo and TAP TO START, on the tap
  gullSpeed: [6, 12],          // px/s, each gull picks one
  gullFps: 4,
  shadow: '#2a170a',           // TAP TO START's 1px drop shadow
  version: { x: 4, y: 4 },     // the version label, from the safe view's bottom-left
};

// Phones, installing and offline play (src/pwa.js, src/systems/Offline.js).
//   updateCheckMs: how often a waiting new version looks for a quiet moment
//     (the battle between waves, nothing open) to show the Captain's banner.
//   saveCode: the Export / Import save code's prefix (with the format's
//     version) and the text box's size (art px) in its dialog.
//   minTap: the smallest tap target (art px); smaller buttons get a bigger
//     invisible hit area.
//   portrait: the "Turn your phone sideways" overlay, on a touch screen held
//     upright that's under maxWidth CSS px across (a phone: in portrait the
//     game would be under 1 CSS px per art px; a tablet still plays), with
//     rotate.png at iconScale CSS px per art px.
//   offline: While you were away. idleRate is an exponential moving average
//     (weight emaWeight) of the gold per second of battle, sampled at each
//     wave cleared on an island or in the Abyss (not Boss Hunts); away
//     earnings are idleRate x share per second away, at most capMs of it,
//     nothing under minAwayMs. A page hidden for returnAfterMs or more counts
//     as coming back. The panel's gold counts up over countMs with a coin
//     tick every tickMs; the ledger opens over openMs.
export const MOBILE = {
  updateCheckMs: 1000,
  saveCode: { prefix: 'HTD1.', rawPrefix: 'HTD0.', box: { width: 216, height: 64 } },
  minTap: 24,
  portrait: { maxWidth: 600, iconScale: 4 },
  offline: {
    emaWeight: 0.2,
    share: 0.25,
    capMs: 8 * 60 * 60 * 1000,
    minAwayMs: 2 * 60 * 1000,
    returnAfterMs: 2 * 60 * 1000,
    countMs: 800,
    tickMs: 80,
    openMs: 250,
  },
};

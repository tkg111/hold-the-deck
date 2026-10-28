import { ABYSS } from '../config.js';

// The Uncharted Seas' stages (see src/systems/Uncharted.js for how they
// play; UNCHARTED in config for the numbers they share). Add a stage by
// adding a row to its sea.
//
// A sea: id and name (legend.json's chart spots), battlefield (the island
// whose scenery and weather it uses, or 'abyss'), storm (the Skull Cove
// finale's storm over it) and current (each stage meets one Abyss current,
// picked from the stage's id).
// A stage: id ("1-4"), name, lineup (group keys from GROUPS below, picked
// at random by weight like an Abyss depth's), waves (how many), rule (at 1
// crown, or null) and extra (added at 2 and 3 crowns), drops (Sea Glass
// colours; a boss stage drops random glass and a Heart instead), and for a
// boss stage bosses: { wave index: [ENEMIES keys] } (several boss waves come
// one after another), hazard: 'lava' (Ember Isle's bombs) or 'blizzard'
// (Frostbite Reef's, the whole stage).

// The groups a lineup draws from: the Abyss's own (ABYSS.enemies), plus the
// Skull Cove ones it leaves out. A group with `once` comes at most once a
// wave (a Siren on her rock).
export const GROUPS = {
  ...ABYSS.enemies,
  drownedSailor: { weight: 1, members: ['drownedSailor', 'drownedSailor', 'drownedSailor'] },
  thiefMonkey: { weight: 1, members: ['thiefMonkey', 'thiefMonkey'] },
  boardingBoat: { weight: 1, size: 4, members: ['boardingBoat', 'boardingBoat'] },
  siren: { weight: 0.5, size: 4, members: ['siren'], once: true },
};

const SKULL = ['drownedSailor', 'thiefMonkey', 'ironCrab', 'stormHarpy', 'kegRunner', 'barnacleKnight'];
const EMBER = ['cinderSkeleton', 'magmaCrab', 'ashBat', 'obsidianGolem', 'kegRunner', 'barnacleKnight'];
const FROST = ['frozenCorsair', 'sledPenguin', 'yetiRaider', 'iceWitch'];
const FOG = ['boneDeckhand', 'fogWraith', 'cursedCannoneer', 'lanternGhoul'];
const ALL = Object.keys(ABYSS.enemies);
const ARMOURED = ['ironCrab', 'magmaCrab', 'barnacleKnight', 'obsidianGolem'];

export const SEAS = [
  {
    id: 'shipwreck_shallows',
    name: 'Shipwreck Shallows',
    battlefield: 'skull_cove',
    stages: [
      { id: '1-1', name: 'Low Tide', lineup: ['drownedSailor', 'ironCrab'], waves: 4, rule: null, extra: 'gale', drops: ['red'] },
      { id: '1-2', name: 'Monkey Business', lineup: ['thiefMonkey', 'kegRunner'], waves: 4, rule: 'swarm', extra: 'doldrums', drops: ['gold'] },
      { id: '1-3', name: 'Barnacle Bay', lineup: ['barnacleKnight', 'ironCrab'], waves: 4, rule: 'barnacled', extra: 'leaky_hull', drops: ['blue'] },
      { id: '1-4', name: 'Harpy Squall', lineup: ['stormHarpy', 'boardingBoat'], waves: 4, rule: 'gale', extra: 'night_watch', drops: ['green'] },
      { id: '1-5', name: 'Skeleton Crew', lineup: SKULL, waves: 5, rule: 'skeleton_crew', extra: 'swarm', drops: ['red', 'purple'] },
      {
        id: '1-6', name: "Kraken's Nest", lineup: ['boardingBoat', 'drownedSailor'], waves: 4, rule: null, extra: 'elite_hunt',
        bosses: { 3: ['kraken', 'ghostGalleon'] },
      },
    ],
  },
  {
    id: 'cinder_straits',
    name: 'Cinder Straits',
    battlefield: 'ember_isle',
    stages: [
      { id: '2-1', name: 'Ashfall', lineup: ['cinderSkeleton', 'ashBat'], waves: 5, rule: null, extra: 'night_watch', drops: ['red'] },
      { id: '2-2', name: 'Obsidian March', lineup: ['obsidianGolem', 'magmaCrab'], waves: 5, rule: 'leaky_hull', extra: 'barnacled', drops: ['blue'] },
      { id: '2-3', name: 'Firefly Night', lineup: ['ashBat'], waves: 5, rule: 'night_watch', extra: 'gale', drops: ['green'] },
      { id: '2-4', name: 'Powder Keg Run', lineup: ['kegRunner', 'cinderSkeleton'], waves: 5, rule: 'hourglass', extra: 'swarm', drops: ['gold'] },
      { id: '2-5', name: 'The Forge', lineup: EMBER, waves: 5, rule: 'fighters_only', extra: 'doldrums', drops: ['red', 'gold'] },
      {
        id: '2-6', name: 'Twin Flames', lineup: EMBER, waves: 4, rule: null, extra: 'leaky_hull', hazard: 'lava',
        bosses: { 3: ['moltenLeviathan', 'kraken'] },
      },
    ],
  },
  {
    id: 'glacier_graveyard',
    name: 'Glacier Graveyard',
    battlefield: 'frostbite_reef',
    stages: [
      { id: '3-1', name: 'Frozen Watch', lineup: ['frozenCorsair', 'boneDeckhand'], waves: 5, rule: null, extra: 'doldrums', drops: ['blue'] },
      { id: '3-2', name: 'Penguin Stampede', lineup: ['sledPenguin'], waves: 5, rule: 'gale', extra: 'swarm', drops: ['green'] },
      { id: '3-3', name: 'Witch Light', lineup: ['iceWitch', 'lanternGhoul', 'frozenCorsair'], waves: 5, rule: 'elite_hunt', extra: 'night_watch', drops: ['purple'] },
      { id: '3-4', name: 'Yeti Pass', lineup: ['yetiRaider', 'cursedCannoneer'], waves: 5, rule: 'leaky_hull', extra: 'hourglass', drops: ['red'] },
      { id: '3-5', name: 'Mystic Frost', lineup: [...FROST, ...FOG], waves: 5, rule: 'mystics_only', extra: 'no_galley', drops: ['purple', 'blue'] },
      {
        id: '3-6', name: 'Wyrm and Bones', lineup: FROST, waves: 4, rule: null, extra: 'elite_hunt', hazard: 'blizzard',
        bosses: { 3: ['frostWyrm', 'captainBlackbones'] },
      },
    ],
  },
  {
    id: 'sirens_maze',
    name: "Siren's Maze",
    battlefield: 'fogbound_isle',
    stages: [
      { id: '4-1', name: 'Fog Bank', lineup: ['fogWraith', 'boneDeckhand'], waves: 5, rule: 'night_watch', extra: 'gale', drops: ['green'] },
      { id: '4-2', name: 'Siren Song', lineup: ['siren', 'boneDeckhand'], waves: 5, rule: 'no_galley', extra: 'doldrums', drops: ['purple'] },
      { id: '4-3', name: 'Graveyard Shift', lineup: ['lanternGhoul', 'boneDeckhand'], waves: 5, rule: 'swarm', extra: 'barnacled', drops: ['gold'] },
      { id: '4-4', name: 'Grapeshot Alley', lineup: ['cursedCannoneer', 'barnacleKnight'], waves: 5, rule: 'doldrums', extra: 'leaky_hull', drops: ['red'] },
      { id: '4-5', name: 'Lost Crew', lineup: FOG, waves: 5, rule: 'skeleton_crew', extra: 'elite_hunt', drops: ['blue', 'purple'] },
      {
        id: '4-6', name: 'The Siren Court', lineup: ['siren', 'boneDeckhand'], waves: 4, rule: 'no_galley', extra: 'night_watch',
        bosses: { 3: ['sirenQueen', 'ghostGalleon'] },
      },
    ],
  },
  {
    id: 'storm_crown',
    name: 'Storm Crown',
    battlefield: 'skull_cove',
    storm: true,
    stages: [
      { id: '5-1', name: 'Thunderhead', lineup: ['stormHarpy', 'ashBat'], waves: 5, rule: 'gale', extra: 'swarm', drops: ['green'] },
      { id: '5-2', name: 'Broadside', lineup: ['boardingBoat', 'cursedCannoneer'], waves: 5, rule: 'leaky_hull', extra: 'barnacled', drops: ['red'] },
      {
        id: '5-3', name: "Giant's Wake", lineup: ['yetiRaider'], waves: 5, rule: 'hourglass', extra: 'doldrums', drops: ['blue'],
        bosses: { 2: ['frostGiant'] },
      },
      { id: '5-4', name: 'Elite Squadron', lineup: ALL, waves: 5, rule: 'elite_hunt', extra: 'gale', drops: ['purple'] },
      { id: '5-5', name: 'Dead Calm', lineup: ALL, waves: 5, rule: 'doldrums', extra: 'no_galley', drops: ['gold', 'red'] },
      {
        id: '5-6', name: 'Eye of the Storm', lineup: SKULL, waves: 4, rule: 'gale', extra: 'elite_hunt',
        bosses: { 1: ['ghostGalleon'], 2: ['kraken'], 3: ['frostWyrm'] },
      },
    ],
  },
  {
    id: 'drowned_throne',
    name: 'The Drowned Throne',
    battlefield: 'abyss',
    current: true,
    stages: [
      { id: '6-1', name: 'Sunken Steps', lineup: ALL, waves: 5, rule: 'elite_hunt', extra: 'swarm', drops: ['red', 'blue'] },
      { id: '6-2', name: 'Pressure', lineup: ARMOURED, waves: 5, rule: 'barnacled', extra: 'leaky_hull', drops: ['blue', 'green'] },
      { id: '6-3', name: 'Black Water', lineup: ALL, waves: 5, rule: 'night_watch', extra: 'doldrums', drops: ['green', 'purple'] },
      { id: '6-4', name: 'The Gauntlet', lineup: ALL, waves: 5, rule: 'hourglass', extra: 'gale', drops: ['purple', 'gold'] },
      { id: '6-5', name: 'Last Watch', lineup: ALL, waves: 5, rule: 'skeleton_crew', extra: 'no_galley', drops: ['gold', 'red'] },
      {
        id: '6-6', name: 'The Drowned Throne', lineup: ALL, waves: 4, rule: 'elite_hunt', extra: 'leaky_hull', heart: true,
        bosses: {
          0: ['kraken', 'moltenLeviathan'], 1: ['frostWyrm', 'frostGiant'], 2: ['sirenQueen', 'captainBlackbones'], 3: ['ghostGalleon'],
        },
      },
    ],
  },
];

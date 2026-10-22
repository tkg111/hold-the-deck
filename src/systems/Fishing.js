import { ABYSS, FISHING, ISLANDS, MEALS } from '../config.js';

// Fishing and meals: the data from public/sprites/fishing/fishing.json (the
// fish and meals in their sheets' order, with names, rarities and home
// spots) joined with the rules in FISHING and MEALS (config). What the
// player holds (fish, Spice, Bait, the Pantry, the active meal, the Fish
// Log) lives in Progress; the fishing minigame in GalleyScene.

// Set by initFishing() before the save is loaded (in the game, from the JSON
// cache; in the balance sim, from the file).
export const FISH_DATA = { fish: [], meals: [], items: [], loaded: false };

export function initFishing(json) {
  if (!json) return;
  FISH_DATA.fish = (json.fish?.order ?? []).map((f, index) => ({ ...f, index }));
  FISH_DATA.meals = (json.meals?.order ?? []).map((m, index) => ({ ...m, ...MEALS.list[m.id], index }));
  FISH_DATA.items = [...(json.items?.order ?? [])];
  FISH_DATA.icons = [...(json.icons12?.order ?? [])];
  FISH_DATA.loaded = true;
}

export const fishOf = (id) => FISH_DATA.fish.find((f) => f.id === id) ?? null;
export const mealOf = (id) => FISH_DATA.meals.find((m) => m.id === id) ?? null;
// Frames of items_sheet.png ('bait', 'spice', 'unknown_fish') and icons12.png
// ('fish', 'pot', 'bait').
export const itemFrame = (name) => Math.max(0, FISH_DATA.items.indexOf(name));
export const iconFrame = (name) => Math.max(0, FISH_DATA.icons.indexOf(name));
export const rarityOf = (fishId) => FISHING.rarities[fishOf(fishId)?.rarity] ?? FISHING.rarities.common;

// --- Spots ---

// Where the ship can fish: each island reached (open on the map, with
// content) and the Abyss once it's open. [{ id, name, shortName, island }]
// (island: the ISLANDS entry or the Abyss's config, for the backdrop).
export function fishingSpots(progress) {
  const spots = ISLANDS.filter((d) => progress.canSailTo(d.id))
    .map((d) => ({ id: d.id, name: d.name, shortName: d.shortName ?? d.name, island: d }));
  if (progress.abyssUnlocked) spots.push({ id: ABYSS.id, name: ABYSS.name, shortName: ABYSS.shortName, island: ABYSS });
  return spots;
}

// --- The catch ---

const pick = (pairs, random) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let roll = random() * total;
  for (const [id, w] of pairs) {
    if (roll < w) return id;
    roll -= w;
  }
  return pairs[pairs.length - 1][0];
};

// A bite's rarity (FISHING.rarities' chances).
export function rollRarity(random = Math.random) {
  return pick(Object.entries(FISHING.rarities).map(([r, { chance }]) => [r, chance]), random);
}

// The fish a bite of this rarity brings at a spot (FISHING.pools): the
// spot's own list if it has one; an island's own uncommon fish (a list with
// one fish) is `local` of the uncommon rolls, the plain ones the rest.
export function rollFish(spotId, rarity, random = Math.random) {
  const pool = FISHING.pools[rarity];
  const own = pool[spotId];
  if (!own) return pick(pool.any, random);
  if (rarity === 'uncommon' && own.length === 1 && spotId !== ABYSS.id) {
    return random() < pool.local ? own[0][0] : pick(pool.any, random);
  }
  return pick(own, random);
}

// Every fish a spot can bring, for the spot picker (by rarity order).
export function spotFish(spotId) {
  const ids = new Set();
  for (const pool of Object.values(FISHING.pools)) {
    for (const [id] of pool[spotId] ?? pool.any) ids.add(id);
    if (pool[spotId] && pool.local) for (const [id] of pool.any) ids.add(id);
  }
  return [...ids];
}

// The catch zone's width (share of the bar) and one sweep's ms for a rarity.
export const reelSpec = (rarity) => FISHING.rarities[rarity] ?? FISHING.rarities.common;
export const hitsToLand = (rarity) => (rarity === 'legendary' ? FISHING.reel.legendaryHits : FISHING.reel.hits);

// --- Meals ---

// A meal's fish (not Spice): [[fishId, n]].
export const mealFish = (meal) => Object.entries(meal.needs).filter(([id]) => id !== 'spice');

// The effect lines on a meal's card ("+12% CREW DAMAGE"), in order.
export function mealEffectLines(meal) {
  const pct = (v) => `${v > 0 ? '+' : '-'}${Math.round(Math.abs(v) * 100)}%`;
  const lines = [];
  if (meal.gold) lines.push(`${pct(meal.gold)} GOLD`);
  if (meal.damage) lines.push(`${pct(meal.damage)} CREW DAMAGE`);
  if (meal.attackSpeed) lines.push(`${pct(meal.attackSpeed)} ATTACK SPEED`);
  if (meal.hull) lines.push(`${pct(meal.hull)} MAX HULL`);
  if (meal.heal) lines.push(`HEALS ${Math.round(meal.heal * 100)}% HULL EVERY ${MEALS.healEveryMs / 1000}S`);
  if (meal.bossDamage) lines.push(`${pct(meal.bossDamage)} DAMAGE TO BOSSES`);
  if (meal.lavaDamage) lines.push(`${pct(meal.lavaDamage)} LAVA BOMB DAMAGE`);
  if (meal.freeze) lines.push(meal.freeze === -0.5 ? 'BLIZZARD FREEZES HALF AS LONG' : `${pct(meal.freeze)} FREEZE TIME`);
  if (meal.charm) lines.push(`${pct(meal.charm)} SIREN CHARMS`);
  if (meal.fog) lines.push(`${pct(meal.fog)} FOG EFFECTS`);
  if (meal.abyssGrowth) lines.push(`ABYSS TIDE ${pct(meal.abyssGrowth)}`);
  return lines;
}

// The combined effects of an active meal ({ id, wavesLeft } or null), as
// multipliers the battle's stat code reads (1 = no change).
export function mealModifiers(active) {
  const m = (active && MEALS.list[active.id]) || {};
  return {
    gold: 1 + (m.gold ?? 0),
    damage: 1 + (m.damage ?? 0),
    attackSpeed: 1 + (m.attackSpeed ?? 0),
    hull: 1 + (m.hull ?? 0),
    heal: m.heal ?? 0,
    bossDamage: 1 + (m.bossDamage ?? 0),
    lavaDamage: 1 + (m.lavaDamage ?? 0),
    freeze: 1 + (m.freeze ?? 0),
    charm: 1 + (m.charm ?? 0),
    fog: 1 + (m.fog ?? 0),
    abyssGrowth: 1 + (m.abyssGrowth ?? 0),
  };
}

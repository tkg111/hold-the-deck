import {
  EXPEDITIONS, HEROES, ISLANDS, PARTS, SPRITES,
} from '../config.js';
import { islandContent, waveGold } from './WaveManager.js';
import {
  materialInGame, materialOf, materialOfBoss, PART_DATA,
} from './Parts.js';

// Expeditions: crewmates sent on timed voyages that run in real time (also
// while the game is closed) and come back with loot. The state lives in
// Progress (expeditions: one entry or null per slot; goldLog: the last
// waves' gold and time); these are the rules that read and change it.
//
// An entry: { dest, party: [hero ids], duration: EXPEDITIONS.durations id,
// elapsed: ms run so far, lastSeen: Date.now() when elapsed was last
// advanced, loot: { gold, pearls, chests: [tiers], bonus, material: { id,
// count } or null }, story, from:
// { heroId: the ship slot they left } }. Loot is rolled when the party sets
// out, so reloading can't re-roll it.

// expedition.json (destinations, crew traits, trait icon order), set by
// initExpeditions() before the save is loaded.
export const EXPEDITION_DATA = { destinations: [], traitOrder: [], crewTraits: {} };

export function initExpeditions(json) {
  if (!json) return;
  EXPEDITION_DATA.destinations = json.destinations ?? [];
  EXPEDITION_DATA.traitOrder = json.traitIcons?.order ?? [];
  EXPEDITION_DATA.crewTraits = json.crewTraits ?? {};
}

export const destinationOf = (id) => EXPEDITION_DATA.destinations.find((d) => d.id === id) ?? null;
export const durationOf = (id) => EXPEDITIONS.durations.find((d) => d.id === id) ?? null;
// A hero's trait: expedition.json lists crew by their sprite name.
export const traitOf = (heroId) => EXPEDITION_DATA.crewTraits[SPRITES.heroes[heroId]?.key] ?? null;
export const traitLabel = (trait) => EXPEDITIONS.traits[trait]?.label ?? '';
const islandOf = (id) => ISLANDS.find((d) => d.id === id);
const islandName = (id) => islandOf(id)?.name ?? id;

// --- Unlocks ---

// The board opens once EXPEDITIONS.unlock's wave is cleared.
export function isUnlocked(progress) {
  const { island, wave } = EXPEDITIONS.unlock;
  return (progress.islandRecord(island)?.best ?? 0) >= wave;
}

export const unlockLabel = () => `Clear wave ${EXPEDITIONS.unlock.wave} to unlock`;

// Slots open: 1 at unlock, one more per EXPEDITIONS.slotIslands unlocked.
export function slotCount(progress) {
  if (!isUnlocked(progress)) return 0;
  return 1 + EXPEDITIONS.slotIslands.filter((id) => progress.isIslandUnlocked(id)).length;
}
export const maxSlots = () => 1 + EXPEDITIONS.slotIslands.length;
// The island whose unlocking opens slot i (null: open from the start).
export const slotIsland = (i) => (i === 0 ? null : islandOf(EXPEDITIONS.slotIslands[i - 1]));

// The wave of its island a destination opens on.
export const destinationWave = (dest) => EXPEDITIONS.destinationWaveByIsland[dest.island] ?? EXPEDITIONS.destinationWave;

export function isDestinationOpen(progress, dest) {
  const record = progress.islandRecord(dest.island);
  return !!record && record.wave >= destinationWave(dest);
}

export const destinationLockLabel = (dest) => `Reach wave ${destinationWave(dest)} on ${islandName(dest.island)}`;
// short: the island's shortName where it has one (e.g. "Frostbite").
export const destinationIslandName = (dest, { short = false } = {}) => (short && islandOf(dest.island)?.shortName)
  || islandName(dest.island);

// --- Time ---

// Advance every running expedition by the real time since it was last seen.
// The clock going backwards gives no time (and never takes any away); a big
// jump forwards just finishes it.
export function tick(progress, now = Date.now()) {
  for (const e of progress.expeditions) {
    if (!e) continue;
    const ms = durationOf(e.duration).ms;
    const delta = now - e.lastSeen;
    if (delta > 0) e.elapsed = Math.min(ms, e.elapsed + delta);
    e.lastSeen = now;
  }
}

export const timeLeft = (e) => Math.max(0, durationOf(e.duration).ms - e.elapsed);
export const isReturned = (e) => !!e && timeLeft(e) <= 0;
export const readyCount = (progress) => progress.expeditions.filter(isReturned).length;

// The entry a hero is away on, or null.
export const entryOf = (progress, heroId) => progress.expeditions.find((e) => e?.party.includes(heroId)) ?? null;

// --- Rewards ---

// Gold per minute of battle over the last waves logged (total gold over
// total time); an estimate from the current wave until enough are logged.
export function goldPerMinute(progress) {
  const log = progress.goldLog.slice(-EXPEDITIONS.recentWaves);
  if (log.length >= EXPEDITIONS.minLoggedWaves) {
    const gold = log.reduce((s, w) => s + w.gold, 0);
    const ms = log.reduce((s, w) => s + w.ms, 0);
    if (ms > 0) return gold / (ms / 60000);
  }
  return estimatedWaveGold(progress) / (EXPEDITIONS.fallbackWaveMs / 60000);
}

// Gold a win of the current wave pays: every enemy's kill gold plus the
// wave-clear bonus.
const estimatedWaveGold = (progress) => waveGold(progress.wave, progress.waveOptions);

// The party's reward multiplier and what makes it up. guaranteed: a full
// party all with the favoured trait (a certain bonus find).
export function partyBonus(progress, party, dest) {
  const matches = party.filter((id) => traitOf(id) === dest.favouredTrait).length;
  const stars = party.reduce((s, id) => s + progress.heroStarCount(id), 0);
  return {
    matches,
    stars,
    multiplier: 1 + matches * EXPEDITIONS.traitBonus + stars * EXPEDITIONS.starBonus,
    guaranteed: party.length === EXPEDITIONS.maxParty && matches === party.length,
  };
}

// What a run would bring, before the dice: gold and Pearls as [min, max],
// chests found for sure, the chance of one more (mixed runs), whether a
// chest may be a better tier, and the bonus find's chance.
export function preview(progress, destId, party, durationId) {
  const dest = destinationOf(destId);
  const duration = durationOf(durationId);
  const focus = EXPEDITIONS.focus[dest.rewardFocus];
  const bonus = partyBonus(progress, party, dest);
  const gold = goldPerMinute(progress) * EXPEDITIONS.goldMinutes * duration.mult * focus.gold * bonus.multiplier;
  const pearls = EXPEDITIONS.pearls * duration.mult * focus.pearls * bonus.multiplier;
  const s = EXPEDITIONS.spread;
  const range = (v) => [Math.round(v * (1 - s)), Math.round(v * (1 + s))];
  return {
    gold: range(gold),
    pearls: pearls > 0 ? range(pearls).map((n) => Math.max(1, n)) : [0, 0],
    chests: focus.chest ?? 0,
    chestChance: focus.chestChance ? Math.min(1, focus.chestChance * duration.mult) : 0,
    betterChests: !!duration.betterChests,
    bonusChance: bonus.guaranteed ? 1 : EXPEDITIONS.bonusChance,
    bonus,
  };
}

// A chest's tier: better odds on long runs, else a plain Chest.
function rollChestTier(duration, random) {
  if (!duration.betterChests) return 'common';
  let roll = random();
  for (const tier of EXPEDITIONS.chestTiers) {
    const chance = EXPEDITIONS.chestOdds[tier] ?? 0;
    if (roll < chance) return tier;
    roll -= chance;
  }
  return 'common';
}

const tierAbove = (tier) => {
  const order = EXPEDITIONS.chestTiers;
  return order[Math.min(order.length - 1, order.indexOf(tier) + 1)];
};

// A run's boss material, maybe (PARTS.expedition): one of its island's
// beaten bosses' materials, or null.
function rollMaterial(progress, dest, random) {
  const island = islandOf(dest.island);
  if (!island?.available) return null;
  const found = islandContent(island).bosses
    .filter((boss) => progress.defeatCount(boss) > 0)
    .map((boss) => materialOfBoss(boss))
    .filter((m) => m && materialInGame(m.id));
  const { chance, min, max } = PARTS.expedition;
  if (!found.length || random() >= chance) return null;
  const m = found[Math.floor(random() * found.length)];
  return { id: m.id, count: min + Math.floor(random() * (max - min + 1)) };
}

// Roll a run's loot (see preview for the ranges).
export function rollLoot(progress, destId, party, durationId, random = Math.random) {
  const dest = destinationOf(destId);
  const duration = durationOf(durationId);
  const p = preview(progress, destId, party, durationId);
  const between = ([min, max]) => Math.round(min + random() * (max - min));
  const chests = [];
  for (let i = 0; i < p.chests; i++) chests.push(rollChestTier(duration, random));
  if (p.chestChance && random() < p.chestChance) chests.push(rollChestTier(duration, random));
  const loot = { gold: between(p.gold), pearls: p.pearls[1] ? between(p.pearls) : 0, chests, bonus: null };
  if (p.bonus.guaranteed || random() < EXPEDITIONS.bonusChance) {
    if (dest.rewardFocus === 'pearls') loot.bonus = { kind: 'pearls', pearls: loot.pearls };
    else {
      const order = EXPEDITIONS.chestTiers;
      const best = chests.reduce((a, t) => (order.indexOf(t) > order.indexOf(a) ? t : a), 'common');
      loot.bonus = { kind: 'chest', tier: tierAbove(best) };
    }
  }
  loot.material = rollMaterial(progress, dest, random);
  return loot;
}

// A one-line story about the run, naming someone in the party.
export function rollStory(destId, party, random = Math.random) {
  const lines = EXPEDITIONS.stories[destId] ?? ['{name} came back with loot.'];
  const line = lines[Math.floor(random() * lines.length)];
  const who = party[Math.floor(random() * party.length)];
  return line.replace('{name}', HEROES[who]?.name ?? 'The crew');
}

// --- Sending and collecting ---

// Why the party can't set out ('' if it can).
export function sendProblem(progress, slot, destId, party, durationId) {
  const dest = destinationOf(destId);
  if (slot < 0 || slot >= slotCount(progress) || progress.expeditions[slot]) return 'No free slot';
  if (!dest || !isDestinationOpen(progress, dest)) return 'Destination locked';
  if (!durationOf(durationId)) return 'Pick a duration';
  if (party.length < 1) return 'Pick up to 3 crew';
  if (party.length > EXPEDITIONS.maxParty || new Set(party).size !== party.length) return 'Too many crew';
  if (party.some((id) => !progress.isOwned(id) || entryOf(progress, id))) return 'Crew busy';
  return '';
}

// Party members on the ship, who'd leave their slot.
export const onDeck = (progress, party) => party.filter((id) => progress.slotOf(id) >= 0);

// Send the party: its crew leave their ship slots, and the loot is rolled.
// Returns the entry, or null if it can't go.
export function send(progress, slot, destId, party, durationId, { random = Math.random, now = Date.now() } = {}) {
  if (sendProblem(progress, slot, destId, party, durationId)) return null;
  const from = {};
  for (const id of party) {
    const at = progress.slotOf(id);
    if (at >= 0) {
      from[id] = at;
      progress.slots[at] = null;
    }
  }
  const entry = {
    dest: destId,
    party: [...party],
    duration: durationId,
    elapsed: 0,
    lastSeen: now,
    loot: rollLoot(progress, destId, party, durationId, random),
    story: rollStory(destId, party, random),
    from,
  };
  progress.expeditions[slot] = entry;
  return entry;
}

// Collect a returned expedition: its loot is paid (chests wait in the chest
// screen) and the crew come back, each to the ship slot they left if it's
// still empty, else the first empty one. Returns the entry, or null.
export function collect(progress, slot) {
  const e = progress.expeditions[slot];
  if (!isReturned(e)) return null;
  progress.expeditions[slot] = null;
  const { loot } = e;
  progress.earnGold(loot.gold);
  progress.pearls += loot.pearls;
  const chests = [...loot.chests];
  if (loot.bonus?.kind === 'pearls') progress.pearls += loot.bonus.pearls;
  if (loot.bonus?.kind === 'chest') chests.push(loot.bonus.tier);
  for (const tier of chests) progress.addFreeChest(tier);
  if (loot.material) progress.addMaterial(loot.material.id, loot.material.count);
  for (const id of e.party) {
    if (!progress.isOwned(id) || progress.slotOf(id) >= 0) continue;
    const at = e.from[id];
    const usable = progress.slots.slice(0, progress.slotCount);
    const target = at != null && at < progress.slotCount && !usable[at] ? at : usable.indexOf(null);
    if (target >= 0) progress.slots[target] = id;
  }
  return e;
}

// Dev: every running expedition returns now.
export function finishAll(progress) {
  for (const e of progress.expeditions) if (e) e.elapsed = durationOf(e.duration).ms;
}

// A saved entry, checked like the rest of the save (see Progress.fromSave).
// null if it isn't usable. taken: crew already away on an earlier slot.
export function entryFromSave(r, progress, taken, now = Date.now()) {
  if (!r || typeof r !== 'object') return null;
  const duration = durationOf(r.duration);
  const known = EXPEDITION_DATA.destinations.length ? !!destinationOf(r.dest) : typeof r.dest === 'string';
  if (!duration || !known || !Array.isArray(r.party)) return null;
  const party = [...new Set(r.party)].filter((id) => id in HEROES && progress.owned.includes(id) && !taken.has(id))
    .slice(0, EXPEDITIONS.maxParty);
  if (!party.length) return null;
  const count = (v) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const loot = r.loot ?? {};
  const tier = (t) => EXPEDITIONS.chestTiers.includes(t);
  let bonus = null;
  if (loot.bonus?.kind === 'pearls') bonus = { kind: 'pearls', pearls: count(loot.bonus.pearls) };
  if (loot.bonus?.kind === 'chest' && tier(loot.bonus.tier)) bonus = { kind: 'chest', tier: loot.bonus.tier };
  const m = loot.material;
  const material = m && typeof m.id === 'string' && (materialOf(m.id) || !PART_DATA.loaded)
    ? { id: m.id, count: Math.max(1, count(m.count)) } : null;
  const from = {};
  for (const id of party) {
    const at = r.from?.[id];
    if (Number.isInteger(at) && at >= 0) from[id] = at;
  }
  return {
    dest: r.dest,
    party,
    duration: duration.id,
    elapsed: Math.min(duration.ms, count(r.elapsed)),
    lastSeen: Number.isFinite(r.lastSeen) ? r.lastSeen : now,
    loot: {
      gold: count(loot.gold),
      pearls: count(loot.pearls),
      chests: Array.isArray(loot.chests) ? loot.chests.filter(tier).slice(0, 5) : [],
      bonus,
      material,
    },
    story: typeof r.story === 'string' ? r.story.slice(0, 200) : '',
    from,
  };
}

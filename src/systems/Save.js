import {
  ABYSS, AUDIO, ECONOMY, ENEMIES, EXPEDITIONS, FISHING, ISLANDS, MEALS, STARTING_HEROES,
} from '../config.js';
import { newOnlineRecord } from '../online/record.js';
import { Progress } from './Progress.js';
import { enemyFirstWave } from './WaveManager.js';

// Storage keys keep the original project name so existing saves are found.
export const SAVE_KEY = 'kampung-defense/save';
const CORRUPT_BACKUP_KEY = 'kampung-defense/save-corrupt-backup';

// Bump when the saved shape changes, and add a migration from the old version.
export const SAVE_VERSION = 22;

// v5 pirate reskin: old hero IDs -> new hero IDs.
const V5_HERO_IDS = {
  budakLastik: 'cabinBoy',
  makCikSelipar: 'shipsCook',
  nelayan: 'netThrower',
  pemburuSumpit: 'grogBrewer',
  pakcikMamak: 'harpooner',
  bomoh: 'voodooPriestess',
  uncleDurian: 'cannoneer',
  pendekarSilat: 'duelist',
  tokPenghulu: 'captain',
};

// Rename a v4 save to v5 field names and IDs. Values are unchanged.
function migrateToPirate(data) {
  const { angPow, semangat, semangatShop, houseHpLevel, floors, owned, heroLevels, heroStars, slots, ...rest } = data;
  const heroId = (id) => V5_HERO_IDS[id] ?? id;
  const renameKeys = (obj) => Object.fromEntries(Object.entries(obj ?? {}).map(([id, v]) => [heroId(id), v]));
  const { houseHp, ...shop } = semangatShop ?? {};
  return {
    ...rest,
    pearls: angPow,
    renown: semangat,
    renownShop: houseHp != null ? { ...shop, hullHp: houseHp } : shop,
    hullHpLevel: houseHpLevel,
    decks: floors,
    owned: (owned ?? []).map(heroId),
    heroLevels: renameKeys(heroLevels),
    heroStars: renameKeys(heroStars),
    slots: (slots ?? []).map((id) => (id ? heroId(id) : id)),
  };
}

// The Renown shop as it was up to v5 (cost of level L: round(baseCost *
// costGrowth ^ L)), to work out how much Renown a v5 save had spent.
const V5_RENOWN_SHOP = {
  heroDamage: { baseCost: 5, costGrowth: 1.5 },
  gold: { baseCost: 5, costGrowth: 1.5 },
  hullHp: { baseCost: 4, costGrowth: 1.5 },
  packDiscount: { baseCost: 20, costGrowth: 2.5, maxLevel: 2 },
};
const V5_MAX_SHOP_LEVEL = 100;  // guards the loop against hand-edited saves

// v6 prestige removal: drop Renown, the shop, the voyage count and best wave,
// and pay all Renown (held plus spent on shop levels) back as Pearls.
function dropPrestige(data) {
  const { renown, renownShop, prestigeCount, bestWave, ...rest } = data;
  const count = (v, max = Infinity) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
  let total = count(renown);
  for (const [key, cost] of Object.entries(V5_RENOWN_SHOP)) {
    const level = count(renownShop?.[key], Math.min(cost.maxLevel ?? Infinity, V5_MAX_SHOP_LEVEL));
    for (let l = 0; l < level; l++) total += Math.round(cost.baseCost * cost.costGrowth ** l);
  }
  return { ...rest, pearls: count(rest.pearls) + total * ECONOMY.pearlsPerOldRenown };
}

// v8 Wanted Board: enemy types whose first wave (on Skull Cove, the only
// island then) the player has passed count
// as met (and their posters as already seen, so an old save doesn't light up
// with "new" posters); defeats start counting from here.
function addWantedBoard(data) {
  const wave = Number.isFinite(data.wave) ? data.wave : 1;
  const met = Object.keys(ENEMIES).filter((id) => enemyFirstWave(id) < wave);
  return { ...data, discovered: met, seenPosters: [...met], defeats: {}, bounties: {} };
}

// v9 islands: the voyage so far is Skull Cove (ISLANDS[0]). A save past
// its finale wave goes back to it, so the player still fights the finale
// (and its reward); the wave reached counts as the best wave.
function addIslands(data) {
  const { wave, lastBossRewardWave, ...rest } = data;
  const first = ISLANDS[0];
  const reached = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
  const finaleWave = first.finale?.wave ?? Infinity;
  const now = Math.min(reached, finaleWave);
  const paid = Number.isFinite(lastBossRewardWave) ? Math.floor(lastBossRewardWave) : 0;
  return {
    ...rest,
    island: first.id,
    islands: {
      [first.id]: { wave: now, best: reached - 1, cleared: false, bossPaid: Math.min(paid, now - 1) },
    },
    mapSeen: false,
    freeLegendaryChests: 0,
  };
}

// v19 the Captain's tutorial: a save past wave 1 has learned the ropes (its
// onboarding is done), and doesn't get tips for what it already has: each
// tip's test of a v18 save.
const TIPS_HAD = {
  first_loss: (d, veteran) => veteran,
  log: (d, veteran) => veteran,
  merchant: (d) => (d.merchantsPlundered ?? 0) > 0,
  boss_incoming: (d) => Object.keys(d.defeats ?? {}).some((k) => ENEMIES[k]?.boss && d.defeats[k] > 0),
  boss_material: (d) => Object.keys(d.materials ?? {}).length > 0 || Object.keys(d.parts ?? {}).length > 0,
  ship_parts: (d) => Object.keys(d.parts ?? {}).length > 0,
  boss_hunts: (d) => ISLANDS.some((i) => d.islands?.[i.id]?.cleared),
  chest: (d) => (d.owned ?? []).length > STARTING_HEROES.length,
  expeditions: (d) => (d.islands?.[EXPEDITIONS.unlock.island]?.best ?? 0) >= EXPEDITIONS.unlock.wave,
  galley: (d) => (d.fishCaught ?? 0) > 0,
  cooking: (d) => Object.values(MEALS.list).some((m) => Object.keys(m.needs).every((id) => id === 'spice' || (d.fishLog?.[id] ?? 0) > 0)),
  ember: (d) => !!d.islands?.ember_isle,
  frost: (d) => !!d.islands?.frostbite_reef,
  fog: (d) => !!d.islands?.fogbound_isle,
  finale: (d) => ISLANDS.some((i) => d.islands?.[i.id]?.cleared),
  abyss: (d) => !!d.abyss?.revealed || !!d.islands?.[ABYSS.unlockIsland]?.cleared,
};

export function addTutorial(data) {
  const records = Object.values(data.islands ?? {}).filter((r) => r && typeof r === 'object');
  const veteran = records.some((r) => (r.wave ?? 1) > 1 || (r.best ?? 0) > 0);
  const tipsSeen = Object.keys(TIPS_HAD).filter((id) => TIPS_HAD[id](data, veteran));
  return {
    ...data,
    tutorial: { onboarding: veteran ? 'done' : 'O1', tipsSeen, tipsOn: true },
  };
}

// MIGRATIONS[n] upgrades a version-n save to version n + 1.
const MIGRATIONS = {
  // v2: sound mute setting saved with progress.
  1: (data) => ({ ...data, muted: false }),
  // v3: Legendary pity counter.
  2: (data) => ({ ...data, packsSinceLegendary: 0 }),
  // v4: prestige (Semangat, shop levels, prestige count, best wave).
  3: (data) => ({
    ...data, semangat: 0, semangatShop: {}, prestigeCount: 0, bestWave: data.wave ?? 1,
  }),
  // v5: pirate reskin. Ang Pow -> pearls, Semangat -> renown, house -> hull,
  // floors -> decks, and every hero ID renamed.
  4: migrateToPirate,
  // v6: prestige removed; Renown converted to Pearls.
  5: dropPrestige,
  // v7: the ability bar's Auto toggle.
  6: (data) => ({ ...data, autoAbilities: false }),
  // v8: Wanted Board (enemy types met, posters seen, defeats, bounties).
  7: addWantedBoard,
  // v9: islands (wave and boss Pearls per island), the world map, free
  // Legendary chests.
  8: addIslands,
  // v10: Bonus Levels (duplicates past max stars, which used to refund Pearls).
  9: (data) => ({ ...data, heroBonus: {} }),
  // v11: the Captain's Log (the last few waves' battle stats).
  10: (data) => ({ ...data, battleLog: [] }),
  // v12: expeditions (empty slots), free chests from them, and the last
  // waves' gold and time (empty: their gold is estimated until 3 are logged).
  11: (data) => ({ ...data, expeditions: [], freeChests: { common: 0, rare: 0 }, goldLog: [] }),
  // v13: the Shipwright's buy amount (x1 / x10 / MAX) and whether it's slid away.
  12: (data) => ({ ...data, buyAmount: '1', shipwrightOpen: true }),
  // v14: ship parts (boss materials, parts owned and their levels, the part
  // on each slot) and Boss Hunts (each boss's hunt level, today's wins).
  13: (data) => ({
    ...data, materials: {}, parts: {}, equipped: {}, huntLevels: {}, huntDay: '', huntWins: {},
  }),
  // v15: the Abyss (best depth, milestones paid, dives started, whether the
  // map has revealed it, and the dive under way). A save that has already
  // won Fogbound Isle's finale gets the reveal the next time the map opens.
  14: (data) => ({
    ...data,
    abyss: {
      best: 0, milestones: [], runs: 0, revealed: false, run: null,
    },
  }),
  // v16: the Abyss Tide (stacks in the dive under way: one per depth it has
  // cleared) and Skip the shallows (the setting, on; the shallows a dive
  // skipped).
  15: (data) => {
    const { run, ...abyss } = data.abyss ?? {};
    return {
      ...data,
      abyss: {
        ...abyss,
        skipShallows: true,
        run: run ? { ...run, tide: Math.max(0, (run.depth ?? 1) - (run.from ?? 1)), skipped: 0 } : null,
      },
    };
  },
  // v17: packs (the chest screen's pack, packs looked at and announced).
  // Every crewmate already owned is kept, whichever pack it's in now; packs
  // a save has already unlocked get their "NEW PACK" banner and dot.
  16: (data) => ({
    ...data, lastPack: null, packsSeen: [], packsAnnounced: [],
  }),
  // v18: the Galley (merchants, fishing and meals): fish held, Spice, Bait
  // (full, its regen clock from now), the Pantry, the active meal, the Fish
  // Log and the Captain's Log totals, all starting empty.
  17: (data) => ({
    ...data,
    fish: {},
    spice: 0,
    bait: FISHING.bait.cap,
    baitAt: Date.now(),
    pantry: {},
    meal: null,
    fishLog: {},
    merchantsPlundered: 0,
    fishCaught: 0,
  }),
  // v19: the Captain's tutorial (onboarding progress, tips seen, tips on).
  18: addTutorial,
  // v20: the Settings' music and sound effects volumes, at their defaults.
  19: (data) => ({ ...data, musicVolume: AUDIO.defaults.music, sfxVolume: AUDIO.defaults.sfx }),
  // v21: While you were away: no idle rate yet and last seen now, so an old
  // save gets no payout for the time before this version (and none at all
  // until it clears a wave); no gold paid for time away yet.
  20: (data) => ({
    ...data, idleRate: 0, lastSeen: Date.now(), goldAway: 0,
  }),
  // v22: Rankings: not joined, nothing submitted, no boards cached.
  21: (data) => ({ ...data, online: newOnlineRecord() }),
};

function migrate(save) {
  let { version, data } = save;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    data = step(data);
    version++;
  }
  return data;
}

// localStorage can throw (private mode, blocked storage, quota), so every
// access is guarded and the game keeps running without saving.
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The stored form of progress ({ version, savedAt, data }).
export const saveRecord = (progress) => ({
  version: SAVE_VERSION,
  savedAt: new Date().toISOString(),
  data: progress.toSave(),
});

// Once a session, after the first save: ask the browser to keep the save
// (phones, iOS especially, may clear storage of sites not installed).
let persistAsked = false;
function askPersist() {
  if (persistAsked || typeof navigator === 'undefined') return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

// Every save also marks the game as last seen now (While you were away).
export function saveProgress(progress) {
  progress.lastSeen = Date.now();
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(saveRecord(progress)));
    askPersist();
    return true;
  } catch (err) {
    console.warn('[save] could not write save:', err);
    return false;
  }
}

// A save record from elsewhere (an imported save code) as Progress. Throws
// a SaveError ('format': not a save; 'newer': from a newer version of the
// game) rather than loading what it can.
export class SaveError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

export function progressFromRecord(save) {
  if (!save || typeof save !== 'object' || !Number.isInteger(save.version) || save.version < 1
    || !save.data || typeof save.data !== 'object' || !Array.isArray(save.data.owned)) {
    throw new SaveError('format', 'not a save');
  }
  if (save.version > SAVE_VERSION) throw new SaveError('newer', `save version ${save.version}`);
  try {
    return Progress.fromSave(migrate(save));
  } catch (err) {
    throw new SaveError('format', err.message);
  }
}

// Returns saved Progress, or a fresh one if there's no usable save.
export function loadProgress() {
  let raw = null;
  try {
    raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return new Progress();

    const save = JSON.parse(raw);
    if (!Number.isInteger(save?.version) || typeof save.data !== 'object') {
      throw new Error('unrecognized save format');
    }
    if (save.version > SAVE_VERSION) {
      console.warn(`[save] save is from a newer version (${save.version}); loading what we can`);
      return Progress.fromSave(save.data);
    }
    return Progress.fromSave(migrate(save));
  } catch (err) {
    // Keep the unreadable save aside rather than silently losing it.
    console.warn('[save] could not load save, starting fresh:', err);
    try { if (raw) storage()?.setItem(CORRUPT_BACKUP_KEY, raw); } catch { /* ignore */ }
    return new Progress();
  }
}

export function clearSave() {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn('[save] could not clear save:', err);
  }
}

// Just the sound settings ({ music, sfx, muted }) from the save, for the
// title screen (before the battle loads the rest); defaults without one.
export function loadAudioSettings() {
  const { music, sfx } = AUDIO.defaults;
  try {
    const data = JSON.parse(storage()?.getItem(SAVE_KEY) ?? 'null')?.data;
    if (!data || typeof data !== 'object') return { music, sfx, muted: false };
    const volume = (v, fallback) => (Number.isFinite(v) ? Math.min(100, Math.max(0, Math.floor(v))) : fallback);
    return { music: volume(data.musicVolume, music), sfx: volume(data.sfxVolume, sfx), muted: data.muted === true };
  } catch {
    return { music, sfx, muted: false };
  }
}

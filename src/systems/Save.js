import { ECONOMY } from '../config.js';
import { Progress } from './Progress.js';

// Storage keys keep the original project name so existing saves are found.
export const SAVE_KEY = 'kampung-defense/save';
const CORRUPT_BACKUP_KEY = 'kampung-defense/save-corrupt-backup';

// Bump when the saved shape changes, and add a migration from the old version.
export const SAVE_VERSION = 7;

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

export function saveProgress(progress) {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify({
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      data: progress.toSave(),
    }));
    return true;
  } catch (err) {
    console.warn('[save] could not write save:', err);
    return false;
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

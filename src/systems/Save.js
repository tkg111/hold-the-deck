import { Progress } from './Progress.js';

export const SAVE_KEY = 'kampung-defense/save';
const CORRUPT_BACKUP_KEY = 'kampung-defense/save-corrupt-backup';

// Bump when the saved shape changes, and add a migration from the old version.
export const SAVE_VERSION = 4;

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

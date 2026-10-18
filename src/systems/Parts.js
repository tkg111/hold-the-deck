import { ENEMIES, ISLANDS, PARTS } from '../config.js';
import { enemyFirstWave, waveGold } from './WaveManager.js';

// Boss materials and ship parts: the data from public/sprites/parts/parts.json
// and the rules that read it (what exists yet, what a level costs). What the
// player owns lives in Progress; what parts do in battle in ShipParts.js.
//
// parts.json names each material's boss by its sprite (e.g. "the_kraken");
// here that's resolved to its ENEMIES key ("kraken").

// Set by initParts() before the save is loaded (in the game, from the JSON
// cache; in the balance sim, from the file).
export const PART_DATA = { materials: [], slots: [], parts: [], loaded: false };

export function initParts(json) {
  if (!json) return;
  const bossKey = (sprite) => Object.keys(ENEMIES).find((k) => ENEMIES[k].boss && ENEMIES[k].sprite === sprite) ?? null;
  PART_DATA.materials = (json.materials?.order ?? []).map((m, index) => ({ ...m, index, bossKey: bossKey(m.boss) }));
  PART_DATA.slots = [...(json.slots ?? [])];
  PART_DATA.parts = (json.parts ?? []).map((p) => ({ ...p }));
  PART_DATA.materialSize = json.materials?.size ?? 16;
  PART_DATA.loaded = true;
}

export const materialOf = (id) => PART_DATA.materials.find((m) => m.id === id) ?? null;
export const partOf = (id) => PART_DATA.parts.find((p) => p.id === id) ?? null;
// The material a boss (ENEMIES key) drops, or null.
export const materialOfBoss = (bossKey) => PART_DATA.materials.find((m) => m.bossKey === bossKey) ?? null;
const islandOf = (id) => ISLANDS.find((d) => d.id === id) ?? null;

// A material is in the game once its boss is (an ENEMIES boss on an island
// with content); until then it, and the parts made from it, stay hidden.
export function materialInGame(id) {
  const m = materialOf(id);
  return !!m?.bossKey && !!islandOf(m.island)?.available;
}
export const partInGame = (id) => materialInGame(partOf(id)?.material);

// The materials and parts in the game, in parts.json's order; a slot's parts.
export const gameMaterials = () => PART_DATA.materials.filter((m) => materialInGame(m.id));
export const gameParts = () => PART_DATA.parts.filter((p) => partInGame(p.id));
export const slotParts = (slot) => gameParts().filter((p) => p.slot === slot);

// The gold a win of the wave where a material's boss first appears pays
// (its island's offset included): a part's gold cost is counted in it.
const bossWaveGold = new Map();
function bossGold(material) {
  if (!bossWaveGold.has(material.id)) {
    const island = islandOf(material.island);
    const wave = enemyFirstWave(material.bossKey, island);
    bossWaveGold.set(material.id, waveGold(Number.isFinite(wave) ? wave : 1, { island, offset: island?.waveOffset ?? 0 }));
  }
  return bossWaveGold.get(material.id);
}

// A combat part's effect at a level, from its level-5 value (PARTS.levelCurve):
// level 1 is a third of it, each level after adds as much again.
export function partValue(atMax, level) {
  if (level <= 0) return 0;
  const c = PARTS.levelCurve;
  return atMax * (1 + c * (level - 1)) / (1 + c * (PARTS.maxLevel - 1));
}

// Whether a part is an economy part (tagged ECONOMY in the Shipyard).
export const isEconomyPart = (id) => PARTS.economy.includes(id);

// What it costs to bring a part to `level` (1 = crafting it): { material,
// gold }, or null past PARTS.maxLevel.
export function partCost(id, level) {
  const part = partOf(id);
  const material = part && materialOf(part.material);
  if (!material || level < 1 || level > PARTS.maxLevel) return null;
  return {
    material: PARTS.material[level - 1],
    gold: Math.round(PARTS.goldWaves[level - 1] * bossGold(material)),
  };
}

// The boss a material comes from and its island, for "Defeat the Frost Wyrm
// to find Wyrm Scale".
export function materialSource(id) {
  const m = materialOf(id);
  return m ? { boss: ENEMIES[m.bossKey] ?? null, island: islandOf(m.island) } : null;
}

// The overlay texture key and file of a part on ship stage `stage` (the
// lantern has one per stage).
export const overlayFile = (part, stage) => part.overlay.replace('{stage}', stage);
export const overlayKey = (part, stage) => `part_${overlayFile(part, stage).replace('.png', '')}`;
export const partIconKey = (part) => `part_${part.icon.replace('.png', '')}`;
export const MATERIALS_KEY = 'part_materials';
export const PARTS_JSON_KEY = 'parts';

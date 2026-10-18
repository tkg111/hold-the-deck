import { HEROES, ISLANDS, SPRITES } from '../config.js';

// The chest packs (public/sprites/packs/packs.json, see PACKS in config):
// each one's id, name, banner, unlock ("always" or "reach <island name>")
// and crew (by sprite key, as in SPRITES.heroes). Filled by initPacks() once
// the file has loaded; until then there's one pack with every crewmate, so
// nothing that rolls a chest breaks.
export const PACKS_JSON_KEY = 'packs';
export const bannerKey = (file) => `pack_${file.replace(/\.png$/, '')}`;

const heroOfSprite = (key) => Object.keys(SPRITES.heroes).find((id) => SPRITES.heroes[id].key === key) ?? null;
const islandByName = (name) => ISLANDS.find((d) => d.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

const everyone = () => [{
  id: 'all', name: 'Treasure Chest', banner: null, unlock: 'always', island: null, crew: Object.keys(HEROES),
}];

export const PACK_DATA = {
  loaded: false, packs: everyone(), lockedOverlay: null, size: [120, 48],
};

export function initPacks(json) {
  if (!json?.packs) return;
  PACK_DATA.packs = json.packs.map((p) => {
    const reach = /^reach (.+)$/i.exec(p.unlock ?? '');
    return {
      id: p.id,
      name: p.name,
      banner: p.banner,
      unlock: p.unlock,
      // The island whose reaching unlocks it (null: always open).
      island: reach ? islandByName(reach[1])?.id ?? null : null,
      crew: (p.crew ?? []).map(heroOfSprite).filter((id) => id && id in HEROES),
    };
  });
  PACK_DATA.lockedOverlay = json.lockedOverlay ?? null;
  if (Array.isArray(json.size)) PACK_DATA.size = json.size;
  PACK_DATA.loaded = true;
}

export const allPacks = () => PACK_DATA.packs;
export const packOf = (id) => PACK_DATA.packs.find((p) => p.id === id) ?? null;
// The island a pack unlocks on (its ISLANDS entry), or null.
export const packIsland = (pack) => ISLANDS.find((d) => d.id === pack.island) ?? null;
// "Reach Ember Isle", for a locked pack's banner.
export const unlockLabel = (pack) => (packIsland(pack) ? `Reach ${packIsland(pack).name}` : '');
// The packs a crewmate is in.
export const packsWith = (heroId) => PACK_DATA.packs.filter((p) => p.crew.includes(heroId));

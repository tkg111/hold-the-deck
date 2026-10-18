import { PARTS } from '../config.js';
import { dark, nineSlice, text } from './kit.js';
import {
  materialOf, MATERIALS_KEY, partIconKey, partOf, partValue,
} from '../systems/Parts.js';

// Ship-part pieces shared by the Shipyard, the chest screen's Materials
// strip, the Wanted Board, the map's Boss Hunt tab and expedition rewards.

// A material's 16x16 icon (materials.png), centred on (x, y).
export function materialIcon(scene, x, y, materialId) {
  const m = materialOf(materialId);
  return scene.add.image(Math.round(x), Math.round(y), MATERIALS_KEY, m?.index ?? 0);
}

// A part's 32x32 icon, centred on (x, y).
export function partIcon(scene, x, y, partId) {
  return scene.add.image(Math.round(x), Math.round(y), partIconKey(partOf(partId)));
}

// The gold "ECONOMY" tag after an economy part's name (PARTS.economy):
// small dark text on a gold plate, its left edge at x, centred on y.
// Returns [plate, label]; plate.displayWidth is its width.
export function economyTag(scene, x, y) {
  const label = text(scene, x + 4, y, 'ECONOMY', dark({ font: 'small' })).setOrigin(0, 0.5);
  const plate = nineSlice(scene, x, y - 5, label.inkWidth + 8, 11, 'btn_gold_normal');
  return [plate, label];
}

const secs = (ms) => `${Number((ms / 1000).toFixed(2))}S`;
const pct = (v) => `${Math.round(v * 100)}%`;

// What a part does at a level, in a short line for the Shipyard
// ("STUNS 2S EVERY 8S").
export function partStat(partId, level) {
  const fx = PARTS.effects[partId];
  const l = Math.max(1, level);
  switch (partId) {
    case 'kraken_figurehead': return `STUNS ${secs(fx.stun + (l - 1) * fx.stunPerLevel)}, ${pct(partValue(fx.damageAtMax, l))} OF BEST DMG EVERY ${secs(fx.every)}`;
    case 'siren_figurehead': return `CHARMS ${secs(fx.charm + (l - 1) * fx.charmPerLevel)} EVERY ${secs(fx.every)}`;
    case 'ghostweave_sails': return `CREW ATTACK SPEED +${pct(partValue(fx.attackSpeedAtMax, l))}`;
    case 'frostwing_sails': return `SLOWS ${pct(partValue(fx.slowAtMax, l))} WITHIN ${fx.range}PX`;
    case 'magma_cannons': return `LAVA: ${pct(partValue(fx.damageAtMax, l))} OF BEST DMG EVERY ${secs(fx.every)}`;
    case 'heartwood_cannons': return `LOG: ${pct(partValue(fx.damageAtMax, l))} OF BEST DMG X${fx.targets} EVERY ${secs(fx.every)}`;
    case 'blackbones_lantern': return `+${pct(l * fx.goldPerLevel)} GOLD, FOG PENALTY -${pct(1 - fx.fogPenalty)}`;
    default: return '';
  }
}


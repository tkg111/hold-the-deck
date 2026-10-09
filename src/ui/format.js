import { RARITY } from '../config.js';
import { UI } from './kit.js';

// Phaser number color (0xRRGGBB) -> CSS string for Text styles.
export const cssColor = (n) => `#${n.toString(16).padStart(6, '0')}`;

// Compact star label for a hero, e.g. "3 STARS", or "5 STARS +2" with Bonus
// Levels; empty for 0 stars. (The pixel fonts have no star glyph; cards draw
// pixel stars instead.)
export const starLabel = (stars, bonus = 0) => (stars > 0
  ? `${stars} STAR${stars === 1 ? '' : 'S'}${bonus > 0 ? ` +${bonus}` : ''}`
  : '');

// 12450 -> "12,450"
export const fmtNumber = (n) => Math.floor(n).toLocaleString('en-US');

// "1 Pearl" / "5 Pearls".
export const pearlsLabel = (n) => `${n} Pearl${n === 1 ? '' : 's'}`;

// Rarity colour for text on parchment: Common's light grey would be too faint,
// so it uses the brown sub-text colour.
export const rarityTextColor = (rarity) => (rarity === 'common' ? UI.colors.subText : cssColor(RARITY[rarity].color));

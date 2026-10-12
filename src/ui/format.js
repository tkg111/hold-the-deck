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

// Short amounts: 950 -> "950", 12450 -> "12.4K", 3.2e6 -> "3.2M", then B, T.
export function fmtShort(n) {
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size;
      return `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
    }
  }
  return `${Math.floor(n)}`;
}

// A time left: "7:59:58" (hours), "29:58", or "0:05".
export function fmtClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (v) => `${v}`.padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

// A short time left for small spaces: "7H", "29M", "5S".
export function fmtShortTime(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  if (s >= 3600) return `${Math.ceil(s / 3600)}H`;
  if (s >= 60) return `${Math.ceil(s / 60)}M`;
  return `${s}S`;
}

// "1 Pearl" / "5 Pearls".
export const pearlsLabel = (n) => `${n} Pearl${n === 1 ? '' : 's'}`;

// Rarity colour for text on parchment: Common's light grey would be too faint,
// so it uses the brown sub-text colour.
export const rarityTextColor = (rarity) => (rarity === 'common' ? UI.colors.subText : cssColor(RARITY[rarity].color));

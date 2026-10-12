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

// Every number the player sees (gold, Pearls, HP, costs, damage, rewards,
// stats) goes through this. Whole numbers only: below 10,000 in full with
// commas (9,876); from 10,000 three significant digits and a suffix: K, M,
// B, T, then aa, ab ... az, ba ... (12.3K, 353M, 1.07B), cut (not rounded)
// to those digits, so 999,999 reads 999K rather than 1000K.
const SUFFIXES = ['', 'K', 'M', 'B', 'T'];
const suffix = (tier) => {
  if (tier < SUFFIXES.length) return SUFFIXES[tier];
  const i = tier - SUFFIXES.length;
  const letter = (n) => String.fromCharCode(97 + n);
  return letter(Math.floor(i / 26) % 26) + letter(i % 26);
};

export function formatNum(value) {
  if (!Number.isFinite(value)) return '0';
  const n = Math.round(Math.abs(value));
  const sign = value < 0 && n > 0 ? '-' : '';
  if (n < 10000) return sign + n.toLocaleString('en-US');
  let exp = Math.floor(Math.log10(n));
  if (10 ** exp > n) exp--;          // log10 rounding near powers of ten
  if (10 ** (exp + 1) <= n) exp++;
  const tier = Math.floor(exp / 3);
  const whole = exp - tier * 3 + 1;  // digits before the point: 1-3
  const digits = `${Math.min(999, Math.floor(n / 10 ** (exp - 2)))}`.padStart(3, '0');
  const shown = whole === 3 ? digits : `${digits.slice(0, whole)}.${digits.slice(whole)}`;
  return sign + shown + suffix(tier);
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
export const pearlsLabel = (n) => `${formatNum(n)} Pearl${n === 1 ? '' : 's'}`;

// Rarity colour for text on parchment: Common's light grey would be too faint,
// so it uses the brown sub-text colour.
export const rarityTextColor = (rarity) => (rarity === 'common' ? UI.colors.subText : cssColor(RARITY[rarity].color));

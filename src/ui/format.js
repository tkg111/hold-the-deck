// Phaser number color (0xRRGGBB) -> CSS string for Text styles.
export const cssColor = (n) => `#${n.toString(16).padStart(6, '0')}`;

// Compact star label for a hero, e.g. "★3"; empty for 0 stars.
export const starLabel = (stars) => (stars > 0 ? `★${stars}` : '');

// "1 Pearl" / "5 Pearls".
export const pearlsLabel = (n) => `${n} Pearl${n === 1 ? '' : 's'}`;

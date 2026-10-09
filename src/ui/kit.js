import Phaser from 'phaser';
import { HEROES, SPRITES, UI_KIT } from '../config.js';
import { versioned } from '../version.js';

// The UI kit in public/sprites/ui/: 9-slice wood and parchment panels, gold and
// wood buttons (normal / hover / pressed / disabled), a bar frame, a 12px icon
// sheet, bitmap fonts (fonts/), and ui.json with the slice sizes, icon order
// and colours. Everything is drawn at 1x in the 480x270 base resolution, on
// whole pixels.

// Filled from ui.json by loadUiSpec() before the game boots.
export const UI = { colors: {}, icons: [], slices: {} };

const KEY = (name) => `ui_${name}`;
const ICONS_KEY = KEY('icons');

// Bitmap fonts in public/sprites/ui/fonts/: <font>_<tone>.png + .xml.
// main: 16px, small: 8px, big: 32px. light: cream with a dark outline (for wood,
// wood buttons, bars and over the scene); dark: plain dark brown (for parchment
// and gold buttons). There is no big_dark.
const FONTS = ['main_light', 'main_dark', 'small_light', 'small_dark', 'big_light'];

export async function loadUiSpec() {
  const base = `${import.meta.env.BASE_URL}${SPRITES.path}${UI_KIT.path}`;
  const spec = await (await fetch(versioned(`${base}ui.json`))).json();
  UI.colors = spec.colors;
  UI.icons = spec.icons.order;
  UI.iconSize = spec.icons.size;
  UI.slices = spec.nineSlice;
}

// Queue the kit's images and fonts; expects the loader path to be public/sprites/.
export function preloadUi(scene) {
  const load = scene.load;
  const path = UI_KIT.path;
  const image = (name) => load.image(KEY(name), `${path}${name}.png`);
  image('panel_wood');
  image('panel_parchment');
  image('bar_frame');
  for (const style of ['gold', 'wood']) {
    for (const state of ['normal', 'hover', 'pressed', 'disabled']) image(`btn_${style}_${state}`);
  }
  load.spritesheet(ICONS_KEY, `${path}icons_sheet.png`, { frameWidth: UI.iconSize, frameHeight: UI.iconSize });
  for (const font of FONTS) load.bitmapFont(font, `${path}fonts/${font}.png`, `${path}fonts/${font}.xml`);
}

// Slice size from ui.json for a kit image ("btn_*.png" matches every button).
function sliceOf(name) {
  if (UI.slices[`${name}.png`] != null) return UI.slices[`${name}.png`];
  const wild = Object.keys(UI.slices).find((k) => k.includes('*') && new RegExp(`^${k.replace('*', '.*')}$`).test(`${name}.png`));
  return UI.slices[wild];
}

// A 9-slice kit image, w x h pixels, origin top-left.
export function nineSlice(scene, x, y, w, h, name) {
  const s = sliceOf(name);
  return scene.add.nineslice(Math.round(x), Math.round(y), KEY(name), undefined, Math.round(w), Math.round(h), s, s, s, s)
    .setOrigin(0);
}

// 'wood' or 'parchment' panel.
export const panel = (scene, x, y, w, h, kind = 'wood') => nineSlice(scene, x, y, w, h, `panel_${kind}`);

// A hero's face, cropped from their single sprite (SPRITES.face, faceTop).
// Falls back to a small square in their colour if they have no sprite.
export function face(scene, x, y, heroId) {
  const sprite = SPRITES.heroes[heroId];
  const { x: fx, width, height } = SPRITES.face;
  if (!sprite) {
    return scene.add.rectangle(x, y, width - 4, height - 2, HEROES[heroId].color).setOrigin(0.5);
  }
  const texture = scene.textures.get(sprite.key);
  if (!texture.has('face')) {
    texture.add('face', 0, fx, sprite.faceTop, width, height);
    // Adding the first extra frame makes it the default; keep the whole sprite.
    texture.firstFrame = '__BASE';
  }
  return scene.add.image(x, y, sprite.key, 'face');
}

export function icon(scene, x, y, name) {
  const frame = UI.icons.indexOf(name);
  return scene.add.image(x, y, ICONS_KEY, frame);
}

// --- Text ---

// Bitmap text, never scaled, that always sits on whole pixels. Position it
// like any object with setPosition / setOrigin: the origin is applied to the
// text's ink (its width, and the cap height of each line) and the result is
// rounded, so centred text lands on whole pixels too.
export class PixelText extends Phaser.GameObjects.BitmapText {
  constructor(scene, x, y, font, str, align) {
    super(scene, 0, 0, font, str, undefined, align);
    const cap = this.fontData.chars[65];  // 'A'
    this.capTop = cap ? cap.yOffset : 0;
    this.capHeight = cap ? cap.height : this.fontData.lineHeight;
    this.anchorX = x;
    this.anchorY = y;
    this.alignX = 0;
    this.alignY = 0;
    this.color = null;
    this.snap();
  }

  setOrigin(x = 0.5, y = x) {
    if (this.anchorX === undefined) return super.setOrigin(x, y);
    this.alignX = x;
    this.alignY = y;
    return this.snap();
  }

  setPosition(x = 0, y = x, z, w) {
    if (this.anchorX === undefined) return super.setPosition(x, y, z, w);
    this.anchorX = x;
    this.anchorY = y;
    return this.snap();
  }

  setX(x) { return this.setPosition(x, this.anchorY); }
  setY(y) { return this.setPosition(this.anchorX, y); }

  setText(value) {
    super.setText(value);
    if (this.anchorX !== undefined) this.snap();
    return this;
  }

  setMaxWidth(value, wordWrapCharCode) {
    super.setMaxWidth(value, wordWrapCharCode);
    if (this.anchorX !== undefined) this.snap();
    return this;
  }

  // CSS colour, tinting the light fonts' cream fill (the outline stays dark);
  // null or the plain text colour clears it.
  setColor(css) {
    this.color = css;
    if (!css || css === UI.colors.text) this.clearTint();
    else this.setTint(hexColor(css));
    return this;
  }

  // Width of the ink and height from the first line's cap top to the last
  // line's baseline.
  get inkWidth() { return this.getTextBounds(false).local.width || 0; }
  get inkHeight() {
    const lines = Math.max(1, this.getTextBounds(false).lines.lengths.length);
    return (lines - 1) * (this.fontData.lineHeight + this.lineSpacing) + this.capHeight;
  }

  snap() {
    const b = this.getTextBounds(false).local;
    // Empty text has no real bounds (Phaser reports x as Number.MAX_VALUE).
    const bx = b.width ? b.x : 0;
    const x = Math.round(this.anchorX - bx - this.alignX * (b.width || 0));
    const y = Math.round(this.anchorY - this.capTop - this.alignY * this.inkHeight);
    super.setPosition(x, y);
    return this;
  }
}

// font: 'main' (16px), 'small' (8px) or 'big' (32px, light only).
// tone: 'light' or 'dark' (see FONTS). color: tints a light font. align
// ('left' / 'center' / 'right') lines up the lines of multi-line text; wrap is
// a maximum line width in pixels. (x, y) is the top-left of the ink until
// setOrigin says otherwise.
export function text(scene, x, y, str, {
  font = 'main', tone = 'light', color = null, align = 'left', wrap = null, lineSpacing = 0,
} = {}) {
  const key = scene.cache.bitmapFont.exists(`${font}_${tone}`) ? `${font}_${tone}` : `${font}_light`;
  const alignCode = { left: 0, center: 1, right: 2 }[align];
  const t = new PixelText(scene, x, y, key, str, alignCode);
  if (lineSpacing) t.setLineSpacing(lineSpacing);
  if (wrap) t.setMaxWidth(wrap);
  if (color) t.setColor(color);
  scene.add.existing(t);
  return t;
}

// Text styles by background: light (on wood, wood buttons, bars and over the
// scene; `color` tints it), dark on parchment and gold buttons, and small dark
// sub-text on parchment.
export const light = (extra = {}) => ({ tone: 'light', ...extra });
export const dark = (extra = {}) => ({ tone: 'dark', ...extra });
export const subText = (extra = {}) => ({ font: 'small', tone: 'dark', ...extra });

export const hexColor = (css) => Phaser.Display.Color.HexStringToColor(css).color;

// --- Bars ---

// A bar_frame with a coloured fill and centred small label. setValue(0..1).
export class Bar extends Phaser.GameObjects.Container {
  constructor(scene, x, y, w, h, fillColor) {
    super(scene, x, y);
    // (Not this.w: Phaser's setPosition(x, y, z, w) overwrites it.)
    this.barWidth = w;
    this.frameImg = nineSlice(scene, 0, 0, w, h, 'bar_frame');
    this.fill = scene.add.rectangle(1, 1, 0, h - 2, hexColor(fillColor)).setOrigin(0);
    this.label = text(scene, w / 2, h / 2, '', light({ font: 'small' })).setOrigin(0.5);
    this.add([this.frameImg, this.fill, this.label]);
    scene.add.existing(this);
  }

  setValue(pct, label) {
    // Whole pixels, so the fill edge lines up with the frame's pixels.
    this.fill.width = Math.round(Phaser.Math.Clamp(pct, 0, 1) * (this.barWidth - 2));
    if (label != null) this.label.setText(label);
    return this;
  }
}

// --- Pixel stars (the fonts have no star glyph) ---

const STAR = ['..#..', '.###.', '#####', '.###.', '#.#.#'];

// Row of `total` 5x5 pixel stars, `filled` of them gold, centred on (x, y).
export function starRow(scene, x, y, filled, total) {
  const g = scene.add.graphics({ x: Math.round(x), y: Math.round(y) });
  const gap = 1;
  const width = total * 5 + (total - 1) * gap;
  const left = -Math.floor(width / 2);
  for (let i = 0; i < total; i++) {
    g.fillStyle(i < filled ? hexColor(UI_KIT.starColor) : hexColor(UI_KIT.starEmptyColor));
    STAR.forEach((row, r) => [...row].forEach((c, col) => {
      if (c === '#') g.fillRect(left + i * (5 + gap) + col, r - 2, 1, 1);
    }));
  }
  return g;
}

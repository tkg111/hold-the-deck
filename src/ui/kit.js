import Phaser from 'phaser';
import { HEROES, SPRITES, UI_KIT } from '../config.js';

// The UI kit in public/sprites/ui/: 9-slice wood and parchment panels, gold and
// wood buttons (normal / hover / pressed / disabled), a bar frame, a 12px icon
// sheet, and ui.json with the fonts, slice sizes, icon order and colours.
//
// Everything here is placed in art pixels' worth of layout units: sizes are
// whole art pixels and the textures are drawn at SPRITES.scale, the same as
// every other sprite. `px(n)` converts art pixels to layout units.

export const px = (n) => n * SPRITES.scale;

// Filled from ui.json by loadUiSpec() before the game boots.
export const UI = { fonts: {}, colors: {}, icons: [], slices: {} };

const KEY = (name) => `ui_${name}`;
const ICONS_KEY = KEY('icons');

// Fetch ui.json and wait for its Google Fonts, so the first text drawn already
// uses them. Gives up on the fonts after a few seconds (the game still runs,
// in a fallback font) so a blocked font CDN can't stop it from starting.
export async function loadUiSpec() {
  const base = `${import.meta.env.BASE_URL}${SPRITES.path}${UI_KIT.path}`;
  const spec = await (await fetch(`${base}ui.json`)).json();
  UI.fonts = spec.fonts;
  UI.colors = spec.colors;
  UI.icons = spec.icons.order;
  UI.iconSize = spec.icons.size;
  UI.slices = spec.nineSlice;
  const fonts = [spec.fonts.main, spec.fonts.small]
    .map(({ family, size }) => document.fonts.load(`${size}px "${family}"`));
  const timeout = new Promise((resolve) => { setTimeout(resolve, UI_KIT.fontTimeout); });
  await Promise.race([Promise.all(fonts), timeout]);
}

// Queue the kit's images; expects the loader path to be public/sprites/.
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
}

// Slice size from ui.json for a kit image ("btn_*.png" matches every button).
function sliceOf(name) {
  if (UI.slices[`${name}.png`] != null) return UI.slices[`${name}.png`];
  const wild = Object.keys(UI.slices).find((k) => k.includes('*') && new RegExp(`^${k.replace('*', '.*')}$`).test(`${name}.png`));
  return UI.slices[wild];
}

// A 9-slice kit image, w x h in layout units (whole art pixels), origin top-left.
export function nineSlice(scene, x, y, w, h, name) {
  const s = sliceOf(name);
  return scene.add.nineslice(x, y, KEY(name), undefined, w / SPRITES.scale, h / SPRITES.scale, s, s, s, s)
    .setOrigin(0).setScale(SPRITES.scale);
}

// 'wood' or 'parchment' panel.
export const panel = (scene, x, y, w, h, kind = 'wood') => nineSlice(scene, x, y, w, h, `panel_${kind}`);

// A hero's face, cropped from their single sprite (SPRITES.face, faceTop).
// Falls back to a small square in their colour if they have no sprite.
export function face(scene, x, y, heroId) {
  const sprite = SPRITES.heroes[heroId];
  const { x: fx, width, height } = SPRITES.face;
  if (!sprite) {
    return scene.add.rectangle(x, y, px(width - 4), px(height - 2), HEROES[heroId].color).setOrigin(0.5);
  }
  const texture = scene.textures.get(sprite.key);
  if (!texture.has('face')) {
    texture.add('face', 0, fx, sprite.faceTop, width, height);
    // Adding the first extra frame makes it the default; keep the whole sprite.
    texture.firstFrame = '__BASE';
  }
  return scene.add.image(x, y, sprite.key, 'face').setScale(SPRITES.scale);
}

export function icon(scene, x, y, name) {
  const frame = UI.icons.indexOf(name);
  return scene.add.image(x, y, ICONS_KEY, frame).setScale(SPRITES.scale);
}

// --- Text ---

// Text drawn one texel per art pixel at the font's own pixel size, with every
// pixel either fully on or off (canvas anti-aliasing is thresholded away), then
// scaled up like the sprites so it stays crisp at any whole-number scale.
export class PixelText extends Phaser.GameObjects.Text {
  updateText() {
    // Let Phaser draw to the canvas without uploading it, threshold the
    // alpha, then upload the result ourselves.
    const { renderer } = this;
    this.renderer = null;
    super.updateText();
    this.renderer = renderer;
    const { canvas, context } = this;
    if (canvas.width && canvas.height) {
      const img = context.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
      context.putImageData(img, 0, 0);
    }
    if (renderer && renderer.gl) {
      this.frame.source.glTexture = renderer.canvasToTexture(canvas, this.frame.source.glTexture, true);
    }
    return this;
  }
}

// font: 'main' (Jersey 10, 16px) or 'small' (Silkscreen, 8px); size 2 draws it
// twice as big (each font pixel 2 art pixels). outline: a colour for a 1px
// outline, or null. wrap: wrap width in layout units.
export function text(scene, x, y, str, {
  font = 'main', size = 1, color = UI.colors.text, outline = null, align = 'left', wrap = null, lineSpacing = 0,
} = {}) {
  const spec = UI.fonts[font];
  const scale = SPRITES.scale * size;
  const style = {
    fontFamily: `"${spec.family}", monospace`,
    fontSize: `${spec.size}px`,
    color,
    align,
    resolution: 1,
  };
  if (outline) Object.assign(style, { stroke: outline, strokeThickness: 2 });
  if (wrap) style.wordWrap = { width: wrap / scale };
  const t = new PixelText(scene, x, y, str, style).setScale(scale).setLineSpacing(lineSpacing);
  scene.add.existing(t);
  return t;
}

// Common text styles: light with a dark outline (on wood or over the scene),
// dark on parchment, and small brown sub-text on parchment.
export const outlined = (extra = {}) => ({ color: UI.colors.text, outline: UI.colors.textOnParchment, ...extra });
export const onParchment = (extra = {}) => ({ color: UI.colors.textOnParchment, ...extra });
export const subText = (extra = {}) => ({ font: 'small', color: UI.colors.subText, ...extra });

export const hexColor = (css) => Phaser.Display.Color.HexStringToColor(css).color;

// --- Bars ---

// A bar_frame with a coloured fill and centred small label. setValue(0..1).
export class Bar extends Phaser.GameObjects.Container {
  constructor(scene, x, y, w, h, fillColor) {
    super(scene, x, y);
    this.w = w;
    this.h = h;
    const inset = px(1);
    this.frameImg = nineSlice(scene, 0, 0, w, h, 'bar_frame');
    this.fill = scene.add.rectangle(inset, inset, 0, h - 2 * inset, hexColor(fillColor)).setOrigin(0);
    this.label = text(scene, w / 2, h / 2, '', { font: 'small', ...outlined() }).setOrigin(0.5);
    this.add([this.frameImg, this.fill, this.label]);
    scene.add.existing(this);
  }

  setValue(pct, label) {
    const inner = this.w - px(2);
    // Whole art pixels, so the fill edge lines up with the frame's pixels.
    this.fill.width = Math.round(Phaser.Math.Clamp(pct, 0, 1) * inner / px(1)) * px(1);
    if (label != null) this.label.setText(label);
    return this;
  }
}

// --- Pixel stars (the fonts have no star glyph) ---

const STAR = ['..#..', '.###.', '#####', '.###.', '#.#.#'];

// Row of `total` 5x5 pixel stars, `filled` of them gold, centred on (x, y).
export function starRow(scene, x, y, filled, total) {
  const g = scene.add.graphics({ x, y });
  const p = px(1);
  const gap = 1;
  const width = total * 5 + (total - 1) * gap;
  const left = -Math.floor(width / 2);
  for (let i = 0; i < total; i++) {
    g.fillStyle(i < filled ? hexColor(UI_KIT.starColor) : hexColor(UI_KIT.starEmptyColor));
    STAR.forEach((row, r) => [...row].forEach((c, col) => {
      if (c === '#') g.fillRect((left + i * (5 + gap) + col) * p, (r - 2) * p, p, p);
    }));
  }
  return g;
}

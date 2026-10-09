import { fxKey } from './sprites.js';

// Effect sprites from public/sprites/fx/ (see fx.json), drawn at 1x.

// Projectiles and impacts draw over the scene and its overlays; UI is higher.
export const FX_DEPTH = 5;

const warned = new Set();  // missing sheets already reported

// A sprite of the effect `name` at (x, y), playing its animation if it has one
// (looping or once, as fx.json says). A sheet that failed to load gives a
// sprite of Phaser's blank texture (and a warning) rather than its
// missing-texture box, so the effect just doesn't show.
export function fxSprite(scene, name, x, y) {
  const key = fxKey(name);
  if (!scene.textures.exists(key)) {
    if (!warned.has(name)) console.warn(`[fx] missing effect sheet: ${name}`);
    warned.add(name);
    return scene.add.sprite(x, y, '__DEFAULT');
  }
  const sprite = scene.add.sprite(x, y, key, 0);
  if (scene.anims.exists(key)) sprite.play(key);
  return sprite;
}

// A one-shot effect (an impact) at (x, y) that removes itself when done.
export function playFx(scene, name, x, y, depth = FX_DEPTH) {
  const sprite = fxSprite(scene, name, x, y).setDepth(depth);
  if (sprite.anims.isPlaying) sprite.once('animationcomplete', () => sprite.destroy());
  else scene.time.delayedCall(100, () => sprite.destroy());
  return sprite;
}

// Frame size of an effect sheet, e.g. to size what it covers.
export function fxSize(scene, name) {
  const frame = scene.textures.getFrame(fxKey(name), 0);
  return { width: frame.width, height: frame.height };
}

// How long a one-shot effect's animation plays, in ms (0 for a still frame).
export function fxDuration(scene, name) {
  return scene.anims.get(fxKey(name))?.duration ?? 0;
}
